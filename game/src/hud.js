// hud.js — the flight instruments and every screen that is not the world.
// One job: draw, on top of the renderer's frame, the HUD (altitude, speed,
// heading, variometer, energy, objectives, warnings, minimap) and the menu /
// briefing / pause / results / help / error screens. Pure drawing: main.js
// owns the state, this file only reads a snapshot and paints it.

import { RUNWAY, VILLAGE, LIGHTHOUSE } from "./terrainSvarra.js";
import { energyHeight, GLIDER } from "./gliderPhysics.js";
import { clamp } from "./gliderPhysics.js";

export function drawHud(ctx, W, H, snap) {
  const { glider, mission, ringIndex, score, seconds, message } = snap;
  ctx.save();
  // --- Top-left flight data block: ALT / SPD / HDG, big and unambiguous.
  panel(ctx, 16, 16, 252, 148, 0.62);
  ctx.fillStyle = "#eaf6fb";
  ctx.textAlign = "left";
  ctx.font = '700 30px "Segoe UI", sans-serif';
  const alt = Math.max(0, Math.round(glider.y));
  const spd = Math.round(glider.speed * 3.6);
  const hdg = String(Math.round(((glider.heading * 180) / Math.PI % 360 + 360) % 360)).padStart(3, "0");
  ctx.fillText(`ALT ${alt} m`, 30, 56);
  ctx.fillText(`SPD ${spd} km/h`, 30, 94);
  ctx.font = '600 19px "Segoe UI", sans-serif';
  ctx.fillStyle = "#9fd8e8";
  ctx.fillText(`HDG ${hdg}°`, 30, 124);
  // Compass strip: a moving tape with cardinal letters.
  drawCompassStrip(ctx, 150, 106, 104, glider.heading);
  // Second row: total energy (the glider's real fuel gauge) and the
  // wind, drawn as an arrow relative to the nose, plus the airbrake tag.
  ctx.font = '700 16px "Segoe UI", sans-serif';
  ctx.fillStyle = "#ffcf4d";
  ctx.fillText(`E ${Math.round(energyHeight(glider))} m`, 30, 152);
  if (snap.sky) {
    const windSpeed = Math.hypot(snap.sky.windX, snap.sky.windZ);
    const windBearing = Math.atan2(snap.sky.windX, -snap.sky.windZ);
    let rel = windBearing - glider.heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    ctx.save();
    ctx.translate(138, 146);
    ctx.rotate(rel);
    ctx.fillStyle = "#9fe8c0";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(4.5, 4);
    ctx.lineTo(0, 1.5);
    ctx.lineTo(-4.5, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#9fe8c0";
    ctx.font = '600 14px "Segoe UI", sans-serif';
    ctx.fillText(`WIND ${windSpeed.toFixed(0)} m/s`, 150, 152);
  }
  if (glider.airbrake) {
    ctx.fillStyle = "#e07b39";
    roundRect(ctx, 216, 134, 42, 20, 5);
    ctx.fill();
    ctx.fillStyle = "#fff3e2";
    ctx.font = '800 12px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("BRK", 237, 148);
    ctx.textAlign = "left";
  }
  if (glider.overspeed) {
    // Past the placard speed the airframe is complaining — say so,
    // in the same row as the brake tag.
    const ox = glider.airbrake ? 264 : 216;
    ctx.fillStyle = "#c33d2e";
    roundRect(ctx, ox, 134, 86, 20, 5);
    ctx.fill();
    ctx.fillStyle = "#ffe9e2";
    ctx.font = '800 12px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("OVERSPEED", ox + 43, 148);
    ctx.textAlign = "left";
  }
  if ((glider.stress || 0) >= 0.75) {
    // The structure is near its limit: one more hard, fast turn can end
    // the sortie. Same pill row, after the brake and overspeed tags.
    const px = 216 + (glider.airbrake ? 48 : 0) + (glider.overspeed ? 94 : 0);
    ctx.fillStyle = "#c33d2e";
    roundRect(ctx, px, 134, 80, 20, 5);
    ctx.fill();
    ctx.fillStyle = "#ffe9e2";
    ctx.font = '800 12px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("AIRFRAME", px + 40, 148);
    ctx.textAlign = "left";
  }

  // --- Top-right: mission, score, clock.
  panel(ctx, W - 268, 16, 252, 118, 0.62);
  ctx.fillStyle = "#eaf6fb";
  ctx.textAlign = "right";
  ctx.font = '700 21px "Segoe UI", sans-serif';
  ctx.fillText(mission.name, W - 30, 46);
  ctx.font = '600 19px "Segoe UI", sans-serif';
  ctx.fillStyle = "#ffd98a";
  ctx.fillText(`SCORE ${Math.round(score)}`, W - 30, 76);
  ctx.fillStyle = "#9fd8e8";
  ctx.fillText(`TIME ${formatTime(seconds)}`, W - 30, 104);
  if (mission.rings.length) {
    ctx.fillText(`RING ${Math.min(ringIndex + 1, mission.rings.length)}/${mission.rings.length}`, W - 30, 128);
  }

  // --- Variometer + energy, right side under the mission block.
  drawVarioBar(ctx, W - 58, 182, 276, glider.verticalSpeed);
  drawEnergyBar(ctx, 30, 182, 276, glider, snap.groundY);
  drawStructBar(ctx, 86, 182, 276, glider.stress || 0);

  // --- Objectives, bottom-left.
  panel(ctx, 16, H - 108, 330, 92, 0.5);
  ctx.fillStyle = "#dceef5";
  ctx.textAlign = "left";
  ctx.font = '600 16.5px "Segoe UI", sans-serif';
  const lines = objectiveLines(snap);
  lines.forEach((line, i) => ctx.fillText(line, 30, H - 78 + i * 24));

  drawMinimap(ctx, W - 148, H - 148, 132, snap);
  drawNextRingArrow(ctx, W, H, snap);

  // --- Centre warnings and transient messages.
  if (glider.stalled) {
    blinkText(ctx, W / 2, H * 0.3, "STALL", "#ff5147", 44, snap.time);
    ctx.font = '700 19px "Segoe UI", sans-serif';
    ctx.fillStyle = "#ffd9d4";
    ctx.textAlign = "center";
    ctx.fillText("nose down — let the speed build", W / 2, H * 0.3 + 34);
  } else if (snap.sinkWarning) {
    blinkText(ctx, W / 2, H * 0.3, "HEAVY SINK", "#ffb84d", 30, snap.time);
  } else if (snap.stormWarning) {
    blinkText(ctx, W / 2, H * 0.3, "SQUALL AHEAD", "#cfe9ff", 30, snap.time);
  }
  if (message && snap.time < message.until) {
    ctx.font = '700 25px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffe9a8";
    ctx.fillText(message.text, W / 2, H * 0.22);
  }
  // --- Touchdown grade: the landing pays off on screen while the
  // glider rolls out, before the results screen takes over.
  if (snap.touchdown) {
    const td = snap.touchdown;
    const cx = W / 2;
    const cy = H * 0.34;
    panel(ctx, cx - 190, cy - 44, 380, 88, 0.55);
    ctx.textAlign = "center";
    ctx.fillStyle = td.grade === "GREASED IT" ? "#7dff9a" : td.grade === "GENTLE" ? "#ffe9a8" : "#ffb84d";
    ctx.font = '800 30px "Segoe UI", sans-serif';
    ctx.fillText(`TOUCHDOWN ${td.sink.toFixed(1)} m/s`, cx, cy - 6);
    ctx.font = '700 19px "Segoe UI", sans-serif';
    ctx.fillStyle = "#eaf6fb";
    ctx.fillText(`${td.grade} · at ${td.speedKmh} km/h${td.bonus ? ` · precision +${td.bonus}` : ""}`, cx, cy + 26);
  }
  if (snap.dropped === false && mission.objective === "drop") {
    ctx.font = '600 16px "Segoe UI", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffd98a";
    ctx.fillText("Press X over the orange circle to drop the mail", W / 2, H - 26);
  }
  ctx.restore();
}

function objectiveLines(snap) {
  const { mission, ringIndex, landed, dropped } = snap;
  if (mission.objective === "free") {
    return ["FREE SOAR — ride the thermals", "Land at the ice runway when ready (or Esc)"];
  }
  const lines = [];
  if (ringIndex < mission.rings.length) {
    lines.push(mission.taskLine
      ? `▸ ${mission.taskLine} · ring ${ringIndex + 1}/${mission.rings.length}`
      : `▸ Fly through ring ${ringIndex + 1} of ${mission.rings.length}`);
  } else lines.push("✓ All rings flown");
  if (mission.objective === "drop") {
    lines.push(dropped ? "✓ Mail away over Port Svarra" : "▸ Drop the mail over Port Svarra (X)");
  }
  if (mission.landAtRunway) lines.push(landed ? "✓ Down safe" : mission.precisionLanding ? "▸ Land on the numbers, gently" : "▸ Land on the ice runway, gently");
  return lines.slice(0, 3);
}

function drawCompassStrip(ctx, x, y, w, heading) {
  const deg = ((heading * 180) / Math.PI % 360 + 360) % 360;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, 20);
  ctx.clip();
  ctx.fillStyle = "rgba(10,18,26,0.55)";
  ctx.fillRect(x, y, w, 20);
  ctx.font = '700 13px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  const cardinals = [[0, "N"], [90, "E"], [180, "S"], [270, "W"]];
  for (const [d, label] of cardinals) {
    let rel = ((d - deg + 540) % 360) - 180;
    if (Math.abs(rel) < 52) {
      ctx.fillStyle = label === "N" ? "#ff8a70" : "#cfe9f5";
      ctx.fillText(label, x + w / 2 + (rel / 52) * (w / 2), y + 15);
    }
  }
  ctx.fillStyle = "#ffcf4d";
  ctx.fillRect(x + w / 2 - 1.5, y, 3, 20);
  ctx.restore();
}

function drawVarioBar(ctx, x, y, h, verticalSpeed) {
  ctx.save();
  ctx.fillStyle = "rgba(8,15,22,0.55)";
  ctx.fillRect(x, y, 30, h);
  const mid = y + h / 2;
  ctx.fillStyle = "#5a7182";
  ctx.fillRect(x, mid - 1, 30, 2);
  const t = clamp(verticalSpeed / 6, -1, 1);
  ctx.fillStyle = verticalSpeed >= 0 ? "#57e389" : "#e35d4f";
  if (verticalSpeed >= 0) ctx.fillRect(x + 3, mid - t * (h / 2), 24, t * (h / 2));
  else ctx.fillRect(x + 3, mid, 24, -t * (h / 2));
  ctx.fillStyle = "#eaf6fb";
  ctx.font = '700 14px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("VARIO", x + 15, y - 8);
  ctx.fillText((verticalSpeed >= 0 ? "+" : "") + verticalSpeed.toFixed(1), x + 15, y + h + 18);
  ctx.restore();
}

function drawEnergyBar(ctx, x, y, h, glider, groundY) {
  const energy = energyHeight(glider);
  const max = 700;
  const t = clamp((energy - groundY) / max, 0, 1);
  ctx.save();
  ctx.fillStyle = "rgba(8,15,22,0.55)";
  ctx.fillRect(x, y, 30, h);
  ctx.fillStyle = "#ffcf4d";
  ctx.fillRect(x + 3, y + h - t * h, 24, t * h);
  ctx.fillStyle = "#eaf6fb";
  ctx.font = '700 12px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("ENERGY", x + 15, y - 8);
  ctx.fillText(`${Math.round(energy)}m`, x + 15, y + h + 18);
  ctx.restore();
}

// Airframe stress, drawn as the energy bar's neighbour: it fills from
// the bottom and changes colour as the structure approaches its limit.
function drawStructBar(ctx, x, y, h, stress) {
  const t = clamp(stress, 0, 1);
  ctx.save();
  ctx.fillStyle = "rgba(8,15,22,0.55)";
  ctx.fillRect(x, y, 30, h);
  ctx.fillStyle = t < 0.5 ? "#57e389" : t < 0.75 ? "#ffb84d" : "#e35d4f";
  ctx.fillRect(x + 3, y + h - t * h, 24, t * h);
  ctx.fillStyle = "#eaf6fb";
  ctx.font = '700 12px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillText("STRUCT", x + 15, y - 8);
  ctx.fillText(`${Math.round(t * 100)}%`, x + 15, y + h + 18);
  ctx.restore();
}

function drawMinimap(ctx, cx, cy, size, snap) {
  const half = size / 2;
  ctx.save();
  panel(ctx, cx - half, cy - half, size, size, 0.66);
  const toMap = (x, z) => [cx + (x / 12000) * size, cy + (z / 12000) * size];
  // The fjord, drawn as its real winding centreline.
  ctx.strokeStyle = "#3d7ea6";
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let z = -6000; z <= 6000; z += 600) {
    const fx = Math.sin(z * 0.00042) * 620 + Math.sin(z * 0.0011 + 1.7) * 180;
    const [mx, my] = toMap(fx, z);
    if (z === -6000) ctx.moveTo(mx, my);
    else ctx.lineTo(mx, my);
  }
  ctx.stroke();
  const [rx, ry] = toMap(RUNWAY.centreX, RUNWAY.centreZ);
  ctx.fillStyle = "#ffcf4d";
  ctx.fillRect(rx - 2, ry - 7, 4, 14);
  const [vx, vy] = toMap(VILLAGE.x, VILLAGE.z);
  ctx.fillStyle = "#ff9d4d";
  ctx.fillRect(vx - 3, vy - 3, 6, 6);
  const [lx, ly] = toMap(LIGHTHOUSE.x, LIGHTHOUSE.z);
  ctx.fillStyle = "#ffe9a8";
  ctx.fillRect(lx - 2, ly - 2, 4, 4);
  // Thermals as rising dots.
  ctx.fillStyle = "rgba(140,240,170,0.9)";
  for (const t of snap.sky.thermals) {
    if (!t.currentLift || t.currentLift < 1) continue;
    const [tx, ty] = toMap(t.x, t.z);
    ctx.beginPath();
    ctx.arc(tx, ty, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Rings.
  ctx.strokeStyle = "#ffd98a";
  snap.mission.rings.forEach((r, i) => {
    if (r.passed) return;
    const [mx, my] = toMap(r.x, r.z);
    ctx.globalAlpha = i === snap.ringIndex ? 1 : 0.45;
    ctx.beginPath();
    ctx.arc(mx, my, 4, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
  // The glider: a triangle pointing its heading.
  const [gx, gy] = toMap(snap.glider.x, snap.glider.z);
  ctx.translate(gx, gy);
  ctx.rotate(snap.glider.heading);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawNextRingArrow(ctx, W, H, snap) {
  const ring = snap.mission.rings[snap.ringIndex];
  if (!ring) return;
  const dx = ring.x - snap.glider.x;
  const dz = ring.z - snap.glider.z;
  const dist = Math.hypot(dx, dz);
  const bearing = Math.atan2(dx, -dz);
  let rel = bearing - snap.glider.heading;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  const cx = W / 2 + clamp(rel, -1.2, 1.2) * (W * 0.3);
  ctx.save();
  ctx.translate(cx, 64);
  ctx.rotate(clamp(rel, -0.9, 0.9));
  ctx.fillStyle = "#ffcf4d";
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(9, 8);
  ctx.lineTo(0, 3);
  ctx.lineTo(-9, 8);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-clamp(rel, -0.9, 0.9));
  ctx.font = '700 15px "Segoe UI", sans-serif';
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe9a8";
  ctx.fillText(`${Math.round(dist)} m`, 0, 30);
  ctx.restore();
}

// ---------- Screens ----------

export function drawMenuScreen(ctx, W, H, snap) {
  overlay(ctx, W, H, 0.45);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe9a8";
  ctx.font = '800 54px "Segoe UI", sans-serif';
  ctx.fillText("THERMAL GLIDE", W / 2, H * 0.2);
  ctx.fillStyle = "#bfe6f5";
  ctx.font = '600 24px "Segoe UI", sans-serif';
  ctx.fillText("A R C T I C   S O A R", W / 2, H * 0.2 + 38);
  ctx.font = '400 17px "Segoe UI", sans-serif';
  ctx.fillStyle = "#dceef5";
  ctx.fillText("No engine. No fuel. Only height, speed — and a living sky.", W / 2, H * 0.2 + 70);
  const items = snap.menuItems;
  items.forEach((item, i) => {
    const y = H * 0.42 + i * 52;
    const selected = i === snap.menuIndex;
    if (selected) {
      ctx.fillStyle = "rgba(255,207,77,0.18)";
      roundRect(ctx, W / 2 - 230, y - 30, 460, 42, 9);
      ctx.fill();
    }
    ctx.fillStyle = selected ? "#ffcf4d" : "#eaf6fb";
    ctx.font = `${selected ? "700" : "600"} 22px "Segoe UI", sans-serif`;
    ctx.fillText(item.label, W / 2, y);
    if (item.note) {
      ctx.font = '400 14.5px "Segoe UI", sans-serif';
      ctx.fillStyle = "#9fc6d6";
      ctx.fillText(item.note, W / 2, y + 20);
    }
  });
  ctx.font = '400 14px "Segoe UI", sans-serif';
  ctx.fillStyle = "#8fb2c2";
  ctx.fillText("↑ ↓ choose · Enter select · mouse flies, W/S pitch, A/D bank, Shift airbrake, C camera, P pause", W / 2, H - 30);
}

export function drawBriefingScreen(ctx, W, H, snap) {
  overlay(ctx, W, H, 0.55);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffcf4d";
  ctx.font = '800 36px "Segoe UI", sans-serif';
  ctx.fillText(snap.mission.name, W / 2, H * 0.3);
  ctx.fillStyle = "#eaf6fb";
  ctx.font = '400 20px "Segoe UI", sans-serif';
  wrapText(ctx, snap.mission.brief, W / 2, H * 0.3 + 48, 620, 28);
  ctx.font = '600 17px "Segoe UI", sans-serif';
  ctx.fillStyle = "#9fd8e8";
  const best = snap.save.bestScore[snap.mission.id];
  ctx.fillText(best ? `Best score ${best} · Best time ${formatTime(snap.save.bestTime[snap.mission.id] || 0)}` : "No flights yet on this sortie — set the first score.", W / 2, H * 0.3 + 118);
  ctx.fillStyle = "#57e389";
  ctx.font = '700 22px "Segoe UI", sans-serif';
  blinkSoft(ctx, snap.time);
  ctx.fillText("Press Enter — or click — to fly", W / 2, H * 0.72);
}

export function drawPauseScreen(ctx, W, H) {
  overlay(ctx, W, H, 0.5);
  ctx.textAlign = "center";
  ctx.fillStyle = "#eaf6fb";
  ctx.font = '800 40px "Segoe UI", sans-serif';
  ctx.fillText("PAUSED", W / 2, H * 0.42);
  ctx.font = '400 18px "Segoe UI", sans-serif';
  ctx.fillStyle = "#bcd9e6";
  ctx.fillText("P resume · Enter resume · Esc quit to menu (sortie saved for Continue)", W / 2, H * 0.42 + 42);
}

export function drawResultScreen(ctx, W, H, snap) {
  overlay(ctx, W, H, 0.58);
  const r = snap.result;
  ctx.textAlign = "center";
  ctx.fillStyle = r.finished ? "#57e389" : "#ff7a6e";
  ctx.font = '800 38px "Segoe UI", sans-serif';
  ctx.fillText(r.title, W / 2, H * 0.24);
  ctx.fillStyle = "#eaf6fb";
  ctx.font = '400 19px "Segoe UI", sans-serif';
  wrapText(ctx, r.reason, W / 2, H * 0.24 + 44, 640, 27);
  if (r.finished) {
    ctx.font = '800 30px "Segoe UI", sans-serif';
    ctx.fillStyle = "#ffcf4d";
    ctx.fillText("★".repeat(r.stars) + "☆".repeat(3 - r.stars), W / 2, H * 0.24 + 108);
  }
  ctx.font = '600 20px "Segoe UI", sans-serif';
  ctx.fillStyle = "#dceef5";
  const breakdown = r.parts ? [
    r.parts.rings ? `rings +${r.parts.rings}` : null,
    r.parts.drop ? `drop +${r.parts.drop}` : null,
    r.parts.landing ? `landing +${r.parts.landing}` : null,
    r.parts.stalls ? `stalls −${r.parts.stalls}` : null,
  ].filter(Boolean).join("  ·  ") : "";
  const rows = [
    `Score  ${Math.round(r.score)}`,
    breakdown || null,
    `Time  ${formatTime(r.seconds)}`,
    `Rings  ${r.ringsFlown}/${snap.mission.rings.length}`,
    r.landingNote ? `Landing  ${r.landingNote}` : null,
    r.isBest ? "New best score on this sortie!" : null,
  ].filter(Boolean);
  rows.forEach((row, i) => ctx.fillText(row, W / 2, H * 0.46 + i * 32));
  ctx.fillStyle = "#57e389";
  ctx.font = '700 21px "Segoe UI", sans-serif';
  ctx.fillText("Enter — back to the menu", W / 2, H * 0.82);
}

export function drawHelpScreen(ctx, W, H) {
  overlay(ctx, W, H, 0.72);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffcf4d";
  ctx.font = '800 32px "Segoe UI", sans-serif';
  ctx.fillText("HOW TO FLY A GLIDER", W / 2, H * 0.16);
  ctx.textAlign = "left";
  ctx.font = '400 18px "Segoe UI", sans-serif';
  ctx.fillStyle = "#eaf6fb";
  const lines = [
    "You have no engine. Height is your fuel tank; speed is how you spend it.",
    "Mouse: move it like a stick — pull toward you to climb, push to dive, slide to bank.",
    "Keys: W/S pitch · A/D bank · Shift airbrake · X drop mail · C cockpit/chase · P pause.",
    "Thermals are rising air. Find their spirals of snow, the circling gulls,",
    "and a variometer that beeps faster as the lift strengthens. Circle inside to climb.",
    "Watch the stall: too slow and the wing drops. Nose down, let speed build, then climb.",
    "Landing: line up on the ice strip, airbrake to bleed height, touch down slow and flat.",
    `Best glide is near ${Math.round(GLIDER.bestGlideSpeed * 3.6)} km/h. Far below it you sink; far above it drag eats you.`,
  ];
  lines.forEach((line, i) => ctx.fillText(line, W / 2 - 360, H * 0.16 + 58 + i * 30));
  ctx.textAlign = "center";
  ctx.fillStyle = "#57e389";
  ctx.font = '700 20px "Segoe UI", sans-serif';
  ctx.fillText("Esc — back", W / 2, H * 0.88);
}

export function drawLoadingScreen(ctx, W, H, progress) {
  ctx.fillStyle = "#0b1622";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ffe9a8";
  ctx.font = '800 34px "Segoe UI", sans-serif';
  ctx.fillText("THERMAL GLIDE", W / 2, H * 0.42);
  ctx.fillStyle = "#24435c";
  roundRect(ctx, W / 2 - 210, H * 0.42 + 34, 420, 16, 8);
  ctx.fill();
  ctx.fillStyle = "#57b6e3";
  roundRect(ctx, W / 2 - 210, H * 0.42 + 34, 420 * clamp(progress, 0, 1), 16, 8);
  ctx.fill();
  ctx.fillStyle = "#9fc6d6";
  ctx.font = '400 15px "Segoe UI", sans-serif';
  ctx.fillText("Carving the fjord, raising the thermals…", W / 2, H * 0.42 + 76);
}

export function drawErrorScreen(ctx, W, H, message) {
  ctx.fillStyle = "#160f0f";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#ff7a6e";
  ctx.font = '800 30px "Segoe UI", sans-serif';
  ctx.fillText("THE GLIDER COULD NOT TAKE OFF", W / 2, H * 0.4);
  ctx.fillStyle = "#e8dcdc";
  ctx.font = '400 17px "Segoe UI", sans-serif';
  wrapText(ctx, message, W / 2, H * 0.4 + 44, 560, 26);
}

// ---------- helpers ----------

export function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function panel(ctx, x, y, w, h, alpha) {
  ctx.fillStyle = `rgba(8,15,22,${alpha})`;
  roundRect(ctx, x, y, w, h, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(140,190,215,0.35)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, w, h, 10);
  ctx.stroke();
}

function overlay(ctx, W, H, alpha) {
  ctx.fillStyle = `rgba(5,10,16,${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function blinkText(ctx, x, y, text, colour, size, time) {
  if (Math.sin(time * 9) < -0.25) return;
  ctx.font = `800 ${size}px "Segoe UI", sans-serif`;
  ctx.textAlign = "center";
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
}

function blinkSoft(ctx, time) {
  // A gentle breathing alpha for "press Enter" prompts. The caller draws
  // immediately after; the next screen resets alpha when it paints.
  ctx.globalAlpha = 0.7 + Math.sin(time * 3) * 0.3;
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let yy = y;
  for (const word of words) {
    const trial = line ? line + " " + word : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineHeight;
    } else {
      line = trial;
    }
  }
  if (line) ctx.fillText(line, x, yy);
  return yy;
}
