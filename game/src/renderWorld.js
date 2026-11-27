// renderWorld.js — the painter that turns Svarra into pixels, now in WebGL.
// One job: draw the world from the glider's camera — shader sky with sun,
// stars and aurora, a smooth-shaded terrain mesh, forest, village, runway,
// lighthouse, thermal spirals, gulls, checkpoint rings and a real 3D glider —
// then finish the frame with the 2D cockpit, speed streaks and vignette on
// the overlay canvas. No game rules live here; main.js hands it a snapshot.

import { terrainHeight, terrainColorAt, RUNWAY, LIGHTHOUSE, WORLD_HALF } from "./terrainSvarra.js";
import { skyPalette } from "./thermalSky.js";
import { clamp } from "./gliderPhysics.js";
import {
  MeshBuilder, buildTerrainGeometry, buildRingGeometry, buildTorusGeometry,
} from "./glMesh.js";
import {
  mat4Perspective, mat4Multiply, mat4View, mat4Model, mat4Identity,
} from "./glMath.js";
import { buildSceneryGeometries, treeHash } from "./worldScenery.js";
import {
  FOG_NEAR, FOG_FAR, LIT_VERT, LIT_FRAG, SKY_VERT, SKY_FRAG,
  SPRITE_VERT, SPRITE_FRAG, FLAT_VERT, FLAT_FRAG,
} from "./glShaders.js";
import { buildAircraftGeometries } from "./aircraftMesh.js";

function compileProgram(gl, vertSrc, fragSrc) {
  const make = (type, src) => {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      throw new Error("Shader failed: " + gl.getShaderInfoLog(sh));
    }
    return sh;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, make(gl.VERTEX_SHADER, vertSrc));
  gl.attachShader(prog, make(gl.FRAGMENT_SHADER, fragSrc));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error("Program link failed: " + gl.getProgramInfoLog(prog));
  }
  return prog;
}


const rgb255 = (c) => [c[0] / 255, c[1] / 255, c[2] / 255];

export function createRenderer(glCanvas, fxCanvas) {
  const gl = glCanvas.getContext("webgl", { antialias: true, alpha: false });
  if (!gl) throw new Error("WebGL is not available in this browser.");
  if (!gl.getExtension("OES_element_index_uint")) {
    throw new Error("WebGL index extension is not available in this browser.");
  }
  const fx = fxCanvas.getContext("2d");
  let W = 0;
  let H = 0;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = glCanvas.clientWidth;
    H = glCanvas.clientHeight;
    for (const c of [glCanvas, fxCanvas]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    fx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gl.viewport(0, 0, glCanvas.width, glCanvas.height);
  }
  window.addEventListener("resize", resize);
  resize();

  const litProg = compileProgram(gl, LIT_VERT, LIT_FRAG);
  const skyProg = compileProgram(gl, SKY_VERT, SKY_FRAG);
  const skyLoc = {
    aNDC: gl.getAttribLocation(skyProg, "aNDC"),
    uRight: gl.getUniformLocation(skyProg, "uRight"),
    uUp: gl.getUniformLocation(skyProg, "uUp"),
    uFwd: gl.getUniformLocation(skyProg, "uFwd"),
    uTanF: gl.getUniformLocation(skyProg, "uTanF"),
    uAspect: gl.getUniformLocation(skyProg, "uAspect"),
    uTop: gl.getUniformLocation(skyProg, "uTop"),
    uHorizon: gl.getUniformLocation(skyProg, "uHorizon"),
    uFog: gl.getUniformLocation(skyProg, "uFog"),
    uSunDir: gl.getUniformLocation(skyProg, "uSunDir"),
    uSunTint: gl.getUniformLocation(skyProg, "uSunTint"),
    uSunI: gl.getUniformLocation(skyProg, "uSunI"),
    uAurora: gl.getUniformLocation(skyProg, "uAurora"),
    uTime: gl.getUniformLocation(skyProg, "uTime"),
  };
  const skyBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const spriteProg = compileProgram(gl, SPRITE_VERT, SPRITE_FRAG);
  const flatProg = compileProgram(gl, FLAT_VERT, FLAT_FRAG);
  const lit = {
    aPos: gl.getAttribLocation(litProg, "aPos"),
    aNormal: gl.getAttribLocation(litProg, "aNormal"),
    aColor: gl.getAttribLocation(litProg, "aColor"),
    aSpec: gl.getAttribLocation(litProg, "aSpec"),
    uMVP: gl.getUniformLocation(litProg, "uMVP"),
    uModel: gl.getUniformLocation(litProg, "uModel"),
    uSunDir: gl.getUniformLocation(litProg, "uSunDir"),
    uSunColor: gl.getUniformLocation(litProg, "uSunColor"),
    uAmbient: gl.getUniformLocation(litProg, "uAmbient"),
    uFogColor: gl.getUniformLocation(litProg, "uFogColor"),
    uCamPos: gl.getUniformLocation(litProg, "uCamPos"),
    uEmissive: gl.getUniformLocation(litProg, "uEmissive"),
    uAlpha: gl.getUniformLocation(litProg, "uAlpha"),
    uTime: gl.getUniformLocation(litProg, "uTime"),
    uRim: gl.getUniformLocation(litProg, "uRim"),
    uTint: gl.getUniformLocation(litProg, "uTint"),
  };

  function uploadGeometry(geo) {
    const mk = (data, itemSize, attrib) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      return { buf, itemSize, attrib };
    };
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geo.indices, gl.STATIC_DRAW);
    return {
      streams: [
        mk(geo.positions, 3, lit.aPos),
        mk(geo.normals, 3, lit.aNormal),
        mk(geo.colors, 3, lit.aColor),
        mk(geo.specs, 1, lit.aSpec),
      ],
      ibo,
      count: geo.indices.length,
    };
  }

  function drawMesh(mesh, mvp, model, opts = {}) {
    for (const s of mesh.streams) {
      gl.bindBuffer(gl.ARRAY_BUFFER, s.buf);
      gl.enableVertexAttribArray(s.attrib);
      gl.vertexAttribPointer(s.attrib, s.itemSize, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ibo);
    gl.uniformMatrix4fv(lit.uMVP, false, mvp);
    gl.uniformMatrix4fv(lit.uModel, false, model);
    gl.uniform1f(lit.uEmissive, opts.emissive ?? 0);
    gl.uniform1f(lit.uAlpha, opts.alpha ?? 1);
    const tint = opts.tint || [1, 1, 1];
    gl.uniform3f(lit.uTint, tint[0], tint[1], tint[2]);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_INT, 0);
  }

  // ---------- Static scene, built once ----------
  const terrainMesh = uploadGeometry(buildTerrainGeometry(terrainHeight, terrainColorAt, WORLD_HALF, 416));

  const scenery = buildSceneryGeometries();
  const forestMesh = uploadGeometry(scenery.forest);
  const villageMesh = uploadGeometry(scenery.village);
  const windowsMesh = uploadGeometry(scenery.windows);
  const boatsMesh = uploadGeometry(scenery.boats);
  const runwayMesh = uploadGeometry(scenery.runway);
  const lighthouseMesh = uploadGeometry(scenery.lighthouse);
  const lampMesh = uploadGeometry(scenery.lamp);
  const beamMesh = uploadGeometry(scenery.beam);
  const lightBase = scenery.lightBase;
  const parcelMesh = uploadGeometry(scenery.parcel);

  const torusMesh = uploadGeometry(buildTorusGeometry(0.055, 40, 10));
  const discMesh = uploadGeometry(buildRingGeometry(0.02, 1, 40));
  const ringBandMesh = uploadGeometry(buildRingGeometry(0.93, 1, 40));

  // The aircraft: geometry lives in aircraftMesh.js, this file only
  // uploads and draws it.
  const aircraft = buildAircraftGeometries();
  const gliderMesh = uploadGeometry(aircraft.body);
  const canopyMesh = uploadGeometry(aircraft.canopy);
  const accentsMesh = uploadGeometry(aircraft.accents);
  const brakesMesh = uploadGeometry(aircraft.brakes);
  const navLightsMesh = uploadGeometry(aircraft.navLights);
  const strobeMesh = uploadGeometry(aircraft.strobe);
  const aileronRMesh = uploadGeometry(aircraft.aileronR);
  const aileronLMesh = uploadGeometry(aircraft.aileronL);
  const elevatorRMesh = uploadGeometry(aircraft.elevatorR);
  const elevatorLMesh = uploadGeometry(aircraft.elevatorL);

  // A control surface's model matrix: the airframe's, then out to the
  // hinge, then swung around it by the deflection angle.
  function surfaceMatrix(gm, hx, hy, hz, theta) {
    const t = mat4Model(hx, hy, hz, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1);
    const c = Math.cos(theta), s = Math.sin(theta);
    const r = mat4Model(0, 0, 0, 1, 0, 0, 0, c, s, 0, -s, c, 1);
    return mat4Multiply(gm, mat4Multiply(t, r));
  }

  // ---------- Sprites: clouds and runway edge lights ----------
  const puffTexture = (() => {
    const c = document.createElement("canvas");
    c.width = 128; c.height = 128;
    const g = c.getContext("2d");
    for (const [x, y, r, a] of [[64, 70, 46, 0.55], [38, 76, 30, 0.4], [92, 76, 32, 0.4], [64, 52, 30, 0.45]]) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(255,255,255,${a})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(0, 0, 128, 128);
    }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
  })();

  const spriteLoc = {
    aPos: gl.getAttribLocation(spriteProg, "aPos"),
    aCorner: gl.getAttribLocation(spriteProg, "aCorner"),
    aSize: gl.getAttribLocation(spriteProg, "aSize"),
    aColor: gl.getAttribLocation(spriteProg, "aColor"),
    uProj: gl.getUniformLocation(spriteProg, "uProj"),
    uView: gl.getUniformLocation(spriteProg, "uView"),
    uRight: gl.getUniformLocation(spriteProg, "uRight"),
    uUp: gl.getUniformLocation(spriteProg, "uUp"),
    uTint: gl.getUniformLocation(spriteProg, "uTint"),
    uDrift: gl.getUniformLocation(spriteProg, "uDrift"),
    uWrap: gl.getUniformLocation(spriteProg, "uWrap"),
    uTex: gl.getUniformLocation(spriteProg, "uTex"),
    uFogColor: gl.getUniformLocation(spriteProg, "uFogColor"),
  };

  function makeSpriteBuffer(items) {
    // Each item: {x, y, z, w, h, r, g, b, a}. Four verts per sprite.
    const pos = [], corner = [], size = [], col = [];
    for (const it of items) {
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        pos.push(it.x, it.y, it.z);
        corner.push(cx, cy);
        size.push(it.w, it.h);
        col.push(it.r, it.g, it.b, it.a);
      }
    }
    const idx = [];
    for (let i = 0; i < items.length; i++) {
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const mk = (arr, type) => {
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(arr), gl.STATIC_DRAW);
      return buf;
    };
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    return { pos: mk(pos), corner: mk(corner), size: mk(size), col: mk(col), ibo, count: idx.length };
  }

  function drawSprites(buf, proj, view, right, up, tint, drift, wrap, fogColor) {
    gl.useProgram(spriteProg);
    const bind = (bufObj, attrib, n) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, bufObj);
      gl.enableVertexAttribArray(attrib);
      gl.vertexAttribPointer(attrib, n, gl.FLOAT, false, 0, 0);
    };
    bind(buf.pos, spriteLoc.aPos, 3);
    bind(buf.corner, spriteLoc.aCorner, 2);
    bind(buf.size, spriteLoc.aSize, 2);
    bind(buf.col, spriteLoc.aColor, 4);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.ibo);
    gl.uniformMatrix4fv(spriteLoc.uProj, false, proj);
    gl.uniformMatrix4fv(spriteLoc.uView, false, view);
    gl.uniform3f(spriteLoc.uRight, right[0], right[1], right[2]);
    gl.uniform3f(spriteLoc.uUp, up[0], up[1], up[2]);
    gl.uniform4f(spriteLoc.uTint, tint[0], tint[1], tint[2], tint[3]);
    gl.uniform1f(spriteLoc.uDrift, drift);
    gl.uniform1f(spriteLoc.uWrap, wrap);
    gl.uniform3f(spriteLoc.uFogColor, fogColor[0], fogColor[1], fogColor[2]);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, puffTexture);
    gl.uniform1i(spriteLoc.uTex, 0);
    gl.drawElements(gl.TRIANGLES, buf.count, gl.UNSIGNED_INT, 0);
  }

  // Dynamic sprites: one batch whose positions are rewritten every
  // frame — the rising air inside thermals and touchdown snow spray.
  const MAX_DYN_SPRITES = 110;
  const dynSprites = (() => {
    const mk = () => gl.createBuffer();
    const pos = mk(), corner = mk(), size = mk(), col = mk();
    const corners = [];
    for (let i = 0; i < MAX_DYN_SPRITES; i++) {
      for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) corners.push(cx, cy);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(corners), gl.STATIC_DRAW);
    const idx = [];
    for (let i = 0; i < MAX_DYN_SPRITES; i++) {
      const b = i * 4;
      idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    return { pos, corner, size, col, ibo, count: 0 };
  })();

  function updateDynSprites(items) {
    const n = Math.min(items.length, MAX_DYN_SPRITES);
    const pos = new Float32Array(n * 12), size = new Float32Array(n * 8), col = new Float32Array(n * 16);
    for (let i = 0; i < n; i++) {
      const it = items[i];
      for (let v = 0; v < 4; v++) {
        pos.set([it.x, it.y, it.z], (i * 4 + v) * 3);
        size.set([it.w, it.h], (i * 4 + v) * 2);
        col.set([it.r, it.g, it.b, it.a], (i * 4 + v) * 4);
      }
    }
    const up = (buf, arr) => {
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.DYNAMIC_DRAW);
    };
    up(dynSprites.pos, pos);
    up(dynSprites.size, size);
    up(dynSprites.col, col);
    dynSprites.count = n * 6;
  }

  const cloudSprites = makeSpriteBuffer(Array.from({ length: 46 }, (_, i) => {
    const h1 = treeHash(i * 3 + 11, 7);
    const h2 = treeHash(5, i * 7 + 3);
    const h3 = treeHash(i + 90, i - 40);
    return {
      x: (h1 - 0.5) * 11000, y: 540 + h2 * 380, z: (h3 - 0.5) * 11000,
      w: 400 + h2 * 460, h: 85 + h3 * 85,
      r: 1, g: 1, b: 1, a: 0.22 + h1 * 0.14,
    };
  }));

  const edgeLightSprites = (() => {
    const items = [];
    for (let dz = -RUNWAY.length / 2 + 30; dz < RUNWAY.length / 2; dz += 78) {
      for (const side of [-1, 1]) {
        items.push({
          x: RUNWAY.centreX + side * (RUNWAY.width / 2 + 4), y: RUNWAY.groundY + 1.6, z: RUNWAY.centreZ + dz,
          w: 3.4, h: 3.4, r: 1, g: 0.7, b: 0.33, a: 0.95,
        });
      }
    }
    return makeSpriteBuffer(items);
  })();

  // ---------- Dynamic flat geometry: thermal spirals and gulls ----------
  const flatLoc = {
    aPos: gl.getAttribLocation(flatProg, "aPos"),
    aColor: gl.getAttribLocation(flatProg, "aColor"),
    uMVP: gl.getUniformLocation(flatProg, "uMVP"),
  };
  const dynPos = gl.createBuffer();
  const dynCol = gl.createBuffer();
  function drawDynamic(positions, colors, mode, mvp) {
    gl.useProgram(flatProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynPos);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(flatLoc.aPos);
    gl.vertexAttribPointer(flatLoc.aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, dynCol);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(flatLoc.aColor);
    gl.vertexAttribPointer(flatLoc.aColor, 4, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(flatLoc.uMVP, false, mvp);
    gl.drawArrays(mode, 0, positions.length / 3);
  }

  // ---------- Camera, same maths as the old projector ----------
  function cameraFor(glider, view, time = 0) {
    const fwdX = Math.sin(glider.heading) * Math.cos(glider.pitch);
    const fwdZ = -Math.cos(glider.heading) * Math.cos(glider.pitch);
    const fwdY = Math.sin(glider.pitch);
    // Buffet: a stalled wing shudders, an oversped airframe trembles —
    // the camera feels both before the pilot reads either.
    const stressShake = (glider.stress || 0) > 0.55 ? (glider.stress - 0.55) * 0.022 : 0;
    const buffet = (glider.stalled ? 0.016 : glider.overspeed ? 0.007 : 0) + stressShake;
    const shX = Math.sin(time * 43.7) * buffet;
    const shY = Math.cos(time * 51.3) * buffet;
    if (view === "cockpit") {
      return { x: glider.x + shX * 8, y: glider.y + 1.2 + shY * 8, z: glider.z, fwdX, fwdY: fwdY + shY, fwdZ, roll: glider.roll * 0.55 + shX * 0.6 };
    }
    // Near the ground the camera tips down a little further, so the
    // glider stays framed through the flare and the roll-out instead
    // of sinking out of the bottom of the picture.
    const gap = glider.y - terrainHeight(glider.x, glider.z);
    const groundTilt = clamp(1 - gap / 160, 0, 1) * 0.15;
    return {
      x: glider.x - fwdX * 21 + shX * 10,
      y: glider.y + 7.2 - fwdY * 21 + shY * 10,
      z: glider.z - fwdZ * 21,
      fwdX, fwdY: fwdY * 0.82 - 0.06 - groundTilt + shY, fwdZ,
      roll: glider.roll * 0.4 + shX * 0.5,
    };
  }

  function cameraBasis(cam) {
    let rx = -cam.fwdZ, rz = cam.fwdX;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux0 = -rz * cam.fwdY;
    const uy0 = rz * cam.fwdX - rx * cam.fwdZ;
    const uz0 = rx * cam.fwdY;
    const cr = Math.cos(cam.roll || 0), sr = Math.sin(cam.roll || 0);
    const right = [rx * cr + ux0 * sr, uy0 * sr, rz * cr + uz0 * sr];
    const up = [ux0 * cr - rx * sr, uy0 * cr, uz0 * cr - rz * sr];
    return { right, up, fwd: [cam.fwdX, cam.fwdY, cam.fwdZ] };
  }

  function basisFromHeadingPitchRoll(heading, pitch, roll) {
    const fx = Math.sin(heading) * Math.cos(pitch);
    const fz = -Math.cos(heading) * Math.cos(pitch);
    const fy = Math.sin(pitch);
    let rx = -fz, rz = fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux0 = -rz * fy;
    const uy0 = rz * fx - rx * fz;
    const uz0 = rx * fy;
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const right = [rx * cr + ux0 * sr, uy0 * sr, rz * cr + uz0 * sr];
    const up = [ux0 * cr - rx * sr, uy0 * cr, uz0 * cr - rz * sr];
    return { right, up, fwd: [fx, fy, fz] };
  }

  function sunDirection(dayPhase) {
    const az = -0.85 + dayPhase * 3.2;
    const el = Math.max(0.04, 0.55 - dayPhase * 0.62);
    const ce = Math.cos(el);
    return [Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce];
  }

  // ---------- The frame ----------
  function draw(snapshot) {
    const { glider, sky, rings, activeRing, view, time, dropZone } = snapshot;
    const palette = skyPalette(sky.dayPhase);
    const cam = cameraFor(glider, view, time);
    const basis = cameraBasis(cam);
    const aspect = W / Math.max(1, H);
    const tanF = 0.5 / 0.92;
    const proj = mat4Perspective(2 * Math.atan(tanF), aspect, 1.5, 12000);
    const viewM = mat4View(cam.x, cam.y, cam.z,
      basis.right[0], basis.right[1], basis.right[2],
      basis.up[0], basis.up[1], basis.up[2],
      basis.fwd[0], basis.fwd[1], basis.fwd[2]);
    const viewProj = mat4Multiply(proj, viewM);
    const identity = mat4Identity();
    const sunDir = sunDirection(sky.dayPhase);
    const sunI = palette.sun;
    const fog = rgb255(palette.fog);
    const sunTint = [1.0, 0.72 + 0.24 * sunDir[1], 0.45 + 0.4 * sunDir[1]];
    const sunColor = [sunTint[0] * (0.25 + 1.15 * sunI), sunTint[1] * (0.25 + 1.15 * sunI), sunTint[2] * (0.25 + 1.15 * sunI)];
    const ambient = [
      0.13 + 0.32 * sunI, 0.16 + 0.3 * sunI, 0.26 + 0.22 * sunI,
    ];

    gl.clearColor(fog[0], fog[1], fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);

    // Sky dome (drawn as a fullscreen triangle at the far plane).
    gl.useProgram(skyProg);
    gl.depthMask(false);
    gl.bindBuffer(gl.ARRAY_BUFFER, skyBuf);
    gl.enableVertexAttribArray(skyLoc.aNDC);
    gl.vertexAttribPointer(skyLoc.aNDC, 2, gl.FLOAT, false, 0, 0);
    gl.uniform3f(skyLoc.uRight, basis.right[0], basis.right[1], basis.right[2]);
    gl.uniform3f(skyLoc.uUp, basis.up[0], basis.up[1], basis.up[2]);
    gl.uniform3f(skyLoc.uFwd, basis.fwd[0], basis.fwd[1], basis.fwd[2]);
    gl.uniform1f(skyLoc.uTanF, tanF);
    gl.uniform1f(skyLoc.uAspect, aspect);
    const top = rgb255(palette.sky), hor = rgb255(palette.horizon);
    gl.uniform3f(skyLoc.uTop, top[0], top[1], top[2]);
    gl.uniform3f(skyLoc.uHorizon, hor[0], hor[1], hor[2]);
    gl.uniform3f(skyLoc.uFog, fog[0], fog[1], fog[2]);
    gl.uniform3f(skyLoc.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
    gl.uniform3f(skyLoc.uSunTint, sunTint[0], sunTint[1], sunTint[2]);
    gl.uniform1f(skyLoc.uSunI, sunI);
    gl.uniform1f(skyLoc.uAurora, palette.aurora);
    gl.uniform1f(skyLoc.uTime, time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.depthMask(true);

    // Lit world.
    gl.useProgram(litProg);
    gl.uniform3f(lit.uSunDir, sunDir[0], sunDir[1], sunDir[2]);
    gl.uniform3f(lit.uSunColor, sunColor[0], sunColor[1], sunColor[2]);
    gl.uniform3f(lit.uAmbient, ambient[0], ambient[1], ambient[2]);
    gl.uniform3f(lit.uFogColor, fog[0], fog[1], fog[2]);
    gl.uniform3f(lit.uCamPos, cam.x, cam.y, cam.z);
    gl.uniform1f(lit.uTime, time);
    // Rim light grows as the sun leaves, so edges stay readable at night.
    gl.uniform1f(lit.uRim, 0.06 + (1 - sunI) * 0.22 + palette.aurora * 0.12);

    drawMesh(terrainMesh, viewProj, identity);
    drawMesh(forestMesh, viewProj, identity);
    drawMesh(villageMesh, viewProj, identity);
    drawMesh(boatsMesh, viewProj, identity);
    drawMesh(windowsMesh, viewProj, identity, { emissive: clamp(0.85 - palette.sun, 0, 0.8) });
    drawMesh(runwayMesh, viewProj, identity);
    drawMesh(lighthouseMesh, viewProj, identity);
    drawMesh(lampMesh, viewProj, identity, { emissive: 0.35 + palette.aurora * 0.9 });

    // Lighthouse beam, sweeping once the aurora is up.
    if (palette.aurora > 0.25) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);
      const sweep = time * 0.7;
      const beamModel = mat4Model(
        LIGHTHOUSE.x, lightBase + 43, LIGHTHOUSE.z,
        Math.cos(sweep), 0, -Math.sin(sweep), 0, 1, 0, Math.sin(sweep), 0, Math.cos(sweep),
      );
      drawMesh(beamMesh, mat4Multiply(viewProj, beamModel), beamModel, { emissive: 1.4, alpha: 0.13 + 0.06 * Math.sin(time * 0.7) });
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // Drop zone: a glowing band and a faint disc on the ground.
    const zone = dropZone || (snapshot.mission && snapshot.mission.objective === "drop" ? snapshot.mission.dropZone : null);
    if (zone) {
      const gy = terrainHeight(zone.x, zone.z);
      const zm = mat4Model(zone.x, gy + 1.6, zone.z, 1, 0, 0, 0, 1, 0, 0, 0, 1, zone.radius);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      drawMesh(ringBandMesh, mat4Multiply(viewProj, zm), zm, { emissive: 0.5, alpha: 0.95 });
      drawMesh(discMesh, mat4Multiply(viewProj, zm), zm, { emissive: 0.3, alpha: 0.16 });
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // The mail parcel, under its canopy, on its way down to the circle.
    if (snapshot.parcel) {
      const p = snapshot.parcel;
      const cs = Math.cos(p.spin || 0), sn = Math.sin(p.spin || 0);
      const pm = mat4Model(p.x, p.y, p.z, cs, 0, -sn, 0, 1, 0, sn, 0, cs, 1);
      drawMesh(parcelMesh, mat4Multiply(viewProj, pm), pm);
    }

    // Checkpoint rings, billboarded so they always read as gates.
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      if (r.passed) continue;
      const active = i === activeRing;
      const pulse = active ? 1 + Math.sin(time * 4) * 0.05 : 1;
      const scale = r.radius * pulse;
      const rm = mat4Model(r.x, r.y, r.z,
        basis.right[0], basis.right[1], basis.right[2],
        basis.up[0], basis.up[1], basis.up[2],
        -basis.fwd[0], -basis.fwd[1], -basis.fwd[2], scale);
      const mvp = mat4Multiply(viewProj, rm);
      if (active) {
        drawMesh(torusMesh, mvp, rm, { emissive: 0.85, tint: [1.0, 0.76, 0.18] });
      } else {
        drawMesh(torusMesh, mvp, rm, { emissive: 0.25 + palette.aurora * 0.5, tint: [0.45, 0.78, 0.95] });
      }
      const inner = mat4Model(r.x, r.y, r.z,
        basis.right[0], basis.right[1], basis.right[2],
        basis.up[0], basis.up[1], basis.up[2],
        -basis.fwd[0], -basis.fwd[1], -basis.fwd[2], scale * 0.86);
      drawMesh(torusMesh, mat4Multiply(viewProj, inner), inner, { emissive: 0.4 });
    }

    // Glider shadow: a soft dark disc on the ground below.
    {
      const gy = terrainHeight(glider.x, glider.z);
      const gap = glider.y - gy;
      if (gap > 0 && gap < 260) {
        const shrink = clamp(1 - gap / 300, 0.25, 1);
        const sm = mat4Model(glider.x, gy + 0.7, glider.z, 1, 0, 0, 0, 1, 0, 0, 0, 1, 13 * shrink + 2);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        drawMesh(discMesh, mat4Multiply(viewProj, sm), sm, { alpha: 0.46 * shrink, tint: [0.04, 0.05, 0.07] });
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }

    // The glider itself (chase view only; in cockpit you ARE the glider).
    if (view !== "cockpit") {
      const gb = basisFromHeadingPitchRoll(glider.heading, glider.pitch, glider.roll);
      const gm = mat4Model(glider.x, glider.y, glider.z,
        gb.right[0], gb.right[1], gb.right[2],
        gb.up[0], gb.up[1], gb.up[2],
        -gb.fwd[0], -gb.fwd[1], -gb.fwd[2], 1.18);
      const mvp = mat4Multiply(viewProj, gm);
      drawMesh(gliderMesh, mvp, gm);
      drawMesh(canopyMesh, mvp, gm);
      // The surfaces answer the stick: ailerons swing opposite each
      // other with the roll input, the elevators together with pitch.
      const ailR = surfaceMatrix(gm, 3.45, -0.06, 0.55, -glider.aileron * 0.38);
      drawMesh(aileronRMesh, mat4Multiply(viewProj, ailR), ailR);
      const ailL = surfaceMatrix(gm, -3.45, -0.06, 0.55, glider.aileron * 0.38);
      drawMesh(aileronLMesh, mat4Multiply(viewProj, ailL), ailL);
      const eleR = surfaceMatrix(gm, 0.35, 0.04, 3.3, glider.elevator * 0.3);
      drawMesh(elevatorRMesh, mat4Multiply(viewProj, eleR), eleR);
      const eleL = surfaceMatrix(gm, -0.35, 0.04, 3.3, glider.elevator * 0.3);
      drawMesh(elevatorLMesh, mat4Multiply(viewProj, eleL), eleL);
      if (glider.airbrake) drawMesh(brakesMesh, mvp, gm);
      drawMesh(accentsMesh, mvp, gm, { emissive: 1.5 });
      drawMesh(navLightsMesh, mvp, gm, { emissive: 1.3 });
      if (Math.sin(time * 2.4) > 0.72) drawMesh(strobeMesh, mvp, gm, { emissive: 1.6 });
    }

    // Thermal spirals: rising ribbons of light air, drawn twice — a
    // bright core and a wider, fainter sheath — so the column reads
    // from across the fjord, additively against the sky.
    {
      const positions = [];
      const colors = [];
      for (const t of sky.thermals) {
        if (!t.currentLift || t.currentLift < 0.7) continue;
        const ground = terrainHeight(t.x, t.z);
        const liftF = clamp(t.currentLift / 3.4, 0.3, 1);
        let prev = null;
        let prevWide = null;
        for (let i = 0; i <= 40; i++) {
          const frac = i / 40;
          const ang = frac * Math.PI * 5 + t.driftPhase + time * 0.9;
          const rad = t.radius * 0.34 * (0.4 + frac * 0.6);
          const px = t.x + Math.cos(ang) * rad;
          const pz = t.z + Math.sin(ang) * rad;
          const py = ground + 12 + frac * 330;
          const wx = t.x + Math.cos(ang) * rad * 1.09;
          const wz = t.z + Math.sin(ang) * rad * 1.09;
          if (prev) {
            positions.push(prev[0], prev[1], prev[2], px, py, pz);
            const a = 0.6 * (1 - frac) * liftF;
            colors.push(1, 1, 1, a, 1, 1, 1, a);
            positions.push(prevWide[0], prevWide[1], prevWide[2], wx, py, wz);
            const aw = 0.22 * (1 - frac) * liftF;
            colors.push(0.75, 0.95, 1, aw, 0.75, 0.95, 1, aw);
          }
          prev = [px, py, pz];
          prevWide = [wx, py, wz];
        }
      }
      if (positions.length) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.depthMask(false);
        drawDynamic(new Float32Array(positions), new Float32Array(colors), gl.LINES, viewProj);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }
    }

    // Gulls circling inside the strong thermals.
    {
      const positions = [];
      const colors = [];
      for (const flock of sky.birds) {
        const t = sky.thermals[flock.thermalSlot % sky.thermals.length];
        if (!t || !t.currentLift || t.currentLift < 1.4) continue;
        const ground = terrainHeight(t.x, t.z);
        for (let i = 0; i < flock.birds; i++) {
          const ang = flock.phase + time * 0.45 + (i * Math.PI * 2) / flock.birds;
          const bx = t.x + Math.cos(ang) * flock.radius;
          const bz = t.z + Math.sin(ang) * flock.radius;
          const by = ground + flock.height + Math.sin(time * 1.3 + i) * 5;
          const rad = [Math.cos(ang), 0, Math.sin(ang)];
          const tan = [-Math.sin(ang), 0, Math.cos(ang)];
          const w = 3.4;
          const flap = Math.sin(time * 6 + i * 1.4) * 1.5;
          const back = [bx - tan[0] * 0.9, by, bz - tan[2] * 0.9];
          const front = [bx + tan[0] * 1.3, by, bz + tan[2] * 1.3];
          const tipL = [bx - rad[0] * w, by + flap, bz - rad[2] * w];
          const tipR = [bx + rad[0] * w, by + flap, bz + rad[2] * w];
          positions.push(...back, ...tipL, ...front, ...back, ...front, ...tipR);
          for (let k = 0; k < 6; k++) colors.push(0.12, 0.14, 0.17, 0.9);
        }
      }
      if (positions.length) {
        drawDynamic(new Float32Array(positions), new Float32Array(colors), gl.TRIANGLES, viewProj);
      }
    }

    // Clouds drift with the wind; runway lights glow as the light fades.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const cloudTint = [
      0.75 + 0.25 * sunI, 0.72 + 0.24 * sunI, 0.78 + 0.2 * sunI,
      0.55 + 0.45 * sunI,
    ];
    drawSprites(cloudSprites, proj, viewM, basis.right, basis.up, cloudTint, time * 6, 1, fog);
    const lightGlow = clamp(1.15 - palette.sun, 0.15, 1);
    drawSprites(edgeLightSprites, proj, viewM, basis.right, basis.up, [1, 1, 1, lightGlow], 0, 0, fog);

    // The air itself, made visible: soft puffs rising inside every
    // working thermal, climbing and swelling as they go — plus the
    // snow spray a fresh touchdown kicks up behind the rolling glider.
    {
      const items = [];
      for (const t of sky.thermals) {
        if (!t.currentLift || t.currentLift < 0.7) continue;
        const ground = terrainHeight(t.x, t.z);
        const liftF = clamp(t.currentLift / 3.4, 0.3, 1);
        for (let k = 0; k < 5; k++) {
          const frac = (time * (0.045 + liftF * 0.05) + t.id * 0.37 + k * 0.2) % 1;
          const ang = t.driftPhase + frac * 5.2 + k * 1.7;
          const rad = t.radius * 0.3 * (0.4 + frac * 0.6);
          items.push({
            x: t.x + Math.cos(ang) * rad, y: ground + 16 + frac * 300, z: t.z + Math.sin(ang) * rad,
            w: 34 + frac * 95, h: 28 + frac * 62,
            r: 1, g: 0.99, b: 0.94, a: (1 - frac) * 0.5 * liftF + 0.05,
          });
        }
      }
      const td = snapshot.touchdown;
      if (td && td.age < 1.4 && glider.speed > 2) {
        const fx2 = Math.sin(glider.heading);
        const fz2 = -Math.cos(glider.heading);
        const gy = terrainHeight(glider.x, glider.z);
        for (let k = 0; k < 7; k++) {
          const back = 4 + k * 1.9 + td.age * 3;
          const spread = (treeHash(k * 7 + 3, Math.floor(td.age * 9)) - 0.5) * 8;
          items.push({
            x: glider.x - fx2 * back - fz2 * spread,
            y: gy + 1.6 + k * 0.7,
            z: glider.z - fz2 * back + fx2 * spread,
            w: 4.5 + k * 1.8, h: 3 + k * 1.3,
            r: 0.97, g: 0.99, b: 1, a: 0.38 * (1 - k / 8),
          });
        }
      }
      if (items.length) {
        updateDynSprites(items);
        drawSprites(dynSprites, proj, viewM, basis.right, basis.up, [1, 1, 1, 1], 0, 0, fog);
      }
    }
    gl.depthMask(true);
    gl.disable(gl.BLEND);

    // ---------- 2D overlay: cockpit, streaks, squall, vignette ----------
    fx.clearRect(0, 0, W, H);
    if (view === "cockpit") drawCockpit(glider, snapshot);
    else drawSpeedStreaks(glider, time);
    drawSnowSquallFx(sky, glider, time);
    drawVignette();
    return palette;
  }

  function drawSpeedStreaks(glider, time) {
    if (glider.speed < 25) return;
    fx.save();
    fx.strokeStyle = "rgba(240,248,255,0.32)";
    fx.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      const seed = (i * 271) % 997;
      const t = (time * (0.5 + glider.speed * 0.012) + seed / 997) % 1;
      const edge = i % 2 === 0 ? -1 : 1;
      const sx = W / 2 + edge * W * (0.3 + t * 0.24);
      const sy = H * (0.2 + ((seed * 7) % 500) / 500 * 0.6) + t * H * 0.1;
      const len = 12 + t * 30 * (glider.speed / 30);
      fx.beginPath();
      fx.moveTo(sx, sy);
      fx.lineTo(sx + edge * len, sy + len * 0.24);
      fx.stroke();
    }
    fx.restore();
  }

  function drawVignette() {
    const grad = fx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.86);
    grad.addColorStop(0, "rgba(6,10,16,0)");
    grad.addColorStop(1, "rgba(6,10,16,0.3)");
    fx.fillStyle = grad;
    fx.fillRect(0, 0, W, H);
  }

  function drawCockpit(glider, snapshot) {
    const dashY = H * 0.78;
    const dashGrad = fx.createLinearGradient(0, dashY - 40, 0, H);
    dashGrad.addColorStop(0, "#1a222b");
    dashGrad.addColorStop(0.25, "#141a20");
    dashGrad.addColorStop(1, "#0b0f14");
    fx.fillStyle = dashGrad;
    fx.beginPath();
    fx.moveTo(0, H);
    fx.lineTo(0, dashY + 26);
    fx.quadraticCurveTo(W * 0.5, dashY - 34, W, dashY + 26);
    fx.lineTo(W, H);
    fx.closePath();
    fx.fill();
    fx.fillStyle = "#1d262f";
    fx.fillRect(0, dashY + 30, W, 5);
    fx.fillStyle = "#10151b";
    fx.beginPath();
    fx.moveTo(0, 0);
    fx.lineTo(W * 0.055, 0);
    fx.lineTo(W * 0.028, dashY);
    fx.lineTo(0, dashY + 20);
    fx.closePath();
    fx.fill();
    fx.beginPath();
    fx.moveTo(W, 0);
    fx.lineTo(W * 0.945, 0);
    fx.lineTo(W * 0.972, dashY);
    fx.lineTo(W, dashY + 20);
    fx.closePath();
    fx.fill();
    // Canopy frame: two slim A-pillars raked in from the top corners —
    // the pilot sits inside a bubble, and the frame is what tells the
    // eye so. Kept thin: a glider's frame is a whisper, not a cage.
    fx.strokeStyle = "#10151b";
    fx.lineCap = "round";
    fx.lineWidth = 7;
    fx.beginPath();
    fx.moveTo(W * 0.205, -6);
    fx.lineTo(W * 0.295, dashY - 6);
    fx.moveTo(W * 0.795, -6);
    fx.lineTo(W * 0.705, dashY - 6);
    fx.stroke();
    fx.strokeStyle = "rgba(160,200,220,0.22)";
    fx.lineWidth = 1.6;
    fx.beginPath();
    fx.moveTo(W * 0.2, -6);
    fx.lineTo(W * 0.29, dashY - 6);
    fx.moveTo(W * 0.8, -6);
    fx.lineTo(W * 0.71, dashY - 6);
    fx.stroke();
    drawHorizonGauge(W * 0.5, dashY + 74, 52, glider);
    drawVarioGauge(W * 0.5 - 128, dashY + 74, 40, snapshot.verticalSpeed || 0);
    drawCompassGauge(W * 0.5 + 128, dashY + 74, 40, glider.heading);
    drawSpeedGauge(W * 0.5 - 256, dashY + 74, 40, glider.speed);
  }

  function drawSpeedGauge(x, y, r, speedMs) {
    gaugeShell(x, y, r, "SPEED km/h");
    const kmh = Math.round(speedMs * 3.6);
    const dial = Math.PI * 0.75 + (clamp(speedMs, 0, 42) / 42) * Math.PI * 1.5;
    fx.strokeStyle = speedMs < 13.5 ? "#e35d4f" : "#e8f4f8";
    fx.lineWidth = 3.4;
    fx.beginPath();
    fx.moveTo(x, y);
    fx.lineTo(x + Math.cos(dial) * (r - 9), y + Math.sin(dial) * (r - 9));
    fx.stroke();
    fx.fillStyle = "#e8f4f8";
    fx.font = `700 ${r * 0.42}px "Segoe UI", sans-serif`;
    fx.textAlign = "center";
    fx.fillText(String(kmh), x, y + r * 0.52);
  }

  function gaugeShell(x, y, r, label) {
    fx.fillStyle = "#0a0e12";
    fx.beginPath();
    fx.arc(x, y, r, 0, Math.PI * 2);
    fx.fill();
    fx.strokeStyle = "#3f5a68";
    fx.lineWidth = 2.5;
    fx.stroke();
    // Glass: a soft crescent of reflected light across the top of the
    // dial, so the instrument reads as a thing behind glass, not a sticker.
    fx.save();
    fx.beginPath();
    fx.arc(x, y, r - 2, 0, Math.PI * 2);
    fx.clip();
    const glass = fx.createRadialGradient(x - r * 0.35, y - r * 0.55, r * 0.1, x, y, r * 1.25);
    glass.addColorStop(0, "rgba(190,225,240,0.20)");
    glass.addColorStop(0.45, "rgba(190,225,240,0.05)");
    glass.addColorStop(0.7, "rgba(190,225,240,0)");
    fx.fillStyle = glass;
    fx.fillRect(x - r, y - r, r * 2, r * 2);
    fx.restore();
    fx.fillStyle = "#9fd8e8";
    fx.font = `600 ${Math.max(9, r * 0.24)}px "Segoe UI", sans-serif`;
    fx.textAlign = "center";
    fx.fillText(label, x, y + r + 14);
  }

  function drawHorizonGauge(x, y, r, glider) {
    gaugeShell(x, y, r, "HORIZON");
    fx.save();
    fx.beginPath();
    fx.arc(x, y, r - 4, 0, Math.PI * 2);
    fx.clip();
    fx.translate(x, y);
    fx.rotate(-glider.roll);
    const pitchPx = clamp(glider.pitch, -0.5, 0.5) * r * 1.1;
    fx.fillStyle = "#3d7ea6";
    fx.fillRect(-r, -r + pitchPx - 60, r * 2, r + 60);
    fx.fillStyle = "#7a5c38";
    fx.fillRect(-r, pitchPx, r * 2, r);
    fx.fillStyle = "#e8f4f8";
    fx.fillRect(-r, pitchPx - 1, r * 2, 2);
    fx.restore();
    fx.strokeStyle = "#ffcf4d";
    fx.lineWidth = 3;
    fx.beginPath();
    fx.moveTo(x - r * 0.5, y);
    fx.lineTo(x - r * 0.14, y);
    fx.lineTo(x, y + r * 0.14);
    fx.lineTo(x + r * 0.14, y);
    fx.lineTo(x + r * 0.5, y);
    fx.stroke();
  }

  function drawVarioGauge(x, y, r, verticalSpeed) {
    gaugeShell(x, y, r, "VARIO m/s");
    const dial = Math.PI * 0.75 + ((clamp(verticalSpeed, -6, 6) + 6) / 12) * Math.PI * 1.5;
    fx.strokeStyle = verticalSpeed >= 0 ? "#57e389" : "#e35d4f";
    fx.lineWidth = 3.4;
    fx.beginPath();
    fx.moveTo(x, y);
    fx.lineTo(x + Math.cos(dial) * (r - 9), y + Math.sin(dial) * (r - 9));
    fx.stroke();
    fx.fillStyle = "#e8f4f8";
    fx.font = `700 ${r * 0.42}px "Segoe UI", sans-serif`;
    fx.textAlign = "center";
    fx.fillText((verticalSpeed >= 0 ? "+" : "") + verticalSpeed.toFixed(1), x, y + r * 0.52);
  }

  function drawCompassGauge(x, y, r, heading) {
    gaugeShell(x, y, r, "HEADING");
    const deg = ((heading * 180) / Math.PI % 360 + 360) % 360;
    fx.fillStyle = "#e8f4f8";
    fx.font = `700 ${r * 0.5}px "Segoe UI", sans-serif`;
    fx.textAlign = "center";
    fx.fillText(String(Math.round(deg)).padStart(3, "0") + "°", x, y + r * 0.18);
    const card = ["N", "E", "S", "W"];
    fx.font = `600 ${r * 0.3}px "Segoe UI", sans-serif`;
    fx.fillStyle = "#9fd8e8";
    fx.fillText(card[Math.round(deg / 90) % 4], x, y - r * 0.3);
  }

  function drawSnowSquallFx(sky, glider, time) {
    if (!sky.squall.active) return;
    const dx = Math.abs(glider.x - sky.squall.x);
    if (dx > sky.squall.width * 1.6) return;
    const density = clamp(1 - dx / (sky.squall.width * 1.6), 0.12, 0.85);
    fx.save();
    fx.strokeStyle = `rgba(240,246,250,${0.5 * density})`;
    fx.lineWidth = 1.6;
    for (let i = 0; i < 60 * density; i++) {
      const sx = ((i * 173 + time * 620) % (W + 80)) - 40;
      const sy = (i * 269 + time * 240) % H;
      fx.beginPath();
      fx.moveTo(sx, sy);
      fx.lineTo(sx - 16, sy + 5);
      fx.stroke();
    }
    fx.fillStyle = `rgba(235,242,248,${0.22 * density})`;
    fx.fillRect(0, 0, W, H);
    fx.restore();
  }

  return { draw, resize, get size() { return { W, H }; } };
}
