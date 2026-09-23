import * as THREE from '/vendor/three/three.module.min.js';
import { rng } from '../layout.js';

// Keyframes over a day (t: 0 = midnight, .5 = noon)
const KEYS = [
  { t: 0.00, top: '#0b0c24', hor: '#2b2350', fog: '#1d1a36', sun: '#8fa6ff', sunI: 0.55, sky: '#4a4f8a', gnd: '#1b1826', hemiI: 0.55, night: 1 },
  { t: 0.20, top: '#0e1030', hor: '#3a2a5a', fog: '#2a2448', sun: '#8fa6ff', sunI: 0.5, sky: '#4f4f8f', gnd: '#221c2c', hemiI: 0.55, night: 1 },
  { t: 0.26, top: '#4b5fa8', hor: '#ffae7a', fog: '#e6a88a', sun: '#ffb27a', sunI: 1.4, sky: '#b9b6ff', gnd: '#5a4636', hemiI: 0.8, night: 0.25 },
  { t: 0.34, top: '#5aa2e6', hor: '#cfe7f5', fog: '#cfe2ec', sun: '#fff1dc', sunI: 2.6, sky: '#cfe6ff', gnd: '#6b5a3e', hemiI: 1.0, night: 0 },
  { t: 0.50, top: '#4d9be8', hor: '#d6ecf7', fog: '#d8e9f1', sun: '#fff8ee', sunI: 3.0, sky: '#d6ebff', gnd: '#6f5d40', hemiI: 1.05, night: 0 },
  { t: 0.66, top: '#5b8fd6', hor: '#ffd9a8', fog: '#f2d2ae', sun: '#ffd49a', sunI: 2.6, sky: '#ffe2c4', gnd: '#6e4f3a', hemiI: 0.95, night: 0 },
  { t: 0.73, top: '#6b6fc0', hor: '#ff9d6c', fog: '#f0a07c', sun: '#ff9e5e', sunI: 2.1, sky: '#ffc3a8', gnd: '#5b3e3a', hemiI: 0.85, night: 0.1 },
  { t: 0.78, top: '#3d3a86', hor: '#ff7a6e', fog: '#b8687a', sun: '#ff7a5a', sunI: 1.2, sky: '#c89ad0', gnd: '#3e2a36', hemiI: 0.7, night: 0.55 },
  { t: 0.84, top: '#141638', hor: '#4a2f62', fog: '#2e2448', sun: '#8fa6ff', sunI: 0.55, sky: '#50528e', gnd: '#1d1828', hemiI: 0.58, night: 1 },
  { t: 1.00, top: '#0b0c24', hor: '#2b2350', fog: '#1d1a36', sun: '#8fa6ff', sunI: 0.55, sky: '#4a4f8a', gnd: '#1b1826', hemiI: 0.55, night: 1 }
];
const PARSED = KEYS.map((k) => ({ ...k, top: new THREE.Color(k.top), hor: new THREE.Color(k.hor), fog: new THREE.Color(k.fog), sun: new THREE.Color(k.sun), sky: new THREE.Color(k.sky), gnd: new THREE.Color(k.gnd) }));

export const TIME_PRESETS = { dawn: 0.28, day: 0.45, sunset: 0.72, night: 0.93 };

export function createSky(scene, quality) {
  const uniforms = {
    uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() }, uNight: { value: 0 }
  };
  const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uTop, uHor, uBottom, uSunDir, uSunColor; uniform float uNight; varying vec3 vDir;
      void main(){
        float y = vDir.y;
        vec3 col = mix(uHor, uTop, smoothstep(0.0, 0.55, y));
        col = mix(col, uBottom, smoothstep(0.0, -0.25, y));
        float sd = max(dot(normalize(vDir), normalize(uSunDir)), 0.0);
        col += uSunColor * (pow(sd, 800.0) * 2.5 + pow(sd, 12.0) * 0.25) * (1.0 - uNight * 0.6);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`
  }));
  dome.renderOrder = -10; dome.frustumCulled = false;
  scene.add(dome);

  // stars
  const starGeo = new THREE.BufferGeometry(); const r = rng(88); const pts = [];
  for (let i = 0; i < 1400; i++) { const u = r() * 2 - 1, a = r() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05; const s = Math.sqrt(1 - y * y); pts.push(Math.cos(a) * s * 800, y * 800, Math.sin(a) * s * 800); }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const starMat = new THREE.PointsMaterial({ color: '#fff6e8', size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  const stars = new THREE.Points(starGeo, starMat); stars.frustumCulled = false; scene.add(stars);

  const hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffffff', 2.5);
  sun.castShadow = quality.shadows;
  const sm = quality.shadowMap;
  sun.shadow.mapSize.set(sm, sm);
  const ext = 42;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 220 });
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);

  scene.fog = new THREE.Fog('#ffffff', 90, 330);

  const state = { t: TIME_PRESETS.sunset, night: 0, sunDir: new THREE.Vector3(), sunColor: new THREE.Color(), ambient: new THREE.Color(), skyColor: new THREE.Color(), light: 1 };
  const tmp = {};
  function sample(t) {
    let a = PARSED[0], b = PARSED[PARSED.length - 1];
    for (let i = 0; i < PARSED.length - 1; i++) if (t >= PARSED[i].t && t <= PARSED[i + 1].t) { a = PARSED[i]; b = PARSED[i + 1]; break; }
    const k = (t - a.t) / Math.max(1e-5, b.t - a.t);
    for (const key of ['top', 'hor', 'fog', 'sun', 'sky', 'gnd']) tmp[key] = (tmp[key] || new THREE.Color()).copy(a[key]).lerp(b[key], k);
    tmp.sunI = a.sunI + (b.sunI - a.sunI) * k; tmp.hemiI = a.hemiI + (b.hemiI - a.hemiI) * k; tmp.night = a.night + (b.night - a.night) * k;
    return tmp;
  }

  function apply(focus) {
    const k = sample(state.t);
    const ang = (state.t - 0.25) * Math.PI * 2;           // 0 at sunrise
    const elev = Math.sin(ang);
    const sunDir = new THREE.Vector3(-Math.cos(ang) * 0.75, Math.max(elev, 0.0), -0.55).normalize();
    // at night the same light becomes a high, cool moon
    const moon = new THREE.Vector3(0.35, 0.85, -0.4).normalize();
    const lightDir = elev > 0.08 ? sunDir : moon.clone().lerp(sunDir.clone().setY(0.25).normalize(), Math.max(0, elev + 0.1) * 5).normalize();
    state.sunDir.copy(lightDir);
    sun.position.copy(focus).addScaledVector(lightDir, 110);
    sun.target.position.copy(focus);
    sun.color.copy(k.sun); sun.intensity = k.sunI;
    hemi.color.copy(k.sky); hemi.groundColor.copy(k.gnd); hemi.intensity = k.hemiI;
    uniforms.uTop.value.copy(k.top); uniforms.uHor.value.copy(k.hor); uniforms.uBottom.value.copy(k.fog).multiplyScalar(0.8);
    uniforms.uSunDir.value.copy(sunDir.y > 0 ? sunDir : new THREE.Vector3(0, -1, 0)); uniforms.uSunColor.value.copy(k.sun); uniforms.uNight.value = k.night;
    scene.fog.color.copy(k.fog);
    starMat.opacity = Math.max(0, k.night - 0.2) * 1.1;
    state.night = k.night;
    state.sunColor.copy(k.sun).multiplyScalar(k.sunI / 2.6);
    state.ambient.copy(k.sky).multiplyScalar(k.hemiI * 0.55);
    state.skyColor.copy(k.hor);
    state.light = 0.35 + 0.65 * (1 - k.night);
    dome.position.copy(focus); stars.position.copy(focus);
    // keep shadow texels stable while driving
    const texel = (ext * 2) / sm;
    sun.target.position.x = Math.round(focus.x / texel) * texel; sun.target.position.z = Math.round(focus.z / texel) * texel;
    sun.position.copy(sun.target.position).addScaledVector(lightDir, 110);
  }

  return { state, sun, hemi, apply, setTime(t) { state.t = ((t % 1) + 1) % 1; } };
}
