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
  // working thermal's column and its gulls in the near distance.
  chase: {
    missionIndex: 0,
    view: "chase",
    glider: { x: 150, y: 310, z: -1150, heading: -0.17, pitch: 0.05, roll: -0.18, speed: 25 },
    dayPhase: 0.14,
    simSeconds: 40,
    score: 300,
    seconds: 42,
  },
  // Cockpit: instruments lit, circling inside a strong thermal — the
  // variometer needle lives on the lift side here.
  cockpit: {
    missionIndex: 0,
    view: "cockpit",
    glider: { x: 120, y: 350, z: -1500, heading: -0.22, pitch: 0.02, roll: 0.3, speed: 23 },
    dayPhase: 0.3,
    simSeconds: 40,
    score: 450,
    seconds: 65,
  },
  // Aurora run: night, lit rings in sequence, lighthouse sweeping.
  aurora: {
    missionIndex: 4,
    view: "chase",
    glider: { x: 300, y: 375, z: -1650, heading: 0.35, pitch: 0.03, roll: -0.12, speed: 25 },
    dayPhase: 0.86,
    simSeconds: 40,
    score: 650,
    seconds: 97,
    ringIndex: 1,
  },
  // Landing: the payoff moment — just touched down on the ice strip,
  // brakes out, spray flying, the grade on screen, all rings flown.
  landing: {
    missionIndex: 0,
    view: "chase",
    glider: { x: LANDING_X, y: RUNWAY.groundY + 1.6, z: RUNWAY.centreZ + 260, heading: 0, pitch: 0, roll: 0, speed: 17, airbrake: true },
    dayPhase: 0.42,
    simSeconds: 40,
    score: 1150,
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
