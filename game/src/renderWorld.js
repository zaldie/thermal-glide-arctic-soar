// renderWorld.js — the painter that turns Svarra into pixels.
// One job: draw the world from the glider's camera onto the 2D canvas — sky,
// terrain grid, fjord water, runway, village, lighthouse, thermal spirals,
// birds, checkpoint rings and the glider itself (chase view) or its cockpit
// (cockpit view). No game rules live here; main.js hands it a snapshot.

import { terrainHeight, surfaceAt, SURFACE_COLOURS, RUNWAY, VILLAGE, LIGHTHOUSE, WORLD_HALF } from "./terrainSvarra.js";
import { skyPalette } from "./thermalSky.js";
import { clamp } from "./gliderPhysics.js";

const FORWARD_STEPS = [0, 35, 80, 140, 215, 310, 430, 580, 770, 1010, 1310, 1670, 2090, 2570, 3120, 3740, 4430, 5190, 5900];
const LATERAL_STEPS = [-3400, -2500, -1850, -1350, -980, -700, -480, -310, -180, -80, 0, 80, 180, 310, 480, 700, 980, 1350, 1850, 2500, 3400];

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

  function drawSky(palette, time, heading = 0) {
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, rgb(palette.sky));
    grad.addColorStop(0.55, rgb(palette.horizon));
    grad.addColorStop(1, rgb(palette.fog));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    drawSun(palette, heading);
    if (palette.aurora > 0.05 || palette.sun < 0.3) drawStars(palette, time);
    if (palette.aurora > 0) drawAurora(palette.aurora, time);
    drawClouds(palette, time, heading);
  }

  // The low arctic sun: a disc with a halo that slides toward the horizon
  // and warms as the day fades. Its screen position follows the heading, so
  // turning the glider visibly turns the light.
  function drawSun(palette, heading) {
    if (palette.sun < 0.12) return;
    // Sun sits in the south-west; heading 0 (north) puts it left-of-frame.
    const sunBearing = 3.84; // radians, fixed in the world
    let rel = sunBearing - heading;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) > 1.5) return;
    const sx = W / 2 + rel * W * 0.42;
    const sy = H * (0.52 - palette.sun * 0.3);
    const r = 26 + palette.sun * 10;
    const halo = ctx.createRadialGradient(sx, sy, r * 0.4, sx, sy, r * 5.2);
    halo.addColorStop(0, `rgba(255,214,140,${0.5 * palette.sun})`);
    halo.addColorStop(1, "rgba(255,190,110,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(sx - r * 5.2, sy - r * 5.2, r * 10.4, r * 10.4);
    ctx.fillStyle = `rgba(255,232,170,${0.55 + palette.sun * 0.4})`;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawStars(palette, time) {
    const alpha = clamp(0.25 - palette.sun, 0, 0.85);
    if (alpha <= 0.02) return;
    ctx.save();
    for (let i = 0; i < 110; i++) {
      // Deterministic star field from the index alone.
      const sx = ((i * 613) % 997) / 997 * W;
      const sy = ((i * 389) % 613) / 613 * H * 0.5;
      const tw = 0.6 + 0.4 * Math.sin(time * (1 + (i % 5) * 0.3) + i);
      ctx.fillStyle = `rgba(230,240,255,${alpha * tw})`;
      ctx.fillRect(sx, sy, i % 7 === 0 ? 2.2 : 1.3, i % 7 === 0 ? 2.2 : 1.3);
    }
    ctx.restore();
  }

  // Slow cloud puffs at screen parallax: they drift against the heading so
  // the world feels deep even before the terrain fills the frame.
  function drawClouds(palette, time, heading) {
    ctx.save();
    const dark = palette.sun < 0.4;
    for (let i = 0; i < 9; i++) {
      const baseX = ((i * 331) % 1200) / 1200;
      const drift = ((time * 0.004 * (1 + (i % 3) * 0.4)) + heading * -0.06) % 1.3;
      let cx = (baseX + drift) * W - W * 0.15;
      if (cx > W + 160) cx -= W + 320;
      const cy = H * (0.08 + ((i * 197) % 300) / 300 * 0.26);
      const s = 46 + (i % 4) * 26;
      ctx.fillStyle = dark ? `rgba(30,42,64,0.3)` : `rgba(255,252,246,${0.1 + palette.sun * 0.1})`;
      for (const [ox, oy, os] of [[0, 0, 1], [-0.7, 0.16, 0.66], [0.72, 0.14, 0.72], [0.1, -0.22, 0.6]]) {
        ctx.beginPath();
        ctx.ellipse(cx + ox * s, cy + oy * s, s * os, s * os * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
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

  function drawTerrain(cam, project, palette, time = 0) {
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
        const col = SURFACE_COLOURS[surface];
        // Two-axis hill shading plus a whisper of per-quad noise, so the
        // snow reads as ground, not graph paper.
        const grain = (treeHash(Math.round(cx / 90), Math.round(cz / 90)) - 0.5) * 0.07;
        let baseShade = clamp(0.9 + (a.wy - c.wy) * 0.0034 + (b.wy - d.wy) * 0.0016 + grain, 0.66, 1.14);
        // Open water catches the light: a slow travelling shimmer.
        if (surface === "water") {
          baseShade *= 1 + 0.09 * Math.sin(time * 1.2 + (cx * 0.011 + cz * 0.017));
        }
        const fogT = clamp((a.p.depth - 500) / 5200, 0, 0.88);
        // The quad is drawn as two triangles, each shaded by its own corner
        // heights: slopes get a soft gradient instead of one flat slab.
        const shade1 = clamp(baseShade + (a.wy - ch) * 0.0022, 0.62, 1.16);
        const shade2 = clamp(baseShade + (c.wy - ch) * 0.0022, 0.62, 1.16);
        ctx.fillStyle = rgb(blendCol(shadeCol(col, shade1), palette.fog, fogT));
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(b.p.x, b.p.y);
        ctx.lineTo(c.p.x, c.p.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = rgb(blendCol(shadeCol(col, shade2), palette.fog, fogT));
        ctx.beginPath();
        ctx.moveTo(a.p.x, a.p.y);
        ctx.lineTo(c.p.x, c.p.y);
        ctx.lineTo(d.p.x, d.p.y);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // Pine forest: deterministic trees scattered by a cell hash, drawn only
  // near the camera where they read as individual trees, not texture.
  function treeHash(ix, iz) {
    let n = ix * 2246822519 + iz * 3266489917;
    n = (n ^ (n >> 15)) * 2654435761;
    return (((n ^ (n >> 13)) >>> 0) % 1000) / 1000;
  }

  function drawTrees(project, cam) {
    const cell = 150;
    const fwdLen = Math.hypot(cam.fwdX, cam.fwdZ) || 1;
    const fx = cam.fwdX / fwdLen;
    const fz = cam.fwdZ / fwdLen;
    const rx = -fz;
    const rz = fx;
    for (let df = 120; df < 2100; df += cell) {
      for (let dl = -1500; dl <= 1500; dl += cell) {
        const wx = cam.x + fx * df + rx * dl;
        const wz = cam.z + fz * df + rz * dl;
        const ix = Math.round(wx / cell);
        const iz = Math.round(wz / cell);
        if (treeHash(ix, iz) > 0.34) continue;
        const jx = wx + (treeHash(ix + 40, iz) - 0.5) * 80;
        const jz = wz + (treeHash(ix, iz + 40) - 0.5) * 80;
        const gy = terrainHeight(jx, jz);
        if (gy < 18 || gy > 215) continue;
        const treeSurface = surfaceAt(jx, jz, gy);
        if (treeSurface !== "snow" && treeSurface !== "shore" && treeSurface !== "tundra") continue;
        const base = project(jx, gy, jz);
        const top = project(jx, gy + 17, jz);
        if (!base || !top || base.depth > 2100) continue;
        const s = base.scale;
        const wHalf = Math.max(1.6, 5.2 * s * 0.14);
        const trunkH = (base.y - top.y) * 0.24;
        ctx.strokeStyle = "#4a3826";
        ctx.lineWidth = Math.max(1, s * 0.16);
        ctx.beginPath();
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(base.x, base.y - trunkH);
        ctx.stroke();
        ctx.fillStyle = "#22483a";
        for (let tier = 0; tier < 2; tier++) {
          const ty = base.y - trunkH - (base.y - top.y - trunkH) * (tier * 0.42);
          const tw = wHalf * (1 - tier * 0.34);
          ctx.beginPath();
          ctx.moveTo(base.x - tw, ty);
          ctx.lineTo(base.x, ty - (base.y - top.y) * 0.52);
          ctx.lineTo(base.x + tw, ty);
          ctx.closePath();
          ctx.fill();
        }
        // A cap of snow on the crown.
        ctx.fillStyle = "rgba(240,246,250,0.85)";
        ctx.beginPath();
        ctx.moveTo(base.x - wHalf * 0.2, top.y + (base.y - top.y) * 0.1);
        ctx.lineTo(base.x, top.y);
        ctx.lineTo(base.x + wHalf * 0.2, top.y + (base.y - top.y) * 0.1);
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
    // Edge lights: amber dots down both sides, lit as the light fades.
    const glow = clamp(1.15 - palette.sun, 0.15, 1);
    for (let dz = -length / 2 + 30; dz < length / 2; dz += 78) {
      for (const side of [-1, 1]) {
        const p = project(centreX + side * (width / 2 + 4), groundY + 1.2, centreZ + dz);
        if (!p || p.depth > 2400) continue;
        ctx.fillStyle = `rgba(255,178,84,${glow})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(1.4, p.scale * 0.32), 0, Math.PI * 2);
        ctx.fill();
      }
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

  function drawVillage(project, palette) {
    for (let i = 0; i < VILLAGE.houses; i++) {
      const hx = VILLAGE.x + ((i * 67) % 220) - 110;
      const hz = VILLAGE.z + ((i * 113) % 200) - 100;
      const gy = terrainHeight(hx, hz);
      drawBox(project, hx, gy, hz, 16, 9, 13, i % 3 === 0 ? "#b5502e" : "#7a4a34", "#e8e2d4", palette);
    }
  }

  function drawBox(project, x, groundY, z, w, h, d, wall, roof, palette) {
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
    // Lit windows once the light goes: Port Svarra is inhabited.
    if (palette && palette.sun < 0.62 && base.depth < 1500) {
      ctx.fillStyle = `rgba(255,196,96,${clamp(0.75 - palette.sun, 0.2, 0.75)})`;
      const winW = Math.max(1.2, s * 0.3);
      ctx.fillRect(base.x - w * s * 0.05, top.y + (base.y - top.y) * 0.45, winW, winW);
      ctx.fillRect(base.x + w * s * 0.03, top.y + (base.y - top.y) * 0.55, winW, winW);
    }
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
    // touch with vertical speed so the picture always shows flight. It is
    // drawn like a small scale model: tapered wings with panel lines and
    // tip stripes, a shaded fuselage with a spine highlight, a glass canopy
    // with the pilot's helmet inside, and a T-tail.
    const cx = W / 2;
    const cy = H * 0.56 + clamp(-glider.verticalSpeed * 2.2, -14, 18);
    const s = Math.min(W, H) / 470;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(glider.roll * 0.9);
    // Wing flex: the tips rise a touch under load in a turn.
    const flex = clamp(Math.abs(glider.roll) * 7, 0, 5) * s;
    const wingGrad = (flip) => {
      const g = ctx.createLinearGradient(0, 0, flip * 128 * s, 0);
      g.addColorStop(0, "#f2703d");
      g.addColorStop(0.75, "#e85d2f");
      g.addColorStop(1, "#d34e24");
      return g;
    };
    for (const flip of [-1, 1]) {
      // Main wing: swept, tapered, with a paler top sheen.
      ctx.fillStyle = wingGrad(flip);
      ctx.beginPath();
      ctx.moveTo(flip * 5 * s, -3 * s);
      ctx.lineTo(flip * 124 * s, 7 * s - flex);
      ctx.lineTo(flip * 128 * s, 15 * s - flex);
      ctx.lineTo(flip * 7 * s, 9 * s);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,214,170,0.35)";
      ctx.beginPath();
      ctx.moveTo(flip * 5 * s, -3 * s);
      ctx.lineTo(flip * 124 * s, 7 * s - flex);
      ctx.lineTo(flip * 126 * s, 10 * s - flex);
      ctx.lineTo(flip * 6 * s, 1 * s);
      ctx.closePath();
      ctx.fill();
      // Aileron split line and the red tip band with its winglet.
      ctx.strokeStyle = "rgba(120,40,16,0.55)";
      ctx.lineWidth = Math.max(0.8, s * 0.8);
      ctx.beginPath();
      ctx.moveTo(flip * 92 * s, 5.4 * s - flex * 0.72);
      ctx.lineTo(flip * 94 * s, 12.6 * s - flex * 0.72);
      ctx.stroke();
      ctx.fillStyle = "#b83a1e";
      ctx.beginPath();
      ctx.moveTo(flip * 112 * s, 6.2 * s - flex * 0.9);
      ctx.lineTo(flip * 124 * s, 7 * s - flex);
      ctx.lineTo(flip * 128 * s, 15 * s - flex);
      ctx.lineTo(flip * 114 * s, 13.6 * s - flex * 0.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#8c2f1c";
      ctx.beginPath();
      ctx.moveTo(flip * 124 * s, 7 * s - flex);
      ctx.lineTo(flip * 130 * s, -2 * s - flex);
      ctx.lineTo(flip * 131 * s, 8 * s - flex);
      ctx.closePath();
      ctx.fill();
    }
    // Fuselage: shaded in three tones — lit spine, mid flank, dark belly.
    const bodyGrad = ctx.createLinearGradient(0, -38 * s, 0, 30 * s);
    bodyGrad.addColorStop(0, "#fff6e6");
    bodyGrad.addColorStop(0.5, "#f6e5c4");
    bodyGrad.addColorStop(1, "#cdb27f");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.moveTo(0, -38 * s);
    ctx.quadraticCurveTo(12 * s, -16 * s, 10.5 * s, 8 * s);
    ctx.quadraticCurveTo(8.5 * s, 27 * s, 0, 33 * s);
    ctx.quadraticCurveTo(-8.5 * s, 27 * s, -10.5 * s, 8 * s);
    ctx.quadraticCurveTo(-12 * s, -16 * s, 0, -38 * s);
    ctx.fill();
    ctx.fillStyle = "rgba(120,90,40,0.25)";
    ctx.beginPath();
    ctx.moveTo(0, 33 * s);
    ctx.quadraticCurveTo(-8.5 * s, 27 * s, -10.5 * s, 8 * s);
    ctx.lineTo(-4 * s, 8 * s);
    ctx.quadraticCurveTo(-4.5 * s, 24 * s, 0, 30 * s);
    ctx.closePath();
    ctx.fill();
    // Spine highlight and two panel rings.
    ctx.strokeStyle = "rgba(255,255,255,0.65)";
    ctx.lineWidth = Math.max(0.8, s);
    ctx.beginPath();
    ctx.moveTo(0, -36 * s);
    ctx.quadraticCurveTo(1.5 * s, -10 * s, 0, 26 * s);
    ctx.stroke();
    ctx.strokeStyle = "rgba(140,110,60,0.4)";
    ctx.beginPath();
    ctx.moveTo(-9.6 * s, 2 * s);
    ctx.quadraticCurveTo(0, 5 * s, 9.6 * s, 2 * s);
    ctx.stroke();
    // T-tail: fin with a red tip, stabilizer shaded like the wings.
    ctx.fillStyle = "#e85d2f";
    ctx.fillRect(-24 * s, 24 * s, 48 * s, 5.5 * s);
    ctx.fillStyle = "#f2703d";
    ctx.fillRect(-3.4 * s, 6 * s, 6.8 * s, 20 * s);
    ctx.fillStyle = "#b83a1e";
    ctx.fillRect(-3.4 * s, 6 * s, 6.8 * s, 5 * s);
    // Canopy: deep glass, a sky reflection, and the pilot's helmet inside.
    const canGrad = ctx.createLinearGradient(0, -30 * s, 0, -2 * s);
    canGrad.addColorStop(0, "#cfeefb");
    canGrad.addColorStop(0.45, "#5f9ec2");
    canGrad.addColorStop(1, "#2c5d7d");
    ctx.fillStyle = canGrad;
    ctx.beginPath();
    ctx.ellipse(0, -16 * s, 7 * s, 13 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a3f45";
    ctx.beginPath();
    ctx.arc(0, -13 * s, 3.6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.ellipse(-2.4 * s, -21 * s, 1.8 * s, 5 * s, -0.4, 0, Math.PI * 2);
    ctx.fill();
    // Airbrake panels, visible when open.
    if (glider.airbrake) {
      ctx.fillStyle = "#8c2f1c";
      ctx.fillRect(-52 * s, 2 * s, 16 * s, 10 * s);
      ctx.fillRect(36 * s, 2 * s, 16 * s, 10 * s);
    }
    // Navigation lights: red on the left tip, green on the right, and a
    // white tail strobe that blinks — tiny, but they sell the dusk shots.
    ctx.fillStyle = "#ff4444";
    ctx.beginPath();
    ctx.arc(-127 * s, 11 * s, 2.6 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3dff7a";
    ctx.beginPath();
    ctx.arc(127 * s, 11 * s, 2.6 * s, 0, Math.PI * 2);
    ctx.fill();
    if (Math.sin(time * 2.4) > 0.72) {
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.beginPath();
      ctx.arc(0, 29 * s, 2.2 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // The glider's shadow on the snow below: the cheapest altitude cue there
  // is, and the one real pilots land by.
  function drawGliderShadow(project, glider) {
    const gy = terrainHeight(glider.x, glider.z);
    const gap = glider.y - gy;
    if (gap > 260 || gap < 0) return;
    const p = project(glider.x, gy + 1, glider.z);
    if (!p) return;
    const shrink = clamp(1 - gap / 300, 0.25, 1);
    const rx = clamp(11 * p.scale * shrink, 4, 90);
    ctx.fillStyle = `rgba(16,24,34,${0.32 * shrink})`;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, rx * 0.26, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSpeedStreaks(glider, time) {
    if (glider.speed < 25) return;
    ctx.save();
    ctx.strokeStyle = "rgba(240,248,255,0.32)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      const seed = (i * 271) % 997;
      const t = (time * (0.5 + glider.speed * 0.012) + seed / 997) % 1;
      const edge = i % 2 === 0 ? -1 : 1;
      const sx = W / 2 + edge * W * (0.3 + t * 0.24);
      const sy = H * (0.2 + ((seed * 7) % 500) / 500 * 0.6) + t * H * 0.1;
      const len = 12 + t * 30 * (glider.speed / 30);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + edge * len, sy + len * 0.24);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVignette() {
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.86);
    grad.addColorStop(0, "rgba(6,10,16,0)");
    grad.addColorStop(1, "rgba(6,10,16,0.3)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
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
    drawSky(palette, time, glider.heading);
    drawTerrain(cam, project, palette, time);
    drawTrees(project, cam);
    drawRunway(project, palette);
    drawVillage(project, palette);
    drawLighthouse(project, palette, time);
    if (dropZone) drawDropZone(project, dropZone);
    drawThermalSpirals(project, sky, time);
    drawBirds(project, sky, glider, time);
    drawRings(project, rings, activeRing, time, palette.aurora);
    drawGliderShadow(project, glider);
    drawSnowSquallFx(sky, glider, time);
    if (view === "cockpit") drawCockpit(glider, snapshot);
    else {
      drawGliderChase(glider, time);
      drawSpeedStreaks(glider, time);
    }
    drawVignette();
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

