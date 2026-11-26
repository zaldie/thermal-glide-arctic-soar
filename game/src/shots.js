// shots.js — deterministic screenshot scenes for the entry's screenshots.
// One job: read ?shot=<name> from the URL and describe a frozen, composed
// moment of the real game — same physics state, same sky, same HUD — so the
// maker's screenshot script can capture the game exactly as it plays.
// Scenes are set dressing only: no rendering tricks, nothing the player
// cannot reach in normal flight.

import { RUNWAY, terrainHeight } from "./terrainSvarra.js";
import { MISSIONS } from "./missions.js";

const LANDING_X = RUNWAY.centreX + 6;
const LANDING_Z = RUNWAY.centreZ + 430;

export const SHOT_SCENES = {
  // Cover: chase view down the fjord side, first ring gold ahead, climbing.
  chase: {
    missionIndex: 0,
    view: "chase",
    glider: { x: RUNWAY.centreX - 120, y: RUNWAY.groundY + 315, z: RUNWAY.centreZ + 900, heading: -0.18, pitch: 0.06, roll: -0.22, speed: 25 },
    dayPhase: 0.14,
    simSeconds: 0,
  },
  // Cockpit: instruments lit inside a thermal, village and runway in view.
  cockpit: {
    missionIndex: 0,
    view: "cockpit",
    glider: { x: RUNWAY.centreX + 160, y: RUNWAY.groundY + 300, z: RUNWAY.centreZ + 420, heading: 0.35, pitch: 0.02, roll: 0.38, speed: 23 },
    dayPhase: 0.3,
    simSeconds: 0,
  },
  // Aurora run: night, lit rings in sequence, lighthouse sweeping.
  aurora: {
    missionIndex: 4,
    view: "chase",
    glider: { x: RUNWAY.centreX - 260, y: RUNWAY.groundY + 330, z: RUNWAY.centreZ + 1050, heading: -0.12, pitch: 0.03, roll: -0.16, speed: 25 },
    dayPhase: 0.86,
    simSeconds: 0,
  },
  // Landing: final approach over the threshold, brakes out, squall behind.
  landing: {
    missionIndex: 3,
    view: "chase",
    glider: { x: LANDING_X, y: terrainHeight(LANDING_X, LANDING_Z) + 44, z: LANDING_Z, heading: 0.02, pitch: -0.04, roll: 0.03, speed: 19, airbrake: true },
    dayPhase: 0.42,
    simSeconds: 0,
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
