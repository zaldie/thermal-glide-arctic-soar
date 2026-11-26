// thermalSky.js — the Living Sky, Thermal Glide's signature system.
// One job: simulate the air itself. Thermals are born over surfaces the low
// arctic sun can warm (dark fjord water, exposed rock, village roofs), drift
// with the wind, strengthen and die; a snow squall wall marches across the
// map carrying a downdraft; the day slides from gold afternoon through blue
// dusk into aurora night, and the thermals weaken as the light goes.
// The physics file asks this file one question: airAt(x, y, z).

import { terrainHeight, fjordCentreX } from "./terrainSvarra.js";
import { clamp } from "./gliderPhysics.js";

// Deterministic per-thermal randomness from a seed, so a sortie replays.
function seededRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const THERMAL_COUNT = 9;

export function createSky(seed, options = {}) {
  const rand = seededRandom(seed * 7919 + 13);
  const thermals = [];
  for (let i = 0; i < THERMAL_COUNT; i++) {
    thermals.push(spawnThermal(rand, i, 0));
  }
  return {
    time: 0,
    // 0 = golden afternoon, 0.5 = blue dusk, 1 = aurora night.
    dayPhase: options.startPhase ?? 0.08,
    phaseLength: options.phaseLength ?? 420, // seconds for a full cycle
    windX: 2.2,
    windZ: 0.7,
    thermals,
    rand,
    squall: {
      active: !!options.squall,
      x: -5200, // the wall starts far west and marches east
      speed: options.squallSpeed ?? 26,
      width: 700,
    },
    birds: makeBirdFlocks(rand),
  };
}

function spawnThermal(rand, index, now) {
  // Anchor thermals over warm surfaces: mostly near the fjord and village,
  // scattered so a route between rings can chain them.
  const z = -3400 + rand() * 6400;
  const nearFjord = rand() < 0.62;
  const x = nearFjord
    ? fjordCentreX(z) + (rand() - 0.5) * 1500
    : (rand() - 0.5) * 5200;
  return {
    id: index,
    x, z,
    baseX: x,
    baseZ: z,
    radius: 150 + rand() * 130,
    peakLift: 3.1 + rand() * 2.3, // m/s at the core, before day-phase scaling
    bornAt: now,
    life: 75 + rand() * 85, // seconds from birth to death
    driftPhase: rand() * Math.PI * 2,
  };
}

function makeBirdFlocks(rand) {
  // Gulls circle inside strong thermals — the oldest lift instrument there is.
  const flocks = [];
  for (let i = 0; i < 4; i++) {
    flocks.push({
      thermalSlot: i,
      birds: 5 + Math.floor(rand() * 4),
      phase: rand() * Math.PI * 2,
      radius: 42 + rand() * 30,
      height: 120 + rand() * 160,
    });
  }
  return flocks;
}

// Thermal strength fades as the sun leaves: at aurora phase lift is a whisper.
export function thermalDayScale(dayPhase) {
  if (dayPhase < 0.45) return 1 - dayPhase * 0.55;
  if (dayPhase < 0.7) return 0.75 - (dayPhase - 0.45) * 1.1;
  return 0.48;
}

export function stepSky(sky, dt) {
  sky.time += dt;
  sky.dayPhase = Math.min(1, sky.dayPhase + dt / sky.phaseLength);
  const scale = thermalDayScale(sky.dayPhase);
  for (let i = 0; i < sky.thermals.length; i++) {
    const t = sky.thermals[i];
    const age = sky.time - t.bornAt;
    if (age > t.life) {
      sky.thermals[i] = spawnThermal(sky.rand, t.id, sky.time);
      continue;
    }
    // Drift with the wind, plus a slow wander so the column never sits still.
    t.x = t.baseX + sky.windX * age * 0.55 + Math.sin(sky.time * 0.05 + t.driftPhase) * 60;
    t.z = t.baseZ + sky.windZ * age * 0.55 + Math.cos(sky.time * 0.04 + t.driftPhase) * 60;
    // Strength envelope: ramp up, hold, sigh out.
    const lifeT = age / t.life;
    t.envelope = lifeT < 0.18 ? lifeT / 0.18 : lifeT > 0.78 ? (1 - lifeT) / 0.22 : 1;
    t.currentLift = t.peakLift * t.envelope * scale;
  }
  if (sky.squall.active) {
    sky.squall.x += sky.squall.speed * dt;
    if (sky.squall.x > 6800) sky.squall.x = -6800; // it wraps, far away
  }
  return sky;
}

// The one question physics asks: how is the air moving at this point?
export function airAt(sky, x, y, z) {
  let lift = 0;
  let strongest = null;
  for (const t of sky.thermals) {
    const dx = x - t.x;
    const dz = z - t.z;
    const d2 = dx * dx + dz * dz;
    const r = t.radius;
    if (d2 > r * r * 2.6) continue;
    const ground = terrainHeight(x, z);
    const heightAboveGround = Math.max(0, y - ground);
    // Lift fades with altitude above the thermal's working band.
    const altitudeFade = clamp(1.25 - heightAboveGround / 900, 0.15, 1);
    const core = Math.exp(-d2 / (r * r)) * t.currentLift * altitudeFade;
    // A ring of gentle sink guards every honest thermal.
    const ringSink = -0.5 * Math.exp(-Math.pow(Math.sqrt(d2) - r * 1.35, 2) / (r * r * 0.4));
    lift += core + ringSink * t.envelope;
    if (!strongest || core > strongest.core) strongest = { thermal: t, core };
  }
  // The squall: a wall of white carrying a hard downdraft at its face.
  if (sky.squall.active) {
    const dx = Math.abs(x - sky.squall.x);
    if (dx < sky.squall.width) {
      lift -= 3.4 * (1 - dx / sky.squall.width);
    }
  }
  return { lift, strongest };
}

// Sky colours for the renderer, blended across the day cycle.
export function skyPalette(dayPhase) {
  const stops = [
    { at: 0, sky: [118, 168, 205], horizon: [232, 196, 140], fog: [196, 208, 216], sun: 1 },
    { at: 0.45, sky: [86, 118, 168], horizon: [238, 164, 118], fog: [178, 186, 200], sun: 0.8 },
    { at: 0.7, sky: [38, 58, 104], horizon: [120, 110, 150], fog: [110, 122, 148], sun: 0.35 },
    { at: 1, sky: [10, 20, 44], horizon: [26, 54, 66], fog: [52, 70, 92], sun: 0.1 },
  ];
  let a = stops[0];
  let b = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (dayPhase >= stops[i].at && dayPhase <= stops[i + 1].at) {
      a = stops[i];
      b = stops[i + 1];
      break;
    }
  }
  const t = clamp((dayPhase - a.at) / Math.max(0.0001, b.at - a.at), 0, 1);
  const mix = (u, v) => Math.round(u + (v - u) * t);
  return {
    sky: [mix(a.sky[0], b.sky[0]), mix(a.sky[1], b.sky[1]), mix(a.sky[2], b.sky[2])],
    horizon: [mix(a.horizon[0], b.horizon[0]), mix(a.horizon[1], b.horizon[1]), mix(a.horizon[2], b.horizon[2])],
    fog: [mix(a.fog[0], b.fog[0]), mix(a.fog[1], b.fog[1]), mix(a.fog[2], b.fog[2])],
    sun: a.sun + (b.sun - a.sun) * t,
    aurora: dayPhase > 0.68 ? clamp((dayPhase - 0.68) / 0.2, 0, 1) : 0,
  };
}
