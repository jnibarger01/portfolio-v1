import * as THREE from '/vendor/three/three.module.min.js';
import { EffectComposer } from '/vendor/three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from '/vendor/three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/vendor/three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '/vendor/three/addons/postprocessing/OutputPass.js';
import { WORLD, PORTALS, CHECKPOINTS, CAREER, DOCK, setProjects, surfaceAt } from './layout.js';
import { buildHeights, paintGround, paintGrassMask, buildTerrain, heightTexture, surfaceHeight, sampleHeight } from './world/ground.js';
import { createGrass } from './world/grass.js';
import { createFoliage } from './world/foliage.js';
import { createWater } from './world/water.js';
import { createSky, TIME_PRESETS } from './world/sky.js';
import { createPortals } from './world/portals.js';
import { createProps, createLetters } from './world/props.js';
import { setNight } from './world/kit.js';
import { createVehicle } from './vehicle.js';
import { createAudio } from './audio.js';
import { createUI, fmt } from './ui.js';
import { ACHIEVEMENTS } from './achievements.js';

// ---------------- Settings & quality ----------------
const QUALITY = {
  low: { dpr: 1, grassCount: 7000, grassPatch: 44, grassHeight: 0.62, shadows: true, shadowMap: 1024, bloom: false, treeCount: 45, pineCount: 90, bushCount: 40, leafDensity: 0.55, flowerCount: 70, anisotropy: 2 },
  medium: { dpr: 1.5, grassCount: 65000, grassPatch: 58, grassHeight: 0.7, shadows: true, shadowMap: 2048, bloom: true, treeCount: 125, pineCount: 280, bushCount: 140, leafDensity: 0.8, flowerCount: 260, anisotropy: 4 },
  high: { dpr: 2, grassCount: 120000, grassPatch: 72, grassHeight: 0.74, shadows: true, shadowMap: 2048, bloom: true, treeCount: 150, pineCount: 340, bushCount: 180, leafDensity: 1, flowerCount: 340, anisotropy: 8 }
};
const coarse = matchMedia('(pointer: coarse)').matches;
const defaultQuality = coarse || innerWidth < 760 ? 'low' : (navigator.hardwareConcurrency || 4) >= 8 ? 'high' : 'medium';
const saved = safeJSON(localStorage.getItem('jace-drive-settings'), {});
const settings = { audio: true, shake: true, time: 'auto', quality: defaultQuality, ...saved };
const forced = new URLSearchParams(location.search).get('quality');
if (QUALITY[forced]) settings.quality = forced;
const quality = QUALITY[settings.quality] || QUALITY.medium;
const saveSettings = () => localStorage.setItem('jace-drive-settings', JSON.stringify(settings));

const store = {
  discovered: new Set(safeJSON(localStorage.getItem('jace-drive-discovered'), [])),
  achievements: new Set(safeJSON(localStorage.getItem('jace-drive-achievements'), [])),
  career: new Set(safeJSON(localStorage.getItem('jace-drive-career'), [])),
  bestLap: Number(localStorage.getItem('jace-drive-best-lap') || 0),
  distance: Number(localStorage.getItem('jace-drive-distance') || 0)
};
const persist = () => {
  localStorage.setItem('jace-drive-discovered', JSON.stringify([...store.discovered]));
  localStorage.setItem('jace-drive-achievements', JSON.stringify([...store.achievements]));
  localStorage.setItem('jace-drive-career', JSON.stringify([...store.career]));
  localStorage.setItem('jace-drive-best-lap', String(store.bestLap || 0));
  localStorage.setItem('jace-drive-distance', String(Math.round(store.distance)));
};

// ---------------- Renderer ----------------
const canvas = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !quality.bloom, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, quality.dpr));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = quality.shadows;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('optRenderer').textContent = `WebGL2 · ${settings.quality}`;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.5, 1400);
let composer = null, bloom = null;
if (quality.bloom) {
  const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.35, 0.5, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  composer?.setSize(innerWidth, innerHeight);
  composer?.setPixelRatio(Math.min(devicePixelRatio || 1, quality.dpr));
}
addEventListener('resize', resize);

const audio = createAudio();
audio.setEnabled(settings.audio);

// ---------------- App facade for the UI ----------------
let vehicle, sky, grass, foliage, water, portals, props, letters, particles;
let colliders = [];
let paused = true, modalOpen = false, started = false;
const timeState = { t: TIME_PRESETS.sunset - 0.04 };

const app = {
  settings, audio, saveSettings,
  get discovered() { return store.discovered; },
  get achievements() { return store.achievements; },
  get bestLap() { return store.bestLap; },
  car: () => vehicle?.state || { x: 0, z: 0, yaw: 0 },
  snapshot() {
    try { render(); return canvas.toDataURL('image/jpeg', 0.82); } catch { return null; }
  },
  travelTo(p, { silent = false } = {}) {
    const dx = p.road.x - p.x, dz = p.road.z - p.z, len = Math.hypot(dx, dz) || 1;
    // park on the driveway, nose toward the building
    const x = p.x + (dx / len) * 3.5, z = p.z + (dz / len) * 3.5;
    vehicle.place(x, z, Math.atan2(-dx, -dz), surfaceHeight);
    snapCamera();
    if (!silent) audio.portal();
  },
  goToCircuit() { const cp = CHECKPOINTS[0], back = CHECKPOINTS[7]; vehicle.place(back.x + (cp.x - back.x) * 0.6, back.z + (cp.z - back.z) * 0.6, Math.atan2(cp.x - back.x, cp.z - back.z), surfaceHeight); snapCamera(); },
  respawn,
  resetObjects,
  resetProgress() { store.discovered.clear(); store.achievements.clear(); store.career.clear(); store.bestLap = 0; persist(); },
  setQuality(v) { settings.quality = v; saveSettings(); location.reload(); },
  setTimeMode(v) { settings.time = v; saveSettings(); if (TIME_PRESETS[v] !== undefined) timeState.t = TIME_PRESETS[v]; },
  setAudio(v) { settings.audio = v; saveSettings(); audio.setEnabled(v); document.getElementById('audioTrigger').setAttribute('aria-pressed', String(v)); },
  unlock,
  interact,
  onModal(open) { modalOpen = open; },
  onRoute: () => ui.setMeta('Jace Nibarger · Drive-in Portfolio | Service Ops & AI Systems', document.querySelector('meta[name=description]').getAttribute('content')),
  onGithub() { unlock('github'); },
  fetchWhispers,
  postWhisper
};
const ui = createUI(app);
document.getElementById('audioTrigger').setAttribute('aria-pressed', String(settings.audio));

// ---------------- Boot ----------------
boot().catch((err) => {
  console.error(err);
  ui.setLoading(1, 'Something went wrong while building the world. Try reloading, or browse projects from the menu.');
});

async function boot() {
  ui.setLoading(0.05, 'Fetching Jace\'s projects…');
  const [projects] = await Promise.all([
    fetch('/api/projects').then((r) => { if (!r.ok) throw new Error('Project API unavailable'); return r.json(); }),
    Promise.race([document.fonts.load("700 40px 'Amatic SC'").then(() => document.fonts.load("800 20px 'Nunito'")), wait(2500)])
  ]);
  setProjects(projects);
  ui.updateProgress();
  document.getElementById('optServer').textContent = 'Online';

  ui.setLoading(0.15, 'Shaping the hills…'); await frame();
  buildHeights();
  ui.setLoading(0.28, 'Painting roads and meadows…'); await frame();
  const groundCanvas = paintGround();
  const maskCanvas = paintGrassMask();
  const { mesh: terrain, map: groundTex } = buildTerrain(groundCanvas, quality);
  scene.add(terrain);
  const hTex = heightTexture();

  ui.setLoading(0.42, 'Planting grass…'); await frame();
  const maskTex = new THREE.CanvasTexture(maskCanvas);
  grass = createGrass({ heightTex: hTex, maskTex, colorTex: groundTex, quality });
  scene.add(grass.mesh);

  ui.setLoading(0.55, 'Growing trees…'); await frame();
  foliage = createFoliage(quality);
  scene.add(foliage.group);

  ui.setLoading(0.66, 'Filling the lake…'); await frame();
  water = createWater(hTex); scene.add(water.mesh);
  sky = createSky(scene, quality);

  ui.setLoading(0.74, 'Raising 17 project portals…'); await frame();
  portals = createPortals(PORTALS); scene.add(portals.group);
  props = createProps(quality); scene.add(props.group);
  letters = createLetters(); scene.add(letters.group);
  for (const l of letters.letters) l.g.position.y = sampleHeight(l.home.x, l.home.z);
  colliders = [...foliage.colliders, ...portals.colliders, ...props.colliders];
  particles = createParticles(); scene.add(particles.points);
  ui.setLoading(0.84, 'Rolling the 4Runner out of the showroom…'); await frame();
  vehicle = createVehicle(scene, { onProgress: (p) => ui.setLoading(0.84 + p * 0.14) });
  respawn(true);
  await Promise.race([new Promise((r) => { addEventListener('jace-4runner-ready', r, { once: true }); addEventListener('jace-4runner-fallback', r, { once: true }); }), wait(20000)]);
  whisperLanterns.init();

  // warm up shaders so the first frames don't hitch
  sky.apply(new THREE.Vector3());
  renderer.compile(scene, camera);
  requestAnimationFrame(loop);
  fetchWhispers();

  ui.ready(start);
}

function start() {
  started = true; paused = false;
  audio.init(); audio.honk();
  unlock('engine');
  canvas.setAttribute('tabindex', '0'); canvas.focus?.();
  // deep links: /project/:slug, /about, /projects
  const m = location.pathname.match(/^\/project\/([^/]+)/);
  const p = m && PORTALS.find((x) => x.slug === m[1]);
  if (p) { app.travelTo(p, { silent: true }); openPortal(p, { push: false }); }
  else if (location.pathname === '/about') ui.openMenu('home');
  else if (location.pathname === '/projects') ui.openMenu('projects');
}

addEventListener('popstate', () => {
  const m = location.pathname.match(/^\/project\/([^/]+)/);
  const p = m && PORTALS.find((x) => x.slug === m[1]);
  if (p) openPortal(p, { push: false });
  else if (location.pathname === '/about') ui.openMenu('home');
  else if (location.pathname === '/projects') ui.openMenu('projects');
  else ui.closeAll();
});

// ---------------- Input ----------------
const keys = new Set();
const touch = { active: false, x: 0, y: 0 };
const pressed = (...k) => k.some((x) => keys.has(x));
const isGameKey = (k) => ['w','a','s','d','q','z','arrowup','arrowdown','arrowleft','arrowright','shift','b','control',' ','enter','m','r','h','l','t'].includes(k);
const menuFocused = () => document.getElementById('introStart') === document.activeElement;
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) { if (e.key === 'Escape') e.target.blur(); return; }
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (ui.isOpen()) ui.closeAll(); else ui.openMenu(); return; }
  if (!started && !ui.isOpen() && !menuFocused()) return;
  if (started && !ui.isOpen() && isGameKey(k) && document.activeElement !== canvas) canvas.focus?.();
  if (ui.isOpen()) { if (k === 'm') ui.closeAll(); return; }
  if (isGameKey(k)) e.preventDefault();
  keys.add(k);
  if (e.repeat) return;
  if (k === 'enter') interact();
  else if (k === 'm') ui.openMap();
  else if (k === 'r') respawn();
  else if (k === 'h') { audio.honk(); unlock('honk'); }
  else if (k === 'l') { app.setAudio(!settings.audio); }
  else if (k === ' ') jump();
  else if (k === 't') { e.preventDefault(); ui.openMenu('whispers'); setTimeout(() => document.getElementById('whisperMessage').focus(), 80); }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());

// camera orbit / zoom
const cam = { yaw: Math.PI * 0.25, pitch: 0.7, dist: coarse ? 26 : 24, target: new THREE.Vector3(), pos: new THREE.Vector3(), shake: 0 };
let drag = null; const pointers = new Map(); let pinch = 0;
canvas.addEventListener('pointerdown', (e) => { pointers.set(e.pointerId, e); if (e.pointerType === 'mouse') drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (pointers.size === 2) {
    pointers.set(e.pointerId, e); const [a, b] = [...pointers.values()]; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    if (pinch) cam.dist = THREE.MathUtils.clamp(cam.dist * (pinch / d), 12, 50); pinch = d; return;
  }
  if (!drag) return;
  cam.yaw -= (e.clientX - drag.x) * 0.005; cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - drag.y) * 0.004, 0.3, 1.25);
  drag = { x: e.clientX, y: e.clientY };
});
const endPtr = (e) => { pointers.delete(e.pointerId); drag = null; if (pointers.size < 2) pinch = 0; };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = THREE.MathUtils.clamp(cam.dist * (1 + e.deltaY * 0.001), 12, 50); }, { passive: false });

// touch joystick: points the way you want to go (screen-relative)
(() => {
  const joy = document.getElementById('joystick'), knob = document.getElementById('joystickKnob');
  const move = (e) => {
    if (!touch.active) return;
    const r = joy.getBoundingClientRect(); const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy) || 1, m = Math.min(46, len);
    knob.style.transform = `translate(${(dx / len) * m}px, ${(dy / len) * m}px)`;
    touch.x = (dx / len) * (m / 46); touch.y = (dy / len) * (m / 46);
  };
  joy.addEventListener('pointerdown', (e) => { touch.active = true; joy.setPointerCapture(e.pointerId); move(e); audio.init(); });
  joy.addEventListener('pointermove', move);
  const end = () => { touch.active = false; touch.x = touch.y = 0; knob.style.transform = ''; };
  joy.addEventListener('pointerup', end); joy.addEventListener('pointercancel', end);
  document.querySelectorAll('[data-touch]').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const a = b.dataset.touch;
      if (a === 'boost') keys.add('shift');
      if (a === 'jump') jump();
      if (a === 'interact') interact();
    });
    const up = () => { if (b.dataset.touch === 'boost') keys.delete('shift'); };
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
  });
})();

function readInput() {
  let throttle = (pressed('w', 'arrowup', 'z') ? 1 : 0) - (pressed('s', 'arrowdown') ? 1 : 0);
  let steer = (pressed('d', 'arrowright') ? 1 : 0) - (pressed('a', 'arrowleft', 'q') ? 1 : 0);
  let boost = pressed('shift'), brake = pressed('b', 'control');
  if (touch.active && (touch.x || touch.y)) {
    // convert screen direction to a world heading, then steer toward it
    const mag = Math.min(1, Math.hypot(touch.x, touch.y));
    const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw));
    const right = new THREE.Vector3(Math.cos(cam.yaw), 0, -Math.sin(cam.yaw));
    const want = fwd.multiplyScalar(-touch.y).add(right.multiplyScalar(touch.x));
    const desired = Math.atan2(want.x, want.z);
    let diff = desired - vehicle.state.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) > 2.4 && Math.abs(vehicle.state.speed) < 4) { throttle = -mag; steer = Math.sign(diff); }
    else { throttle = mag > 0.25 ? mag : 0; steer = THREE.MathUtils.clamp(-diff * 1.8, -1, 1); }
  }
  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    const ax = Math.abs(pad.axes[0]) > 0.15 ? pad.axes[0] : 0;
    const rt = pad.buttons[7]?.value || 0, lt = pad.buttons[6]?.value || 0;
    if (ax) steer = ax;
    if (rt || lt) throttle = rt - lt;
    if (pad.buttons[1]?.pressed) boost = true;
    if (pad.buttons[2]?.pressed) brake = true;
    const a = pad.buttons[0]?.pressed, y = pad.buttons[3]?.pressed;
    if (a && !padPrev.a) (ui.isOpen() ? ui.closeAll() : interact());
    if (y && !padPrev.y) jump();
    padPrev.a = a; padPrev.y = y;
    if (Math.abs(pad.axes[2] || 0) > 0.2) cam.yaw -= pad.axes[2] * 0.03;
  }
  if ((modalOpen && !menuFocused()) || (paused && !menuFocused())) return { throttle: 0, steer: 0, boost: false, brake: true };
  return { throttle, steer, boost, brake };
}
const padPrev = { a: false, y: false };

function jump() {
  if (!vehicle || !vehicle.state.grounded || modalOpen) return;
  vehicle.state.vy = 8.5; vehicle.state.grounded = false; vehicle.state.suspV += 3;
  audio.jump(); unlock('jump');
}

// ---------------- Interaction ----------------
let nearest = null;
function findNearest() {
  const s = vehicle.state; let best = null, bd = Infinity;
  for (const p of PORTALS) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < 8.5 && d < bd) { bd = d; best = { type: 'portal', data: p, label: `Open ${p.name}` }; } }
  for (const it of props.interactives) { const d = Math.hypot(s.x - it.x, s.z - it.z); if (d < it.r && d < bd) { bd = d; best = { type: it.type, data: it.data, id: it.id, label: it.type === 'whispers' ? 'Tune the visitor radio' : it.type === 'career' ? `Read: ${it.label}` : it.label } }; }
  return best;
}
function interact() {
  if (!nearest || modalOpen) return;
  audio.click();
  if (nearest.type === 'portal') openPortal(nearest.data);
  else if (nearest.type === 'career') {
    ui.openInfo('career', nearest.data);
    store.career.add(nearest.data.id); persist();
    if (store.career.size >= CAREER.length) unlock('career');
  } else if (nearest.type === 'contact') { ui.openInfo('contact', nearest.data); unlock('contact'); }
  else if (nearest.type === 'whispers') ui.openMenu('whispers');
}
function openPortal(p, opts) {
  const first = !store.discovered.has(p.slug);
  store.discovered.add(p.slug); persist(); ui.updateProgress();
  ui.openProject(p, opts);
  if (first) {
    audio.chime();
    ui.toast('Portal discovered', `${p.name} · ${store.discovered.size}/${PORTALS.length}`, '◎');
    unlock('portal-first');
    if (store.discovered.size >= 5) unlock('portal-five');
    if (store.discovered.size >= PORTALS.length) unlock('portal-all');
  }
}
function unlock(id) {
  if (store.achievements.has(id)) return;
  const a = ACHIEVEMENTS.find((x) => x.id === id); if (!a) return;
  store.achievements.add(id); persist();
  ui.toast(a.title, a.text, '★'); audio.chime();
}

function respawn(silent) {
  const a = (225 * Math.PI) / 180;
  vehicle.place(Math.cos(a) * -2, Math.sin(a) * -2, Math.atan2(Math.cos(a), Math.sin(a)), surfaceHeight);
  snapCamera();
  if (silent !== true) audio.honk();
}
function resetObjects() {
  for (const l of letters.letters) { Object.assign(l, { vx: 0, vz: 0, spin: 0, tip: 0, tipV: 0, fallen: false }); l.g.position.set(l.home.x, sampleHeight(l.home.x, l.home.z), l.home.z); l.g.rotation.set(0, l.home.yaw, 0); }
}

// ---------------- Whispers (server-backed, placed in the world) ----------------
let whispers = [];
async function fetchWhispers() {
  try { const r = await fetch('/api/whispers'); whispers = await r.json(); whisperLanterns.sync(whispers); } catch { /* offline */ }
  return whispers;
}
async function postWhisper(name, message) {
  const s = vehicle.state;
  const r = await fetch('/api/whispers', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, message, x: +s.x.toFixed(1), z: +s.z.toFixed(1) }) });
  const data = await r.json(); if (!r.ok) throw new Error(data.error || 'Transmission failed');
  whispers.push(data); whisperLanterns.sync(whispers); unlock('radio');
  return data;
}
const whisperLanterns = (() => {
  let mesh = null; const bubbles = document.getElementById('bubbles'); const pool = new Map();
  const geo = new THREE.OctahedronGeometry(0.32, 0);
  const matl = new THREE.MeshBasicMaterial({ color: '#ffb3c4', toneMapped: false });
  return {
    init() { mesh = new THREE.InstancedMesh(geo, matl, 80); mesh.count = 0; mesh.frustumCulled = false; scene.add(mesh); },
    sync(rows) {
      if (!mesh) return;
      const placed = rows.filter((w) => Number.isFinite(w.x) && Number.isFinite(w.z)).slice(-80);
      mesh.count = placed.length; mesh.userData.rows = placed;
    },
    update(t) {
      if (!mesh) return;
      const rows = mesh.userData.rows || []; const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const e = new THREE.Euler();
      const car = vehicle.state; const seen = new Set();
      rows.forEach((w, i) => {
        const y = sampleHeight(w.x, w.z) + 2.3 + Math.sin(t * 2 + i) * 0.2;
        m.compose(new THREE.Vector3(w.x, y, w.z), q.setFromEuler(e.set(0, t + i, 0)), new THREE.Vector3(1, 1.4, 1));
        mesh.setMatrixAt(i, m);
        const d = Math.hypot(car.x - w.x, car.z - w.z);
        if (d < 16) {
          seen.add(w.id);
          let el = pool.get(w.id);
          if (!el) { el = document.createElement('div'); el.className = 'bubble'; el.innerHTML = `<b></b><span></span>`; el.querySelector('b').textContent = w.name || 'Visitor'; el.querySelector('span').textContent = w.message; bubbles.appendChild(el); pool.set(w.id, el); }
          const v = new THREE.Vector3(w.x, y + 0.6, w.z).project(camera);
          el.style.left = `${(v.x * 0.5 + 0.5) * innerWidth}px`; el.style.top = `${(-v.y * 0.5 + 0.5) * innerHeight}px`;
          el.style.opacity = String(Math.min(1, (16 - d) / 5) * (v.z < 1 ? 1 : 0));
        }
      });
      mesh.instanceMatrix.needsUpdate = true;
      for (const [id, el] of pool) if (!seen.has(id)) { el.remove(); pool.delete(id); }
    }
  };
})();

// ---------------- Circuit ----------------
const lap = { active: false, next: 1, dir: 0, start: 0, count: 0 };
function updateCircuit(now) {
  const s = vehicle.state;
  const hit = (i) => Math.hypot(s.x - CHECKPOINTS[i].x, s.z - CHECKPOINTS[i].z) < WORLD.roadHalf + 2.5;
  if (!lap.active) {
    if (hit(0) && Math.abs(s.speed) > 4) { Object.assign(lap, { active: true, dir: 0, start: now, count: 0 }); audio.checkpoint(); ui.toast('Circuit started', 'Hit all 8 checkpoints, either direction', '⏱'); }
  } else {
    if (lap.dir === 0) { if (hit(1)) { lap.dir = 1; lap.next = 2; lap.count = 1; audio.checkpoint(); } else if (hit(7)) { lap.dir = -1; lap.next = 6; lap.count = 1; audio.checkpoint(); } }
    else if (lap.count < 7 && hit(lap.next)) { lap.count++; lap.next = (lap.next + lap.dir + 8) % 8; audio.checkpoint(); }
    else if (lap.count >= 7 && hit(0)) {
      const ms = now - lap.start; lap.active = false;
      const best = !store.bestLap || ms < store.bestLap;
      if (best) { store.bestLap = ms; persist(); }
      ui.toast(best ? 'New best lap!' : 'Lap complete', fmt(ms), '🏁'); unlock('circuit'); audio.chime();
      submitLap(ms);
    }
    if (now - lap.start > 10 * 60 * 1000) lap.active = false;
  }
  const label = !lap.active ? '' : lap.dir === 0 ? 'Checkpoint 1 or 7 next' : lap.count >= 7 ? 'Back to START · FINISH' : `Checkpoint ${lap.next} next · ${lap.count}/8`;
  ui.setCircuit(lap.active, now - lap.start, label);
  return lap.active ? (lap.dir === 0 ? -1 : lap.count >= 7 ? 0 : lap.next) : 0;
}
async function submitLap(ms) {
  const name = localStorage.getItem('jace-drive-name') || prompt('Nice lap! Name for the leaderboard?', '') || 'Anonymous driver';
  localStorage.setItem('jace-drive-name', name);
  try { await fetch('/api/circuit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, ms: Math.round(ms) }) }); } catch { /* offline */ }
}

// ---------------- Letters physics ----------------
function updateLetters(dt) {
  const s = vehicle.state; const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  let fallen = 0;
  for (const l of letters.letters) {
    const p = l.g.position;
    const d = Math.hypot(s.x + fx * 1.2 - p.x, s.z + fz * 1.2 - p.z);
    if (d < 2.4 && Math.abs(s.speed) > 2 && !l.fallen) {
      const nx = (p.x - s.x) / (d || 1), nz = (p.z - s.z) / (d || 1);
      const imp = Math.abs(s.speed);
      l.vx += nx * imp * 0.55 + fx * s.speed * 0.4; l.vz += nz * imp * 0.55 + fz * s.speed * 0.4;
      l.spin += (Math.random() - 0.5) * imp * 0.3; l.tipV = Math.max(l.tipV, imp * 0.35);
      const facing = Math.sin(l.g.rotation.y) * nx + Math.cos(l.g.rotation.y) * nz;
      l.tipDir = facing >= 0 ? 1 : -1;
      s.speed *= 0.82; audio.impact(imp * 0.5); cam.shake = Math.max(cam.shake, 0.3);
    }
    if (l.vx || l.vz || l.tipV || l.tip) {
      p.x += l.vx * dt; p.z += l.vz * dt;
      const f = Math.exp(-2.4 * dt); l.vx *= f; l.vz *= f; l.spin *= f;
      if (Math.hypot(l.vx, l.vz) < 0.05) l.vx = l.vz = 0;
      l.g.rotation.y += l.spin * dt;
      if (l.tipV) {
        l.tip += l.tipV * dt; l.tipV += 6 * dt;
        if (l.tip >= Math.PI / 2) { l.tip = Math.PI / 2; l.tipV = 0; l.fallen = true; audio.land(4); }
      }
      l.g.rotation.x = l.tip * (l.tipDir || 1);
      l.g.position.y = sampleHeight(p.x, p.z);
    }
    if (l.fallen) fallen++;
  }
  if (fallen >= 2) unlock('letters');
}

// ---------------- Particles (dust, splashes, boost) ----------------
function createParticles() {
  const N = 260;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), alpha = new Float32Array(N);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true,
    uniforms: { uScale: { value: innerHeight * 0.5 } },
    vertexShader: 'attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC = color; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; gl_FragColor = vec4(vC, vA * smoothstep(0.5, 0.15, d)); }'
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false;
  const live = Array.from({ length: N }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, s: 1, c: new THREE.Color() }));
  let cursor = 0;
  return {
    points: pts,
    emit(x, y, z, vx, vy, vz, color, s = 1, life = 1) {
      const p = live[cursor]; cursor = (cursor + 1) % N;
      Object.assign(p, { life, max: life, x, y, z, vx, vy, vz, s }); p.c.set(color);
    },
    update(dt) {
      for (let i = 0; i < N; i++) {
        const p = live[i];
        if (p.life > 0) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy -= 1.5 * dt; p.vx *= 0.96; p.vz *= 0.96; }
        const k = Math.max(0, p.life / p.max);
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        col[i * 3] = p.c.r; col[i * 3 + 1] = p.c.g; col[i * 3 + 2] = p.c.b;
        size[i] = p.s * (1.6 - k); alpha[i] = k * 0.55;
      }
      geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = geo.attributes.aSize.needsUpdate = geo.attributes.aAlpha.needsUpdate = true;
    }
  };
}

// ---------------- Camera ----------------
const tmpV = new THREE.Vector3();
function snapCamera() { cameraUpdate(1, true); }
function cameraUpdate(dt, snap = false) {
  const s = vehicle.state;
  const look = Math.min(6, Math.abs(s.speed) * 0.22) * Math.sign(s.speed);
  tmpV.set(s.x + Math.sin(s.yaw) * look, s.y + 1.2, s.z + Math.cos(s.yaw) * look);
  const k = snap ? 1 : 1 - Math.exp(-5 * dt);
  cam.target.lerp(tmpV, k);
  const dist = cam.dist + Math.min(8, Math.abs(s.speed) * 0.12);
  const off = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch)).multiplyScalar(dist);
  cam.pos.copy(cam.target).add(off);
  const minY = sampleHeight(cam.pos.x, cam.pos.z) + 2;
  if (cam.pos.y < minY) cam.pos.y = minY;
  camera.position.copy(cam.pos);
  if (cam.shake > 0 && settings.shake) { camera.position.x += (Math.random() - 0.5) * cam.shake; camera.position.y += (Math.random() - 0.5) * cam.shake; cam.shake *= Math.exp(-6 * dt); if (cam.shake < 0.01) cam.shake = 0; }
  camera.lookAt(cam.target);
}

// ---------------- Main loop ----------------
let last = performance.now(), time = 0, airTime = 0, lastSpeedoUpdate = 0, nightSeen = 0;
const speedEl = document.getElementById('speedValue'), speedo = speedEl.parentElement;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; time += dt;
  if (document.hidden) return;

  if (settings.time === 'auto') timeState.t = (timeState.t + dt / 600) % 1;   // 10-minute day
  sky.setTime(timeState.t);

  const input = readInput();
  const s = vehicle.state;
  const prev = { x: s.x, z: s.z };
  vehicle.update(dt, input, surfaceHeight, colliders, {
    onImpact: (v) => { audio.impact(v); cam.shake = Math.max(cam.shake, Math.min(0.9, v * 0.05)); },
    onLand: (v) => { audio.land(v); cam.shake = Math.max(cam.shake, Math.min(0.6, v * 0.04)); for (let i = 0; i < 10; i++) particles.emit(s.x + (Math.random() - 0.5) * 3, s.y + 0.2, s.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 4, 1 + Math.random(), (Math.random() - 0.5) * 4, '#cdb79a', 1.3, 0.9); }
  });
  store.distance += Math.hypot(s.x - prev.x, s.z - prev.z);
  if (store.distance > 3000) unlock('road-trip');
  if (!s.grounded) { airTime += dt; if (airTime > 1) unlock('big-air'); } else airTime = 0;
  const mph = Math.abs(s.speed) * 2.237;
  if (mph >= 60) unlock('boost');
  if (s.inWater > 0.3) {
    unlock('lake');
    if (Math.abs(s.speed) > 2 && Math.random() < 0.6) particles.emit(s.x + (Math.random() - 0.5) * 2, WORLD.waterLevel + 0.1, s.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 3, 2 + Math.random() * 2, (Math.random() - 0.5) * 3, '#e8fbff', 1.1, 0.8);
    if (s.inWater > 1.3) { ui.toast('Too deep!', 'Towed back to the dock', '⚓'); audio.splash(); vehicle.place(DOCK.x - Math.cos(DOCK.angle) * 6, DOCK.z - Math.sin(DOCK.angle) * 6, Math.atan2(-Math.cos(DOCK.angle), -Math.sin(DOCK.angle)), surfaceHeight); snapCamera(); }
  }
  // dust from rear wheels off-road or when boosting
  if (s.grounded && Math.abs(s.speed) > 5) {
    const surf = surfaceAt(s.x, s.z);
    const offroad = surf.road < 0.5 && surf.plaza < 0.5;
    if ((offroad || s.boost || Math.abs(s.steer) > 0.8) && Math.random() < (s.boost ? 0.9 : 0.45)) {
      const bx = s.x - Math.sin(s.yaw) * 1.6, bz = s.z - Math.cos(s.yaw) * 1.6;
      const lx = Math.cos(s.yaw) * 0.85 * (Math.random() > 0.5 ? 1 : -1), lz = -Math.sin(s.yaw) * 0.85;
      particles.emit(bx + lx, s.y + 0.25, bz + lz * Math.sign(lx), -Math.sin(s.yaw) * 2 + (Math.random() - 0.5), 0.8 + Math.random(), -Math.cos(s.yaw) * 2 + (Math.random() - 0.5), surf.dirt > 0.4 ? '#c49a6c' : offroad ? '#a8b07a' : '#d8d0c4', s.boost ? 1.5 : 1.1, 0.9);
    }
  }
  speedo.classList.toggle('is-boost', s.boost);
  if (now - lastSpeedoUpdate > 80) { speedEl.textContent = String(Math.round(mph)); lastSpeedoUpdate = now; }

  if (!modalOpen) {
    nearest = findNearest();
    ui.setPrompt(nearest?.label || '');
  }
  updateLetters(dt);
  const activeCp = updateCircuit(now);

  cameraUpdate(dt);
  sky.apply(cam.target);
  const night = sky.state.night;
  if (night > 0.7 && Math.abs(s.speed) > 5) { nightSeen += dt; if (nightSeen > 3) unlock('night'); }
  setNight(night);
  vehicle.setNight(night);
  renderer.toneMappingExposure = 1.05 + night * 0.25;
  if (bloom) bloom.strength = 0.22 + night * 0.55;

  grass.update(time, cam.target, new THREE.Vector3(s.x, s.y, s.z));
  grass.setLight(sky.state.sunColor, sky.state.ambient, sky.state.sunDir);
  foliage.update(time);
  water.update(time);
  water.setLight(sky.state.sunDir, sky.state.sunColor, sky.state.skyColor, sky.state.light);
  portals.update(time, nearest?.type === 'portal' ? nearest.data.slug : null, store.discovered);
  props.update(time, night, lap.active ? activeCp : 0, lap.active);
  particles.update(dt);
  whisperLanterns.update(time);
  audio.update(s.speed, input.throttle, s.boost, night, dt);

  if (Math.floor(time) !== Math.floor(time - dt)) persist();
  render();
}
function render() {
  if (composer) composer.render(); else renderer.render(scene, camera);
}

// ---------------- helpers ----------------
function frame() { return new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))); }
function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }
function safeJSON(s, fallback) { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } }

// debugging / automated checks
window.__jace = { get state() { return vehicle?.state; }, scene, camera, renderer, app, get ready() { return started; }, setTime: (t) => { settings.time = 'manual'; timeState.t = t; }, keys, cam };
