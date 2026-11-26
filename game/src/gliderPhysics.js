// gliderPhysics.js — the Kestrel glider's energy flight model.
// One job: advance the glider's state by dt. A glider has no engine, so the
// whole model is an energy ledger: altitude and airspeed trade against each
// other, lift fades toward the stall, drag punishes hard turns and brakes.
// The sky (thermalSky.js) tells us the vertical air movement at our position;
// this file never reaches into the sky or the renderer.

export const GLIDER = {
  stallSpeed: 13.5, // m/s — below this the wing drops
  bestGlideSpeed: 24, // m/s — slowest sink lives here
  maxSpeed: 68, // m/s — structural limit, beyond it drag walls off the dive
  minSink: 0.85, // m/s at best glide
  cruiseSink: 1.35,
};

export function createGliderState(x, y, z, headingRad, speed) {
  return {
    x, y, z,
    heading: headingRad, // 0 = north (-z), positive turns east
    pitch: 0, // radians, positive = nose up
    roll: 0, // radians, positive = right wing down
    speed, // m/s along the flight direction
    verticalSpeed: 0, // m/s, filled by stepGlider for the variometer
    stalled: false,
    airbrake: false,
    crashed: false,
    gearDown: true,
  };
}

// input: { pitchInput -1..1 (up positive), rollInput -1..1, airbrake bool }
// air:   { lift } vertical movement of the air itself in m/s (thermalSky)
// Returns events the game cares about: stall start, overspeed.
export function stepGlider(state, input, air, dt) {
  const events = { stallStarted: false };
  // Controls: pitch eases toward the pilot's ask, roll follows stick or keys.
  const targetPitch = input.pitchInput * 0.42 - 0.03;
  state.pitch += (targetPitch - state.pitch) * Math.min(1, dt * 3.2);
  const targetRoll = input.rollInput * 1.05;
  state.roll += (targetRoll - state.roll) * Math.min(1, dt * 4.5);
  state.airbrake = !!input.airbrake;

  // Heading changes with bank: a coordinated turn, faster when banked hard.
  const turnRate = Math.tan(THREE_Q(state.roll)) * 9.81 / Math.max(12, state.speed);
  state.heading += turnRate * dt * 0.62;

  // Gravity pulls speed up in a dive and bleeds it in a climb.
  state.speed += -Math.sin(state.pitch) * 9.81 * dt * 1.55;
  // Drag: parasite drag grows with speed squared; brakes add a wall of it.
  const drag = 0.0016 * state.speed * state.speed + (state.airbrake ? 0.55 : 0);
  state.speed -= drag * dt * (state.speed > GLIDER.bestGlideSpeed ? 1.15 : 0.55);
  // Induced drag in a turn: banking hard costs energy, as it should.
  state.speed -= Math.abs(state.roll) * 0.55 * dt;
  state.speed = clamp(state.speed, 4, GLIDER.maxSpeed + 14);

  // Stall: below stall speed the nose drops and sink balloons until speed
  // recovers. This is the failure the HUD shouts about.
  const wasStalled = state.stalled;
  state.stalled = state.speed < GLIDER.stallSpeed;
  if (state.stalled && !wasStalled) events.stallStarted = true;
  if (state.stalled) {
    state.pitch += (-0.38 - state.pitch) * Math.min(1, dt * 2.4);
  }

  // Sink curve: a shallow U around best glide, ugly at both ends.
  const off = (state.speed - GLIDER.bestGlideSpeed) / 22;
  let sink = GLIDER.minSink + off * off * 1.9;
  if (state.stalled) sink += 3.6;
  if (state.airbrake) sink += 1.5;
  sink += Math.abs(state.roll) * 0.85; // turning sinks faster

  const climbFromAir = air ? air.lift : 0;
  state.verticalSpeed = climbFromAir - sink + Math.sin(state.pitch) * state.speed * 0.32;

  // Advance along heading and pitch.
  const vx = Math.sin(state.heading) * Math.cos(state.pitch);
  const vz = -Math.cos(state.heading) * Math.cos(state.pitch);
  state.x += vx * state.speed * dt;
  state.y += state.verticalSpeed * dt;
  state.z += vz * state.speed * dt;
  return events;
}

function THREE_Q(roll) {
  // Bank beyond ~65 degrees stops helping the turn and just spills lift.
  return clamp(roll, -1.15, 1.15);
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// Total energy expressed as "energy height": altitude plus the altitude the
// current airspeed could buy back. The HUD draws this as one honest number.
export function energyHeight(state) {
  return state.y + (state.speed * state.speed) / (2 * 9.81);
}
