import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, LAKE, PORTALS, CAREER, CONTACT, RAMPS, CHECKPOINTS, DOCK, roadDistance, lakeRadiusAt, rng, noise } from '../layout.js';
import { sampleHeight } from './ground.js';

const PALETTES = {
  green: ['#4f8a2c', '#5f9a34', '#6fae3c', '#3f7a2a', '#7cb843'],
  autumn: ['#e98a3b', '#d9672e', '#f2a646', '#e4b044'],
  blossom: ['#f08aa6', '#e8739a', '#f6a9be', '#ff9f8a'],
  bush: ['#4b7f2e', '#5a9236', '#3f6f2a']
};

function leafTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = rng(5);
  for (let i = 0; i < 9; i++) {
    const x = 22 + r() * 84, y = 22 + r() * 84, a = r() * Math.PI;
    g.save(); g.translate(x, y); g.rotate(a);
    const shade = 200 + Math.floor(r() * 55);
    g.fillStyle = `rgb(${shade},${shade},${shade})`;
    g.beginPath(); g.ellipse(0, 0, 20, 11, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-18, 0); g.lineTo(18, 0); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function flowerTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; g.beginPath(); g.ellipse(32 + Math.cos(a) * 14, 32 + Math.sin(a) * 14, 11, 8, a, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(32, 32, 8, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function clearAt(x, z, margin = 0) {
  const r = Math.hypot(x, z);
  if (r < WORLD.centerRadius + 9 + margin) return false;
  if (roadDistance(x, z) < WORLD.roadHalf + 3 + margin) return false;
  if (Math.hypot(x - LAKE.x, z - LAKE.z) < lakeRadiusAt(x, z) + 4 + margin) return false;
  if (Math.hypot(x - DOCK.x, z - DOCK.z) < 10) return false;
  for (const p of PORTALS) {
    if (Math.hypot(x - p.x, z - p.z) < p.plazaR + 3 + margin) return false;
    if (Math.hypot(x - p.bx, z - p.bz) < 15 + margin) return false;
    // keep driveways clear
    const vx = p.road.x - p.x, vz = p.road.z - p.z, L = vx * vx + vz * vz;
    const t = Math.max(0, Math.min(1, ((x - p.x) * vx + (z - p.z) * vz) / L));
    if (Math.hypot(x - (p.x + vx * t), z - (p.z + vz * t)) < 5 + margin) return false;
  }
  for (const c of [...CAREER, ...CONTACT]) if (Math.hypot(x - c.x, z - c.z) < 7 + margin) return false;
  for (const rp of RAMPS) if (Math.hypot(x - rp.x, z - rp.z) < 12 + margin) return false;
  for (const cp of CHECKPOINTS) if (Math.hypot(x - cp.x, z - cp.z) < 9) return false;
  return true;
}

function scatter(rand, n, minDist, rMin, rMax, margin, existing = []) {
  const out = [];
  let tries = 0;
  while (out.length < n && tries++ < n * 60) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rMin * rMin + rand() * (rMax * rMax - rMin * rMin));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) > WORLD.size / 2 - 4 || Math.abs(z) > WORLD.size / 2 - 4) continue;
    if (!clearAt(x, z, margin)) continue;
    let ok = true;
    for (const o of out) if ((o.x - x) ** 2 + (o.z - z) ** 2 < minDist * minDist) { ok = false; break; }
    if (ok) for (const o of existing) if ((o.x - x) ** 2 + (o.z - z) ** 2 < (minDist * 0.7) ** 2) { ok = false; break; }
    if (ok) out.push({ x, z });
  }
  return out;
}

export function createFoliage(quality) {
  const group = new THREE.Group(); group.name = 'foliage';
  const colliders = [];
  const rand = rng(2024);
  const leafMap = leafTexture();

  // ---- placements ----
  // clustered groves: bias broadleaf trees toward noise-defined groves
  const broadRaw = scatter(rand, 260, 6.5, 22, WORLD.playRadius + 6, 1);
  const broad = broadRaw.filter((p) => noise(p.x * 0.02, p.z * 0.02) > -0.25).slice(0, quality.treeCount);
  const pines = scatter(rand, quality.pineCount, 5.2, WORLD.playRadius - 8, WORLD.playRadius + 58, 0, broad);
  const innerPines = scatter(rand, 26, 7, 40, WORLD.playRadius - 10, 2, broad);
  const bushes = scatter(rand, quality.bushCount, 3.2, 18, WORLD.playRadius + 4, -1, [...broad, ...innerPines]);

  // ---- trunks ----
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.42, 1, 7, 1); trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshLambertMaterial({ color: '#6b4a38' });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, broad.length);
  trunks.castShadow = true; trunks.receiveShadow = true;

  // ---- leaf cards ----
  const leaves = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  broad.forEach((t, i) => {
    const y0 = sampleHeight(t.x, t.z);
    const kindRoll = rand();
    const pal = kindRoll < 0.13 ? PALETTES.blossom : kindRoll < 0.3 ? PALETTES.autumn : PALETTES.green;
    const hTrunk = 2.2 + rand() * 1.6, size = 0.85 + rand() * 0.55;
    m4.compose(v.set(t.x, y0 - 0.1, t.z), q.identity(), s.set(size, hTrunk + 0.8, size));
    trunks.setMatrixAt(i, m4);
    const blobs = 3 + Math.floor(rand() * 3);
    const baseColor = new THREE.Color(pal[Math.floor(rand() * pal.length)]);
    for (let b = 0; b < blobs; b++) {
      const R = (1.25 + rand() * 0.9) * size * (b === 0 ? 1.25 : 1);
      const ang = rand() * Math.PI * 2, off = b === 0 ? 0 : (0.9 + rand() * 0.7) * size;
      const c = new THREE.Vector3(t.x + Math.cos(ang) * off, y0 + hTrunk + R * 0.6 + (b === 0 ? 0.6 : rand() * 1.2) * size, t.z + Math.sin(ang) * off);
      const cards = Math.floor(R * R * 20 * quality.leafDensity);
      for (let k = 0; k < cards; k++) {
        const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
        const d = R * (0.55 + 0.45 * Math.sqrt(rand()));
        leaves.push({ p: c.clone().addScaledVector(dir, d), n: dir.clone().setY(dir.y + 0.35).normalize(), s: (0.85 + rand() * 0.6) * size, color: baseColor.clone().offsetHSL((rand() - 0.5) * 0.04, (rand() - 0.5) * 0.1, (rand() - 0.5) * 0.12 + dir.y * 0.06) });
      }
    }
    colliders.push({ type: 'circle', x: t.x, z: t.z, r: 0.75 * size + 0.2, kind: 'tree' });
  });
  bushes.forEach((b) => {
    const y0 = sampleHeight(b.x, b.z);
    const col = new THREE.Color(PALETTES.bush[Math.floor(rand() * 3)]);
    const blobs = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < blobs; k++) {
      const R = 0.7 + rand() * 0.5;
      const c = new THREE.Vector3(b.x + (rand() - 0.5) * 1.2, y0 + R * 0.55, b.z + (rand() - 0.5) * 1.2);
      const cards = Math.floor(R * R * 22 * quality.leafDensity);
      for (let j = 0; j < cards; j++) {
        const dir = new THREE.Vector3(rand() * 2 - 1, rand() * 1.5 - 0.3, rand() * 2 - 1).normalize();
        leaves.push({ p: c.clone().addScaledVector(dir, R * (0.5 + 0.5 * rand())), n: dir.clone().setY(dir.y + 0.4).normalize(), s: 0.55 + rand() * 0.35, color: col.clone().offsetHSL(0, 0, (rand() - 0.5) * 0.12 + dir.y * 0.05) });
      }
    }
  });

  const cardGeo = new THREE.PlaneGeometry(1, 1);
  const outward = new Float32Array(leaves.length * 3);
  const leafMat = new THREE.MeshLambertMaterial({ map: leafMap, alphaTest: 0.5, side: THREE.DoubleSide });
  const windUniform = { value: 0 };
  leafMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aOutward;\nuniform float uTime;')
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalMatrix * aOutward;\n#ifdef FLIP_SIDED\ntransformedNormal = -transformedNormal;\n#endif')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = instanceMatrix * vec4(transformed, 1.0);
        float ph = instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.27;
        mvPosition.x += sin(uTime * 1.6 + ph) * 0.07 + sin(uTime * 4.1 + ph * 3.0) * 0.025;
        mvPosition.z += cos(uTime * 1.3 + ph) * 0.06;
        mvPosition.y += sin(uTime * 2.3 + ph * 2.0) * 0.03;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
  };
  const leafMesh = new THREE.InstancedMesh(cardGeo, leafMat, leaves.length);
  leaves.forEach((l, i) => {
    e.set(rand() * Math.PI * 2, rand() * Math.PI * 2, rand() * Math.PI * 2);
    m4.compose(v.copy(l.p), q.setFromEuler(e), s.set(l.s, l.s, l.s));
    leafMesh.setMatrixAt(i, m4);
    leafMesh.setColorAt(i, l.color);
    outward[i * 3] = l.n.x; outward[i * 3 + 1] = l.n.y; outward[i * 3 + 2] = l.n.z;
  });
  cardGeo.setAttribute('aOutward', new THREE.InstancedBufferAttribute(outward, 3));
  leafMesh.castShadow = true; leafMesh.receiveShadow = true;
  leafMesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafMap, alphaTest: 0.5 });
  leafMesh.computeBoundingSphere();

  // ---- pines ----
  const pineParts = [];
  const trunk = new THREE.CylinderGeometry(0.18, 0.3, 1.6, 6); trunk.translate(0, 0.8, 0); tint(trunk, '#5d4033'); pineParts.push(trunk);
  [[2.4, 3.0, 1.4], [1.9, 2.6, 3.0], [1.35, 2.2, 4.4], [0.8, 1.7, 5.6]].forEach(([r, h, y], i) => {
    const cone = new THREE.ConeGeometry(r, h, 8, 1); cone.translate(0, y + h / 2 - 0.6, 0);
    tint(cone, ['#2f5d34', '#36693a', '#3d7440', '#45804a'][i]); pineParts.push(cone);
  });
  const pineGeo = mergeGeometries(pineParts.map((g) => g.toNonIndexed()));
  pineGeo.computeVertexNormals();
  const allPines = [...pines, ...innerPines];
  const pineMesh = new THREE.InstancedMesh(pineGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), allPines.length);
  allPines.forEach((p, i) => {
    const sc = 0.9 + rand() * 0.9;
    e.set(0, rand() * Math.PI, 0);
    m4.compose(v.set(p.x, sampleHeight(p.x, p.z) - 0.2, p.z), q.setFromEuler(e), s.set(sc, sc * (0.9 + rand() * 0.35), sc));
    pineMesh.setMatrixAt(i, m4);
    pineMesh.setColorAt(i, new THREE.Color().setHSL(0.3 + (rand() - 0.5) * 0.04, 0.35 + rand() * 0.2, 0.75 + rand() * 0.25));
    if (Math.hypot(p.x, p.z) < WORLD.playRadius + 4) colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.6 * sc + 0.3, kind: 'tree' });
  });
  pineMesh.castShadow = true; pineMesh.receiveShadow = true;

  // ---- rocks ----
  const rockVariants = [0, 1, 2].map((k) => {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const pos = g.attributes.position; const rr = rng(100 + k);
    const seen = new Map();
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
      if (!seen.has(key)) seen.set(key, 0.78 + rr() * 0.4);
      const f = seen.get(key);
      pos.setXYZ(i, pos.getX(i) * f * (1 + k * 0.15), pos.getY(i) * f * 0.62, pos.getZ(i) * f);
    }
    g.computeVertexNormals(); return g;
  });
  const rockMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, flatShading: true });
  const rockSpots = [
    ...scatter(rand, 70, 5, 20, WORLD.playRadius + 30, 0, [...broad, ...allPines]).map((p) => ({ ...p, s: 0.35 + rand() * 1.5 })),
    // shoreline boulders
    ...Array.from({ length: 14 }, (_, i) => { const a = (i / 14) * Math.PI * 2 + rand() * 0.2; const r = lakeRadiusAt(LAKE.x + Math.cos(a) * 20, LAKE.z + Math.sin(a) * 20) + 1 + rand() * 2.5; const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r; return Math.hypot(x - DOCK.x, z - DOCK.z) < 9 ? null : { x, z, s: 0.5 + rand() * 1.1 }; }).filter(Boolean)
  ];
  const rockMeshes = rockVariants.map((g) => new THREE.InstancedMesh(g, rockMat, rockSpots.length));
  const counts = [0, 0, 0];
  rockSpots.forEach((r) => {
    const k = Math.floor(rand() * 3), mesh = rockMeshes[k];
    e.set(rand() * 0.3, rand() * Math.PI * 2, rand() * 0.3);
    m4.compose(v.set(r.x, sampleHeight(r.x, r.z) + r.s * 0.12, r.z), q.setFromEuler(e), s.set(r.s, r.s, r.s));
    mesh.setMatrixAt(counts[k], m4);
    const g = 0.62 + rand() * 0.22; mesh.setColorAt(counts[k], new THREE.Color(g * 1.02, g * 0.97, g * 0.92));
    counts[k]++;
    if (r.s > 0.7) colliders.push({ type: 'circle', x: r.x, z: r.z, r: r.s * 0.95, kind: 'rock' });
  });
  rockMeshes.forEach((m, k) => { m.count = counts[k]; m.castShadow = true; m.receiveShadow = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });

  // ---- flowers ----
  const flowerSpots = [];
  const fcols = ['#ffffff', '#fff2a8', '#ffb3d1', '#c9a8ff', '#ff8f6b'];
  for (let i = 0; i < quality.flowerCount; i++) {
    const a = rand() * Math.PI * 2, r = 18 + rand() * (WORLD.playRadius - 18);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (noise(x * 0.05 + 7, z * 0.05) < 0.1 || !clearAt(x, z, -1.5)) continue;
    // little clumps
    const clump = 3 + Math.floor(rand() * 5), col = fcols[Math.floor(rand() * fcols.length)];
    for (let k = 0; k < clump; k++) flowerSpots.push({ x: x + (rand() - 0.5) * 2.2, z: z + (rand() - 0.5) * 2.2, col });
  }
  const flowerGeo = mergeGeometries([new THREE.PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2 + 0.35), new THREE.PlaneGeometry(0.34, 0.34).rotateX(-Math.PI / 2 - 0.35).rotateY(Math.PI / 2)]);
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, new THREE.MeshLambertMaterial({ map: flowerTexture(), alphaTest: 0.5, side: THREE.DoubleSide }), flowerSpots.length);
  flowerSpots.forEach((f, i) => {
    e.set(0, rand() * Math.PI, 0);
    m4.compose(v.set(f.x, sampleHeight(f.x, f.z) + 0.32 + rand() * 0.25, f.z), q.setFromEuler(e), s.setScalar(0.8 + rand() * 0.6));
    flowerMesh.setMatrixAt(i, m4); flowerMesh.setColorAt(i, new THREE.Color(f.col));
  });

  group.add(trunks, leafMesh, pineMesh, ...rockMeshes, flowerMesh);
  return {
    group, colliders,
    trees: broad, pines: allPines,
    update(time) { windUniform.value = time; }
  };
}

function tint(geo, hex) {
  const c = new THREE.Color(hex); const n = geo.attributes.position.count; const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
}
