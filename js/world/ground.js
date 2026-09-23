import * as THREE from '../../vendor/three/three.module.min.js';
import { WORLD, LAKE, DOCK, PORTALS, SPOKES, CHECKPOINTS, CAREER, RAMPS, heightAt, lakeRadiusAt, fbm, noise, noise2, polar, rng, rampHeight, deckHeight } from '../layout.js';

const N = 257;                // height grid resolution (shared by mesh, physics, grass)
const HALF = WORLD.size / 2;
const CELL = WORLD.size / (N - 1);

export const heights = new Float32Array(N * N);

export function buildHeights() {
  for (let j = 0; j < N; j++) {
    const z = -HALF + j * CELL;
    for (let i = 0; i < N; i++) heights[j * N + i] = heightAt(-HALF + i * CELL, z);
  }
}

// Bilinear sample of the same grid the mesh is built from, so wheels sit on the visible surface.
export function sampleHeight(x, z) {
  const fx = Math.min(N - 1.001, Math.max(0, (x + HALF) / CELL));
  const fz = Math.min(N - 1.001, Math.max(0, (z + HALF) / CELL));
  const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
  const a = heights[j * N + i], b = heights[j * N + i + 1], c = heights[(j + 1) * N + i], d = heights[(j + 1) * N + i + 1];
  // match the mesh's triangle split (diagonal from (i,j+1) to (i+1,j))
  if (tx + tz <= 1) return a + (b - a) * tx + (c - a) * tz;
  return d + (c - d) * (1 - tx) + (b - d) * (1 - tz);
}
export function surfaceHeight(x, z) { return Math.max(sampleHeight(x, z), rampHeight(x, z), deckHeight(x, z)); }

// ---------- Painted ground ----------
const TEX = 2048;
const S = TEX / WORLD.size;
const cx = (x) => (x + HALF) * S;
const cz = (z) => (z + HALF) * S;

function lakePath(ctx, grow = 0, scale = S) {
  ctx.beginPath();
  for (let k = 0; k <= 96; k++) {
    const a = (k / 96) * Math.PI * 2;
    const px = LAKE.x + Math.cos(a) * 30, pz = LAKE.z + Math.sin(a) * 30;
    const r = lakeRadiusAt(px, pz) + grow;
    const x = (LAKE.x + Math.cos(a) * r + HALF) * scale, y = (LAKE.z + Math.sin(a) * r + HALF) * scale;
    k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function strokeRoads(ctx, width, style, scale = S, dash = null) {
  ctx.save();
  ctx.strokeStyle = style; ctx.lineWidth = width * scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (dash) ctx.setLineDash(dash.map((d) => d * scale));
  ctx.beginPath(); ctx.arc(HALF * scale, HALF * scale, WORLD.ringRadius * scale, 0, Math.PI * 2); ctx.stroke();
  for (const s of SPOKES) { ctx.beginPath(); ctx.moveTo((s.ax + HALF) * scale, (s.az + HALF) * scale); ctx.lineTo((s.bx + HALF) * scale, (s.bz + HALF) * scale); ctx.stroke(); }
  ctx.restore();
}
function strokeDriveways(ctx, width, style, scale = S) {
  ctx.save(); ctx.strokeStyle = style; ctx.lineWidth = width * scale; ctx.lineCap = 'round';
  const dockRoad = polar(45, WORLD.ringRadius);
  for (const seg of [...PORTALS.map((p) => [p.x, p.z, p.road.x, p.road.z]), [DOCK.x, DOCK.z, dockRoad.x, dockRoad.z]]) {
    ctx.beginPath(); ctx.moveTo((seg[0] + HALF) * scale, (seg[1] + HALF) * scale); ctx.lineTo((seg[2] + HALF) * scale, (seg[3] + HALF) * scale); ctx.stroke();
  }
  ctx.restore();
}
function fillPlazas(ctx, style, grow = 0, scale = S) {
  ctx.save(); ctx.fillStyle = style;
  ctx.beginPath(); ctx.arc(HALF * scale, HALF * scale, (WORLD.centerRadius + grow) * scale, 0, Math.PI * 2); ctx.fill();
  for (const p of PORTALS) {
    ctx.beginPath(); ctx.arc((p.x + HALF) * scale, (p.z + HALF) * scale, (p.plazaR + grow) * scale, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate((p.bx + HALF) * scale, (p.bz + HALF) * scale); ctx.rotate(-p.face);
    const e = (9.5 + grow) * scale; ctx.beginPath(); ctx.roundRect(-e, -e, e * 2, e * 2, 2 * scale); ctx.fill(); ctx.restore();
  }
  for (const c of CAREER) { ctx.beginPath(); ctx.arc((c.x + HALF) * scale, (c.z + HALF) * scale, (3.2 + grow) * scale, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}

export function paintGround() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TEX;
  const ctx = canvas.getContext('2d');

  // 1) Meadow: low-res per-pixel noise, upscaled smoothly
  const LOW = 512, lowS = LOW / WORLD.size;
  const low = document.createElement('canvas'); low.width = low.height = LOW;
  const lctx = low.getContext('2d'); const img = lctx.createImageData(LOW, LOW);
  const lush = [86, 138, 52], deep = [58, 104, 40], dry = [168, 160, 78], moss = [110, 150, 60];
  for (let y = 0; y < LOW; y++) {
    const z = y / lowS - HALF;
    for (let x = 0; x < LOW; x++) {
      const wx = x / lowS - HALF;
      const n1 = fbm(wx * 0.02, z * 0.02, 3), n2 = noise2(wx * 0.09, z * 0.09), n3 = noise(wx * 0.4, z * 0.4);
      const h = heightAt(wx, z);
      let c = mix3(lush, deep, clamp01(0.5 + n1 * 0.9));
      c = mix3(c, dry, clamp01(n2 * 0.7 - 0.15 + Math.max(0, h - 3) * 0.05));
      c = mix3(c, moss, clamp01(n3 * 0.3));
      const r = Math.hypot(wx, z);
      if (r > WORLD.playRadius) c = mix3(c, [70, 96, 44], clamp01((r - WORLD.playRadius) / 25));
      const o = (y * LOW + x) * 4; const shade = 0.93 + n3 * 0.07;
      img.data[o] = c[0] * shade; img.data[o + 1] = c[1] * shade; img.data[o + 2] = c[2] * shade; img.data[o + 3] = 255;
    }
  }
  lctx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(low, 0, 0, TEX, TEX);

  // 2) Lake shore: sand then wet bed
  ctx.save(); ctx.filter = 'blur(10px)'; ctx.fillStyle = '#d8c28e'; lakePath(ctx, 5); ctx.fill(); ctx.restore();
  ctx.save(); ctx.fillStyle = '#b9a577'; lakePath(ctx, 0.8); ctx.fill(); ctx.fillStyle = '#5d7d6a'; ctx.filter = 'blur(8px)'; lakePath(ctx, -3); ctx.fill(); ctx.restore();

  // 3) Worn verges, dirt driveways
  ctx.save(); ctx.filter = 'blur(6px)';
  strokeRoads(ctx, WORLD.roadHalf * 2 + 3.2, 'rgba(142,128,86,.75)');
  strokeDriveways(ctx, 6.2, 'rgba(142,118,80,.55)');
  fillPlazas(ctx, 'rgba(120,110,80,.45)', 2);
  ctx.restore();
  strokeDriveways(ctx, 4.2, '#b88f62');
  ctx.save(); ctx.globalAlpha = 0.35; strokeDriveways(ctx, 1.1, '#8f6a45'); ctx.restore();

  // 4) Asphalt: curbs, body, lane paint
  strokeRoads(ctx, WORLD.roadHalf * 2 + 0.9, '#e7dccb');
  strokeRoads(ctx, WORLD.roadHalf * 2, '#4f4a55');
  strokeRoads(ctx, WORLD.roadHalf * 2 - 0.7, 'rgba(255,248,236,.85)');
  strokeRoads(ctx, WORLD.roadHalf * 2 - 1.1, '#56505c');
  strokeRoads(ctx, 0.28, '#f2c14e', S, [2.6, 2.2]);

  // 5) Paved plazas with tile grid
  fillPlazas(ctx, '#ddd0bb', 0.6);
  fillPlazas(ctx, '#e9dfcd');
  ctx.save();
  fillPlazasClip(ctx);
  ctx.strokeStyle = 'rgba(150,128,100,.28)'; ctx.lineWidth = 1.2;
  const step = 1.6 * S;
  for (let v = 0; v < TEX; v += step) { ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, TEX); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(TEX, v); ctx.stroke(); }
  ctx.restore();

  // portal pads: accent ring + inner disc
  for (const p of PORTALS) {
    ctx.save(); ctx.translate(cx(p.x), cz(p.z));
    ctx.fillStyle = 'rgba(60,44,40,.14)'; ctx.beginPath(); ctx.arc(0, 0, 6.6 * S, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = p.accent; ctx.globalAlpha = 0.8; ctx.lineWidth = 0.35 * S; ctx.beginPath(); ctx.arc(0, 0, 6.2 * S, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // spawn plaza rosette
  ctx.save(); ctx.translate(cx(0), cz(0));
  for (let k = 0; k < 3; k++) { ctx.strokeStyle = 'rgba(196,120,86,.55)'; ctx.lineWidth = 0.35 * S; ctx.beginPath(); ctx.arc(0, 0, (5 + k * 3.6) * S, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();

  // start/finish checker across the ring at checkpoint 0
  const cp = CHECKPOINTS[0]; const a = Math.atan2(cp.z, cp.x);
  ctx.save(); ctx.translate(cx(cp.x), cz(cp.z)); ctx.rotate(a);
  const cs = 0.9 * S;
  for (let i = -4; i < 4; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#1d1721' : '#fff8ef'; ctx.fillRect(i * cs, (j - 1) * cs, cs, cs); }
  ctx.restore();

  // ramps get a painted apron
  for (const r of RAMPS) {
    ctx.save(); ctx.translate(cx(r.x), cz(r.z)); ctx.rotate(r.yaw);
    ctx.fillStyle = 'rgba(120,96,70,.45)'; ctx.filter = 'blur(4px)'; ctx.fillRect(-r.len * 0.9 * S, -r.w * 0.8 * S, r.len * 1.8 * S, r.w * 1.6 * S); ctx.restore();
  }

  // 6) Grain: pebbles and grass tufts over everything
  const rand = rng(77);
  for (let k = 0; k < 26000; k++) {
    const x = rand() * TEX, y = rand() * TEX, s = 0.6 + rand() * 1.8;
    ctx.fillStyle = rand() > 0.5 ? 'rgba(255,250,235,.09)' : 'rgba(30,40,20,.10)';
    ctx.fillRect(x, y, s, s);
  }
  return canvas;
}
function fillPlazasClip(ctx) {
  ctx.beginPath(); ctx.arc(cx(0), cz(0), WORLD.centerRadius * S, 0, Math.PI * 2);
  for (const p of PORTALS) {
    ctx.moveTo(cx(p.x) + p.plazaR * S, cz(p.z)); ctx.arc(cx(p.x), cz(p.z), p.plazaR * S, 0, Math.PI * 2);
  }
  ctx.clip();
}

// Grass density mask (R = density). Low res; linear filtered.
export function paintGrassMask() {
  const M = 512, ms = M / WORLD.size;
  const c = document.createElement('canvas'); c.width = c.height = M;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, M, M);
  ctx.filter = 'blur(1.5px)';
  strokeRoads(ctx, WORLD.roadHalf * 2 + 2.4, '#000', ms);
  strokeDriveways(ctx, 5.2, '#000', ms);
  fillPlazas(ctx, '#000', 1.2, ms);
  ctx.fillStyle = '#000'; lakePath(ctx, 2.5, ms); ctx.fill();
  for (const r of RAMPS) { ctx.save(); ctx.translate((r.x + HALF) * ms, (r.z + HALF) * ms); ctx.rotate(r.yaw); ctx.fillRect(-r.len * 0.7 * ms, -r.w * 0.7 * ms, r.len * 1.4 * ms, r.w * 1.4 * ms); ctx.restore(); }
  // patchy meadow: thin the grass in noisy clearings
  const img = ctx.getImageData(0, 0, M, M);
  for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
    const wx = x / ms - HALF, wz = y / ms - HALF;
    const n = noise2(wx * 0.045, wz * 0.045);
    const o = (y * M + x) * 4;
    img.data[o] = img.data[o] * clamp01(0.62 + n * 0.9);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function buildTerrain(groundCanvas, quality) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    pos[k * 3] = -HALF + i * CELL; pos[k * 3 + 1] = heights[k]; pos[k * 3 + 2] = -HALF + j * CELL;
    uv[k * 2] = i / (N - 1); uv[k * 2 + 1] = 1 - j / (N - 1);
  }
  const idx = new Uint32Array((N - 1) * (N - 1) * 6); let o = 0;
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx[o++] = a; idx[o++] = c; idx[o++] = b; idx[o++] = b; idx[o++] = c; idx[o++] = d;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();

  const map = new THREE.CanvasTexture(groundCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = quality.anisotropy;
  map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;

  const mat = new THREE.MeshLambertMaterial({ map });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return { mesh, map };
}

// Half-float height texture for the grass vertex shader (R = height)
export function heightTexture() {
  const data = new Uint16Array(N * N * 4);
  for (let k = 0; k < N * N; k++) data[k * 4] = THREE.DataUtils.toHalfFloat(heights[k]);
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter; tex.needsUpdate = true;
  return tex;
}

function clamp01(v) { return Math.min(1, Math.max(0, v)); }
function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export { N as GRID_N, CELL as GRID_CELL };
