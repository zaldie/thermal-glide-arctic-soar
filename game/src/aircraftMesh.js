// aircraftMesh.js — the aircraft as a small scale model, built from
// lathe, wing, box and sphere parts. One job: describe the airframe's
// geometry — the sci-fi jet the user picked from the concept sheet:
// white angular fuselage, two-panel swept wings, downward winglets,
// twin fins, and cyan light strips along the wing leading edges, spine
// and intakes, with a glowing cyan engine core. Pure looks: the physics
// underneath is still the same engineless energy model. Returns raw
// geometries; renderWorld.js uploads and draws them.

import { MeshBuilder } from "./glMesh.js";

export function buildAircraftGeometries() {
  const body = new MeshBuilder();
  {
    const white = [0.92, 0.94, 0.96];
    const grey = [0.78, 0.82, 0.86];
    const dark = [0.12, 0.14, 0.17];
    body.lathe([
      [-4.8, 0.02], [-4.3, 0.18], [-3.4, 0.38], [-2.4, 0.52], [-1.2, 0.6],
      [0.2, 0.62], [1.4, 0.56], [2.6, 0.44], [3.4, 0.3], [3.8, 0.22],
    ], 16, white, 0.4);
    // Tail cone.
    body.lathe([[3.8, 0.22], [3.95, 0.27], [4.08, 0.2]], 12, dark, 0.2);
    // Two-panel swept wings: white inner, grey outer, kinked like the art.
    body.wing(0.25, 3.1, -0.08, -1.15, -0.15, 2.0, 1.25, 0.09, white, 0.2);
    body.wing(-0.25, -3.1, -0.08, -1.15, -0.15, 2.0, 1.25, 0.09, white, 0.2);
    body.wing(3.1, 5.6, -0.08, -0.15, 0.75, 1.25, 0.6, 0.08, grey, 0.2);
    body.wing(-3.1, -5.6, -0.08, -0.15, 0.75, 1.25, 0.6, 0.08, grey, 0.2);
    // Downward winglets at the tips.
    body.box(5.58, -0.38, 1.02, 0.07, 0.62, 0.68, grey, 0.16);
    body.box(-5.58, -0.38, 1.02, 0.07, 0.62, 0.68, grey, 0.16);
    // Side intakes.
    body.box(0.52, -0.15, 0.3, 0.36, 0.4, 1.4, dark, 0.12);
    body.box(-0.52, -0.15, 0.3, 0.36, 0.4, 1.4, dark, 0.12);
    // Swept tailplanes and twin fins.
    body.wing(0.12, 2.2, 0.02, 2.7, 3.25, 0.95, 0.5, 0.07, grey, 0.16);
    body.wing(-0.12, -2.2, 0.02, 2.7, 3.25, 0.95, 0.5, 0.07, grey, 0.16);
    body.box(0.72, 0.72, 3.15, 0.08, 1.1, 0.9, white, 0.16);
    body.box(-0.72, 0.72, 3.15, 0.08, 1.1, 0.9, white, 0.16);
  }
  const canopy = new MeshBuilder();
  canopy.sphere(0, 0.34, -2.0, 0.44, [0.1, 0.2, 0.3], 1.0, 0.76);
  canopy.sphere(0, 0.32, -1.4, 0.48, [0.1, 0.2, 0.3], 1.0, 0.76);
  // Cyan light strips: wing leading edges, spine and intake rims.
  const accents = new MeshBuilder();
  {
    const cyan = [0.25, 0.85, 1.0];
    accents.wing(3.15, 5.55, 0.03, -0.12, 0.72, 0.17, 0.13, 0.02, cyan, 0);
    accents.wing(-3.15, -5.55, 0.03, -0.12, 0.72, 0.17, 0.13, 0.02, cyan, 0);
    accents.box(0, 0.6, -0.5, 0.15, 0.05, 3.2, cyan, 0);
    accents.box(0.52, -0.15, -0.42, 0.38, 0.42, 0.05, cyan, 0);
    accents.box(-0.52, -0.15, -0.42, 0.38, 0.42, 0.05, cyan, 0);
    accents.box(0.72, 1.3, 3.15, 0.09, 0.2, 0.9, cyan, 0);
    accents.box(-0.72, 1.3, 3.15, 0.09, 0.2, 0.9, cyan, 0);
  }
  const brakes = new MeshBuilder();
  brakes.box(2.2, 0.1, 0.1, 1.3, 0.26, 0.6, [0.3, 0.34, 0.4], 0.1);
  brakes.box(-2.2, 0.1, 0.1, 1.3, 0.26, 0.6, [0.3, 0.34, 0.4], 0.1);
  const navLights = new MeshBuilder();
  navLights.sphere(-5.6, -0.08, 1.35, 0.24, [1, 0.2, 0.2], 0);
  navLights.sphere(5.6, -0.08, 1.35, 0.24, [0.2, 1, 0.45], 0);
  const strobe = new MeshBuilder();
  strobe.sphere(0, 0.15, 3.9, 0.22, [1, 1, 1], 0);
  const burner = new MeshBuilder();
  burner.sphere(0, 0, 4.02, 0.17, [0.3, 0.85, 1.0], 0);
  // Control surfaces, built in hinge-local space (hinge line at the
  // origin, surface extending outward and aft) so renderWorld can
  // swing them around their hinges with the pilot's stick.
  const grey = [0.78, 0.82, 0.86];
  const aileronR = new MeshBuilder();
  aileronR.box(1.05, 0, 0.22, 2.1, 0.05, 0.44, grey, 0.2);
  const aileronL = new MeshBuilder();
  aileronL.box(-1.05, 0, 0.22, 2.1, 0.05, 0.44, grey, 0.2);
  const elevatorR = new MeshBuilder();
  elevatorR.box(0.75, 0, 0.18, 1.5, 0.045, 0.36, grey, 0.2);
  const elevatorL = new MeshBuilder();
  elevatorL.box(-0.75, 0, 0.18, 1.5, 0.045, 0.36, grey, 0.2);
  return {
    body: body.build(),
    canopy: canopy.build(),
    accents: accents.build(),
    brakes: brakes.build(),
    navLights: navLights.build(),
    strobe: strobe.build(),
    burner: burner.build(),
    aileronR: aileronR.build(),
    aileronL: aileronL.build(),
    elevatorR: elevatorR.build(),
    elevatorL: elevatorL.build(),
  };
}
