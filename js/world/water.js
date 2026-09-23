import * as THREE from '../../vendor/three/three.module.min.js';
import { WORLD, LAKE } from '../layout.js';
import { GRID_N } from './ground.js';

export function createWater(heightTex) {
  const geo = new THREE.CircleGeometry(LAKE.r + 9, 96);
  geo.rotateX(-Math.PI / 2);
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 },
    uHeightTex: { value: heightTex },
    uLevel: { value: WORLD.waterLevel },
    uDeep: { value: new THREE.Color('#1f5a6e') },
    uShallow: { value: new THREE.Color('#4fb3b0') },
    uSky: { value: new THREE.Color('#ffd9b0') },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
    uSunColor: { value: new THREE.Color(1, 0.9, 0.8) },
    uLight: { value: 1 }
  }]);
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, fog: true, depthWrite: false,
    vertexShader: /* glsl */`
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime, uLevel, uLight;
      uniform sampler2D uHeightTex;
      uniform vec3 uDeep, uShallow, uSky, uSunDir, uSunColor;
      varying vec3 vWorld;
      const float HALF = ${(WORLD.size / 2).toFixed(1)};
      const float SIZE = ${WORLD.size.toFixed(1)};
      const float GN = ${GRID_N.toFixed(1)};
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        vec2 uvW = (vWorld.xz + HALF) / SIZE;
        float ground = texture2D(uHeightTex, (uvW * (GN - 1.0) + 0.5) / GN).r;
        float depth = uLevel - ground;
        if (depth < -0.05) discard;
        vec2 p = vWorld.xz;
        float n1 = vnoise(p * 0.55 + vec2(uTime * 0.35, uTime * 0.2));
        float n2 = vnoise(p * 1.4 - vec2(uTime * 0.25, -uTime * 0.4));
        float ripple = n1 * 0.6 + n2 * 0.4;
        vec3 nrm = normalize(vec3((n1 - 0.5) * 0.35, 1.0, (n2 - 0.5) * 0.35));
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(viewDir, nrm), 0.0), 3.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 2.2, depth));
        col = mix(col, uSky, fres * 0.55);
        vec3 h = normalize(normalize(uSunDir) + viewDir);
        float spec = pow(max(dot(nrm, h), 0.0), 90.0) * 1.6;
        col += uSunColor * spec;
        // shoreline foam bands that lap in and out
        float foam = smoothstep(0.32, 0.0, depth + sin(uTime * 1.6 + ripple * 6.0) * 0.05);
        foam += smoothstep(0.55, 0.45, depth + sin(uTime * 1.1) * 0.08) * smoothstep(0.35, 0.45, depth) * step(0.55, ripple) * 0.6;
        col = mix(col, vec3(0.95, 0.97, 0.95), clamp(foam, 0.0, 1.0) * 0.85);
        col *= uLight;
        float alpha = clamp(0.55 + depth * 0.25 + foam, 0.0, 0.94);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(LAKE.x, WORLD.waterLevel, LAKE.z);
  mesh.renderOrder = 2;
  mesh.name = 'lake';
  return {
    mesh,
    update(t) { uniforms.uTime.value = t; },
    setLight(sunDir, sunColor, skyColor, level) { uniforms.uSunDir.value.copy(sunDir); uniforms.uSunColor.value.copy(sunColor); uniforms.uSky.value.copy(skyColor); uniforms.uLight.value = level; }
  };
}
