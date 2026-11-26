// renderWorld.js — the painter that turns Svarra into pixels.
// One job: draw the world from the glider's camera onto the 2D canvas — sky,
// terrain grid, fjord water, runway, village, lighthouse, thermal spirals,
// birds, checkpoint rings and the glider itself (chase view) or its cockpit
// (cockpit view). No game rules live here; main.js hands it a snapshot.

import { terrainHeight, surfaceAt, SURFACE_COLOURS, RUNWAY, VILLAGE, LIGHTHOUSE, WORLD_HALF } from "./terrainSvarra.js";
import { skyPalette } from "./thermalSky.js";
import { clamp } from "./gliderPhysics.js";

const FORWARD_STEPS = [0, 60, 130, 220, 340, 500, 700, 950, 1250, 1600, 2000, 2450, 2950, 3500, 4100, 4750, 5450];
const LATERAL_STEPS = [-3400, -2400, -1700, -1200, -850, -580, -380, -220, -110, 0, 110, 220, 380, 580, 850, 1200, 1700, 2400, 3400];

export function createRenderer(canvas) {
  const ctx = canvas.getContext("2d");
  let W = 0;
  let H = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener("resize", resize);
  resize();

  // Camera basis from the glider state and the view mode.
  function cameraFor(glider, view) {
    const fwdX = Math.sin(glider.heading) * Math.cos(glider.pitch);
    const fwdZ = -Math.cos(glider.heading) * Math.cos(glider.pitch);
    const fwdY = Math.sin(glider.pitch);
    if (view === "cockpit") {
      return { x: glider.x, y: glider.y + 1.2, z: glider.z, fwdX, fwdY, fwdZ, roll: glider.roll * 0.55 };
    }
    // Chase: behind and above, looking past the glider.
    return {
      x: glider.x - fwdX * 30,
      y: glider.y + 10 - fwdY * 30,
      z: glider.z - fwdZ * 30,
      fwdX, fwdY: fwdY * 0.82 - 0.06, fwdZ,
      roll: glider.roll * 0.4,
    };
  }

  function makeProjector(cam) {
    // Right and up vectors, with cockpit roll applied to the frame.
    let rightX = -cam.fwdZ;
    let rightZ = cam.fwdX;
    const rightLen = Math.hypot(rightX, rightZ) || 1;
    rightX /= rightLen;
    rightZ /= rightLen;
    // up = right x forward, component by component:
    // (ry*fz - rz*fy, rz*fx - rx*fz, rx*fy - ry*fx) with ry = 0.
    let upX = -rightZ * cam.fwdY;
    let upY = rightZ * cam.fwdX - rightX * cam.fwdZ;
    let upZ = rightX * cam.fwdY;
    // Apply roll around the forward axis.
    const cr = Math.cos(cam.roll || 0);
    const sr = Math.sin(cam.roll || 0);
    const rX = rightX * cr + upX * sr;
    const rY = upY * sr;
    const rZ = rightZ * cr + upZ * sr;
    const uX = upX * cr - rightX * sr;
    const uY = upY * cr;
    const uZ = upZ * cr - rightZ * sr;
    const focal = H * 0.92;
    return function project(x, y, z) {
      const dx = x - cam.x;
      const dy = y - cam.y;
      const dz = z - cam.z;
      const depth = dx * cam.fwdX + dy * cam.fwdY + dz * cam.fwdZ;
      if (depth < 2) return null;
      const px = dx * rX + dy * rY + dz * rZ;
      const py = dx * uX + dy * uY + dz * uZ;
      return {
        x: W / 2 + (px / depth) * focal,
        y: H / 2 - (py / depth) * focal,
        depth,
        scale: focal / depth,
      };
    };
  }

  function drawSky(palette, time) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, rgb(palette.sky));
    grad.addColorStop(0.55, rgb(palette.horizon));
    grad.addColorStop(1, rgb(palette.fog));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    if (palette.aurora > 0) drawAurora(palette.aurora, time);
  }

  function drawAurora(strength, time) {
    ctx.save();
    ctx.globalAlpha = 0.34 * strength;
    for (let band = 0; band < 3; band++) {
      const baseY = H * (0.06 + band * 0.07);
      const grad = ctx.createLinearGradient(0, baseY, 0, baseY + H * 0.16);
      const colours = ["rgba(64,255,170,0.55)", "rgba(64,200,255,0.35)", "rgba(170,110,255,0.30)"];
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(0.5, colours[band]);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(0, baseY + H * 0.16);
      for (let x = 0; x <= W; x += 24) {
        const y = baseY + Math.sin(x * 0.006 + time * 0.35 + band * 1.7) * 16 + Math.sin(x * 0.017 - time * 0.2) * 7;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, baseY + H * 0.16);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawTerrain(cam, project, palette) {
    const fwdFlatX = cam.fwdX;
    const fwdFlatZ = cam.fwdZ;
    const len = Math.hypot(fwdFlatX, fwdFlatZ) || 1;
    const fx = fwdFlatX / len;
    const fz = fwdFlatZ / len;
    const rx = -fz;
    const rz = fx;
    // Vertex grid in world space.
    const verts = [];
    for (let i = 0; i < FORWARD_STEPS.length; i++) {
      const row = [];
      for (let j = 0; j < LATERAL_STEPS.length; j++) {
        const wx = cam.x + fx * FORWARD_STEPS[i] + rx * LATERAL_STEPS[j];
        const wz = cam.z + fz * FORWARD_STEPS[i] + rz * LATERAL_STEPS[j];
        const wy = Math.abs(wx) > WORLD_HALF || Math.abs(wz) > WORLD_HALF ? -12 : terrainHeight(wx, wz);
        row.push({ wx, wy, wz, p: project(wx, wy, wz) });
      }
      verts.push(row);
    }
    // Painter's order: far rows first.
    for (let i = FORWARD_STEPS.length - 2; i >= 0; i--) {
      for (let j = 0; j < LATERAL_STEPS.length - 1; j++) {
        const a = verts[i][j];
        const b = verts[i][j + 1];
        const c = verts[i + 1][j + 1];
        const d = verts[i + 1][j];
        if (!a.p || !b.p || !c.p || !d.p) continue;
        const cx = (a.wx + c.wx) / 2;
        const cz = (a.wz + c.wz) / 2;
        const ch = (a.wy + c.wy) / 2;
        const surface = surfaceAt(cx, cz, ch);
        let col = SURFACE_COLOURS[surface];
        // Simple hill shading from the height difference across the quad.
        const shade = clamp(0.88 + (a.wy - c.wy) * 0.004, 0.68, 1.12);
        const fogT = clamp((a.p.depth - 500) / 5200, 0, 0.88);
        ctx.fillStyle = rgb(blendCol(shadeCol(col, shade), palette.fog, fogT));
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.lineTo(c.p.x, c.p.y);
        ctx.lineTo(d.p.x, d.p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawRunway(project, palette) {
    const { centreX, centreZ, length, width, groundY } = RUNWAY;
    const corners = [
      [centreX - width / 2, centreZ - length / 2],
      [centreX + width / 2, centreZ - length / 2],
      [centreX + width / 2, centreZ + length / 2],
      [centreX - width / 2, centreZ + length / 2],
    ].map(([x, z]) => project(x, groundY + 0.4, z));
    if (corners.some((p) => !p)) return;
    ctx.fillStyle = "rgba(196,214,224,0.95)";
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(240,248,252,0.9)";
    ctx.lineWidth = 2;
    // Centreline dashes.
    for (let i = -4; i < 5; i++) {
      const z0 = centreZ + i * 62;
      const p1 = project(centreX, groundY + 0.5, z0);
      const p2 = project(centreX, groundY + 0.5, z0 + 30);
      if (!p1 || !p2) continue;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
    // Threshold bar at the landing (south) end.
    const t1 = project(centreX - width / 2 + 3, groundY + 0.5, centreZ + length / 2 - 14);
    const t2 = project(centreX + width / 2 - 3, groundY + 0.5, centreZ + length / 2 - 14);
    if (t1 && t2) {
      ctx.strokeStyle = "#ffcf4d";
      ctx.lineWidth = Math.max(2, t1.scale * 1.4);
      ctx.beginPath();
      ctx.moveTo(t1.x, t1.y);
      ctx.lineTo(t2.x, t2.y);
      ctx.stroke();
    }
  }

  function drawVillage(project) {
    for (let i = 0; i < VILLAGE.houses; i++) {
      const hx = VILLAGE.x + ((i * 67) % 220) - 110;
      const hz = VILLAGE.z + ((i * 113) % 200) - 100;
      const gy = terrainHeight(hx, hz);
      drawBox(project, hx, gy, hz, 16, 9, 13, i % 3 === 0 ? "#b5502e" : "#7a4a34", "#e8e2d4");
    }
  }

  function drawBox(project, x, groundY, z, w, h, d, wall, roof) {
    const top = project(x, groundY + h, z);
    const base = project(x, groundY, z);
    if (!top || !base || base.depth > 2600) return;
    const s = base.scale;
    ctx.fillStyle = wall;
    ctx.fillRect(base.x - (w / 2) * s * 0.14, top.y, w * s * 0.14, base.y - top.y);
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.moveTo(base.x - (w / 2 + 2) * s * 0.14, top.y + 2);
    ctx.lineTo(base.x, top.y - h * s * 0.07);
    ctx.lineTo(base.x + (w / 2 + 2) * s * 0.14, top.y + 2);
    ctx.closePath();
    ctx.fill();
  }

  function drawLighthouse(project, palette, time) {
    const gy = terrainHeight(LIGHTHOUSE.x, LIGHTHOUSE.z);
    const base = project(LIGHTHOUSE.x, gy, LIGHTHOUSE.z);
    const top = project(LIGHTHOUSE.x, gy + 44, LIGHTHOUSE.z);
    if (!base || !top || base.depth > 4200) return;
    const s = base.scale;
    ctx.fillStyle = "#e8e4da";
    ctx.fillRect(base.x - 3.2 * s * 0.14, top.y, 6.4 * s * 0.14, base.y - top.y);
    ctx.fillStyle = "#c33d2a";
    ctx.fillRect(base.x - 3.2 * s * 0.14, top.y + (base.y - top.y) * 0.4, 6.4 * s * 0.14, (base.y - top.y) * 0.16);
    const lampGlow = 0.35 + palette.aurora;
    ctx.fillStyle = `rgba(255,214,110,${lampGlow})`;
    ctx.beginPath();
    ctx.arc(top.x, top.y, Math.max(2.5, 3.4 * s * 0.14), 0, Math.PI * 2);
    ctx.fill();
    if (palette.aurora > 0.25) {
      const sweep = Math.sin(time * 0.7) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,224,140,${0.10 + sweep * 0.08})`;
      ctx.beginPath();
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(top.x + 340, top.y + 26 + sweep * 30);
      ctx.lineTo(top.x + 340, top.y - 20);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawThermalSpirals(project, sky, time) {
    for (const t of sky.thermals) {
      if (!t.currentLift || t.currentLift < 0.7) continue;
      const ground = terrainHeight(t.x, t.z);
      ctx.save();
      for (let i = 0; i < 14; i++) {
        const frac = (i / 14 + (time * 0.14) % (1 / 14)) % 1;
        const ang = frac * Math.PI * 5 + t.driftPhase;
        const rad = t.radius * 0.34 * (0.4 + frac * 0.6);
        const px = t.x + Math.cos(ang) * rad;
        const pz = t.z + Math.sin(ang) * rad;
        const py = ground + 12 + frac * 330;
        const p = project(px, py, pz);
        if (!p || p.depth > 3800) continue;
        const alpha = 0.16 * (1 - frac) * clamp(t.currentLift / 3.4, 0.3, 1);
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.6, p.scale * 2.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawBirds(project, sky, glider, time) {
    for (const flock of sky.birds) {
      const t = sky.thermals[flock.thermalSlot % sky.thermals.length];
      if (!t || !t.currentLift || t.currentLift < 1.4) continue;
      const ground = terrainHeight(t.x, t.z);
      for (let i = 0; i < flock.birds; i++) {
        const ang = flock.phase + time * 0.45 + (i * Math.PI * 2) / flock.birds;
        const bx = t.x + Math.cos(ang) * flock.radius;
        const bz = t.z + Math.sin(ang) * flock.radius;
        const by = ground + flock.height + Math.sin(time * 1.3 + i) * 5;
        const p = project(bx, by, bz);
        if (!p || p.depth > 2400) continue;
        const w = Math.max(2.4, p.scale * 1.5);
        const flap = Math.sin(time * 6 + i * 1.4) * w * 0.45;
        ctx.strokeStyle = "rgba(30,36,44,0.85)";
        ctx.lineWidth = Math.max(1, w * 0.22);
        ctx.beginPath();
        ctx.moveTo(p.x - w, p.y - flap);
        ctx.lineTo(p.x, p.y);
        ctx.lineTo(p.x + w, p.y - flap);
        ctx.stroke();
      }
    }
  }

  function drawRings(project, rings, activeIndex, time, aurora) {
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      if (r.passed) continue;
      const p = project(r.x, r.y, r.z);
      if (!p) continue;
      const radiusPx = r.radius * p.scale;
      if (radiusPx < 3 || radiusPx > W) continue;
      const active = i === activeIndex;
      const pulse = active ? 1 + Math.sin(time * 4) * 0.05 : 1;
      ctx.save();
      ctx.lineWidth = Math.max(2.5, radiusPx * 0.09);
      ctx.strokeStyle = active ? "#ffcf4d" : "rgba(150,210,235,0.75)";
      if (active || aurora > 0.3) {
        ctx.shadowColor = active ? "rgba(255,190,60,0.9)" : "rgba(120,220,255,0.7)";
        ctx.shadowBlur = 16;
      }
      ctx.beginPath();
      ctx.arc(p.x, p.y, radiusPx * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = Math.max(1.2, radiusPx * 0.03);
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, radiusPx * pulse * 0.86, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawDropZone(project, zone) {
    const gy = terrainHeight(zone.x, zone.z);
    const p = project(zone.x, gy + 2, zone.z);
    if (!p) return;
    const radiusPx = zone.radius * p.scale;
    if (radiusPx < 4) return;
    ctx.save();
    ctx.strokeStyle = "#ff9d4d";
    ctx.lineWidth = Math.max(2, radiusPx * 0.06);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radiusPx, radiusPx * 0.36, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,157,77,0.16)";
    ctx.fill();
    ctx.restore();
  }

  function drawGliderChase(glider, time) {
    // The glider sits centre-frame, banking with its roll, sinking/rising a
    // touch with vertical speed so the picture always shows flight.
    const cx = W / 2;
    const cy = H * 0.56 + clamp(-glider.verticalSpeed * 2.2, -14, 18);
    const s = Math.min(W, H) / 520;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(glider.roll * 0.9);
    // Far wing (drawn first, slightly darker).
    ctx.fillStyle = "#d8542e";
    ctx.beginPath();
    ctx.moveTo(-6 * s, 0);
    ctx.lineTo(-118 * s, 12 * s);
    ctx.lineTo(-122 * s, 20 * s);
    ctx.lineTo(-8 * s, 8 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f06a35";
    ctx.beginPath();
    ctx.moveTo(6 * s, 0);
    ctx.lineTo(118 * s, 12 * s);
    ctx.lineTo(122 * s, 20 * s);
    ctx.lineTo(8 * s, 8 * s);
    ctx.closePath();
    ctx.fill();
    // Fuselage, seen from behind-above: a tapered body with a glass canopy.
    const bodyGrad = ctx.createLinearGradient(0, -26 * s, 0, 16 * s);
    bodyGrad.addColorStop(0, "#fdf3e3");
    bodyGrad.addColorStop(0.55, "#f4e3c2");
    bodyGrad.addColorStop(1, "#d9c491");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(0, -34 * s);
    ctx.quadraticCurveTo(11 * s, -12 * s, 9 * s, 10 * s);
    ctx.quadraticCurveTo(7 * s, 26 * s, 0, 30 * s);
    ctx.quadraticCurveTo(-7 * s, 26 * s, -9 * s, 10 * s);
    ctx.quadraticCurveTo(-11 * s, -12 * s, 0, -34 * s);
    ctx.fill();
    // Tail.
    ctx.fillStyle = "#d8542e";
    ctx.fillRect(-22 * s, 22 * s, 44 * s, 6 * s);
    ctx.fillRect(-3 * s, 8 * s, 6 * s, 20 * s);
    // Canopy.
    const canGrad = ctx.createLinearGradient(0, -26 * s, 0, -4 * s);
    canGrad.addColorStop(0, "#bfe6f5");
    canGrad.addColorStop(1, "#3d7ea6");
    ctx.fillStyle = canGrad;
    ctx.beginPath();
    ctx.ellipse(0, -15 * s, 6.4 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Airbrake panels, visible when open.
    if (glider.airbrake) {
      ctx.fillStyle = "#8c2f1c";
      ctx.fillRect(-52 * s, 2 * s, 16 * s, 10 * s);
      ctx.fillRect(36 * s, 2 * s, 16 * s, 10 * s);
    }
    ctx.restore();
  }

  function drawCockpit(glider, snapshot) {
    // A framed cockpit: dark coaming, a glass reflection, and three lit
    // instruments — horizon, variometer, compass — drawn as flown gauges.
    const dashY = H * 0.78;
    ctx.fillStyle = "#141a20";
    ctx.beginPath();
    ctx.moveTo(0, H);
    ctx.lineTo(0, dashY + 26);
    ctx.quadraticCurveTo(W * 0.5, dashY - 34, W, dashY + 26);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#1d262f";
    ctx.fillRect(0, dashY + 30, W, 5);
    // Side pillars.
    ctx.fillStyle = "#10151b";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(W * 0.055, 0);
    ctx.lineTo(W * 0.028, dashY);
    ctx.lineTo(0, dashY + 20);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(W, 0);
    ctx.lineTo(W * 0.945, 0);
    ctx.lineTo(W * 0.972, dashY);
    ctx.lineTo(W, dashY + 20);
    ctx.closePath();
    ctx.fill();
    drawHorizonGauge(W * 0.5, dashY + 74, 52, glider);
    drawVarioGauge(W * 0.5 - 128, dashY + 74, 40, snapshot.verticalSpeed);
    drawCompassGauge(W * 0.5 + 128, dashY + 74, 40, glider.heading);
  }

  function gaugeShell(x, y, r, label) {
    ctx.fillStyle = "#0a0e12";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3f5a68";
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = "#9fd8e8";
    ctx.font = `600 ${Math.max(9, r * 0.24)}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + r + 14);
  }

  function drawHorizonGauge(x, y, r, glider) {
    gaugeShell(x, y, r, "HORIZON");
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r - 4, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(x, y);
    ctx.rotate(-glider.roll);
    const pitchPx = clamp(glider.pitch, -0.5, 0.5) * r * 1.1;
    ctx.fillStyle = "#3d7ea6";
    ctx.fillRect(-r, -r + pitchPx - 60, r * 2, r + 60);
    ctx.fillStyle = "#7a5c38";
    ctx.fillRect(-r, pitchPx, r * 2, r);
    ctx.fillStyle = "#e8f4f8";
    ctx.fillRect(-r, pitchPx - 1, r * 2, 2);
    ctx.restore();
    ctx.strokeStyle = "#ffcf4d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.5, y);
    ctx.lineTo(x - r * 0.14, y);
    ctx.lineTo(x, y + r * 0.14);
    ctx.lineTo(x + r * 0.14, y);
    ctx.lineTo(x + r * 0.5, y);
    ctx.stroke();
  }

  function drawVarioGauge(x, y, r, verticalSpeed) {
    gaugeShell(x, y, r, "VARIO m/s");
    // Map -6..+6 onto a 270-degree dial starting at lower-left.
    const dial = Math.PI * 0.75 + ((clamp(verticalSpeed, -6, 6) + 6) / 12) * Math.PI * 1.5;
    ctx.strokeStyle = verticalSpeed >= 0 ? "#57e389" : "#e35d4f";
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(dial) * (r - 9), y + Math.sin(dial) * (r - 9));
    ctx.stroke();
    ctx.fillStyle = "#e8f4f8";
    ctx.font = `700 ${r * 0.42}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText((verticalSpeed >= 0 ? "+" : "") + verticalSpeed.toFixed(1), x, y + r * 0.52);
  }

  function drawCompassGauge(x, y, r, heading) {
    gaugeShell(x, y, r, "HEADING");
    const deg = ((heading * 180) / Math.PI % 360 + 360) % 360;
    ctx.fillStyle = "#e8f4f8";
    ctx.font = `700 ${r * 0.5}px "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(String(Math.round(deg)).padStart(3, "0") + "°", x, y + r * 0.18);
    const card = ["N", "E", "S", "W"];
    ctx.font = `600 ${r * 0.3}px "Segoe UI", sans-serif`;
    ctx.fillStyle = "#9fd8e8";
    ctx.fillText(card[Math.round(deg / 90) % 4], x, y - r * 0.3);
  }

  function drawSnowSquallFx(sky, glider, time) {
    if (!sky.squall.active) return;
    const dx = Math.abs(glider.x - sky.squall.x);
    if (dx > sky.squall.width * 1.6) return;
    const density = clamp(1 - dx / (sky.squall.width * 1.6), 0.12, 0.85);
    ctx.save();
    ctx.strokeStyle = `rgba(240,246,250,${0.5 * density})`;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 60 * density; i++) {
      const sx = ((i * 173 + time * 620) % (W + 80)) - 40;
      const sy = (i * 269 + time * 240) % H;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - 16, sy + 5);
      ctx.stroke();
    }
    ctx.fillStyle = `rgba(235,242,248,${0.22 * density})`;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  // The one entry point main.js calls per frame.
  function draw(snapshot) {
    const { glider, sky, rings, activeRing, view, time, dropZone } = snapshot;
    const palette = skyPalette(sky.dayPhase);
    const cam = cameraFor(glider, view);
    const project = makeProjector(cam);
    drawSky(palette, time);
    drawTerrain(cam, project, palette);
    drawRunway(project, palette);
    drawVillage(project);
    drawLighthouse(project, palette, time);
    if (dropZone) drawDropZone(project, dropZone);
    drawThermalSpirals(project, sky, time);
    drawBirds(project, sky, glider, time);
    drawRings(project, rings, activeRing, time, palette.aurora);
    drawSnowSquallFx(sky, glider, time);
    if (view === "cockpit") drawCockpit(glider, snapshot);
    else drawGliderChase(glider, time);
    return palette;
  }

  return { draw, resize, get size() { return { W, H }; } };
}

function rgb(c) {
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function shadeCol(col, factor) {
  return [clamp(Math.round(col[0] * factor), 0, 255), clamp(Math.round(col[1] * factor), 0, 255), clamp(Math.round(col[2] * factor), 0, 255)];
}

function blendCol(col, target, t) {
  return [
    clamp(Math.round(col[0] + (target[0] - col[0]) * t), 0, 255),
    clamp(Math.round(col[1] + (target[1] - col[1]) * t), 0, 255),
    clamp(Math.round(col[2] + (target[2] - col[2]) * t), 0, 255),
  ];
}

