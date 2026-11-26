// audioVariometer.js — synthesized sound: variometer, wind, chimes, aurora pad.
// One job: make the air audible with WebAudio alone, no audio files. The
// variometer is the star: a beeping tone whose rate and pitch climb with the
// lift, exactly like the instrument in a real glider cockpit. Everything is
// created lazily on the first user gesture, as browsers require.

export function createAudio(settings) {
  let ctx = null;
  let master = null;
  let varioOsc = null;
  let varioGain = null;
  let windGain = null;
  let windFilter = null;
  let beepClock = 0;
  let padNodes = null;

  function ensureContext() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = settings.volume ?? 0.7;
      master.connect(ctx.destination);
      // Variometer tone.
      varioOsc = ctx.createOscillator();
      varioOsc.type = "sine";
      varioOsc.frequency.value = 620;
      varioGain = ctx.createGain();
      varioGain.gain.value = 0;
      varioOsc.connect(varioGain).connect(master);
      varioOsc.start();
      // Wind: filtered noise, gain follows airspeed.
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise.buffer = buffer;
      noise.loop = true;
      windFilter = ctx.createBiquadFilter();
      windFilter.type = "bandpass";
      windFilter.frequency.value = 480;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(windFilter).connect(windGain).connect(master);
      noise.start();
      return true;
    } catch {
      return false;
    }
  }

  function chime(freqA, freqB, when = 0, dur = 0.35) {
    if (!ensureContext()) return;
    const t0 = ctx.currentTime + when;
    for (const [i, f] of [freqA, freqB].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      gain.gain.setValueAtTime(0.0001, t0 + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.16, t0 + i * 0.07 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(master);
      osc.start(t0 + i * 0.07);
      osc.stop(t0 + dur + 0.05);
    }
  }

  return {
    unlock() {
      if (ensureContext() && ctx.state === "suspended") ctx.resume();
    },
    setVolume(v) {
      if (master) master.gain.value = v;
      settings.volume = v;
    },
    // Called every frame with the flight state.
    update(dt, { verticalSpeed, speed, stalled, overspeed }) {
      if (!ctx) return;
      beepClock += dt;
      // Beep pattern: silent in sink, urgent and high in strong lift.
      const lift = verticalSpeed;
      let level = 0;
      let freq = 620;
      if (lift > 0.15) {
        const rate = 2.2 + lift * 1.6; // beeps per second
        const phase = (beepClock * rate) % 1;
        level = phase < 0.45 ? 0.11 : 0;
        freq = 560 + lift * 130;
      } else if (lift < -2.6) {
        level = 0.045; // a low continuous groan in heavy sink
        freq = 210;
      }
      if (stalled) {
        level = 0.13;
        freq = 880 + Math.sin(beepClock * 26) * 60;
      }
      varioGain.gain.setTargetAtTime(level, ctx.currentTime, 0.03);
      varioOsc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.05);
      let wind = Math.min(0.2, 0.02 + speed * 0.0026);
      // Overspeed: the wind noise flutters and rattles — the airframe
      // creaking under load, audible before it is readable.
      if (overspeed) wind *= 1 + Math.sin(beepClock * 31) * 0.35;
      windGain.gain.setTargetAtTime(wind, ctx.currentTime, 0.1);
      windFilter.frequency.setTargetAtTime(320 + speed * 14, ctx.currentTime, 0.1);
    },
    ringPassed(centreHit) {
      if (centreHit) chime(880, 1318, 0, 0.4);
      else chime(660, 990, 0, 0.32);
    },
    dropped() {
      chime(520, 390, 0, 0.3);
    },
    landed() {
      chime(440, 660, 0, 0.5);
      chime(550, 880, 0.16, 0.55);
    },
    crashed() {
      if (!ensureContext()) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(160, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(38, ctx.currentTime + 0.5);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.55);
      osc.connect(gain).connect(master);
      osc.start();
      osc.stop(ctx.currentTime + 0.6);
    },
    // A slow two-chord pad that fades in under the aurora.
    auroraPad(on) {
      if (!ensureContext()) return;
      if (on && !padNodes) {
        const gain = ctx.createGain();
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(0.035, ctx.currentTime, 2.5);
        gain.connect(master);
        const oscs = [220, 277.18, 329.63].map((f) => {
          const o = ctx.createOscillator();
          o.type = "sine";
          o.frequency.value = f;
          o.connect(gain);
          o.start();
          return o;
        });
        padNodes = { gain, oscs };
      } else if (!on && padNodes) {
        const { gain, oscs } = padNodes;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.6);
        setTimeout(() => oscs.forEach((o) => o.stop()), 2200);
        padNodes = null;
      }
    },
  };
}
