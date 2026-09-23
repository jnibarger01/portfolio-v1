import * as THREE from 'three';
import { box, cyl, cone, mat, glow, labelSprite, signTexture, canvasTexture, FONT_DISPLAY } from './kit.js';
import { sampleHeight } from './ground.js';

const WALL = '#efe6d8', WALL2 = '#e2d6c4', PLUM = '#3b2f4a', DARK = '#2a2430', STONE = '#cfc3b0';
const win = () => glow('#ffc978', 0.08, 1.9);

// Each builder models in local space: front faces +z, footprint ~ within ±8m.
// Returns an array of local boxes used as colliders: [cx, cz, halfW, halfD]
const BUILDERS = {
  house(g, a) { // Jace HQ: modern house with a porch light and roof deck
    box(g, 12, 0.5, 10, mat(STONE));
    box(g, 11, 4, 8, mat(WALL), 0, 0.5, -0.5);
    box(g, 7, 3.2, 6.5, mat(WALL2), -2, 4.5, -1.2);
    box(g, 11.6, 0.35, 8.6, mat(PLUM), 0, 4.5, -0.5);
    box(g, 7.5, 0.3, 7, mat(a), -2, 7.7, -1.2);
    for (const x of [-3.5, 0, 3.5]) box(g, 2.2, 2.4, 0.1, win(), x, 1.3, 3.55);
    box(g, 4.5, 2, 0.1, win(), -2, 5.2, 2.1);
    box(g, 1.5, 3, 0.2, mat(a), 4.6, 0.5, 3.6);
    cyl(g, 0.08, 0.08, 1.4, mat(DARK), 5.6, 4.8, 2.6, 6); box(g, 1.6, 1, 0.08, mat(a), 5.6, 5.9, 2.6);
    return [[0, -0.5, 5.8, 4.6]];
  },
  tower(g, a) { // ACS: control tower with rotating beacon
    box(g, 9, 3.5, 9, mat(WALL));
    for (const s of [-1, 1]) box(g, 3.2, 1.8, 0.1, win(), s * 2.2, 1, 4.55);
    cyl(g, 2.2, 2.8, 12, mat(WALL2), 0, 3.5, 0, 12);
    cyl(g, 3.4, 3, 2.6, win(), 0, 15.5, 0, 12);
    cyl(g, 3.8, 3.8, 0.4, mat(PLUM), 0, 18.1, 0, 12);
    cyl(g, 0.12, 0.12, 4, mat(DARK), 0, 18.5, 0, 6);
    const beacon = cyl(g, 0.5, 0.5, 0.6, glow(a, 1.2, 3), 0, 22.4, 0, 10);
    beacon.userData.spin = true;
    box(g, 9.4, 0.4, 9.4, mat(a), 0, 3.5, 0);
    return [[0, 0, 4.6, 4.6]];
  },
  vault(g, a) { // AgentHarness: isolated bunker with cage + kill switch
    box(g, 12, 3.2, 9, mat('#b9b1a6'));
    box(g, 12.6, 0.6, 9.6, mat(PLUM), 0, 3.2, 0);
    cyl(g, 1.8, 1.8, 0.5, mat('#8e8579'), 0, 1.2, 4.55, 24).rotation.x = Math.PI / 2;
    for (let i = -2; i <= 2; i++) box(g, 0.12, 4.5, 0.12, mat(DARK), i * 2.6, 3.8, 0);
    box(g, 11, 0.12, 0.12, mat(DARK), 0, 8.3, 0);
    box(g, 4, 3, 4, glow(a, 0.6, 2.2), 0, 3.8, 0);
    box(g, 0.8, 1.2, 0.8, mat('#e03b3b'), 5, 0, 5.2);
    return [[0, 0, 6.2, 4.8]];
  },
  library(g, a) { // Prompt Foundry: library with book-spine facade
    box(g, 13, 0.6, 9, mat(STONE));
    box(g, 12, 6, 7.5, mat(WALL), 0, 0.6, -0.5);
    const cols = ['#ff9ecb', '#7de8ff', '#ffcf6e', '#c9ff5a', '#9b8cff', '#ff7d6d'];
    for (let i = 0; i < 14; i++) box(g, 0.7, 2.6 + (i % 3) * 0.5, 0.35, mat(cols[i % cols.length]), -5.2 + i * 0.8, 3.2, 3.35);
    box(g, 13, 0.8, 8.5, mat(PLUM), 0, 6.6, -0.5);
    cone(g, 7.5, 3.2, mat(a), 0, 7.4, -0.5, 4);
    box(g, 2.4, 2.4, 0.1, win(), 0, 0.6, 3.3);
    return [[0, -0.5, 6.5, 4.4]];
  },
  bank(g, a) { // DealPilot: evidence hall with columns and pediment
    box(g, 14, 1, 10, mat(STONE));
    box(g, 11, 6, 6.5, mat(WALL), 0, 1, -1.2);
    for (let i = 0; i < 6; i++) cyl(g, 0.45, 0.5, 5.4, mat('#f6efe3'), -5 + i * 2, 1, 3, 12);
    box(g, 13, 0.8, 9, mat(WALL2), 0, 6.4, 0);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 5.2, 2.6, 4, 1), mat(a)); roof.scale.set(1.8, 1, 1.2); roof.rotation.y = Math.PI / 4; roof.position.set(0, 8.5, 0); roof.castShadow = true; g.add(roof);
    box(g, 2.6, 3.8, 0.1, win(), 0, 1, 2.1);
    return [[0, 0, 7, 5]];
  },
  radio(g, a) { // Relay: lattice radio mast + studio hut
    box(g, 7, 3.4, 6, mat(WALL), -3, 0, 0);
    box(g, 7.4, 0.4, 6.4, mat(a), -3, 3.4, 0);
    box(g, 2.6, 1.6, 0.1, win(), -3, 1.2, 3.05);
    const legs = 4;
    for (let i = 0; i < legs; i++) {
      const ang = (i / legs) * Math.PI * 2 + Math.PI / 4;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 20, 5), mat(PLUM));
      leg.position.set(4 + Math.cos(ang) * 0.9, 10, Math.sin(ang) * 0.9); leg.rotation.z = Math.cos(ang) * -0.05; leg.rotation.x = Math.sin(ang) * 0.05; leg.castShadow = true; g.add(leg);
    }
    for (let y = 2; y < 20; y += 2.5) box(g, 2.2 - y * 0.06, 0.1, 2.2 - y * 0.06, mat(PLUM), 4, y, 0);
    const tip = cyl(g, 0.45, 0.45, 0.45, glow(a, 1.5, 3.5), 4, 20, 0, 10); tip.userData.blink = true;
    return [[-3, 0, 3.8, 3.2], [4, 0, 1.4, 1.4]];
  },
  ticker(g, a) { // Terminal Canvas: tower wrapped in market tickers
    box(g, 9, 13, 8, mat('#2f2a38'));
    for (let y = 1.2; y < 12; y += 1.6) {
      const t = tickerTexture(a, y);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 1), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
      face.position.set(0, y, 4.02); g.add(face); face.userData.ticker = t;
    }
    box(g, 9.6, 0.5, 8.6, mat(a), 0, 13, 0);
    box(g, 4, 1.5, 0.3, glow(a, 1.2, 2.5), 0, 13.6, 0);
    return [[0, 0, 4.6, 4.1]];
  },
  neighborhood(g, a) { // Property Intel: three homes around a map table
    const houses = [[-5, -2, '#f1d9b6'], [0, -4, '#d9e6c4'], [5, -2, '#f3c9bd']];
    for (const [x, z, c] of houses) {
      box(g, 4, 3, 4, mat(c), x, 0, z);
      const roof = cone(g, 3.3, 2.2, mat(PLUM), x, 3, z, 4); roof.scale.set(1, 1, 1);
      box(g, 1.1, 1.2, 0.1, win(), x, 0.9, z + 2.02);
    }
    box(g, 6, 0.9, 3.4, mat(STONE), 0, 0, 3);
    const map = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 3), new THREE.MeshStandardMaterial({ map: parcelTexture(a), roughness: 0.7 }));
    map.rotation.x = -Math.PI / 2; map.position.set(0, 0.92, 3); g.add(map);
    return [[-5, -2, 2.1, 2.1], [0, -4, 2.1, 2.1], [5, -2, 2.1, 2.1], [0, 3, 3, 1.7]];
  },
  market(g, a) { // Deal Hunter: warehouse with striped awnings + crates
    box(g, 13, 5, 8, mat(WALL2), 0, 0, -1);
    box(g, 13.4, 0.4, 8.4, mat(PLUM), 0, 5, -1);
    for (let i = 0; i < 4; i++) {
      const aw = box(g, 2.9, 0.18, 2, mat(i % 2 ? a : '#fff8ef'), -4.5 + i * 3, 3.2, 3.8);
      aw.rotation.x = 0.35;
      box(g, 2.4, 2.2, 0.1, win(), -4.5 + i * 3, 0.6, 3.05);
    }
    for (const [x, z] of [[5.5, 5], [6.4, 5.8], [5.9, 5.4]]) box(g, 1, 1, 1, mat('#b98a55'), x, 0, z, x);
    box(g, 3, 1.2, 0.2, mat(a), 0, 5.4, 3.1);
    return [[0, -1, 6.7, 4.1], [6, 5.4, 1.2, 1.2]];
  },
  showroom(g, a) { // Toyota Showroom: glass box with a 4Runner on a turntable
    box(g, 15, 0.5, 11, mat(STONE));
    const glass = new THREE.MeshStandardMaterial({ color: '#bfe3ef', transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.3 });
    box(g, 13, 5, 9, glass, 0, 0.5, 0).castShadow = false;
    box(g, 13.6, 0.6, 9.6, mat('#e8e1d6'), 0, 5.5, 0);
    for (const x of [-6.4, 6.4]) for (const z of [-4.4, 4.4]) box(g, 0.3, 5, 0.3, mat(PLUM), x, 0.5, z);
    const turn = cyl(g, 3.4, 3.4, 0.3, glow(a, 0.25, 0.9), 0, 0.5, 0, 32); turn.userData.spin = 0.3;
    const car = new THREE.Group(); car.position.set(0, 0.8, 0); turn.add(car); car.position.set(0, 0.15, 0);
    box(car, 2, 1.2, 4.4, mat('#d7dcdc', { metalness: 0.4, roughness: 0.35 }), 0, 0.5, 0);
    box(car, 1.8, 0.9, 2.5, mat('#1d1721', { roughness: 0.2 }), 0, 1.7, -0.3);
    for (const x of [-1, 1]) for (const z of [-1.4, 1.4]) cyl(car, 0.45, 0.45, 0.35, mat('#1a1a1a'), x, 0.1, z, 12).rotation.z = Math.PI / 2;
    box(g, 6, 1, 0.2, signMat('TOYOTA SHOWROOM', a), 0, 5.7, 4.9);
    return [[0, 0, 7.4, 5.4]];
  },
  pavilion(g, a) { // Lexus: dark sleek pavilion with spindle arch
    box(g, 14, 0.4, 10, mat('#8f8a86'));
    box(g, 12, 4.5, 7, mat('#2b2a2f', { roughness: 0.3, metalness: 0.5 }), 0, 0.4, -0.5);
    box(g, 12.8, 0.35, 8.4, mat('#d9d6d0', { metalness: 0.6, roughness: 0.3 }), 0, 4.9, 0);
    const spindle = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.28, 8, 6), mat('#c7ccd6', { metalness: 0.9, roughness: 0.2 }));
    spindle.scale.set(0.8, 1.2, 1); spindle.position.set(0, 2.8, 3.1); spindle.castShadow = true; g.add(spindle);
    box(g, 10, 0.12, 0.1, glow('#ffffff', 0.4, 2), 0, 4.2, 3.02);
    for (const x of [-4.2, 4.2]) box(g, 2.6, 3.2, 0.1, win(), x, 0.8, 3.02);
    return [[0, -0.5, 6.4, 4]];
  },
  dealership(g, a) { // Jayota: dealership + tall pylon sign
    box(g, 14, 0.4, 9, mat(STONE));
    box(g, 12, 5, 7, mat('#f4f1ec'), 0, 0.4, -0.8);
    box(g, 12.4, 1.2, 7.4, mat(a), 0, 5.4, -0.8);
    box(g, 9, 3.4, 0.1, win(), 0, 0.8, 2.72);
    cyl(g, 0.3, 0.3, 9, mat('#bfbfbf'), 6.4, 0, 3.8, 8);
    box(g, 3.8, 2.2, 0.5, signMat('JAYOTA', a, '#fff'), 6.4, 9, 3.8);
    return [[0, -0.8, 6.3, 3.9], [6.4, 3.8, 0.6, 0.6]];
  },
  garage(g, a) { // ShiftForge: workshop with lift + paint booth glow
    box(g, 14, 5.5, 9, mat(WALL), 0, 0, -1);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.8, 14.4, 16, 1, false, 0, Math.PI), mat(a));
    roof.rotation.z = Math.PI / 2; roof.rotation.y = 0; roof.scale.set(1, 1, 0.45); roof.position.set(0, 5.5, -1); roof.castShadow = true; g.add(roof);
    box(g, 5, 4, 0.12, mat(PLUM), -3.5, 0, 3.52);
    box(g, 5, 4, 0.12, glow(a, 0.5, 1.8), 3.5, 0, 3.52);
    for (let i = 0; i < 6; i++) box(g, 4.8, 0.08, 0.14, mat('#1d1721'), -3.5, 0.5 + i * 0.6, 3.6);
    box(g, 2.2, 0.35, 4.6, mat('#e03b3b'), -3.5, 0, 6); box(g, 0.2, 2.2, 0.2, mat(DARK), -4.6, 0, 6);
    return [[0, -1, 7, 4.6]];
  },
  lab(g, a) { // Diagnostic Decision Lab: lab + scope-trace screen + dish
    box(g, 13, 4.2, 8, mat(WALL), 0, 0, -1);
    box(g, 13.4, 0.4, 8.4, mat(PLUM), 0, 4.2, -1);
    box(g, 5, 6.5, 5, mat(WALL2), -3.5, 4.6, -2);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(6, 2.4), new THREE.MeshBasicMaterial({ map: scopeTexture(a), toneMapped: false }));
    screen.position.set(2.5, 2, 3.02); g.add(screen); screen.userData.scope = screen.material.map;
    const dish = new THREE.Mesh(new THREE.SphereGeometry(2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.6), mat('#f4f1ec', { side: THREE.DoubleSide }));
    dish.rotation.x = -0.9; dish.position.set(-3.5, 12.4, -2); dish.castShadow = true; g.add(dish); dish.userData.sweep = true;
    cyl(g, 0.2, 0.3, 1.5, mat(DARK), -3.5, 11.1, -2, 8);
    return [[0, -1, 6.6, 4.1]];
  },
  control(g, a) { // Toyota Dashboard: control room with wall of screens
    box(g, 13, 6, 8, mat(WALL2), 0, 0, -1);
    box(g, 13.4, 0.5, 8.4, mat(a), 0, 6, -1);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const t = dashTexture(a, i + j * 3);
      const s = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
      s.position.set(-4 + i * 4, 1.6 + j * 2.4, 3.02); g.add(s);
    }
    box(g, 2, 3, 2, mat('#bfbfbf'), 4.5, 6.5, -3); cyl(g, 0.1, 0.1, 3, mat(DARK), 4.5, 9.5, -3, 5);
    return [[0, -1, 6.7, 4.2]];
  },
  servicebay(g, a) { // Toyota Maintenance: three-bay service drive
    box(g, 15, 5, 8, mat(WALL), 0, 0, -1.5);
    box(g, 15.4, 0.8, 8.4, mat(a), 0, 5, -1.5);
    for (let i = -1; i <= 1; i++) {
      box(g, 3.8, 3.8, 0.12, glow('#fff1d6', 0.15, 1.2), i * 4.6, 0, 2.52);
      for (let k = 0; k < 6; k++) box(g, 3.6, 0.06, 0.1, mat('#b8ad9c'), i * 4.6, 0.3 + k * 0.6, 2.6);
    }
    box(g, 7, 1, 0.25, signMat('SERVICE', '#fff', a), 0, 5.9, 2.72);
    return [[0, -1.5, 7.7, 4.2]];
  },
  tirestack(g, a) { // Matchmaker: oil-can kiosk + tire towers
    box(g, 8, 3.6, 6, mat(WALL), -2, 0, -1);
    box(g, 8.6, 0.4, 6.6, mat(a), -2, 3.6, -1);
    box(g, 3, 1.6, 0.1, win(), -2, 1.2, 2.02);
    const tireGeo = new THREE.TorusGeometry(0.7, 0.32, 8, 16);
    for (const [x, z, n] of [[4, 1.5, 6], [5.6, -0.6, 4], [4.2, -2.6, 5]]) for (let k = 0; k < n; k++) {
      const t = new THREE.Mesh(tireGeo, mat('#232026')); t.rotation.x = Math.PI / 2; t.position.set(x, 0.32 + k * 0.62, z); t.castShadow = true; g.add(t);
    }
    cyl(g, 1, 1, 2.6, mat(a), -2, 4, -1, 16); cyl(g, 0.3, 0.3, 0.6, mat(DARK), -2, 6.6, -1, 8);
    return [[-2, -1, 4.3, 3.3], [4.8, -0.6, 1.8, 3]];
  }
};

function signMat(text, bg, fg = '#1d1721') {
  return new THREE.MeshStandardMaterial({ map: canvasTexture(512, 128, (g, w, h) => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `900 70px 'Nunito', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4); }), roughness: 0.6 });
}
function tickerTexture(accent, seed) {
  return repeatX(canvasTexture(1024, 96, (g, w, h) => {
    g.fillStyle = '#0d0b12'; g.fillRect(0, 0, w, h);
    g.font = `800 52px 'Nunito', monospace`; g.textBaseline = 'middle';
    const syms = ['SPY', 'QQQ', 'EFA', 'GLD', 'TLT', 'USO', 'DIA', 'IWM'];
    let x = 10;
    for (let i = 0; i < 8; i++) { const up = (i * 7 + seed * 13) % 3 !== 0; g.fillStyle = up ? '#7dffa0' : '#ff6a7c'; const s = `${syms[(i + Math.floor(seed)) % 8]} ${up ? '▲' : '▼'}${((i * 37 + seed * 11) % 300 / 100).toFixed(2)}`; g.fillText(s, x, h / 2); x += g.measureText(s).width + 44; }
  }));
}
function repeatX(t) { t.wrapS = THREE.RepeatWrapping; return t; }
function parcelTexture(accent) {
  return canvasTexture(512, 256, (g, w, h) => {
    g.fillStyle = '#efe6d2'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#a89878'; g.lineWidth = 2;
    for (let x = 0; x < w; x += 42) for (let y = 0; y < h; y += 36) { g.fillStyle = (x * y) % 7 < 2 ? accent : 'rgba(0,0,0,0)'; g.fillRect(x + 3, y + 3, 36, 30); g.strokeRect(x + 3, y + 3, 36, 30); }
    g.strokeStyle = '#4f4a55'; g.lineWidth = 10; g.beginPath(); g.moveTo(0, 130); g.lineTo(w, 110); g.stroke();
  });
}
function scopeTexture(accent) {
  return repeatX(canvasTexture(512, 205, (g, w, h) => {
    g.fillStyle = '#081418'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(110,231,255,.18)'; g.lineWidth = 1;
    for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = accent; g.lineWidth = 4; g.beginPath();
    for (let x = 0; x < w; x++) { const y = h / 2 + Math.sin(x * 0.07) * 40 + (x % 128 < 6 ? -60 : 0); x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  }));
}
function dashTexture(accent, k) {
  return canvasTexture(340, 200, (g, w, h) => {
    g.fillStyle = '#12101a'; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, w, 20);
    g.fillStyle = '#fff'; g.font = "800 13px 'Nunito', sans-serif"; g.fillText(['REPAIR ORDERS', 'BLOCKERS', 'FOLLOW-UPS', 'RECOMMENDATIONS', 'ADVISORS', 'MCP TOOLS'][k], 8, 15);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 3 === 0 ? '#ffcf6e' : '#6ee7ff'; g.fillRect(12, 34 + i * 26, 40 + ((i * 53 + k * 31) % 240), 14); }
  });
}

// Ground ring + light beam that marks every portal from afar
function portalMarker(accent) {
  const g = new THREE.Group();
  const ringMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(5.7, 6.3, 64), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(accent) }, uStrength: { value: 1 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 uColor; uniform float uStrength, uTime; varying vec2 vUv; void main(){ float a = pow(1.0 - vUv.y, 2.2) * (0.55 + 0.1 * sin(uTime * 3.0 + vUv.y * 20.0)); gl_FragColor = vec4(uColor * a * uStrength, a * uStrength); }'
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(5.9, 6, 14, 48, 1, true), beamMat);
  beam.position.y = 7; g.add(beam);
  return { group: g, ring, ringMat, beam, beamMat };
}

export function createPortals(portals) {
  const group = new THREE.Group(); group.name = 'portals';
  const colliders = []; const items = []; const animated = [];
  for (const p of portals) {
    const b = new THREE.Group();
    const y = sampleHeight(p.bx, p.bz);
    b.position.set(p.bx, y - 0.05, p.bz); b.rotation.y = p.face;
    const boxes = (BUILDERS[p.shape] || BUILDERS.house)(b, p.accent);
    b.traverse((o) => { if (o.userData.spin || o.userData.blink || o.userData.sweep || o.userData.ticker || o.userData.scope) animated.push(o); });
    group.add(b);
    for (const [lx, lz, hw, hd] of boxes) {
      const c = Math.cos(p.face), s = Math.sin(p.face);
      colliders.push({ type: 'box', x: p.bx + lx * c + lz * s, z: p.bz - lx * s + lz * c, hw, hd, yaw: p.face, kind: 'building' });
    }
    const box3 = new THREE.Box3().setFromObject(b);
    const label = labelSprite(p.short, p.kind, p.accent, 1);
    label.position.set(p.bx, box3.max.y + 3.2, p.bz);
    group.add(label);
    const marker = portalMarker(p.accent);
    marker.group.position.set(p.x, sampleHeight(p.x, p.z), p.z);
    group.add(marker.group);
    items.push({ project: p, building: b, label, marker, baseLabelY: label.position.y });
  }
  return {
    group, colliders, items,
    update(t, nearestSlug, discovered) {
      for (const it of items) {
        const near = it.project.slug === nearestSlug;
        const seen = discovered.has(it.project.slug);
        it.marker.ringMat.opacity = near ? 0.95 : 0.45 + Math.sin(t * 2 + it.project.angle) * 0.12;
        it.marker.ring.scale.setScalar(near ? 1 + Math.sin(t * 6) * 0.03 : 1);
        it.marker.beamMat.uniforms.uStrength.value = near ? 1.3 : seen ? 0.35 : 0.9;
        it.marker.beamMat.uniforms.uTime.value = t;
        it.label.position.y = it.baseLabelY + Math.sin(t * 1.4 + it.project.angle) * 0.25;
      }
      for (const o of animated) {
        if (o.userData.spin) o.rotation.y = t * (typeof o.userData.spin === 'number' ? o.userData.spin : 1.6);
        if (o.userData.blink) o.material.emissiveIntensity = (Math.sin(t * 4) > 0 ? 3 : 0.3);
        if (o.userData.sweep) o.rotation.z = Math.sin(t * 0.4) * 0.6;
        if (o.userData.ticker) o.userData.ticker.offset.x = (t * 0.05) % 1;
        if (o.userData.scope) o.userData.scope.offset.x = (t * 0.12) % 1;
      }
    }
  };
}
export { signTexture };
