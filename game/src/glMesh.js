// glMesh.js — tiny matrix and geometry toolkit for the WebGL renderer.
// One job: build the vertex buffers (positions, normals, colours, specular
// weights, indices) that renderWorld.js uploads to the GPU, plus the 4x4
// matrix helpers its shaders need. No game rules, no DOM, no GL calls here:
// everything is plain arrays a test could check.

export function mat4Perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) / (near - far);
  m[11] = -1;
  m[14] = (2 * far * near) / (near - far);
  return m;
}

export function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

// View matrix from a camera position and its right/up/forward basis, the
// same basis the old 2D projector used, so both views frame identically.
export function mat4View(px, py, pz, rx, ry, rz, ux, uy, uz, fx, fy, fz) {
  const m = new Float32Array(16);
  m[0] = rx; m[4] = ry; m[8] = rz;
  m[1] = ux; m[5] = uy; m[9] = uz;
  m[2] = -fx; m[6] = -fy; m[10] = -fz;
  m[12] = -(rx * px + ry * py + rz * pz);
  m[13] = -(ux * px + uy * py + uz * pz);
  m[14] = fx * px + fy * py + fz * pz;
  m[15] = 1;
  return m;
}

// Model matrix from a position and right/up/back basis columns.
export function mat4Model(px, py, pz, rx, ry, rz, ux, uy, uz, bx, by, bz, scale = 1) {
  const m = new Float32Array(16);
  m[0] = rx * scale; m[1] = ry * scale; m[2] = rz * scale;
  m[4] = ux * scale; m[5] = uy * scale; m[6] = uz * scale;
  m[8] = bx * scale; m[9] = by * scale; m[10] = bz * scale;
  m[12] = px; m[13] = py; m[14] = pz;
  m[15] = 1;
  return m;
}

export function mat4Identity() {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

// Accumulates triangles with flat shading: every face gets its geometric
// normal, which is what makes built objects read as solid low-poly models.
export class MeshBuilder {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.colors = [];
    this.specs = [];
    this.indices = [];
  }

  vert(x, y, z, color, spec) {
    this.positions.push(x, y, z);
    this.colors.push(color[0], color[1], color[2]);
    this.specs.push(spec);
    return this.positions.length / 3 - 1;
  }

  tri(a, b, c, color, spec = 0.05) {
    const ax = this.positions[a * 3], ay = this.positions[a * 3 + 1], az = this.positions[a * 3 + 2];
    const bx = this.positions[b * 3], by = this.positions[b * 3 + 1], bz = this.positions[b * 3 + 2];
    const cx = this.positions[c * 3], cy = this.positions[c * 3 + 1], cz = this.positions[c * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9) return; // degenerate (a doubled corner): nothing to draw
    nx /= len; ny /= len; nz /= len;
    for (const idx of [a, b, c]) {
      this.normals[idx * 3] = nx;
      this.normals[idx * 3 + 1] = ny;
      this.normals[idx * 3 + 2] = nz;
    }
    void color; void spec;
    this.indices.push(a, b, c);
  }

  // A quad as two triangles; corners counter-clockwise seen from outside.
  quad(p1, p2, p3, p4, color, spec = 0.05) {
    const a = this.vert(...p1, color, spec);
    const b = this.vert(...p2, color, spec);
    const c = this.vert(...p3, color, spec);
    const d = this.vert(...p4, color, spec);
    // Pre-register normals slots (tri() fills them).
    this.normals.push(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    this.tri(a, b, c, color, spec);
    this.tri(a, c, d, color, spec);
  }

  box(cx, cy, cz, w, h, d, color, spec = 0.05, rotY = 0) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const corner = (x, y, z) => [cx + x * cos - z * sin, cy + y, cz + x * sin + z * cos];
    const t000 = corner(-hw, -hh, -hd), t100 = corner(hw, -hh, -hd), t110 = corner(hw, -hh, hd), t010 = corner(-hw, -hh, hd);
    const b000 = corner(-hw, hh, -hd), b100 = corner(hw, hh, -hd), b110 = corner(hw, hh, hd), b010 = corner(-hw, hh, hd);
    this.quad(t010, t110, b110, b010, color, spec); // south (+z)
    this.quad(t100, t000, b000, b100, color, spec); // north (-z)
    this.quad(t110, t100, b100, b110, color, spec); // east (+x)
    this.quad(t000, t010, b010, b000, color, spec); // west (-x)
    this.quad(b000, b100, b110, b010, color, spec); // top
    this.quad(t000, t110, t010, t100, color, spec); // bottom (rarely seen)
  }

  // A gable roof prism: ridge along z, base w x d at y, apex h above base.
  roof(cx, cy, cz, w, h, d, color, spec = 0.05, rotY = 0) {
    const hw = w / 2, hd = d / 2;
    const cos = Math.cos(rotY), sin = Math.sin(rotY);
    const P = (x, y, z) => [cx + x * cos - z * sin, cy + y, cz + x * sin + z * cos];
    const a = P(-hw, 0, -hd), b = P(hw, 0, -hd), c = P(hw, 0, hd), e = P(-hw, 0, hd);
    const r1 = P(0, h, -hd), r2 = P(0, h, hd);
    // The two "degenerate" quads collapse into the gable-end triangles.
    this.quad(a, b, r1, r1, color, spec); // north gable
    this.quad(b, c, r2, r1, color, spec); // east slope
    this.quad(c, e, r2, r2, color, spec); // south gable
    this.quad(e, a, r1, r2, color, spec); // west slope
  }

  // A tapered wing panel: root at x0, tip at x1 (either sign), chord
  // shrinking from c0 to c1, leading edge sweeping from z0 to z1.
  wing(x0, x1, y, zLead0, zLead1, c0, c1, thick, color, spec = 0.12) {
    const t = thick / 2;
    const top = [
      [x0, y + t, zLead0], [x1, y + t, zLead1], [x1, y + t, zLead1 + c1], [x0, y + t, zLead0 + c0],
    ];
    const bot = [
      [x0, y - t, zLead0], [x1, y - t, zLead1], [x1, y - t, zLead1 + c1], [x0, y - t, zLead0 + c0],
    ];
    this.quad(top[0], top[1], top[2], top[3], color, spec);
    this.quad(bot[3], bot[2], bot[1], bot[0], color, spec);
    this.quad(bot[0], bot[1], top[1], top[0], color, spec); // leading edge
    this.quad(bot[2], bot[3], top[3], top[2], color, spec); // trailing edge
    this.quad(bot[1], bot[2], top[2], top[1], color, spec); // tip
  }

  // A surface of revolution around the Z axis (the fuselage): profile is a
  // list of [z, radius] stations, nose first.
  lathe(profile, segments, color, spec = 0.25) {
    const rings = [];
    for (const [z, r] of profile) {
      const ring = [];
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        ring.push(this.vert(Math.cos(a) * r, Math.sin(a) * r, z, color, spec));
      }
      this.normals.push(...new Array(segments * 3).fill(0));
      rings.push(ring);
    }
    for (let s = 0; s < profile.length - 1; s++) {
      for (let i = 0; i < segments; i++) {
        const n = (i + 1) % segments;
        this.tri(rings[s][i], rings[s + 1][i], rings[s + 1][n], color, spec);
        this.tri(rings[s][i], rings[s + 1][n], rings[s][n], color, spec);
      }
    }
    // Smooth the lathe normals: average the face normals at shared verts is
    // overkill here; radial normals read correctly on a body of revolution.
    for (let s = 0; s < profile.length; s++) {
      const [z, r] = profile[s];
      void z; void r;
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const idx = rings[s][i];
        this.normals[idx * 3] = Math.cos(a);
        this.normals[idx * 3 + 1] = Math.sin(a);
        this.normals[idx * 3 + 2] = 0;
      }
    }
  }

  cylinder(cx, cy, cz, radius, height, segments, color, spec = 0.08) {
    const base = [], top = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      base.push(this.vert(cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius, color, spec));
      top.push(this.vert(cx + Math.cos(a) * radius, cy + height, cz + Math.sin(a) * radius, color, spec));
    }
    this.normals.push(...new Array(segments * 6).fill(0));
    for (let i = 0; i < segments; i++) {
      const n = (i + 1) % segments;
      this.tri(base[i], top[i], top[n], color, spec);
      this.tri(base[i], top[n], base[n], color, spec);
      const a = (i / segments) * Math.PI * 2;
      for (const idx of [base[i], top[i]]) {
        this.normals[idx * 3] = Math.cos(a);
        this.normals[idx * 3 + 1] = 0;
        this.normals[idx * 3 + 2] = Math.sin(a);
      }
    }
  }

  cone(cx, cy, cz, radius, height, segments, color, spec = 0.05) {
    const base = [];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      base.push(this.vert(cx + Math.cos(a) * radius, cy, cz + Math.sin(a) * radius, color, spec));
    }
    const apex = this.vert(cx, cy + height, cz, color, spec);
    this.normals.push(...new Array((segments + 1) * 3).fill(0));
    for (let i = 0; i < segments; i++) {
      const n = (i + 1) % segments;
      this.tri(base[i], apex, base[n], color, spec);
    }
  }

  sphere(cx, cy, cz, r, color, spec = 0.4, squashY = 1) {
    const seg = 10, ringsN = 7;
    const grid = [];
    for (let j = 0; j <= ringsN; j++) {
      const phi = (j / ringsN) * Math.PI;
      const ring = [];
      for (let i = 0; i < seg; i++) {
        const th = (i / seg) * Math.PI * 2;
        ring.push(this.vert(
          cx + Math.sin(phi) * Math.cos(th) * r,
          cy + Math.cos(phi) * r * squashY,
          cz + Math.sin(phi) * Math.sin(th) * r,
          color, spec,
        ));
      }
      this.normals.push(...new Array(seg * 3).fill(0));
      grid.push(ring);
    }
    for (let j = 0; j < ringsN; j++) {
      for (let i = 0; i < seg; i++) {
        const n = (i + 1) % seg;
        this.tri(grid[j][i], grid[j + 1][i], grid[j + 1][n], color, spec);
        this.tri(grid[j][i], grid[j + 1][n], grid[j][n], color, spec);
      }
    }
    // Radial normals.
    for (let j = 0; j <= ringsN; j++) {
      for (let i = 0; i < seg; i++) {
        const idx = grid[j][i];
        const dx = this.positions[idx * 3] - cx;
        const dy = (this.positions[idx * 3 + 1] - cy) / Math.max(0.2, squashY);
        const dz = this.positions[idx * 3 + 2] - cz;
        const len = Math.hypot(dx, dy, dz) || 1;
        this.normals[idx * 3] = dx / len;
        this.normals[idx * 3 + 1] = dy / len;
        this.normals[idx * 3 + 2] = dz / len;
      }
    }
  }

  build() {
    return {
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      colors: new Float32Array(this.colors),
      specs: new Float32Array(this.specs),
      indices: new Uint32Array(this.indices),
    };
  }
}

// The terrain as one smooth-shaded mesh: a regular grid over the whole
// world with per-vertex colours from the continuous colour ramp and normals
// from the height gradient, so the GPU interpolates light and colour across
// every triangle — the smoothness flat canvas fills could never reach.
export function buildTerrainGeometry(terrainHeight, terrainColorAt, worldHalf, segments) {
  const vertsPerSide = segments + 1;
  const positions = new Float32Array(vertsPerSide * vertsPerSide * 3);
  const normals = new Float32Array(vertsPerSide * vertsPerSide * 3);
  const colors = new Float32Array(vertsPerSide * vertsPerSide * 3);
  const specs = new Float32Array(vertsPerSide * vertsPerSide);
  const heights = new Float32Array(vertsPerSide * vertsPerSide);
  const cell = (worldHalf * 2) / segments;
  for (let j = 0; j < vertsPerSide; j++) {
    for (let i = 0; i < vertsPerSide; i++) {
      const x = -worldHalf + i * cell;
      const z = -worldHalf + j * cell;
      const h = terrainHeight(x, z);
      const k = j * vertsPerSide + i;
      heights[k] = h;
      positions[k * 3] = x;
      positions[k * 3 + 1] = h;
      positions[k * 3 + 2] = z;
    }
  }
  for (let j = 0; j < vertsPerSide; j++) {
    for (let i = 0; i < vertsPerSide; i++) {
      const k = j * vertsPerSide + i;
      const hl = heights[j * vertsPerSide + Math.max(0, i - 1)];
      const hr = heights[j * vertsPerSide + Math.min(segments, i + 1)];
      const hd = heights[Math.max(0, j - 1) * vertsPerSide + i];
      const hu = heights[Math.min(segments, j + 1) * vertsPerSide + i];
      const span = cell * ((i === 0 || i === segments) ? 1 : 2);
      const spanZ = cell * ((j === 0 || j === segments) ? 1 : 2);
      const gx = (hr - hl) / span;
      const gz = (hu - hd) / spanZ;
      const slope = Math.hypot(gx, gz);
      let nx = -gx, ny = 1, nz = -gz;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      normals[k * 3] = nx; normals[k * 3 + 1] = ny; normals[k * 3 + 2] = nz;
      const x = positions[k * 3], h = positions[k * 3 + 1], z = positions[k * 3 + 2];
      const col = terrainColorAt(x, z, h, slope);
      // Baked cavity shading: ground that sits below its neighbours
      // (gullies, valley floors, the lee of a ridge) darkens a touch,
      // and crests catch a whisper more light — the relief reads
      // crisper at distance than flat vertex colour alone.
      let shade = 1;
      if (h > 2) {
        const cavity = (hl + hr + hd + hu) / 4 - h;
        shade = Math.min(1.06, Math.max(0.8, 1 - cavity * 0.022));
      }
      colors[k * 3] = (col[0] / 255) * shade;
      colors[k * 3 + 1] = (col[1] / 255) * shade;
      colors[k * 3 + 2] = (col[2] / 255) * shade;
      specs[k] = h < 1.5 ? 0.85 : h > 240 && slope < 0.25 ? 0.3 : 0.04;
    }
  }
  const indices = new Uint32Array(segments * segments * 6);
  let q = 0;
  for (let j = 0; j < segments; j++) {
    for (let i = 0; i < segments; i++) {
      const a = j * vertsPerSide + i;
      const b = a + 1;
      const c = a + vertsPerSide;
      const d = c + 1;
      indices[q++] = a; indices[q++] = c; indices[q++] = b;
      indices[q++] = b; indices[q++] = c; indices[q++] = d;
    }
  }
  return { positions, normals, colors, specs, indices };
}

// A flat ring (annulus) lying in the XZ plane, for the drop zone.
export function buildRingGeometry(inner, outer, segments) {
  const positions = [], normals = [], colors = [], specs = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(a) * inner, 0, Math.sin(a) * inner, Math.cos(a) * outer, 0, Math.sin(a) * outer);
    normals.push(0, 1, 0, 0, 1, 0);
    colors.push(1, 1, 1, 1, 1, 1);
    specs.push(0, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    specs: new Float32Array(specs),
    indices: new Uint32Array(indices),
  };
}

// A torus standing in the XY plane (hole facing ±Z), unit outer radius, for
// the checkpoint rings; scale it per ring at draw time.
export function buildTorusGeometry(tube, radialSegs, tubeSegs) {
  const positions = [], normals = [], colors = [], specs = [], indices = [];
  const R = 1 - tube;
  for (let j = 0; j <= tubeSegs; j++) {
    const v = (j / tubeSegs) * Math.PI * 2;
    for (let i = 0; i <= radialSegs; i++) {
      const u = (i / radialSegs) * Math.PI * 2;
      const cx = R * Math.cos(u), cy = R * Math.sin(u);
      const x = cx + tube * Math.cos(v) * Math.cos(u);
      const y = cy + tube * Math.cos(v) * Math.sin(u);
      const z = tube * Math.sin(v);
      positions.push(x, y, z);
      let nx = x - cx, ny = y - cy, nz = z;
      const len = Math.hypot(nx, ny, nz) || 1;
      normals.push(nx / len, ny / len, nz / len);
      colors.push(1, 1, 1);
      specs.push(0.3);
    }
  }
  const cols = radialSegs + 1;
  for (let j = 0; j < tubeSegs; j++) {
    for (let i = 0; i < radialSegs; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    specs: new Float32Array(specs),
    indices: new Uint32Array(indices),
  };
}
