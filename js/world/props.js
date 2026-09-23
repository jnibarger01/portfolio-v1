import * as THREE from '/vendor/three/three.module.min.js';
import { WORLD, SPOKES, PORTALS, CAREER, CONTACT, CHECKPOINTS, RAMPS, DOCK, WHISPER_STATION, LAKE, polar, rng } from '../layout.js';
import { sampleHeight } from './ground.js';
import { box, cyl, mat, glow, canvasTexture, signTexture, FONT_DISPLAY, FONT_BODY } from './kit.js';

const PLUM = '#3b2f4a';

export function createProps(quality) {
  const group = new THREE.Group(); group.name = 'props';
  const colliders = [];
  const interactives = []; // {id, x, z, r, type, data}

  // ---------------- Lamp posts ----------------
  const lampSpots = [];
  for (let a = 0; a < 360; a += 11) {
    const p = polar(a + 5, WORLD.ringRadius + WORLD.roadHalf + 1.6);
    if (tooClose(p)) continue; lampSpots.push(p);
  }
  for (const s of SPOKES) {
    const len = Math.hypot(s.bx - s.ax, s.bz - s.az), nx = -(s.bz - s.az) / len, nz = (s.bx - s.ax) / len;
    for (let d = 10, k = 0; d < len - 6; d += 16, k++) {
      const side = k % 2 ? 1 : -1, t = d / len;
      const p = { x: s.ax + (s.bx - s.ax) * t + nx * side * (WORLD.roadHalf + 1.6), z: s.az + (s.bz - s.az) * t + nz * side * (WORLD.roadHalf + 1.6) };
      if (!tooClose(p)) lampSpots.push(p);
    }
  }
  for (let a = 0; a < 360; a += 60) lampSpots.push(polar(a + 30, WORLD.centerRadius + 1));
  const poleGeo = new THREE.CylinderGeometry(0.09, 0.13, 4.2, 6); poleGeo.translate(0, 2.1, 0);
  const headGeo = new THREE.BoxGeometry(0.55, 0.7, 0.55); headGeo.translate(0, 4.5, 0);
  const capGeo = new THREE.ConeGeometry(0.5, 0.4, 4); capGeo.rotateY(Math.PI / 4); capGeo.translate(0, 5.05, 0);
  const lampHeadMat = glow('#ffcf7a', 0.15, 3.2);
  const poles = new THREE.InstancedMesh(poleGeo, mat(PLUM), lampSpots.length);
  const heads = new THREE.InstancedMesh(headGeo, lampHeadMat, lampSpots.length);
  const caps = new THREE.InstancedMesh(capGeo, mat(PLUM), lampSpots.length);
  const poolTex = canvasTexture(128, 128, (g) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,205,130,.85)'); gr.addColorStop(0.5, 'rgba(255,180,100,.3)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, toneMapped: false });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(9, 9).rotateX(-Math.PI / 2), poolMat, lampSpots.length);
  const m4 = new THREE.Matrix4();
  lampSpots.forEach((p, i) => {
    const y = sampleHeight(p.x, p.z);
    m4.makeTranslation(p.x, y, p.z);
    poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); caps.setMatrixAt(i, m4);
    m4.makeTranslation(p.x, y + 0.08, p.z); pools.setMatrixAt(i, m4);
    colliders.push({ type: 'circle', x: p.x, z: p.z, r: 0.35, kind: 'lamp' });
  });
  poles.castShadow = true; caps.castShadow = true;
  pools.renderOrder = 1;
  group.add(poles, heads, caps, pools);

  // ---------------- Career billboards ----------------
  for (const c of CAREER) {
    const g = new THREE.Group();
    g.position.set(c.x, sampleHeight(c.x, c.z), c.z); g.rotation.y = c.yaw;
    for (const x of [-2.4, 2.4]) box(g, 0.25, 3.2, 0.25, mat(PLUM), x, 0, -0.1);
    const tex = canvasTexture(1024, 560, (ctx, w, h) => {
      ctx.fillStyle = '#1d1721'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#c21515'; ctx.fillRect(0, 0, w, 18);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#ffceca'; ctx.font = `700 64px ${FONT_DISPLAY}`; ctx.fillText(c.title.toUpperCase(), 48, 104);
      ctx.fillStyle = '#d5ff95'; ctx.font = `700 220px ${FONT_DISPLAY}`; ctx.fillText(c.big, 44, 318);
      ctx.fillStyle = '#fff'; ctx.font = `700 38px ${FONT_BODY}`; wrap(ctx, c.line, 48, 394, w - 96, 46);
      ctx.fillStyle = 'rgba(255,255,255,.62)'; ctx.font = `400 30px ${FONT_BODY}`; ctx.fillText(c.role, 48, 510);
    });
    const board = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.4, 0.25), [mat('#2a2430'), mat('#2a2430'), mat('#2a2430'), mat('#2a2430'), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.12 }), mat('#2a2430')]);
    board.position.set(0, 4.6, 0); board.castShadow = true; g.add(board);
    board.material[4].userData.glow = { day: 0.12, night: 0.7 }; glowList.push(board.material[4]);
    group.add(g);
    colliders.push({ type: 'box', x: c.x, z: c.z, hw: 3, hd: 0.4, yaw: c.yaw, kind: 'sign' });
    interactives.push({ id: c.id, type: 'career', x: c.x - Math.sin(c.yaw) * -4, z: c.z - Math.cos(c.yaw) * -4, r: 5.5, data: c, label: c.title });
  }

  // ---------------- Contact kiosks ----------------
  for (const c of CONTACT) {
    const g = new THREE.Group(); const y = sampleHeight(c.x, c.z);
    g.position.set(c.x, y, c.z); g.rotation.y = Math.atan2(-c.x, -c.z);
    if (c.id === 'contact-mail') {
      box(g, 0.18, 1.1, 0.18, mat(PLUM));
      const mb = box(g, 0.8, 0.7, 1.2, mat('#e03b3b'), 0, 1.1, 0);
      box(g, 0.08, 0.5, 0.25, mat('#ffcf4d'), 0.44, 1.5, -0.3);
    } else {
      box(g, 0.2, 2.4, 0.2, mat(PLUM), -1, 0, 0); box(g, 0.2, 2.4, 0.2, mat(PLUM), 1, 0, 0);
      const t = signTexture([{ text: c.label, size: 84 }, { text: c.sub, size: 30, display: false, weight: 700 }], { bg: '#1d1721', fg: c.color, accent: c.color });
      const s = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.4, 0.12), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }));
      s.position.set(0, 2.4, 0); s.castShadow = true; g.add(s);
    }
    group.add(g);
    colliders.push({ type: 'circle', x: c.x, z: c.z, r: 0.8, kind: 'sign' });
    interactives.push({ id: c.id, type: 'contact', x: c.x * 0.84, z: c.z * 0.84, r: 3.6, data: c, label: c.label });
  }

  // ---------------- District signposts at spoke/ring junctions ----------------
  const districtFor = (a) => PORTALS.filter((p) => Math.abs(((p.angle - a + 540) % 360) - 180) < 60).map((p) => p.district);
  for (const s of SPOKES) {
    const at = polar(s.a + 6, WORLD.ringRadius - WORLD.roadHalf - 2.2);
    const names = [...new Set(districtFor(s.a))].slice(0, 2);
    if (!names.length) continue;
    const g = new THREE.Group(); g.position.set(at.x, sampleHeight(at.x, at.z), at.z); g.rotation.y = Math.atan2(-at.x, -at.z);
    box(g, 0.18, 3.2, 0.18, mat('#6b4a38'));
    names.forEach((n, i) => {
      const t = signTexture([{ text: n.toUpperCase(), size: 60 }], { bg: '#fff4e3', accent: '#c21515', w: 512, h: 128 });
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 0.1), new THREE.MeshStandardMaterial({ map: t }));
      arm.position.set(i ? -1.1 : 1.1, 2.6 - i * 0.7, 0); arm.rotation.y = i ? 0.25 : -0.25; arm.castShadow = true; g.add(arm);
    });
    group.add(g); colliders.push({ type: 'circle', x: at.x, z: at.z, r: 0.3, kind: 'sign' });
  }

  // ---------------- Benches near plazas ----------------
  const benchR = rng(12);
  for (const p of PORTALS.filter((_, i) => i % 2 === 0)) {
    const ang = Math.atan2(p.z - p.road.z, p.x - p.road.x) + (benchR() > 0.5 ? 1.2 : -1.2);
    const bx = p.x + Math.cos(ang) * (p.plazaR - 1.4), bz = p.z + Math.sin(ang) * (p.plazaR - 1.4);
    const g = new THREE.Group(); g.position.set(bx, sampleHeight(bx, bz), bz); g.rotation.y = -ang + Math.PI / 2;
    for (const x of [-0.8, 0.8]) box(g, 0.1, 0.45, 0.5, mat(PLUM), x, 0, 0);
    for (let k = 0; k < 3; k++) box(g, 2, 0.06, 0.14, mat('#c58b5a'), 0, 0.45, -0.18 + k * 0.18);
    for (let k = 0; k < 2; k++) box(g, 2, 0.14, 0.05, mat('#c58b5a'), 0, 0.65 + k * 0.22, -0.26);
    group.add(g); colliders.push({ type: 'circle', x: bx, z: bz, r: 0.9, kind: 'bench' });
  }

  // ---------------- Circuit gates ----------------
  const gates = CHECKPOINTS.map((cp, i) => {
    const g = new THREE.Group(); const y = sampleHeight(cp.x, cp.z);
    g.position.set(cp.x, y, cp.z); g.rotation.y = -(cp.angle * Math.PI) / 180;
    const span = WORLD.roadHalf + 1.4;
    box(g, 0.35, 4.4, 0.35, mat(PLUM), -span, 0, 0); box(g, 0.35, 4.4, 0.35, mat(PLUM), span, 0, 0);
    const tex = canvasTexture(512, 96, (c, w, h) => { c.fillStyle = '#1d1721'; c.fillRect(0, 0, w, h); c.fillStyle = i === 0 ? '#d5ff95' : '#ffceca'; c.font = `700 76px ${FONT_DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(i === 0 ? 'START · FINISH' : `CHECKPOINT ${i}`, w / 2, h / 2 + 4); });
    const bannerMat = new THREE.MeshStandardMaterial({ map: tex, emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: 0.15 });
    const banner = new THREE.Mesh(new THREE.BoxGeometry(span * 2 + 0.4, 0.9, 0.15), [mat(PLUM), mat(PLUM), mat(PLUM), mat(PLUM), bannerMat, bannerMat]);
    banner.position.y = 4.2; banner.castShadow = true; g.add(banner);
    group.add(g);
    for (const s of [-1, 1]) { const c = Math.cos((cp.angle * Math.PI) / 180), sn = Math.sin((cp.angle * Math.PI) / 180); colliders.push({ type: 'circle', x: cp.x + c * span * s, z: cp.z + sn * span * s, r: 0.35, kind: 'gate' }); }
    return { cp, bannerMat };
  });

  // ---------------- Ramps ----------------
  for (const r of RAMPS) {
    const shape = new THREE.Shape(); shape.moveTo(-r.len / 2, 0); shape.lineTo(r.len / 2, 0); shape.lineTo(r.len / 2, r.h); shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: r.w, bevelEnabled: false }); geo.translate(0, 0, -r.w / 2);
    const stripes = canvasTexture(256, 256, (c) => { c.fillStyle = '#c58b5a'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#a8734a'; for (let k = 0; k < 256; k += 32) c.fillRect(k, 0, 5, 256); c.fillStyle = '#ffcf4d'; c.fillRect(236, 0, 20, 256); });
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.8 }));
    m.position.set(r.x, sampleHeight(r.x, r.z), r.z); m.rotation.y = -r.yaw; m.castShadow = true; m.receiveShadow = true;
    group.add(m);
  }

  // ---------------- Dock + visitor radio ----------------
  const dock = new THREE.Group();
  dock.position.set(DOCK.x, WORLD.waterLevel + 0.28, DOCK.z); dock.rotation.y = -DOCK.angle + Math.PI / 2;
  for (let k = 0; k < 17; k++) box(dock, 3.4, 0.14, 0.62, mat(k % 3 ? '#a87650' : '#94663f'), 0, 0, k * 0.68);
  for (let k = 0; k < 17; k += 3) for (const s of [-1.5, 1.5]) cyl(dock, 0.13, 0.13, 2.2, mat('#6b4a38'), s, -1.9, k * 0.68, 6);
  for (const s of [-1.6, 1.6]) cyl(dock, 0.1, 0.1, 1.1, mat('#6b4a38'), s, 0, 10.6, 6);
  group.add(dock);
  const radio = new THREE.Group();
  radio.position.set(WHISPER_STATION.x, sampleHeight(WHISPER_STATION.x, WHISPER_STATION.z), WHISPER_STATION.z);
  box(radio, 1.4, 1.1, 1, mat('#e8e1d6'));
  box(radio, 1.2, 0.5, 0.05, glow('#d5ff95', 0.6, 2.2), 0, 0.35, 0.52);
  cyl(radio, 0.04, 0.04, 3.2, mat(PLUM), 0.5, 1.1, 0, 5);
  const radioTip = cyl(radio, 0.18, 0.18, 0.18, glow('#ff6a7c', 1.5, 3), 0.5, 4.3, 0, 8);
  group.add(radio);
  colliders.push({ type: 'circle', x: WHISPER_STATION.x, z: WHISPER_STATION.z, r: 1, kind: 'radio' });
  interactives.push({ id: 'whispers', type: 'whispers', x: DOCK.x, z: DOCK.z, r: WHISPER_STATION.r, label: 'Visitor radio' });

  return {
    group, colliders, interactives, gates,
    update(t, night, activeCheckpoint, lapActive) {
      poolMat.opacity = Math.max(0, night - 0.15) * 0.9;
      for (const m of glowList) m.emissiveIntensity = m.userData.glow.day + (m.userData.glow.night - m.userData.glow.day) * night;
      radioTip.material.emissiveIntensity = Math.sin(t * 5) > 0 ? 3 : 0.4;
      for (const g of gates) {
        const on = g.cp.i === activeCheckpoint;
        g.bannerMat.emissiveIntensity = on ? 0.9 + Math.sin(t * 8) * 0.3 : 0.15 + night * 0.3;
      }
    }
  };

  function tooClose(p) {
    for (const q of PORTALS) if (Math.hypot(p.x - q.road.x, p.z - q.road.z) < 7) return true;
    for (const c of CHECKPOINTS) if (Math.hypot(p.x - c.x, p.z - c.z) < 8) return true;
    for (const s of SPOKES) { const e = polar(s.a, WORLD.ringRadius); if (Math.hypot(p.x - e.x, p.z - e.z) < 9) return true; }
    if (Math.hypot(p.x - LAKE.x, p.z - LAKE.z) < LAKE.r + 6) return true;
    return false;
  }
}
const glowList = [];

function wrap(ctx, text, x, y, maxW, lh) {
  const words = text.split(' '); let line = '';
  for (const w of words) { const test = line ? `${line} ${w}` : w; if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, y); line = w; y += lh; } else line = test; }
  ctx.fillText(line, x, y);
}

// ---------------- Voxel name letters (knockable) ----------------
const GLYPHS = {
  J: ['..###', '...#.', '...#.', '...#.', '#..#.', '#..#.', '.##..'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####']
};
export function createLetters() {
  const group = new THREE.Group(); group.name = 'letters';
  const colors = ['#ff6a7c', '#ffcf6e', '#d5ff95', '#7de8ff'];
  const cube = new THREE.BoxGeometry(0.62, 0.62, 0.62);
  const letters = [];
  const word = 'JACE';
  const baseAngle = (225 * Math.PI) / 180;
  const cx = Math.cos(baseAngle) * 11, cz = Math.sin(baseAngle) * 11;
  const along = { x: -Math.sin(baseAngle), z: Math.cos(baseAngle) };
  [...word].forEach((ch, i) => {
    const g = new THREE.Group();
    const inst = new THREE.InstancedMesh(cube, mat(colors[i]), 35); let n = 0;
    GLYPHS[ch].forEach((row, r) => [...row].forEach((cell, c) => {
      if (cell !== '#') return;
      inst.setMatrixAt(n++, new THREE.Matrix4().makeTranslation((c - 2) * 0.62, (6 - r) * 0.62 + 0.31, 0));
    }));
    inst.count = n; inst.castShadow = true; inst.receiveShadow = true;
    g.add(inst);
    const off = (i - 1.5) * 3.8;
    const x = cx + along.x * off, z = cz + along.z * off;
    g.position.set(x, 0, z);
    g.rotation.y = Math.atan2(-Math.cos(baseAngle), -Math.sin(baseAngle));
    group.add(g);
    letters.push({ g, home: { x, z, yaw: g.rotation.y }, vx: 0, vz: 0, spin: 0, tip: 0, tipV: 0, r: 1.6 });
  });
  return { group, letters };
}
