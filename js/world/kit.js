import * as THREE from '../../vendor/three/three.module.min.js';

const mats = new Map();
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.82, metalness: 0, ...opts }));
  return mats.get(key);
}
// Window glass that glows warmly at night (intensity driven by setNight)
const glowMats = [];
export function glow(color, day = 0.05, night = 1.6) {
  const m = new THREE.MeshStandardMaterial({ color: '#1d1721', emissive: color, emissiveIntensity: day, roughness: 0.25, metalness: 0.1 });
  m.userData.glow = { day, night };
  glowMats.push(m);
  return m;
}
export function setNight(n) {
  for (const m of glowMats) m.emissiveIntensity = m.userData.glow.day + (m.userData.glow.night - m.userData.glow.day) * n;
}

export function box(parent, w, h, d, material, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z); m.rotation.y = ry;
  m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
export function cyl(parent, rt, rb, h, material, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}
export function cone(parent, r, h, material, x = 0, y = 0, z = 0, seg = 4, ry = Math.PI / 4) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), material);
  m.position.set(x, y + h / 2, z); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true;
  parent.add(m); return m;
}

export const FONT_DISPLAY = "'Amatic SC', 'Trebuchet MS', sans-serif";
export const FONT_BODY = "'Nunito', 'Trebuchet MS', sans-serif";

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Floating world label (always faces camera, constant-ish size)
export function labelSprite(title, subtitle, accent = '#ffffff', scale = 1) {
  const tex = canvasTexture(512, 192, (g, w, h) => {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 92px ${FONT_DISPLAY}`;
    g.lineWidth = 12; g.strokeStyle = 'rgba(29,23,33,.85)'; g.lineJoin = 'round';
    g.strokeText(title, w / 2, 70); g.fillStyle = '#fff8ef'; g.fillText(title, w / 2, 70);
    if (subtitle) {
      g.font = `800 30px ${FONT_BODY}`;
      const tw = g.measureText(subtitle.toUpperCase()).width + 36;
      g.fillStyle = 'rgba(29,23,33,.78)'; g.beginPath(); g.roundRect(w / 2 - tw / 2, 128, tw, 46, 23); g.fill();
      g.fillStyle = accent; g.fillText(subtitle.toUpperCase(), w / 2, 152);
    }
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(8 * scale, 3 * scale, 1);
  sprite.renderOrder = 5;
  return sprite;
}

// Painted sign board texture
export function signTexture(lines, { bg = '#fff4e3', fg = '#1d1721', accent = '#c21515', w = 512, h = 256 } = {}) {
  return canvasTexture(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = accent; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = fg;
    const n = lines.length;
    lines.forEach((l, i) => {
      const size = l.size || (i === 0 ? 64 : 34);
      g.font = `${l.weight || 700} ${size}px ${l.display === false ? FONT_BODY : FONT_DISPLAY}`;
      g.fillStyle = l.color || fg;
      g.fillText(l.text, w / 2, h * ((i + 1) / (n + 1)) + (l.dy || 0));
    });
  });
}
