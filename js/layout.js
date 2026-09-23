// Shared world layout: every system (terrain paint, grass, props, physics, minimap)
// reads from here so roads, plazas, lake and heights always agree.

export const WORLD = {
  size: 400,          // terrain square edge, meters
  playRadius: 150,    // hills rise beyond this
  ringRadius: 95,     // circuit / ring road
  roadHalf: 3.6,      // asphalt half-width
  spokeAngles: [45, 135, 225, 315],
  centerRadius: 16,   // spawn plaza
  waterLevel: -0.55
};

export const LAKE = { x: 84, z: 93, r: 19 };
// Dock starts on the sand and runs 11m out over the water toward the lake center.
const DOCK_ANGLE = Math.atan2(-16.9, -15.6) + Math.PI;
export const DOCK = { x: 68.4, z: 76.1, angle: DOCK_ANGLE, len: 11, w: 3.4 };
export const WHISPER_STATION = { x: 65.4, z: 77.5, r: 7 };

const rad = (d) => (d * Math.PI) / 180;
export const polar = (angleDeg, r) => ({ x: Math.cos(rad(angleDeg)) * r, z: Math.sin(rad(angleDeg)) * r });

// ---------- Noise (2D simplex, seeded) ----------
function makeSimplex(seed = 1337) {
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const g = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    const s0 = (xin + yin) * F2;
    const i = Math.floor(xin + s0), j = Math.floor(yin + s0);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    const corner = (x, y, gi) => { let tt = 0.5 - x * x - y * y; if (tt < 0) return 0; tt *= tt; const gr = g[gi % 8]; return tt * tt * (gr[0] * x + gr[1] * y); };
    n += corner(x0, y0, perm[ii + perm[jj]]);
    n += corner(x1, y1, perm[ii + i1 + perm[jj + j1]]);
    n += corner(x2, y2, perm[ii + 1 + perm[jj + 1]]);
    return 70 * n;
  };
}
export const noise = makeSimplex(4177);
export const noise2 = makeSimplex(9001);
export function fbm(x, z, oct = 4) {
  let a = 0.5, f = 1, sum = 0;
  for (let i = 0; i < oct; i++) { sum += a * noise(x * f, z * f); f *= 2.03; a *= 0.5; }
  return sum;
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const smoothstep = smooth;

// ---------- Portals / plazas ----------
export let PORTALS = [];
export function setProjects(projects) {
  PORTALS = projects.map((p) => {
    const at = polar(p.angle, p.radius);
    const road = nearestRoadPoint(at.x, at.z);
    let dx = at.x - road.x, dz = at.z - road.z;
    const len = Math.hypot(dx, dz) || 1; dx /= len; dz /= len;
    return {
      ...p,
      x: at.x, z: at.z,                        // parking ring (interaction point)
      bx: at.x + dx * 13, bz: at.z + dz * 13,  // building center
      face: Math.atan2(-dx, -dz),              // building yaw so its front faces the road
      road,
      plazaR: 11
    };
  });
  return PORTALS;
}

// ---------- Career road (spoke 225) + contact corner ----------
export const CAREER = [
  { id: 'career-hendrick', title: 'Hendrick Toyota Merriam', big: '$1M+', line: 'Customer-pay labor & parts since July 2025', role: 'Assistant Service Drive Manager / Service Advisor', story: 'The challenge was delivering high-volume customer service while protecting trust, clarity, and revenue quality. Jace used structured inspection review, repair prioritization, consistent follow-up, and direct customer communication, and generated over $1M in customer-pay labor and parts revenue since July 2025.', ...polarOff(225, 32, 7) },
  { id: 'career-elr', title: 'Effective labor rate', big: '#2 / 17', line: '$123.35 ELR among qualifying advisors', role: 'Recorded performance benchmark', story: 'A recorded $123.35 effective labor rate, ranked #2 of 17 among advisors who met the benchmark volume threshold. It is shown separately from current revenue so the numbers never imply a shared reporting period.', ...polarOff(225, 48, -7) },
  { id: 'career-efd', title: 'EFD Logistics', big: '40+', line: 'CRM accounts rebuilt & migrated into HubSpot', role: 'Consultant / Account Manager · $1M+ AR/AP exposure managed', story: 'Account information was fragmented, with little visibility into operations and cash flow. Jace rebuilt the CRM structure, migrated more than 40 accounts into HubSpot, and created trackable operating workflows while managing over $1M in AR/AP exposure.', ...polarOff(225, 64, 7) },
  { id: 'career-ai', title: 'Service + AI', big: 'Evidence', line: 'Practical AI with clear authority, provenance & failure boundaries', role: 'Systems builder · Kansas City, MO', story: 'Maintenance recommendations can be slow to verify and hard to explain at the service counter, so Jace built a read-only Toyota maintenance lookup with exact vehicle matching, due-now guidance, print views, and source provenance. It favors verified factory data over guessed recommendations, and the same doctrine runs through ACS, DealPilot, and every portal in this world.', ...polarOff(225, 80, -7) }
];
function polarOff(angle, r, side) {
  const a = rad(angle), n = { x: -Math.sin(a), z: Math.cos(a) };
  // yaw turns the board's +z face back toward the road
  return { x: Math.cos(a) * r + n.x * side, z: Math.sin(a) * r + n.z * side, yaw: Math.atan2(-n.x * Math.sign(side), -n.z * Math.sign(side)) };
}
export const CONTACT = [
  { id: 'contact-mail', label: 'Email Jace', sub: 'jnibarger01@gmail.com', href: 'mailto:jnibarger01@gmail.com', color: '#ff6a7c', ...polar(160, 21) },
  { id: 'contact-github', label: 'GitHub', sub: 'github.com/jnibarger01', href: 'https://github.com/jnibarger01', color: '#f5f3e9', ...polar(180, 21) },
  { id: 'contact-linkedin', label: 'LinkedIn', sub: 'Professional profile', href: 'https://www.linkedin.com/in/jace-nibarger-a7196211b', color: '#6fb6ff', ...polar(200, 21) }
];

// ---------- Circuit ----------
export const CHECKPOINTS = Array.from({ length: 8 }, (_, i) => ({ i, angle: i * 45 + 22.5, ...polar(i * 45 + 22.5, WORLD.ringRadius) }));

// ---------- Ramps (oriented wedges) ----------
export const RAMPS = [
  { x: 26, z: 30, yaw: rad(45), len: 9, w: 5, h: 1.9 },
  { x: -52, z: 8, yaw: rad(180), len: 8, w: 5, h: 1.6 }
];
export function rampHeight(x, z) {
  let best = -Infinity;
  for (const r of RAMPS) {
    const dx = x - r.x, dz = z - r.z;
    const c = Math.cos(r.yaw), s = Math.sin(r.yaw);
    const lx = dx * c + dz * s;        // along ramp
    const lz = -dx * s + dz * c;       // across
    if (Math.abs(lz) > r.w / 2 || lx < -r.len / 2 || lx > r.len / 2) continue;
    const t = (lx + r.len / 2) / r.len;
    best = Math.max(best, t * r.h);
  }
  return best;
}

// ---------- Roads ----------
function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az; const wx = px - ax, wz = pz - az;
  const t = Math.max(0, Math.min(1, (wx * vx + wz * vz) / (vx * vx + vz * vz)));
  const cx = ax + vx * t, cz = az + vz * t;
  return { d: Math.hypot(px - cx, pz - cz), x: cx, z: cz };
}
export const SPOKES = WORLD.spokeAngles.map((a) => {
  const inner = polar(a, WORLD.centerRadius - 2), outer = polar(a, a === 225 || a === 45 ? WORLD.ringRadius : WORLD.playRadius - 4);
  return { a, ax: inner.x, az: inner.z, bx: outer.x, bz: outer.z };
});
export function nearestRoadPoint(x, z) {
  const r = Math.hypot(x, z) || 1;
  let best = { d: Math.abs(r - WORLD.ringRadius), x: (x / r) * WORLD.ringRadius, z: (z / r) * WORLD.ringRadius };
  for (const s of SPOKES) { const c = segDist(x, z, s.ax, s.az, s.bx, s.bz); if (c.d < best.d) best = c; }
  const cr = Math.abs(r - WORLD.centerRadius);
  if (cr < best.d) best = { d: cr, x: (x / r) * WORLD.centerRadius, z: (z / r) * WORLD.centerRadius };
  return best;
}
export function roadDistance(x, z) {
  const r = Math.hypot(x, z);
  let d = Math.abs(r - WORLD.ringRadius);
  for (const s of SPOKES) d = Math.min(d, segDist(x, z, s.ax, s.az, s.bx, s.bz).d);
  return d;
}
export function driveways() {
  return PORTALS.map((p) => ({ ax: p.x, az: p.z, bx: p.road.x, bz: p.road.z }));
}
function drivewayDistance(x, z) {
  let d = Infinity;
  for (const p of PORTALS) d = Math.min(d, segDist(x, z, p.x, p.z, p.road.x, p.road.z).d);
  const dock = segDist(x, z, DOCK.x, DOCK.z, polar(45, WORLD.ringRadius).x, polar(45, WORLD.ringRadius).z).d;
  return Math.min(d, dock);
}

// Surface classification used by paint, grass and physics.
// Returns { flat 0..1, road 0..1, plaza 0..1, dirt 0..1, sand 0..1 }
export function surfaceAt(x, z) {
  const road = 1 - smooth(WORLD.roadHalf - 0.3, WORLD.roadHalf + 0.4, roadDistance(x, z));
  const dirt = 1 - smooth(1.9, 2.6, drivewayDistance(x, z));
  let plaza = 1 - smooth(WORLD.centerRadius - 0.5, WORLD.centerRadius + 0.5, Math.hypot(x, z));
  for (const p of PORTALS) {
    plaza = Math.max(plaza, 1 - smooth(p.plazaR - 0.4, p.plazaR + 0.4, Math.hypot(x - p.x, z - p.z)));
    plaza = Math.max(plaza, 1 - smooth(9, 10, Math.max(Math.abs(rot(x - p.bx, z - p.bz, p.face).x), Math.abs(rot(x - p.bx, z - p.bz, p.face).z))));
  }
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z) - lakeRadiusAt(x, z);
  const sand = 1 - smooth(1.5, 5.5, ld);
  return { road, plaza, dirt, sand };
}
function rot(x, z, a) { const c = Math.cos(a), s = Math.sin(a); return { x: x * c - z * s, z: x * s + z * c }; }

export function lakeRadiusAt(x, z) {
  const a = Math.atan2(z - LAKE.z, x - LAKE.x);
  return LAKE.r + Math.sin(a * 3 + 1.3) * 2.2 + Math.sin(a * 5 + 0.2) * 1.2;
}

// ---------- Height field ----------
function flatMask(x, z) {
  const rd = Math.min(roadDistance(x, z), drivewayDistance(x, z));
  let m = 1 - smooth(WORLD.roadHalf + 0.5, WORLD.roadHalf + 9, rd);
  m = Math.max(m, 1 - smooth(WORLD.centerRadius + 1, WORLD.centerRadius + 12, Math.hypot(x, z)));
  for (const p of PORTALS) {
    m = Math.max(m, 1 - smooth(p.plazaR + 1, p.plazaR + 10, Math.hypot(x - p.x, z - p.z)));
    m = Math.max(m, 1 - smooth(11, 20, Math.hypot(x - p.bx, z - p.bz)));
  }
  for (const c of CAREER) m = Math.max(m, 1 - smooth(4, 9, Math.hypot(x - c.x, z - c.z)));
  for (const r of RAMPS) m = Math.max(m, 1 - smooth(6, 12, Math.hypot(x - r.x, z - r.z)));
  return m;
}
export function heightAt(x, z) {
  let h = fbm(x * 0.011, z * 0.011, 4) * 4.2 + noise2(x * 0.05, z * 0.05) * 0.35;
  h = Math.max(h, -1.2) + 0.9;
  h *= 1 - flatMask(x, z);
  // lake bowl
  const ld = Math.hypot(x - LAKE.x, z - LAKE.z), lr = lakeRadiusAt(x, z);
  if (ld < lr + 10) {
    const t = 1 - smooth(lr - 7, lr + 2, ld);
    h = h * smooth(lr, lr + 10, ld) - t * 2.8;
  }
  // outer hills form the world boundary
  const r = Math.hypot(x, z);
  if (r > WORLD.playRadius - 12) {
    const t = Math.min(r - (WORLD.playRadius - 12), 70);
    h += Math.pow(t, 1.35) * 0.3 * (0.7 + 0.3 * noise(x * 0.03, z * 0.03));
  }
  return h;
}
export function deckHeight(x, z) {
  const dx = x - DOCK.x, dz = z - DOCK.z, c = Math.cos(DOCK.angle), s = Math.sin(DOCK.angle);
  const along = dx * c + dz * s, across = -dx * s + dz * c;
  return along > -0.4 && along < DOCK.len && Math.abs(across) < DOCK.w / 2 ? WORLD.waterLevel + 0.42 : -Infinity;
}
export function groundHeight(x, z) {
  return Math.max(heightAt(x, z), rampHeight(x, z), deckHeight(x, z));
}
