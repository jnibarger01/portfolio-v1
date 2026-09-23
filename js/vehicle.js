import * as THREE from '/vendor/three/three.module.min.js';
import { GLTFLoader } from '/vendor/three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from '/vendor/three/addons/loaders/DRACOLoader.js';
import { WORLD } from './layout.js';
import { box, cyl, mat } from './world/kit.js';

// Jace's exact Toyota Showroom 2024 4Runner TRD Pro (self-hosted copy of his own asset)
export const MODEL_URL = '/assets/models/modsnation_7416_assets_assembled.glb';
export const WHEEL_URL = '/assets/models/wheel_trd_pro.glb';
export const TIRE_URL = '/assets/models/ModsNation_7416_tire.glb';
export const VEHICLE_LABEL = '2024 Toyota 4Runner TRD Pro';
const TIRE_SCALE = 1.45;

const G = 22;             // gravity (a touch floaty, like a toy)
const WHEELBASE = 2.81;
const R_WHEEL = 0.39;

export function createVehicle(scene, { onProgress } = {}) {
  const root = new THREE.Group(); root.name = 'vehicle';
  const body = new THREE.Group(); root.add(body);
  scene.add(root);

  const state = {
    x: 0, y: 0, z: 0, yaw: Math.PI * 1.25, speed: 0, vy: 0, grounded: true, steer: 0,
    pitch: 0, roll: 0, suspension: 0, suspV: 0, spin: 0, boost: false, braking: false, inWater: 0,
    ready: false, fallback: false, runningGearReady: false
  };

  const wheels = { spin: [], steer: [] };
  const lights = { head: [], brake: [] };

  // headlights: one shadowless spotlight + additive glow cards
  const spot = new THREE.SpotLight('#fff2d6', 0, 42, 0.6, 0.55, 1.2);
  spot.position.set(0, 0.9, 2.2); spot.target.position.set(0, 0, 14);
  root.add(spot, spot.target);
  const flare = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,240,1)'); gr.addColorStop(0.3, 'rgba(255,230,180,.5)'); gr.addColorStop(1, 'rgba(255,220,160,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c; })());
  const flareMat = new THREE.SpriteMaterial({ map: flare, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, toneMapped: false });
  for (const x of [-0.62, 0.62]) { const s = new THREE.Sprite(flareMat); s.position.set(x, 0.95, 2.42); s.scale.setScalar(1.3); body.add(s); }

  const draco = new DRACOLoader();
  draco.setDecoderPath('/vendor/three/addons/libs/draco/');
  const loader = new GLTFLoader(); loader.setDRACOLoader(draco);

  const onLoad = (gltf, wheelGltf, tireGltf) => {
    const model = gltf.scene;
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      const m = o.material;
      if (!m) return;
      if (/emissive\.headlight|emissive\.foglight/.test(m.name)) lights.head.push(m);
      if (/brakelights|taillight/.test(m.name)) lights.brake.push(m);
      if (/glass\.windows/.test(m.name)) { m.transparent = true; m.opacity = Math.min(m.opacity ?? 1, 0.72); }
    });
    for (const side of ['front_left', 'front_right', 'rear_left', 'rear_right']) {
      const front = side.startsWith('front');
      const mountName = `MOUNT_WHEEL_${side.toUpperCase()}`;
      const mount = model.getObjectByName(mountName);
      const oldTire = model.getObjectByName(`PLACED_KO3_${side}`);
      const oldWheel = model.getObjectByName(`PLACED_WEISU_${side}`);
      if (!mount || !oldTire || !oldWheel) throw new Error(`4Runner wheel mount is incomplete: ${side}`);

      // Replace the assembled model's undersized KO3 and aftermarket WEISU meshes with the
      // supplied TRD Pro rim and correctly scaled KO3 tire at the authored wheel mount.
      oldTire.parent?.remove(oldTire);
      oldWheel.parent?.remove(oldWheel);
      const pivot = new THREE.Group();
      pivot.name = `TRD_PRO_WHEEL_PIVOT_${side}`;
      pivot.rotation.order = 'YXZ';
      const wheel = wheelGltf.scene.clone(true);
      wheel.name = `TRD_PRO_WHEEL_${side}`;
      const tire = tireGltf.scene.clone(true);
      tire.name = `KO3_TIRE_${side}`;
      tire.scale.setScalar(TIRE_SCALE);
      for (const part of [wheel, tire]) part.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
      pivot.add(tire, wheel);
      mount.add(pivot);

      wheels.spin.push(pivot);
      if (front) wheels.steer.push(pivot);
      const cal = model.getObjectByName('PLACED_AOOA_caliper_' + side);
      if (cal && front) { cal.rotation.order = 'YXZ'; wheels.steer.push(cal); }
    }
    body.add(model);
    state.runningGearReady = true;
    state.ready = true;
    window.dispatchEvent(new CustomEvent('jace-4runner-ready'));
  };
  const onError = (err) => {
    console.warn('4Runner model unavailable, using built-in stand-in.', err);
    buildStandIn(body, wheels);
    state.ready = true; state.fallback = true;
    window.dispatchEvent(new CustomEvent('jace-4runner-fallback'));
  };
  loader.load(MODEL_URL, (gltf) => {
    onProgress?.(0.92);
    Promise.all([loader.loadAsync(WHEEL_URL), loader.loadAsync(TIRE_URL)]).then(([wheelGltf, tireGltf]) => {
      try { onLoad(gltf, wheelGltf, tireGltf); } catch (err) { onError(err); }
    }).catch(onError);
  }, (e) => onProgress?.((e.total ? e.loaded / e.total : 0) * 0.92), onError);

  const tmpN = new THREE.Vector3();

  function update(dt, input, ground, colliders, hooks = {}) {
    const s = state;
    const { throttle, steer: steerIn, boost, brake } = input;
    const maxF = boost ? 31 : 21;
    const accel = boost ? 24 : 13;
    s.boost = boost && throttle > 0;
    s.braking = false;

    if (s.grounded) {
      if (brake) { s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), 40 * dt); s.braking = true; }
      else if (throttle > 0) {
        if (s.speed < -0.5) { s.speed += 32 * dt; s.braking = true; }
        else s.speed += accel * throttle * dt * (1 - Math.max(0, s.speed) / maxF * 0.6);
      } else if (throttle < 0) {
        if (s.speed > 0.5) { s.speed -= 32 * dt; s.braking = true; }
        else s.speed = Math.max(-9, s.speed + accel * 0.6 * throttle * dt);
      } else {
        s.speed *= Math.exp(-0.7 * dt);
        s.speed -= Math.sign(s.speed) * Math.min(Math.abs(s.speed), 2.2 * dt);
      }
      if (s.speed > maxF) s.speed += (maxF - s.speed) * Math.min(1, 3 * dt);
      if (s.inWater > 0.25) s.speed *= Math.exp(-2.6 * s.inWater * dt);
    }

    // speed-sensitive bicycle steering
    s.steer += (steerIn - s.steer) * (1 - Math.exp(-9 * dt));
    const steerAngle = s.steer * 0.58 * (1 - 0.5 * Math.min(1, Math.abs(s.speed) / 30));
    const yawRate = (s.speed / WHEELBASE) * Math.tan(steerAngle);
    s.yaw -= yawRate * dt * (s.grounded ? 1 : 0.25);

    const fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
    s.x += fx * s.speed * dt;
    s.z += fz * s.speed * dt;

    // collisions (two circles along the body)
    let impact = 0;
    for (const off of [1.35, -1.3]) {
      const cxp = s.x + fx * off, czp = s.z + fz * off, r = 1.25;
      for (const c of colliders) {
        const dx0 = cxp - c.x, dz0 = czp - c.z;
        if (dx0 * dx0 + dz0 * dz0 > 400) continue;
        let nx, nz, pen;
        if (c.type === 'circle') {
          const d = Math.hypot(dx0, dz0), min = c.r + r;
          if (d >= min || d === 0) continue;
          nx = dx0 / d; nz = dz0 / d; pen = min - d;
        } else {
          const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
          const lx = dx0 * cs - dz0 * sn, lz = dx0 * sn + dz0 * cs;
          const qx = Math.max(-c.hw, Math.min(c.hw, lx)), qz = Math.max(-c.hd, Math.min(c.hd, lz));
          let ex = lx - qx, ez = lz - qz; let d = Math.hypot(ex, ez);
          if (d >= r) continue;
          if (d === 0) { // center inside box: push out along smallest axis
            const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
            if (px < pz) { ex = Math.sign(lx) || 1; ez = 0; d = 0; pen = px + r; } else { ex = 0; ez = Math.sign(lz) || 1; d = 0; pen = pz + r; }
          } else pen = r - d;
          const len = Math.hypot(ex, ez) || 1; const lnx = ex / len, lnz = ez / len;
          nx = lnx * cs + lnz * sn; nz = -lnx * sn + lnz * cs;
        }
        s.x += nx * pen; s.z += nz * pen;
        const vn = (fx * nx + fz * nz) * s.speed * Math.sign(off);
        const along = fx * nx + fz * nz;
        if ((off > 0 && s.speed > 0 && along < -0.3) || (off < 0 && s.speed < 0 && along > 0.3)) {
          impact = Math.max(impact, Math.abs(s.speed) * Math.abs(along));
          s.speed *= -0.25 * Math.abs(along) + (1 - Math.abs(along)) * 0.9;
        } else s.speed *= 0.985;
        hooks.onHit?.(c);
      }
    }
    if (impact > 3) hooks.onImpact?.(impact);

    // world boundary: soft wall past the hills
    const rr = Math.hypot(s.x, s.z), lim = WORLD.playRadius + 14;
    if (rr > lim) { s.x *= lim / rr; s.z *= lim / rr; s.speed *= 0.6; hooks.onImpact?.(4); }

    // vertical: follow terrain, launch off crests and ramps
    const gy = ground(s.x, s.z);
    const predicted = s.y + s.vy * dt - 0.5 * G * dt * dt;
    if (s.grounded) {
      const gvy = (gy - s.y) / Math.max(dt, 1e-3);
      if (predicted - 0.02 > gy && s.vy > 2.5) { s.grounded = false; s.vy -= G * dt; s.y = predicted; }
      else { s.vy = Math.max(-12, Math.min(14, gvy)); s.y = gy; }
    } else {
      s.vy -= G * dt; s.y = predicted;
      if (s.y <= gy) {
        const land = -s.vy; s.y = gy; s.grounded = true; s.vy = 0;
        s.suspV -= Math.min(land, 14) * 0.9;
        if (land > 5) hooks.onLand?.(land);
      }
    }
    s.inWater = Math.max(0, Math.min(1.5, WORLD.waterLevel - gy + 0.1));

    // chassis attitude from four contact points
    const lx = Math.cos(s.yaw), lz = -Math.sin(s.yaw);
    const hF = ground(s.x + fx * 1.4, s.z + fz * 1.4), hB = ground(s.x - fx * 1.4, s.z - fz * 1.4);
    const hL = ground(s.x + lx * 0.85, s.z + lz * 0.85), hR = ground(s.x - lx * 0.85, s.z - lz * 0.85);
    const lean = s.grounded ? 1 : 0.02;
    const accelPitch = s.grounded ? -(throttle * 0.02 * (s.boost ? 2 : 1)) + (s.braking ? 0.035 : 0) : 0;
    const targetPitch = -Math.atan2(hF - hB, 2.8) + accelPitch;
    const targetRoll = Math.atan2(hL - hR, 1.7) - s.steer * Math.min(1, Math.abs(s.speed) / 20) * 0.06 * Math.sign(s.speed);
    s.pitch += (targetPitch - s.pitch) * Math.min(1, dt * 10 * lean + (s.grounded ? 0 : dt * 0.8));
    s.roll += (targetRoll - s.roll) * Math.min(1, dt * 10 * lean);
    // suspension spring
    s.suspV += (-s.suspension * 180 - s.suspV * 14) * dt;
    s.suspension += s.suspV * dt;

    root.position.set(s.x, s.y, s.z);
    root.rotation.set(0, s.yaw, 0);
    body.rotation.set(s.pitch, 0, s.roll, 'YXZ');
    body.position.y = s.suspension * 0.12;

    s.spin += (s.speed / R_WHEEL) * dt;
    for (const w of wheels.spin) w.rotation.x = s.spin;
    for (const w of wheels.steer) w.rotation.y = -steerAngle;

    return { yawRate };
  }

  function setNight(n) {
    spot.intensity = n > 0.35 ? 60 * n : 0;
    flareMat.opacity = n * 0.9;
    for (const m of lights.head) { m.emissiveIntensity = 1 + n * 5; }
    for (const m of lights.brake) { m.emissiveIntensity = state.braking ? 8 : 1 + n * 2; }
  }

  function place(x, z, yaw, ground) {
    Object.assign(state, { x, z, yaw, speed: 0, vy: 0, grounded: true, steer: 0, pitch: 0, roll: 0, suspension: 0, suspV: 0 });
    state.y = ground(x, z);
  }

  return { root, body, state, update, setNight, place };
}

// Lightweight stand-in so driving still works if the GLB can't load
function buildStandIn(body, wheels) {
  box(body, 1.9, 1.1, 4.8, mat('#d7dcdc', { metalness: 0.3, roughness: 0.4 }), 0, 0.45, 0);
  box(body, 1.75, 0.8, 2.9, mat('#1d1721', { roughness: 0.2 }), 0, 1.5, -0.4);
  box(body, 1.95, 0.25, 0.3, mat('#1a1a1a'), 0, 0.5, 2.4);
  for (const [x, z] of [[0.85, 1.5], [-0.85, 1.5], [0.85, -1.3], [-0.85, -1.3]]) {
    const pivot = new THREE.Group(); pivot.position.set(x, R_WHEEL, z); pivot.rotation.order = 'YXZ';
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(R_WHEEL, R_WHEEL, 0.32, 14), mat('#1a1a1a'));
    tire.rotation.z = Math.PI / 2; tire.castShadow = true; pivot.add(tire);
    body.add(pivot); wheels.spin.push(pivot); if (z > 0) wheels.steer.push(pivot);
  }
}
