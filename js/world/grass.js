import * as THREE from '/vendor/three/three.module.min.js';
import { WORLD, rng } from '../layout.js';
import { GRID_N } from './ground.js';

// A patch of blades that wraps around the car, so the whole meadow feels grassy
// while only ~N blades ever exist. Height, density and color come from textures.
export function createGrass({ heightTex, maskTex, colorTex, quality }) {
  const { grassCount: count, grassPatch: patch } = quality;

  const blade = new THREE.BufferGeometry();
  const w = 0.075;
  // 3 segments + tip; x = half-width sign, y = height fraction
  const verts = [
    -w, 0, 0,  w, 0, 0,
    -w * 0.8, 0.33, 0,  w * 0.8, 0.33, 0,
    -w * 0.5, 0.66, 0,  w * 0.5, 0.66, 0,
    0, 1, 0
  ];
  blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  blade.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6]);

  const geo = new THREE.InstancedBufferGeometry();
  geo.index = blade.index; geo.attributes.position = blade.attributes.position;
  const offsets = new Float32Array(count * 4);
  const rand = rng(31337);
  for (let i = 0; i < count; i++) {
    offsets[i * 4] = (rand() - 0.5) * patch;
    offsets[i * 4 + 1] = (rand() - 0.5) * patch;
    offsets[i * 4 + 2] = rand();
    offsets[i * 4 + 3] = rand();
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 4));
  geo.instanceCount = count;

  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uCar: { value: new THREE.Vector3(0, -99, 0) },
    uPatch: { value: patch },
    uBladeHeight: { value: quality.grassHeight },
    uHeightTex: { value: heightTex },
    uMaskTex: { value: maskTex },
    uColorTex: { value: colorTex },
    uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uAmbient: { value: new THREE.Color(0.45, 0.5, 0.55) },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
    uWater: { value: WORLD.waterLevel }
  }]);

  const mat = new THREE.ShaderMaterial({
    uniforms,
    fog: true,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      attribute vec4 aOffset;
      uniform float uTime, uPatch, uBladeHeight, uWater;
      uniform vec2 uCenter;
      uniform vec3 uCar;
      uniform sampler2D uHeightTex, uMaskTex, uColorTex;
      varying vec3 vColor;
      varying float vT;
      varying vec3 vNormalW;
      const float HALF = ${(WORLD.size / 2).toFixed(1)};
      const float SIZE = ${WORLD.size.toFixed(1)};
      const float GN = ${GRID_N.toFixed(1)};
      void main() {
        vec2 rel = mod(aOffset.xy - uCenter + uPatch * 0.5, uPatch) - uPatch * 0.5;
        vec2 world = uCenter + rel;
        vec2 uvW = (world + HALF) / SIZE;
        float h = texture2D(uHeightTex, (uvW * (GN - 1.0) + 0.5) / GN).r;
        vec2 uvC = vec2(uvW.x, 1.0 - uvW.y);
        float dens = texture2D(uMaskTex, uvC).r;
        vec3 ground = texture2D(uColorTex, uvC).rgb;

        float edge = 1.0 - smoothstep(uPatch * 0.32, uPatch * 0.5, length(rel));
        float keep = step(aOffset.z, dens) * step(uWater + 0.15, h);
        float scale = keep * edge * (0.55 + aOffset.w * 0.75) * uBladeHeight;

        float ang = aOffset.z * 43.98 + aOffset.w * 7.0;
        vec3 side = vec3(cos(ang), 0.0, sin(ang));
        float t = position.y;
        vec3 p = vec3(world.x, h, world.y) + side * position.x * (0.6 + scale) + vec3(0.0, t * scale, 0.0);

        // lean + wind gusts rolling across the meadow
        vec2 lean = vec2(cos(ang * 1.7), sin(ang * 1.7)) * 0.18;
        float gust = sin(uTime * 1.3 + world.x * 0.18 + world.y * 0.11) * 0.5 + 0.5;
        float flutter = sin(uTime * 3.7 + aOffset.w * 30.0 + world.x * 0.7) * 0.25;
        vec2 wind = normalize(vec2(1.0, 0.45)) * (gust * 0.42 + flutter * 0.2);
        p.xz += (lean + wind) * t * t * scale;
        p.y -= gust * 0.12 * t * t * scale;

        // flattened by the tires
        vec2 d = world - uCar.xz;
        float dist = length(d);
        float push = (1.0 - smoothstep(1.4, 3.4, dist)) * step(abs(uCar.y - h), 3.0);
        p.xz += (d / max(dist, 0.001)) * push * 0.7 * t * scale;
        p.y -= push * 0.5 * t * scale;

        vec3 base = ground * 0.52;
        vec3 tip = ground * 1.32 + vec3(0.05, 0.07, 0.0) * aOffset.w;
        vColor = mix(base, tip, t) * (0.9 + aOffset.z * 0.2);
        vT = t;
        vNormalW = normalize(vec3(side.z, 0.9, -side.x));

        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uSunColor, uAmbient, uSunDir;
      varying vec3 vColor;
      varying float vT;
      varying vec3 vNormalW;
      void main() {
        float ndl = abs(dot(normalize(vNormalW), normalize(uSunDir)));
        vec3 light = uAmbient + uSunColor * (0.35 + 0.55 * ndl) * (0.55 + 0.45 * vT);
        gl_FragColor = vec4(vColor * light, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'grass';

  return {
    mesh,
    update(time, center, car) {
      uniforms.uTime.value = time;
      uniforms.uCenter.value.set(center.x, center.z);
      uniforms.uCar.value.copy(car);
    },
    setLight(sunColor, ambient, sunDir) {
      uniforms.uSunColor.value.copy(sunColor);
      uniforms.uAmbient.value.copy(ambient);
      uniforms.uSunDir.value.copy(sunDir);
    }
  };
}
