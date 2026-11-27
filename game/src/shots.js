// shots.js — deterministic screenshot scenes for the entry's screenshots.
// One job: read ?shot=<name> from the URL and describe a frozen, composed
// moment of the real game — same physics state, same sky, same HUD — so
// the maker's screenshot script can capture the game exactly as it plays.
// Scenes are set dressing only: no rendering tricks, nothing the player
// cannot reach in normal flight. simSeconds ages the sky before the
// capture so thermals stand at working strength, as they do a minute
// into a real flight; score/seconds/ringIndex dress the HUD the way
// that moment in the sortie would read.

import { RUNWAY } from "./terrainSvarra.js";
import { MISSIONS } from "./missions.js";

const LANDING_X = RUNWAY.centreX + 6;

export const SHOT_SCENES = {
  // Cover: chase view down the fjord side, first ring gold ahead, a
  // working thermal's column and its gulls in the near distance. (The
  // Supply Drop was tried as the cover twice: the drop circle sits on
  // a steep brown slope, and every honest approach angle fills the
  // frame with hillside — the fjord is the game's face. The drop verb
  // is carried by the mission outline and the parcel the player
  // watches fall in real flight.)
  chase: {
    missionIndex: 0,
    view: "chase",
    glider: { x: 150, y: 310, z: -1150, heading: -0.17, pitch: 0.05, roll: -0.18, speed: 25, stress: 0.1 },
    dayPhase: 0.14,
    simSeconds: 40,
    score: 0,
    seconds: 42,
  },
  // Cockpit: Fjord Run in its crosswind, flown hot — past the placard
  // speed, the OVERSPEED tag lit and the STRUCT bar showing what the
  // dive is costing the airframe. Instruments lit, canopy frame around
  // the pilot, the first gate gold in the windscreen.
  cockpit: {
    missionIndex: 1,
    view: "cockpit",
    glider: { x: -150, y: 395, z: 1950, heading: -0.05, pitch: 0.02, roll: 0.3, speed: 43, overspeed: true, stress: 0.45 },
    dayPhase: 0.22,
    simSeconds: 40,
    score: 0,
    seconds: 58,
  },
  // Aurora run: night, lit rings in sequence, lighthouse sweeping.
  aurora: {
    missionIndex: 4,
    view: "chase",
    glider: { x: 300, y: 375, z: -1650, heading: 0.35, pitch: 0.03, roll: -0.12, speed: 25, stress: 0.15 },
    dayPhase: 0.86,
    simSeconds: 40,
    score: 300,
    seconds: 97,
    ringIndex: 1,
  },
  // Drop: the mail run a second after release — parcel under its
  // canopy just ahead and below the glider, the drop circle dead ahead
  // on the shore at Port Svarra, both guide rings already flown. The
  // approach runs close, from the north-west at 220 m out: from across
  // the fjord the circle hid behind the ridge and read as a speck, so
  // the frame is taken where the player actually releases — low, near,
  // with the village at the circle's shoulder.
  drop: {
    missionIndex: 2,
    view: "chase",
    glider: { x: 499, y: 425, z: -2318, heading: 2.14, pitch: 0, roll: 0.2, speed: 25, stress: 0.18 },
    dayPhase: 0.24,
    simSeconds: 40,
    score: 600,
    seconds: 88,
    ringIndex: 2,
    parcel: { x: 504, y: 421.5, z: -2315 },
    message: "MAIL AWAY",
  },
  // Storm: Storm Line with the squall wall at the glider's shoulder —
  // simSeconds marches the wall in from its far-west start until its
  // face is ~550 m west of the first gate, close enough that the snow
  // streaks and the STORM warning read on the HUD. STRUCT near half:
  // the pilot is spending the airframe to beat the weather.
  storm: {
    missionIndex: 3,
    view: "chase",
    glider: { x: -700, y: 420, z: 250, heading: 0.9, pitch: 0.04, roll: 0.28, speed: 29, stress: 0.52 },
    dayPhase: 0.38,
    simSeconds: 188,
    score: 300,
    seconds: 51,
    ringIndex: 1,
  },
  // Result: Supply Drop flown home — the results panel a real finish
  // prints, breakdown lines and all, over the strip it ended on. This
  // is the depth receipt: rings, the drop itself, the landing note.
  result: {
    missionIndex: 2,
    view: "chase",
    glider: { x: LANDING_X, y: RUNWAY.groundY + 1.6, z: RUNWAY.centreZ + 260, heading: 0, pitch: 0, roll: 0, speed: 17, airbrake: true, stress: 0.22 },
    dayPhase: 0.3,
    simSeconds: 40,
    score: 1050,
    seconds: 186,
    ringIndex: 2,
    dropped: true,
    result: {
      title: "SORTIE COMPLETE",
      reason: "Every objective flown and a landing the strip crew would applaud.",
      stars: 3,
      ringsFlown: 2,
      isBest: true,
      landingNote: "touchdown at 61 km/h, sink -1.1 m/s",
      parts: { rings: 600, drop: 450, landing: 0, stalls: 0 },
    },
  },
  // Landing: the payoff moment — just touched down on the ice strip,
  // brakes out, spray flying, the grade on screen, all rings flown.
  landing: {
    missionIndex: 0,
    view: "chase",
    glider: { x: LANDING_X, y: RUNWAY.groundY + 1.6, z: RUNWAY.centreZ + 260, heading: 0, pitch: 0, roll: 0, speed: 17, airbrake: true, stress: 0.22 },
    dayPhase: 0.42,
    simSeconds: 40,
    score: 900,
    seconds: 132,
    ringIndex: 3,
    touchdown: { sink: -1.1 },
  },
};

export function readShotScene() {
  const params = new URLSearchParams(window.location.search);
  const name = params.get("shot");
  if (!name) return null;
  const scene = SHOT_SCENES[name];
  if (!scene) return null;
  return { name, ...scene, mission: MISSIONS[scene.missionIndex] };
}
