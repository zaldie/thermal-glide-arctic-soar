// main.js — Thermal Glide: Arctic Soar. Boot, state machine and the sortie.
// This file owns the game's flow (loading, menu, briefing, flying, pause,
// results, help) and the rules of a flight: rings in order, the mail drop,
// landings judged honestly, crashes named by their cause. Every other file
// does one job; this one conducts them.

import { createRenderer } from "./renderWorld.js";
import { drawHud, drawMenuScreen, drawBriefingScreen, drawPauseScreen, drawResultScreen, drawHelpScreen, drawLoadingScreen, drawErrorScreen } from "./hud.js";
import { createGliderState, stepGlider, GLIDER } from "./gliderPhysics.js";
import { createSky, stepSky, airAt } from "./thermalSky.js";
import { terrainHeight, RUNWAY, WORLD_HALF } from "./terrainSvarra.js";
import { MISSIONS, FREE_SOAR, SCORE, starsFor } from "./missions.js";
import { createInput } from "./inputPilot.js";
import { createAudio } from "./audioVariometer.js";
import { loadSave, storeSave, recordResult } from "./saveGame.js";
import { readShotScene } from "./shots.js";

const glCanvas = document.getElementById("game");
const canvas = document.getElementById("fx");
const statusEl = document.getElementById("status");
const ctx = canvas.getContext("2d");

const ALL_SORTIES = [...MISSIONS, FREE_SOAR];

let save = loadSave();
const audio = createAudio(save.settings);
const input = createInput(canvas);

let renderer = null;
let bootError = null;
try {
  if (!ctx) throw new Error("Canvas 2D is not available in this browser.");
  renderer = createRenderer(glCanvas, canvas);
} catch (err) {
  bootError = err;
}

// Game state.
let mode = "loading"; // loading | menu | briefing | flying | paused | result | help
let loadProgress = 0;
let time = 0;
let menuIndex = 0;
let menuContext = "main"; // main | sorties | settings
let selectedSortie = 0;
let mission = MISSIONS[0];
let glider = null;
let sky = null;
let rings = [];
let ringIndex = 0;
let score = 0;
// Where the score came from, line by line — the results screen reads
// this out, so a pilot can see what the sortie actually paid for.
let scoreParts = { rings: 0, drop: 0, landing: 0, stalls: 0 };
let seconds = 0;
let dropped = null; // null = carrying, true/false once released (drop quality)
let packageDroppedAt = null;
let parcel = null; // the released mail parcel, falling under its canopy
let view = "chase";
let message = null;
let result = null;
let touchdown = null; // { sink, speedKmh, grade, age, pending } during roll-out
let stallCount = 0;
let wasStalled = false;
let lastFrame = performance.now();
let shotScene = readShotScene();

function say(text) {
  if (statusEl) statusEl.textContent = text;
}

function showMessage(text, dur = 2.4) {
  message = { text, until: time + dur };
}

// ---------- Menu model ----------

function menuItems() {
  if (menuContext === "sorties") {
    const items = ALL_SORTIES.map((m, i) => {
      const locked = i < MISSIONS.length && i >= save.unlocked;
      const stars = save.stars[m.id] || 0;
      return {
        label: locked ? `🔒 ${m.name}` : m.name,
        note: locked ? "Finish the sortie before this one to unlock it" : (stars ? "★".repeat(stars) + `  best ${save.bestScore[m.id] || 0}` : m.brief),
        action: locked ? null : () => chooseSortie(i),
      };
    });
    items.push({ label: "← Back", note: "", action: () => { menuContext = "main"; menuIndex = 0; } });
    return items;
  }
  if (menuContext === "settings") {
    const s = save.settings;
    return [
      { label: `Mouse sensitivity: ${s.sensitivity.toFixed(1)}`, note: "Enter cycles 0.6 – 1.6", action: () => { s.sensitivity = s.sensitivity >= 1.6 ? 0.6 : +(s.sensitivity + 0.2).toFixed(1); storeSave(save); } },
      { label: `Volume: ${Math.round(s.volume * 100)}%`, note: "Enter cycles", action: () => { s.volume = s.volume >= 0.95 ? 0 : +(s.volume + 0.25).toFixed(2); audio.setVolume(s.volume); storeSave(save); } },
      { label: `Invert Y: ${s.invertY ? "on" : "off"}`, note: "", action: () => { s.invertY = !s.invertY; storeSave(save); } },
      { label: "← Back", note: "", action: () => { menuContext = "main"; menuIndex = 0; } },
    ];
  }
  const items = [];
  if (save.continueSortie) {
    items.push({ label: "Continue sortie", note: `${save.continueSortie.missionName} — pick up where you left off`, action: continueSortie });
  }
  items.push({ label: "Fly a sortie", note: "Five missions over the Svarra Archipelago, plus Free Soar", action: () => { menuContext = "sorties"; menuIndex = 0; } });
  items.push({ label: "How to fly", note: "Ninety seconds of reading that saves your first glider", action: () => { mode = "help"; } });
  items.push({ label: "Settings", note: "Mouse, sound, stick direction", action: () => { menuContext = "settings"; menuIndex = 0; } });
  return items;
}

function chooseSortie(index) {
  selectedSortie = index;
  mission = ALL_SORTIES[index];
  mode = "briefing";
  say(`Selected ${mission.name}. ${mission.brief}`);
}

function continueSortie() {
  const c = save.continueSortie;
  if (!c) return;
  const idx = ALL_SORTIES.findIndex((m) => m.id === c.missionId);
  if (idx < 0) return;
  selectedSortie = idx;
  mission = ALL_SORTIES[idx];
  startFlight(c);
}

// ---------- Flight setup ----------

function startFlight(resume = null) {
  const start = resume?.glider ?? mission.start;
  glider = createGliderState(start.x, start.y, start.z, start.heading, start.speed);
  if (resume?.glider) {
    glider.pitch = resume.glider.pitch || 0;
    glider.roll = resume.glider.roll || 0;
  }
  if (start.airbrake) glider.airbrake = true;
  sky = createSky(mission.seed, { ...mission.sky, thermalScale: mission.thermalScale ?? 1 });
  if (resume?.dayPhase != null) sky.dayPhase = resume.dayPhase;
  rings = mission.rings.map((r) => ({ ...r, passed: false }));
  ringIndex = resume?.ringIndex ?? 0;
  for (let i = 0; i < ringIndex; i++) if (rings[i]) rings[i].passed = true;
  score = resume?.score ?? 0;
  // The breakdown resumes too: without it the results panel would
  // swear the rings flown before the pause were worth nothing.
  scoreParts = { rings: 0, drop: 0, landing: 0, stalls: 0, ...(resume?.parts || {}) };
  seconds = resume?.seconds ?? 0;
  dropped = mission.objective === "drop" ? (resume?.dropped ?? null) : undefined;
  packageDroppedAt = null;
  parcel = null;
  stallCount = 0;
  wasStalled = false;
  result = null;
  touchdown = null;
  view = "chase";
  mode = "flying";
  showMessage(mission.objective === "free" ? "Free Soar — the sky is yours" : `${mission.name} — ring 1 ahead`, 3);
  say(`Flying ${mission.name}`);
}

function gradeFor(sink) {
  if (sink >= -1.2) return "GREASED IT";
  if (sink >= -2.2) return "GENTLE";
  return "FIRM";
}

function applyShotScene() {
  if (!shotScene) return;
  mission = shotScene.mission;
  selectedSortie = shotScene.missionIndex;
  startFlight();
  const g = shotScene.glider;
  Object.assign(glider, g);
  sky.dayPhase = shotScene.dayPhase;
  view = shotScene.view;
  // Age the sky so the thermals stand at working strength, the way they
  // do a minute into a real flight, not at their birth ramp.
  const simSteps = Math.round((shotScene.simSeconds || 0) / 0.5);
  for (let i = 0; i < simSteps; i++) stepSky(sky, 0.5);
  sky.dayPhase = shotScene.dayPhase;
  // Compose the HUD numbers the way a real moment in this scene would read.
  seconds = shotScene.seconds ?? 42;
  score = shotScene.score ?? 300;
  if (shotScene.ringIndex) {
    ringIndex = Math.min(shotScene.ringIndex, rings.length);
    for (let i = 0; i < ringIndex; i++) rings[i].passed = true;
  }
  if (shotScene.touchdown) {
    touchdown = {
      sink: shotScene.touchdown.sink,
      speedKmh: Math.round(glider.speed * 3.6),
      grade: gradeFor(shotScene.touchdown.sink),
      age: 0.5,
      pending: null,
    };
  }
  showMessage("", 0);
  message = null;
  // A scene may stage the mail parcel mid-fall, the frame a second after
  // a real release: score already banked, parcel under its canopy. It
  // leaves with the glider's own velocity, exactly as tryDrop spawns it,
  // so it travels with the frame instead of dropping out of it.
  if (shotScene.parcel) {
    parcel = {
      ...shotScene.parcel,
      vx: Math.sin(glider.heading) * glider.speed * 0.92,
      vz: -Math.cos(glider.heading) * glider.speed * 0.92,
      vy: -11,
      spin: 0.6,
    };
    dropped = true;
  }
  if (shotScene.message) showMessage(shotScene.message, 30);
  // A scene may mark the mail as already away without staging the
  // parcel itself (the results panel's checklist reads this flag).
  if (shotScene.dropped) dropped = true;
  // A scene may freeze the sortie at its results panel: the breakdown
  // lines and stars a real finish prints, over the strip it ended on.
  if (shotScene.result) {
    const r = shotScene.result;
    scoreParts = { rings: 0, drop: 0, landing: 0, stalls: 0, ...r.parts };
    result = {
      finished: true,
      title: r.title,
      reason: r.reason,
      landingNote: r.landingNote || null,
      score,
      seconds,
      stars: r.stars,
      ringsFlown: r.ringsFlown,
      isBest: !!r.isBest,
      parts: { ...scoreParts },
    };
    mode = "result";
  }
}

// ---------- Flight rules ----------

function checkRingPass(prev) {
  const ring = rings[ringIndex];
  if (!ring) return;
  // Passed if the segment prev->glider crosses near the ring centre.
  const d = Math.hypot(glider.x - ring.x, glider.y - ring.y, glider.z - ring.z);
  if (d < ring.radius * 0.92) {
    ring.passed = true;
    const centreBonus = d < ring.radius * 0.38;
    score += centreBonus ? SCORE.ringCentre : SCORE.ringEdge;
    scoreParts.rings += centreBonus ? SCORE.ringCentre : SCORE.ringEdge;
    audio.ringPassed(centreBonus);
    showMessage(centreBonus ? `Ring ${ringIndex + 1} — dead centre! +${SCORE.ringCentre}` : `Ring ${ringIndex + 1} +${SCORE.ringEdge}`);
    ringIndex++;
    if (ringIndex >= rings.length && mission.objective !== "drop") {
      showMessage("All rings — now land on the ice runway", 3.4);
    }
  }
  void prev;
}

function tryDrop() {
  if (mission.objective !== "drop" || dropped !== null) return;
  const zone = mission.dropZone;
  const dist = Math.hypot(glider.x - zone.x, glider.z - zone.z);
  const heightAbove = glider.y - terrainHeight(glider.x, glider.z);
  if (dist < zone.radius && heightAbove < 280) {
    dropped = true;
    const accurate = dist < zone.radius * 0.45 && heightAbove < 190;
    score += accurate ? SCORE.dropAccurate : SCORE.dropNear;
    scoreParts.drop += accurate ? SCORE.dropAccurate : SCORE.dropNear;
    audio.dropped();
    showMessage(accurate ? `Mail away — right over the circle! +${SCORE.dropAccurate}` : `Mail away +${SCORE.dropNear}`, 3);
  } else {
    dropped = false;
    audio.dropped();
    showMessage("The mail drifts into the fjord… no points for the drop", 3);
  }
  packageDroppedAt = { x: glider.x, z: glider.z };
  // The parcel leaves with the glider's own velocity and settles under
  // its canopy — the pilot watches the mail go down, not just a message.
  parcel = {
    x: glider.x, y: glider.y - 2, z: glider.z,
    vx: Math.sin(glider.heading) * glider.speed * 0.92,
    vz: -Math.cos(glider.heading) * glider.speed * 0.92,
    vy: glider.verticalSpeed - 1,
    spin: 0,
  };
}

function finishFlight(finished, title, reason, landingNote = null) {
  const stars = starsFor(mission, seconds, finished);
  const isBest = finished && score > (save.bestScore[mission.id] || 0);
  result = {
    finished, title, reason, landingNote,
    score: Math.round(score), seconds, stars,
    ringsFlown: rings.filter((r) => r.passed).length,
    isBest,
    parts: { ...scoreParts },
  };
  if (mission.objective !== "free") {
    recordResult(save, mission, result);
    if (finished) {
      const idx = MISSIONS.findIndex((m) => m.id === mission.id);
      if (idx >= 0 && idx + 2 > save.unlocked) {
        save.unlocked = Math.min(MISSIONS.length, idx + 2);
        storeSave(save);
      }
    }
  } else {
    save.totalFlightSeconds = Math.round(save.totalFlightSeconds + seconds);
    save.continueSortie = null;
    storeSave(save);
  }
  if (finished) audio.landed();
  mode = "result";
  say(`${title}. ${reason} Score ${Math.round(score)}.`);
}

function beginTouchdown(finished, title, reason, landingNote, precisionBonus = 0) {
  // A real landing earns a roll-out: two seconds of spray and the grade
  // on screen before the results panel takes over.
  touchdown = {
    sink: glider.verticalSpeed,
    speedKmh: Math.round(glider.speed * 3.6),
    grade: gradeFor(glider.verticalSpeed),
    bonus: precisionBonus,
    age: 0,
    pending: { finished, title, reason, note: landingNote },
  };
}

function judgeTouchdown() {
  // Called the first frame the glider reaches the ground.
  const groundY = terrainHeight(glider.x, glider.z);
  const onRunway =
    Math.abs(glider.x - RUNWAY.centreX) <= RUNWAY.width / 2 + 14 &&
    Math.abs(glider.z - RUNWAY.centreZ) <= RUNWAY.length / 2 + 20;
  const sink = glider.verticalSpeed;
  const headingError = Math.min(Math.abs(glider.heading), Math.abs(Math.abs(glider.heading) - Math.PI * 2));
  if (glider.y <= 1.5) {
    // Water.
    if (rings.every((r) => r.passed) || mission.objective === "free") {
      audio.crashed();
      finishFlight(false, "DITCHED IN THE FJORD", "Down on the water, but the fishing boats saw you splash. The glider is lost; the pilot is embarrassed and dry by dinner.");
    } else {
      audio.crashed();
      finishFlight(false, "DOWN IN THE FJORD", `The water took the glider ${rings.length - ringIndex} ring${rings.length - ringIndex === 1 ? "" : "s"} short of done. Height is fuel — the thermals were there.`);
    }
    return;
  }
  if (onRunway && sink > -3.4 && glider.speed < 30 && Math.abs(glider.roll) < 0.4 && headingError < 0.5) {
    // A real landing.
    let landingNote = `touchdown at ${Math.round(glider.speed * 3.6)} km/h, sink ${sink.toFixed(1)} m/s`;
    let precisionBonus = 0;
    if (mission.precisionLanding) {
      const distTarget = Math.hypot(glider.x - RUNWAY.centreX, glider.z - (RUNWAY.centreZ + RUNWAY.length / 2 - 90));
      const precision = Math.max(0, Math.round(SCORE.landingPrecisionMax * (1 - distTarget / 320)));
      score += precision;
      scoreParts.landing += precision;
      precisionBonus = precision;
      landingNote += ` · precision +${precision} (${Math.round(distTarget)} m from the numbers)`;
    }
    const objectivesDone = rings.every((r) => r.passed) && (mission.objective !== "drop" || dropped === true);
    if (objectivesDone || mission.objective === "free") {
      beginTouchdown(true, mission.objective === "free" ? "DOWN SAFE" : "SORTIE COMPLETE", mission.objective === "free" ? "A free flight, ended the way every flight should end: on the strip, grinning." : "Every objective flown and a landing the strip crew would applaud.", landingNote, precisionBonus);
    } else {
      beginTouchdown(false, "DOWN, BUT NOT DONE", "You landed safely — but the sortie's work was not finished, so it does not count as complete.", landingNote, precisionBonus);
    }
    return;
  }
  if (onRunway) {
    audio.crashed();
    finishFlight(false, "A ROUGH ARRIVAL", `The strip caught you, but sink ${sink.toFixed(1)} m/s at ${Math.round(glider.speed * 3.6)} km/h is a crash wearing a landing's clothes. Bleed speed, flare gently.`);
    return;
  }
  if (sink > -5.5 && glider.speed < 21) {
    // A survivable off-field arrival if the objectives were done.
    const objectivesDone = rings.every((r) => r.passed);
    audio.crashed();
    if (objectivesDone) {
      finishFlight(false, "OUT-LANDING", "Down in one piece on the snow, short of the strip. The crew will fetch you with the snowcat — but the sortie is not complete.");
    } else {
      finishFlight(false, "PUT DOWN IN THE SNOW", "The terrain rose to meet you before the work was done. Watch the energy gauge: it never lies.");
    }
    return;
  }
  audio.crashed();
  const cause = glider.stalled
    ? "A stall at low height — there was no sky left to recover in."
    : sink <= -9
      ? "The ground arrived faster than the glider could argue with."
      : "Terrain, met at flying speed.";
  finishFlight(false, "CRASHED", cause);
  void groundY;
}

function saveContinueAndQuit() {
  if (mission.objective !== "free") {
    save.continueSortie = {
      missionId: mission.id,
      missionName: mission.name,
      glider: { x: glider.x, y: glider.y, z: glider.z, heading: glider.heading, pitch: glider.pitch, roll: glider.roll, speed: glider.speed },
      ringIndex, score, seconds,
      parts: { ...scoreParts },
      dropped: dropped ?? null,
      dayPhase: sky.dayPhase,
    };
    storeSave(save);
  }
  mode = "menu";
  menuContext = "main";
  menuIndex = 0;
}

// ---------- Per-frame update ----------

function updateFlight(dt) {
  if (touchdown) {
    // Roll-out: the flight is judged, the glider just sheds speed on
    // the strip while the spray flies and the grade shows.
    stepSky(sky, dt);
    if (!shotScene) {
      touchdown.age += dt;
      glider.speed = Math.max(0, glider.speed - 8.5 * dt);
      glider.x += Math.sin(glider.heading) * glider.speed * dt;
      glider.z += -Math.cos(glider.heading) * glider.speed * dt;
      glider.y = terrainHeight(glider.x, glider.z) + 1.6;
      glider.pitch *= 0.88;
      glider.roll *= 0.88;
      glider.verticalSpeed = 0;
      seconds += dt;
      audio.update(dt, glider);
      if (touchdown.age > 2.0 && touchdown.pending) {
        const p = touchdown.pending;
        touchdown = null;
        finishFlight(p.finished, p.title, p.reason, p.note);
      }
    }
    return;
  }
  const flightInput = input.sample(save.settings);
  if (input.consume("KeyC")) view = view === "chase" ? "cockpit" : "chase";
  if (input.consume("KeyP")) { mode = "paused"; return; }
  if (flightInput.drop && input.consume("KeyX")) tryDrop();
  else if (flightInput.drop) { /* X held: consume handled above on press frame */ }

  stepSky(sky, dt);
  const air = airAt(sky, glider.x, glider.y, glider.z);
  const prev = { x: glider.x, y: glider.y, z: glider.z };
  const events = stepGlider(glider, flightInput, air, dt);
  if (events.stallStarted) {
    stallCount++;
    scoreParts.stalls += SCORE.stallPenalty;
    score = Math.max(0, score - SCORE.stallPenalty);
  }
  if (events.airframeFailed) {
    finishFlight(false, "AIRFRAME FAILURE", "The wing spar gave way. Overspeed and steep, fast turns had been writing cheques the structure could not cash — ease off past 155 km/h, and bank gently when you are fast.");
    return;
  }
  // The parcel drifts down under its canopy until it meets the ground.
  if (parcel) {
    parcel.vy = Math.max(parcel.vy - 26 * dt, -13);
    parcel.vx *= 1 - 0.55 * dt;
    parcel.vz *= 1 - 0.55 * dt;
    parcel.x += parcel.vx * dt;
    parcel.y += parcel.vy * dt;
    parcel.z += parcel.vz * dt;
    parcel.spin += dt * 0.7;
    if (parcel.y <= terrainHeight(parcel.x, parcel.z) + 1.2) parcel = null;
  }
  seconds += dt;
  checkRingPass(prev);

  audio.update(dt, glider);
  audio.auroraPad(sky.dayPhase > 0.7 && mode === "flying");

  // Ground contact.
  const groundY = terrainHeight(glider.x, glider.z);
  if (glider.y <= groundY + 1.6) {
    glider.y = groundY + 1.6;
    judgeTouchdown();
    return;
  }
  // Out of the world.
  if (Math.abs(glider.x) > WORLD_HALF + 400 || Math.abs(glider.z) > WORLD_HALF + 400) {
    finishFlight(false, "LOST OVER THE ICE", "The archipelago ended and the map with it. The rings, the strip and the thermals were all back the other way.");
  }
}

function snapshot() {
  const groundY = glider ? terrainHeight(glider.x, glider.z) : 0;
  const air = glider && sky ? airAt(sky, glider.x, glider.y, glider.z) : { lift: 0 };
  return {
    glider, sky, rings, activeRing: ringIndex, view, time,
    mission, ringIndex, score, seconds,
    verticalSpeed: glider ? glider.verticalSpeed : 0,
    groundY,
    sinkWarning: glider ? glider.verticalSpeed < -4.2 && air.lift < 0.5 : false,
    stormWarning: sky?.squall.active && Math.abs(glider.x - sky.squall.x) < sky.squall.width * 1.8,
    message, dropped, parcel, result, save, touchdown,
    // The HUD checklist ticks its landing line off this flag; it is the
    // one field hud.js read that the snapshot never supplied, so the
    // line stayed unticked even on the results screen of a real landing.
    landed: !!(touchdown || (result && result.finished)),
    menuItems: menuItems(),
    menuIndex,
  };
}

// ---------- Input for menus ----------

canvas.addEventListener("mousedown", () => {
  audio.unlock();
  if (mode === "briefing") startFlight();
  else if (mode === "menu") activateMenuItem();
  else if (mode === "result") { mode = "menu"; menuContext = "main"; menuIndex = 0; }
});
window.addEventListener("keydown", (e) => {
  audio.unlock();
  if (mode === "menu") {
    const items = menuItems();
    if (e.code === "ArrowUp" || e.code === "KeyW") menuIndex = (menuIndex + items.length - 1) % items.length;
    if (e.code === "ArrowDown" || e.code === "KeyS") menuIndex = (menuIndex + 1) % items.length;
    if (e.code === "Enter") activateMenuItem();
  } else if (mode === "briefing" && e.code === "Enter") {
    startFlight();
  } else if (mode === "help" && e.code === "Escape") {
    mode = "menu";
  } else if (mode === "paused") {
    if (e.code === "KeyP" || e.code === "Enter") mode = "flying";
    if (e.code === "Escape") saveContinueAndQuit();
  } else if (mode === "flying" && e.code === "Escape") {
    mode = "paused";
  } else if (mode === "result" && e.code === "Enter") {
    mode = "menu";
    menuContext = "main";
    menuIndex = 0;
  }
});

function activateMenuItem() {
  const item = menuItems()[menuIndex];
  if (item?.action) item.action();
}

// ---------- Main loop ----------

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.033, (now - lastFrame) / 1000 || 0.016);
  lastFrame = now;
  time += dt;
  const { W, H } = renderer ? renderer.size : { W: canvas.clientWidth, H: canvas.clientHeight };

  if (bootError) {
    drawErrorScreen(ctx, W, H, `${bootError.message} Try a current desktop Chrome. Your save and settings are untouched.`);
    return;
  }
  if (mode === "loading") {
    loadProgress = Math.min(1, loadProgress + dt * 0.8);
    drawLoadingScreen(ctx, W, H, loadProgress);
    if (loadProgress >= 1) {
      if (shotScene) applyShotScene();
      else mode = "menu";
    }
    return;
  }
  if (mode === "flying") updateFlight(dt);
  if (mode === "flying" || mode === "paused" || mode === "result") {
    const snap = snapshot();
    renderer.draw(snap);
    drawHud(ctx, W, H, snap);
    if (mode === "paused") drawPauseScreen(ctx, W, H);
    if (mode === "result") drawResultScreen(ctx, W, H, snap);
    return;
  }
  // Menu, briefing and help float over a slowly orbiting demo flight.
  drawBackdrop(dt);
  const snap = snapshotForBackdrop();
  if (mode === "menu") drawMenuScreen(ctx, W, H, snap);
  else if (mode === "briefing") drawBriefingScreen(ctx, W, H, snap);
  else if (mode === "help") drawHelpScreen(ctx, W, H);
}

let backdropState = null;
function drawBackdrop(dt) {
  if (!backdropState) {
    const m = MISSIONS[0];
    backdropState = {
      glider: createGliderState(m.start.x, m.start.y + 60, m.start.z + 500, 0.2, 25),
      sky: createSky(3, { startPhase: 0.12, phaseLength: 9999 }),
      rings: m.rings.map((r) => ({ ...r })),
    };
  }
  const b = backdropState;
  stepSky(b.sky, dt);
  const air = airAt(b.sky, b.glider.x, b.glider.y, b.glider.z);
  stepGlider(b.glider, { pitchInput: 0.12, rollInput: Math.sin(time * 0.24) * 0.4, airbrake: false }, air, dt);
  if (b.glider.y < terrainHeight(b.glider.x, b.glider.z) + 130) b.glider.y += 60 * dt;
  if (Math.abs(b.glider.x) > 3200 || Math.abs(b.glider.z) > 4200) {
    b.glider.x = MISSIONS[0].start.x;
    b.glider.z = MISSIONS[0].start.z + 500;
  }
  renderer.draw({ glider: b.glider, sky: b.sky, rings: b.rings, activeRing: 0, view: "chase", time, dropZone: null });
}

function snapshotForBackdrop() {
  const base = snapshot();
  return { ...base, mission, save, time };
}

// In shot mode the backdrop glider must not replace the composed scene.
const originalFrame = frame;
void originalFrame;
requestAnimationFrame(frame);
say("Thermal Glide: Arctic Soar loaded");
