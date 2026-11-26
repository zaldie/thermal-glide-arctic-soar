// inputPilot.js — keyboard and mouse flight controls.
// One job: turn raw events into one calm input object the physics file reads.
// The mouse is the stick: its offset from screen centre pitches and banks.
// Keys mirror everything, so the game is fully playable keyboard-only.

export function createInput(canvas) {
  const keys = new Set();
  const state = {
    mouseX: 0, // -1..1 from centre
    mouseY: 0,
    mouseActive: false,
    lastKeyAt: 0,
  };

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    keys.add(e.code);
    state.lastKeyAt = performance.now();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", () => keys.clear());

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    state.mouseX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    state.mouseY = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    state.mouseActive = true;
  });
  canvas.addEventListener("mouseleave", () => {
    state.mouseActive = false;
  });

  return {
    keys,
    // Sample the pilot's ask. settings: { sensitivity, invertY }
    sample(settings) {
      const keyboardRecent = performance.now() - state.lastKeyAt < 4000;
      let pitchInput = 0;
      let rollInput = 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) pitchInput += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) pitchInput -= 1;
      if (keys.has("KeyA") || keys.has("ArrowLeft")) rollInput -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) rollInput += 1;
      if (state.mouseActive && !keyboardRecent) {
        const sens = settings?.sensitivity ?? 1;
        const invert = settings?.invertY ? -1 : 1;
        // Mouse below centre = pull back = climb, like a real stick.
        pitchInput = clampUnit(-state.mouseY * sens) * invert * -1;
        rollInput = clampUnit(state.mouseX * sens);
      }
      return {
        pitchInput: clampUnit(pitchInput),
        rollInput: clampUnit(rollInput),
        airbrake: keys.has("ShiftLeft") || keys.has("ShiftRight") || keys.has("KeyB"),
        drop: keys.has("KeyX"),
      };
    },
    pressed(code) {
      return keys.has(code);
    },
    consume(code) {
      const was = keys.has(code);
      keys.delete(code);
      return was;
    },
  };
}

function clampUnit(v) {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}
