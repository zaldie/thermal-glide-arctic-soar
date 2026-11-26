// glMath.js — the renderer's 4x4 matrix helpers.
// One job: perspective, view and model matrices as plain Float32Arrays,
// column-major, ready for uniformMatrix4fv. No geometry, no GL state —
// pure functions a test could check.

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
