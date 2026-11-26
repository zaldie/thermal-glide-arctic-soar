// terrainSvarra.js — the Svarra Archipelago: a deterministic procedural heightmap.
// One job: answer "how high is the ground at (x, z)?" and describe the landmarks
// (ice runway, fishing village, lighthouse, drop zone) that missions refer to.
// The world is 12,000 m by 12,000 m, centred on (0, 0). Sea level is y = 0;
// the glider flies at positive y above it. Everything is a pure function of
// position and a fixed seed, so every run and every screenshot is identical.

export const WORLD_HALF = 6000;
export const SEA_LEVEL = 0;

// A tiny deterministic value-noise so ridges look carved, not sinusoidal.
function hashNoise(ix, iz) {
  let n = ix * 374761393 + iz * 668265263;
  n = (n ^ (n >> 13)) * 1274126177;
  return (((n ^ (n >> 16)) >>> 0) % 10000) / 10000;
}

function smoothNoise(x, z, cell) {
  const ix = Math.floor(x / cell);
  const iz = Math.floor(z / cell);
  const fx = x / cell - ix;
  const fz = z / cell - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const a = hashNoise(ix, iz);
  const b = hashNoise(ix + 1, iz);
  const c = hashNoise(ix, iz + 1);
  const d = hashNoise(ix + 1, iz + 1);
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
}

// The fjord is a winding channel carved below sea level. Its centreline is
// x = fjordCentreZ(z); terrain within FJORD_HALF_WIDTH of it is water.
export function fjordCentreX(z) {
  return Math.sin(z * 0.00042) * 620 + Math.sin(z * 0.0011 + 1.7) * 180;
}
const FJORD_HALF_WIDTH = 330;

export function terrainHeight(x, z) {
  // Base mountain mass: layered ridges rising away from the fjord.
  const distFjord = Math.abs(x - fjordCentreX(z));
  const ridge =
    150 * Math.sin(x * 0.0009 + 2.1) * Math.cos(z * 0.0007) +
    120 * Math.sin(x * 0.00045 - 1.2) * Math.sin(z * 0.0013 + 0.6) +
    260 * smoothNoise(x, z, 900) +
    90 * smoothNoise(x, z, 260) +
    26 * smoothNoise(x, z, 70);
  // Land climbs steeply once you leave the water's edge.
  const shore = Math.min(1, Math.max(0, (distFjord - FJORD_HALF_WIDTH) / 700));
  let h = -14 + shore * shore * (210 + ridge);
  // Two feature peaks the player learns to recognise.
  h += peak(x, z, -2100, -1600, 950, 330);
  h += peak(x, z, 2400, 1900, 1050, 360);
  h += peak(x, z, 1500, -2900, 800, 250);
  // Flatten the home plateau: the ice runway and village sit on it, and the
  // southern approach corridor is flattened too, so finals are flyable.
  const homeBlend = Math.max(
    plateauBlend(x, z, RUNWAY.centreX, RUNWAY.centreZ, 780),
    plateauBlend(x, z, RUNWAY.centreX, RUNWAY.centreZ + 560, 520) * 0.92,
  );
  h = h * (1 - homeBlend) + RUNWAY.groundY * homeBlend;
  // Flatten the far lighthouse point just enough to stand on.
  const lightBlend = plateauBlend(x, z, LIGHTHOUSE.x, LIGHTHOUSE.z, 260);
  h = h * (1 - lightBlend) + 26 * lightBlend;
  return h;
}

function peak(x, z, px, pz, radius, height) {
  const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
  const t = Math.max(0, 1 - d2 / (radius * radius));
  return height * t * t;
}

function plateauBlend(x, z, px, pz, radius) {
  const d = Math.hypot(x - px, z - pz);
  if (d >= radius) return 0;
  const t = 1 - d / radius;
  return t * t * (3 - 2 * t);
}

// Landmarks, all in world metres. The runway heading is north (toward -z).
export const RUNWAY = {
  centreX: fjordCentreX(-2600) + 980,
  centreZ: -2600,
  groundY: 64,
  length: 620,
  width: 46,
  headingRad: 0, // land travelling toward -z, touchdown zone at the south end
};

export const VILLAGE = {
  x: RUNWAY.centreX + 330,
  z: RUNWAY.centreZ + 420,
  name: "Port Svarra",
  houses: 14,
};

export const LIGHTHOUSE = {
  x: fjordCentreX(2900) - 520,
  z: 2900,
  name: "Svarra Light",
};

export const DROP_ZONE = {
  x: VILLAGE.x + 60,
  z: VILLAGE.z - 40,
  radius: 90,
  name: "Port Svarra drop circle",
};

// Surface classification for the renderer: water, snow, rock, ice runway.
export function surfaceAt(x, z, h) {
  if (h <= SEA_LEVEL + 1.5) return h < -16 ? "deepwater" : "water";
  const runwayDx = Math.abs(x - RUNWAY.centreX);
  const runwayDz = Math.abs(z - RUNWAY.centreZ);
  if (runwayDx <= RUNWAY.width / 2 && runwayDz <= RUNWAY.length / 2) return "runway";
  // Steep ground is bare warm rock, whatever its height.
  const e = 16;
  const slope = Math.max(
    Math.abs(terrainHeight(x + e, z) - terrainHeight(x - e, z)),
    Math.abs(terrainHeight(x, z + e) - terrainHeight(x, z - e)),
  ) / (2 * e);
  if (slope > 0.6) return "rock";
  if (h < SEA_LEVEL + 8) return "shore";
  // The high plateau is old ice where it lies flat.
  if (h > 248) return "ice";
  // Low, gentle ground carries the arctic summer: green tundra meadows and
  // rust-red shrub patches, laid down by one broad noise so they read as
  // country, not confetti.
  if (h < 128) {
    const patch = smoothNoise(x - 9000, z + 7000, 460);
    if (patch > 0.52) return "tundra";
    if (patch < 0.3) return "shrub";
  }
  const slopeNoise = smoothNoise(x + 5000, z - 3000, 180);
  if (h > 205 + slopeNoise * 70) return "rock";
  return "snow";
}

export const SURFACE_COLOURS = {
  deepwater: [18, 66, 108],
  water: [34, 110, 142],
  shore: [198, 178, 134],
  tundra: [102, 134, 66],
  shrub: [172, 102, 48],
  snow: [228, 237, 245],
  ice: [160, 214, 230],
  rock: [126, 100, 82],
  runway: [188, 205, 214],
};
