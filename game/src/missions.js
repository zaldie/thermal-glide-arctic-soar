// missions.js — the six Svarra sorties and Free Soar.
// One job: describe each mission as data — start, rings, objectives, scoring
// targets — so main.js runs them and the menu can list them. A ring is a
// gate in the sky: fly through its disc and it counts, gold centre included.

import { RUNWAY, DROP_ZONE } from "./terrainSvarra.js";

function ring(x, y, z, radius = 62) {
  return { x, y, z, radius, passed: false };
}

// Heading 0 flies north (toward -z). A glider that starts south of the
// runway on heading 0 is already lined up for its landing approach, so most
// sorties start there and let the rings pull the pilot off the line.
function startSouthOfRunway(altitude, speed = 26, offsetX = 0) {
  return {
    x: RUNWAY.centreX + offsetX,
    y: RUNWAY.groundY + altitude,
    z: RUNWAY.centreZ + 1500,
    heading: 0,
    speed,
  };
}

export const MISSIONS = [
  {
    id: "first-glide",
    name: "1 · First Glide",
    brief: "Three rings, one gentle thermal, then home. Learn the sky.",
    taskLine: "Thread the three training rings",
    start: startSouthOfRunway(330),
    sky: { startPhase: 0.08, squall: false, windX: 2.2, windZ: 0.7 },
    rings: [
      ring(RUNWAY.centreX - 260, RUNWAY.groundY + 300, RUNWAY.centreZ + 620),
      ring(RUNWAY.centreX + 240, RUNWAY.groundY + 265, RUNWAY.centreZ - 60),
      ring(RUNWAY.centreX, RUNWAY.groundY + 190, RUNWAY.centreZ - 760),
    ],
    objective: "rings",
    landAtRunway: true,
    starTimes: [150, 210, 300],
    seed: 11,
  },
  {
    id: "fjord-run",
    name: "2 · Fjord Run",
    brief: "Six rings down the winding fjord in a crosswind. Stay low, stay quick.",
    taskLine: "Race the fjord gates",
    start: { x: -500, y: 430, z: 2500, heading: 0.5, speed: 27 },
    sky: { startPhase: 0.16, squall: false, windX: 6.4, windZ: -1.8 },
    rings: [
      ring(-180, 380, 1500),
      ring(240, 330, 620),
      ring(-320, 300, -300),
      ring(180, 285, -1200),
      ring(-140, 260, -2050),
      ring(RUNWAY.centreX - 200, RUNWAY.groundY + 210, RUNWAY.centreZ - 500),
    ],
    objective: "rings",
    landAtRunway: true,
    starTimes: [210, 280, 380],
    seed: 23,
  },
  {
    id: "supply-drop",
    name: "3 · Supply Drop",
    brief: "Carry the mail to Port Svarra: release over the drop circle, then land.",
    taskLine: "Run the mail to Port Svarra",
    start: startSouthOfRunway(380, 26, -300),
    sky: { startPhase: 0.24, squall: false, windX: 3.6, windZ: 1.4 },
    rings: [
      ring(RUNWAY.centreX - 420, RUNWAY.groundY + 330, RUNWAY.centreZ + 500),
      // On the shore line to the circle. (It first sat north of the
      // village at y 314 with the hillside at 463 — inside the hill,
      // unpassable; the audit that measured every gate against the
      // terrain moved it onto the descent.)
      ring(350, 350, DROP_ZONE.z + 70),
    ],
    objective: "drop",
    dropZone: DROP_ZONE,
    landAtRunway: true,
    starTimes: [200, 270, 360],
    seed: 37,
  },
  {
    id: "storm-line",
    name: "4 · Storm Line",
    brief: "A squall is marching in from the west. Five rings before it eats the route.",
    taskLine: "Beat the squall to the last ring",
    start: { x: -1400, y: 470, z: 900, heading: 0.9, speed: 28 },
    sky: { startPhase: 0.38, squall: true, squallSpeed: 21, windX: 7.5, windZ: 2.6 },
    rings: [
      ring(-700, 420, 250),
      ring(60, 380, -350),
      ring(620, 340, -950),
      ring(RUNWAY.centreX - 350, RUNWAY.groundY + 260, RUNWAY.centreZ - 150),
      ring(RUNWAY.centreX, RUNWAY.groundY + 185, RUNWAY.centreZ - 720),
    ],
    objective: "rings",
    landAtRunway: true,
    starTimes: [190, 250, 340],
    seed: 49,
  },
  {
    id: "aurora-run",
    name: "5 · Aurora Run",
    brief: "Night. Weak lift, lit rings, and a landing judged to the metre.",
    taskLine: "Chase lit rings under the aurora",
    start: startSouthOfRunway(360, 26, 200),
    sky: { startPhase: 0.82, squall: false, phaseLength: 900, windX: 1.1, windZ: 0.4 },
    rings: [
      ring(RUNWAY.centreX - 520, RUNWAY.groundY + 330, RUNWAY.centreZ + 780),
      ring(RUNWAY.centreX + 430, RUNWAY.groundY + 310, RUNWAY.centreZ + 120),
      ring(RUNWAY.centreX - 300, RUNWAY.groundY + 285, RUNWAY.centreZ - 480),
      // (Moved west and up from a first spot whose hillside stood
      // 39 m over the gate's centre — the pass sphere never reached
      // the air above it. Descent 349 → 296 → 244 preserved.)
      ring(400, 296, RUNWAY.centreZ - 850),
      ring(RUNWAY.centreX, RUNWAY.groundY + 180, RUNWAY.centreZ - 1350),
    ],
    objective: "rings",
    landAtRunway: true,
    precisionLanding: true,
    starTimes: [230, 300, 400],
    seed: 67,
  },
  {
    id: "dead-calm",
    name: "6 · Dead Calm",
    brief: "Dusk, and the sky has gone to sleep: almost no lift anywhere. Four low rings on one tank of height — every metre is spent, none is earned back.",
    taskLine: "Four low rings, one tank of height",
    start: startSouthOfRunway(300, 25, -100),
    sky: { startPhase: 0.46, squall: false, windX: 0.8, windZ: 0.3 },
    thermalScale: 0.15,
    rings: [
      ring(RUNWAY.centreX - 300, RUNWAY.groundY + 215, RUNWAY.centreZ + 700),
      ring(RUNWAY.centreX + 260, RUNWAY.groundY + 185, RUNWAY.centreZ + 60),
      ring(RUNWAY.centreX - 180, RUNWAY.groundY + 160, RUNWAY.centreZ - 520),
      // (280 m closer than first authored: at centreZ - 980 the
      // ground stands at 292, 88 m over this gate's centre — in the
      // one mission with no lift to spare, an unpassable final gate.)
      ring(RUNWAY.centreX, RUNWAY.groundY + 140, RUNWAY.centreZ - 700),
    ],
    objective: "rings",
    landAtRunway: true,
    precisionLanding: true,
    starTimes: [170, 230, 320],
    seed: 83,
  },
];

export const FREE_SOAR = {
  id: "free-soar",
  name: "Free Soar",
  brief: "No rings, no clock. The whole archipelago and a slow sunset.",
  start: startSouthOfRunway(420, 26, -500),
  sky: { startPhase: 0.05, squall: false, phaseLength: 600 },
  rings: [],
  objective: "free",
  landAtRunway: false,
  starTimes: null,
  seed: 5,
};

// Scoring, kept here so the results screen and the audit read the same rules.
export const SCORE = {
  ringCentre: 300,
  ringEdge: 140,
  landingPrecisionMax: 500, // aurora run: full marks on the numbers
  dropAccurate: 450,
  dropNear: 200,
  stallPenalty: 60,
};

export function starsFor(mission, seconds, finished) {
  if (!finished || !mission.starTimes) return 0;
  if (seconds <= mission.starTimes[0]) return 3;
  if (seconds <= mission.starTimes[1]) return 2;
  if (seconds <= mission.starTimes[2]) return 1;
  return 1;
}
