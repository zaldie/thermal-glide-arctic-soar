// worldScenery.js — the static world as geometry: forest, village,
// runway, lighthouse, boats and dock.
// One job: build the raw vertex buffers for everything in Svarra that
// never moves, so renderWorld.js only uploads and draws them. Houses
// are jittered in rotation, scale and paint so the village reads as
// built by people, not stamped by a die; boats ride the fjord by the
// harbour. Pure arrays out — no GL calls here.

import { MeshBuilder } from "./glMesh.js";
import { terrainHeight, surfaceAt, RUNWAY, VILLAGE, LIGHTHOUSE, WORLD_HALF, fjordCentreX } from "./terrainSvarra.js";

// Deterministic 2D hash, the forest's and village's shared dice —
// the renderer's long-standing dice, moved here unchanged so the
// forest grows in exactly the same places it always has.
export function treeHash(ix, iz) {
  let n = ix * 2246822519 + iz * 3266489917;
  n = (n ^ (n >> 15)) * 2654435761;
  return (((n ^ (n >> 13)) >>> 0) % 1000) / 1000;
}

export function buildSceneryGeometries() {
  const forest = new MeshBuilder();
  {
    const cell = 150;
    const span = Math.floor(WORLD_HALF / cell);
    for (let ix = -span; ix <= span; ix++) {
      for (let iz = -span; iz <= span; iz++) {
        if (treeHash(ix, iz) > 0.34) continue;
        const jx = ix * cell + (treeHash(ix + 40, iz) - 0.5) * 80;
        const jz = iz * cell + (treeHash(ix, iz + 40) - 0.5) * 80;
        const gy = terrainHeight(jx, jz);
        if (gy < 18 || gy > 215) continue;
        const surf = surfaceAt(jx, jz, gy);
        if (surf !== "snow" && surf !== "shore" && surf !== "tundra") continue;
        const s = 0.8 + treeHash(ix - 40, iz + 9) * 0.55;
        const shade = 0.85 + treeHash(ix + 7, iz - 40) * 0.35;
        const fol = [0.13 * shade, 0.28 * shade, 0.22 * shade];
        forest.box(jx, gy + 1.5 * s, jz, 0.55 * s, 3 * s, 0.55 * s, [0.29, 0.22, 0.15], 0.02);
        if (treeHash(ix + 99, iz - 99) > 0.55) {
          // Round-crowned pine: a ball of foliage with a snowy cap.
          forest.sphere(jx, gy + 7.6 * s, jz, 3.6 * s, fol, 0.03);
          forest.cone(jx, gy + 11.2 * s, jz, 1.5 * s, 4.2 * s, 6, [0.93, 0.96, 0.98], 0.05);
        } else {
          forest.cone(jx, gy + 2.6 * s, jz, 3.5 * s, 9.5 * s, 7, fol, 0.03);
          forest.cone(jx, gy + 7.2 * s, jz, 2.4 * s, 7.5 * s, 7, fol, 0.03);
          forest.cone(jx, gy + 12.6 * s, jz, 0.95 * s, 2.4 * s, 6, [0.93, 0.96, 0.98], 0.05);
        }
      }
    }
  }

  const village = new MeshBuilder();
  const windows = new MeshBuilder();
  const wallPalette = [
    [0.71, 0.31, 0.18], // harbour red
    [0.48, 0.29, 0.20], // weathered brown
    [0.62, 0.55, 0.44], // driftwood grey-tan
    [0.36, 0.42, 0.48], // slate blue-grey
    [0.78, 0.62, 0.30], // ochre
  ];
  for (let i = 0; i < VILLAGE.houses; i++) {
    const hx = VILLAGE.x + ((i * 67) % 220) - 110 + (treeHash(i, 7) - 0.5) * 26;
    const hz = VILLAGE.z + ((i * 113) % 200) - 100 + (treeHash(3, i) - 0.5) * 26;
    const gy = terrainHeight(hx, hz);
    // Skip ground too steep to build on — a house stamped across a
    // cliff reads as a bug, not a village.
    if (Math.abs(terrainHeight(hx + 9, hz) - gy) > 6.5 || Math.abs(terrainHeight(hx, hz + 9) - gy) > 6.5) continue;
    const rotY = (treeHash(i, 21) - 0.5) * 0.85;
    const hs = 0.85 + treeHash(i, 33) * 0.4;
    const wall = wallPalette[i % wallPalette.length];
    village.box(hx, gy + 4.5 * hs, hz, 16 * hs, 9 * hs, 13 * hs, wall, 0.04, rotY);
    village.roof(hx, gy + 9 * hs, hz, 18.5 * hs, 5 * hs, 15.5 * hs, [0.91, 0.89, 0.83], 0.05, rotY);
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    for (const dx of [-3.6, 3.6]) {
      const wx = hx + (dx * hs) * cos - (6.56 * hs) * sin;
      const wz = hz + (dx * hs) * sin + (6.56 * hs) * cos;
      windows.box(wx, gy + 4.6 * hs, wz, 1.7, 1.7, 0.24, [1.0, 0.77, 0.38], 0, rotY);
    }
  }

  // Boats on the fjord by the harbour, and a dock reaching out to them.
  const boats = new MeshBuilder();
  for (let k = 0; k < 3; k++) {
    const bz = VILLAGE.z - 190 + k * 185;
    let bx = fjordCentreX(bz) + (treeHash(k, 51) - 0.5) * 150;
    if (terrainHeight(bx, bz) > -1) bx = fjordCentreX(bz);
    const rotY = (treeHash(k, 77) - 0.5) * 0.7;
    const hull = k === 1 ? [0.85, 0.87, 0.88] : [0.62, 0.22, 0.16];
    boats.box(bx, 0.9, bz, 3.4, 1.8, 10.5, hull, 0.12, rotY);
    boats.box(bx, 2.2, bz + 1.8, 2.4, 1.1, 3.2, [0.92, 0.9, 0.84], 0.08, rotY);
    boats.cylinder(bx, 1.6, bz - 1.6, 0.14, 7.5, 6, [0.4, 0.33, 0.24], 0.05);
  }
  {
    // Walk from the village toward the water until the shore, then lay
    // the dock from there out over the fjord.
    let sx = VILLAGE.x, sz = VILLAGE.z + 10;
    const cx = fjordCentreX(sz);
    const stepX = Math.sign(cx - sx) * 12;
    for (let s = 0; s < 30 && terrainHeight(sx, sz) > 0.6; s++) sx += stepX;
    boats.box(sx + stepX * 0.8, 1.7, sz, 26, 0.5, 4.2, [0.45, 0.36, 0.26], 0.06, 0);
    boats.cylinder(sx + stepX * 1.6, 0.2, sz - 1.8, 0.22, 3.4, 6, [0.4, 0.33, 0.24], 0.05);
    boats.cylinder(sx + stepX * 1.6, 0.2, sz + 1.8, 0.22, 3.4, 6, [0.4, 0.33, 0.24], 0.05);
  }

  const runway = new MeshBuilder();
  runway.box(RUNWAY.centreX, RUNWAY.groundY - 0.1, RUNWAY.centreZ, RUNWAY.width, 1, RUNWAY.length, [0.74, 0.80, 0.84], 0.06);
  for (let i = -4; i < 5; i++) {
    runway.box(RUNWAY.centreX, RUNWAY.groundY + 0.55, RUNWAY.centreZ + i * 62 + 15, 1.6, 0.08, 30, [0.95, 0.97, 0.98], 0.02);
  }
  runway.box(RUNWAY.centreX, RUNWAY.groundY + 0.55, RUNWAY.centreZ + RUNWAY.length / 2 - 14, RUNWAY.width - 6, 0.08, 2.4, [1.0, 0.81, 0.3], 0.02);

  const lightBase = terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
  const lighthouse = new MeshBuilder();
  lighthouse.cylinder(LIGHTHOUSE.x, lightBase, LIGHTHOUSE.z, 3.1, 40, 12, [0.91, 0.89, 0.85], 0.06);
  lighthouse.cylinder(LIGHTHOUSE.x, lightBase + 21, LIGHTHOUSE.z, 3.16, 7, 12, [0.76, 0.24, 0.16], 0.06);
  lighthouse.cylinder(LIGHTHOUSE.x, lightBase + 40, LIGHTHOUSE.z, 3.7, 1.4, 12, [0.16, 0.18, 0.2], 0.1);
  const lamp = new MeshBuilder();
  lamp.sphere(LIGHTHOUSE.x, lightBase + 43, LIGHTHOUSE.z, 1.9, [1.0, 0.84, 0.43], 0.2);
  // The rotating beam: a long flat cone of light along +Z from the lamp.
  const beam = (() => {
    const positions = [0, 0, 0], normals = [0, 1, 0], colors = [1, 0.9, 0.6], specs = [0], indices = [];
    const segs = 12, len = 340, rad = 30;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      positions.push(Math.cos(a) * rad, Math.sin(a) * rad, len);
      normals.push(0, 1, 0);
      colors.push(1, 0.9, 0.6);
      specs.push(0);
    }
    for (let i = 0; i < segs; i++) indices.push(0, i + 1, i + 2);
    return {
      positions: new Float32Array(positions), normals: new Float32Array(normals),
      colors: new Float32Array(colors), specs: new Float32Array(specs),
      indices: new Uint32Array(indices),
    };
  })();

  return {
    forest: forest.build(),
    village: village.build(),
    windows: windows.build(),
    boats: boats.build(),
    runway: runway.build(),
    lighthouse: lighthouse.build(),
    lamp: lamp.build(),
    beam,
    lightBase,
  };
}
