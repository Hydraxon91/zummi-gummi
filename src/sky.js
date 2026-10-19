// Sky, lighting and the day/night clock for the meadow.
// A procedural gradient dome, layered drifting clouds, sun + halo, moon,
// stars and a keyframed dawn/day/dusk/night palette. Everything visual is put
// on REFLECT_LAYER so the pond's virtual camera can reflect it.

import * as THREE from 'three';

export const REFLECT_LAYER = 1;
const DAY_SECONDS = 600; // 10 real minutes for a full day at 1x

const K = (o) => ({
  sunColor: 0xffe3b8,
  sunI: 3.0,
  moonI: 0.0,
  hemiSky: 0x9dc8ff,
  hemiGround: 0x6c8a4c,
  hemiI: 0.9,
  cloud: 0xffffff,
  cloudO: 0.82,
  stars: 0,
  exposure: 1.0,
  top: 0x3b8de0,
  horizon: 0xd6f1ff,
  ground: 0xf2f0d8,
  fog: 0xcfe8f2,
  ...o,
});

const KEYS = [
  K({ h: 0.0, top: 0x050f20, horizon: 0x0d2238, ground: 0x04080c, fog: 0x081522,
      sunColor: 0x9db8ff, sunI: 0.0, moonI: 0.55, hemiSky: 0x18304d, hemiGround: 0x060e09, hemiI: 0.34,
      cloud: 0x2b3d55, cloudO: 0.42, stars: 1, exposure: 0.78 }),
  K({ h: 4.6, top: 0x0b1c39, horizon: 0x283b58, ground: 0x0a1110, fog: 0x142434,
      sunColor: 0x8fa6e8, sunI: 0.0, moonI: 0.35, hemiSky: 0x223a58, hemiGround: 0x0b160e, hemiI: 0.6,
      cloud: 0x354a65, cloudO: 0.45, stars: 0.7, exposure: 0.86 }),
  K({ h: 5.9, top: 0x244f83, horizon: 0xff9f78, ground: 0x8f7b62, fog: 0x8d889c,
      sunColor: 0xffb37a, sunI: 1.4, moonI: 0.05, hemiSky: 0x6e93b8, hemiGround: 0x6b5b45, hemiI: 0.72,
      cloud: 0xffe5d3, cloudO: 0.8, stars: 0.18, exposure: 0.98 }),
  K({ h: 7.1, top: 0x4d90cc, horizon: 0xffdcb0, ground: 0xb9a47e, fog: 0xc0ced5,
      sunColor: 0xffcf96, sunI: 2.7, moonI: 0.0, hemiSky: 0x9ec8ef, hemiGround: 0x7c8d58, hemiI: 0.88,
      cloud: 0xfff8ef, cloudO: 0.9, stars: 0, exposure: 1.04 }),
  K({ h: 9.6, top: 0x1d7fd8, horizon: 0xbfeaff, ground: 0xdfeccd, fog: 0xcbe7f0,
      sunColor: 0xfff3df, sunI: 3.4, moonI: 0.0, hemiSky: 0xaad8ff, hemiGround: 0x7e9a55, hemiI: 1.0,
      cloud: 0xffffff, cloudO: 0.944, stars: 0, exposure: 1.06 }),
  K({ h: 13.5, top: 0x1479d6, horizon: 0xb4e6ff, ground: 0xe7f0d7, fog: 0xc5e4ef,
      sunColor: 0xfff8e9, sunI: 3.7, moonI: 0.0, hemiSky: 0xa8d8ff, hemiGround: 0x7e9a55, hemiI: 1.0,
      cloud: 0xffffff, cloudO: 0.94, stars: 0, exposure: 1.08 }),
  K({ h: 16.5, top: 0x2c80cf, horizon: 0xffe3b6, ground: 0xcdd6a6, fog: 0xd6dfd2,
      sunColor: 0xffddac, sunI: 3.0, moonI: 0.0, hemiSky: 0xaed4f0, hemiGround: 0x84965c, hemiI: 0.92,
      cloud: 0xfff8ea, cloudO: 0.9, stars: 0, exposure: 1.04 }),
  K({ h: 18.3, top: 0x5b5f97, horizon: 0xffa47b, ground: 0x8b7a65, fog: 0xb0928f,
      sunColor: 0xff9d68, sunI: 2.0, moonI: 0.0, hemiSky: 0x8d9fc3, hemiGround: 0x6b5f4a, hemiI: 0.78,
      cloud: 0xffb394, cloudO: 0.8, stars: 0.08, exposure: 1.0 }),
  K({ h: 19.6, top: 0x2d3b69, horizon: 0xe07467, ground: 0x554d4c, fog: 0x5a5b73,
      sunColor: 0xff7b58, sunI: 0.9, moonI: 0.08, hemiSky: 0x536383, hemiGround: 0x3f4038, hemiI: 0.62,
      cloud: 0xc97f85, cloudO: 0.6, stars: 0.35, exposure: 0.95 }),
  K({ h: 21.0, top: 0x111e3b, horizon: 0x243252, ground: 0x0a0f12, fog: 0x182433,
      sunColor: 0x8ca6e8, sunI: 0.0, moonI: 0.5, hemiSky: 0x263f5e, hemiGround: 0x0b1710, hemiI: 0.36,
      cloud: 0x34465f, cloudO: 0.45, stars: 0.85, exposure: 0.86 }),
  K({ h: 24.0, top: 0x050f20, horizon: 0x0d2238, ground: 0x04080c, fog: 0x081522,
      sunColor: 0x9db8ff, sunI: 0.0, moonI: 0.55, hemiSky: 0x18304d, hemiGround: 0x060e09, hemiI: 0.34,
      cloud: 0x2b3d55, cloudO: 0.42, stars: 1, exposure: 0.78 }),
];

function pickKey(h) {
  h = ((h % 24) + 24) % 24;
  for (let i = 0; i < KEYS.length - 1; i++) {
    const a = KEYS[i], b = KEYS[i + 1];
    if (h >= a.h && h <= b.h) {
      const t = (h - a.h) / Math.max(1e-5, b.h - a.h);
      return { a, b, t: t * t * (3 - 2 * t) };
    }
  }
  return { a: KEYS[0], b: KEYS[0], t: 0 };
}

function blendColor(out, ah, bh, t) {
  out.setHex(ah);
  _c2.setHex(bh);
  return out.lerp(_c2, t);
}

const _c2 = new THREE.Color();

function cloudTexture(seed) {
  const w = 256, h = 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  let s = seed * 9301 + 49297;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const puffs = 10 + Math.floor(rnd() * 7);
  for (let i = 0; i < puffs; i++) {
    const px = 30 + rnd() * (w - 60);
    const py = 56 + (rnd() - 0.5) * 34;
    const r = 18 + rnd() * 38;
    const g = ctx.createRadialGradient(px, py, r * 0.08, px, py, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.72, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // soften the base so clouds sit nicely on the horizon
  const fade = ctx.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, h * 0.78, w, h * 0.22);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

function sunTexture() {
  const s = 256;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s/2, s/2, 2, s/2, s/2, s/2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.09, 'rgba(255,250,225,1)');
  g.addColorStop(0.18, 'rgba(255,233,175,0.95)');
  g.addColorStop(0.35, 'rgba(255,208,135,0.5)');
  g.addColorStop(0.7, 'rgba(255,185,115,0.12)');
  g.addColorStop(1, 'rgba(255,170,90,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function moonTexture() {
  const s = 512;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const cx = s/2, cy = s/2, r = s*0.32;
  const halo = ctx.createRadialGradient(cx, cy, r*0.82, cx, cy, s*0.5);
  halo.addColorStop(0, 'rgba(205,228,255,0.42)');
  halo.addColorStop(0.48, 'rgba(170,205,255,0.14)');
  halo.addColorStop(1, 'rgba(150,195,255,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, s, s);
  const disc = ctx.createRadialGradient(cx - r*.28, cy - r*.28, r*.12, cx, cy, r);
  disc.addColorStop(0, '#fffdf2');
  disc.addColorStop(.55, '#edf4ff');
  disc.addColorStop(1, '#c7d6ec');
  ctx.fillStyle = disc;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  // soft maria + a deterministic field of crisp little craters
  let seed = 7127;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 11; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * r * .58;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, rr = r * (.13 + rnd() * .20);
    const g = ctx.createRadialGradient(x, y, 1, x, y, rr);
    g.addColorStop(0, 'rgba(155,176,210,.18)');
    g.addColorStop(1, 'rgba(155,176,210,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI*2); ctx.fill();
  }
  for (let i = 0; i < 38; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * r * .86;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d, rr = r * (.012 + rnd() * .055);
    ctx.strokeStyle = 'rgba(150,171,204,.34)';
    ctx.lineWidth = Math.max(1, s * .0022);
    ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = 'rgba(165,184,214,.15)';
    ctx.beginPath(); ctx.arc(x + rr*.2, y + rr*.2, rr*.82, 0, Math.PI*2); ctx.fill();
  }
  // limb shading, keeping the moon readable rather than a flat white disk
  const shade = ctx.createRadialGradient(cx - r*.3, cy - r*.3, r*.15, cx, cy, r*1.02);
  shade.addColorStop(0, 'rgba(255,255,255,0)');
  shade.addColorStop(.68, 'rgba(176,196,228,.05)');
  shade.addColorStop(1, 'rgba(115,144,188,.30)');
  ctx.fillStyle = shade;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSky(scene, renderer) {
  const group = new THREE.Group();
  group.name = 'meadowSky';
  scene.add(group);

  const top = new THREE.Color(0x3b8de0);
  const horizon = new THREE.Color(0xd6f1ff);
  const ground = new THREE.Color(0xf2f0d8);
  const sunCol = new THREE.Color(0xffcf96);
  const fogCol = new THREE.Color(0xcfe8f2);

  const domeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      uTop: { value: top },
      uHorizon: { value: horizon },
      uGround: { value: ground },
      uSunDir: { value: new THREE.Vector3(-1, 0.1, -0.4).normalize() },
      uSunColor: { value: sunCol },
      uSunStrength: { value: 0.8 },
      uCloudColor: { value: new THREE.Color(0xffffff) },
      uCloudTime: { value: 0 },
      uCloudAmount: { value: 0.8 },
      uCityGlow: { value: 0 },
    },
    vertexShader: `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uGround, uSunDir, uSunColor, uCloudColor;
      uniform float uSunStrength, uCloudTime, uCloudAmount, uCityGlow;
      varying vec3 vDir;

      float cloudHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }
      float cloudNoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(cloudHash(i), cloudHash(i + vec2(1.0, 0.0)), f.x),
          mix(cloudHash(i + vec2(0.0, 1.0)), cloudHash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float cloudFbm(vec2 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += cloudNoise(p) * a;
          p = p * 2.03 + vec2(11.7, -7.1);
          a *= 0.5;
        }
        return v;
      }

      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = mix(uHorizon, uTop, smoothstep(0.0, 0.20, h));
        col = mix(uGround, col, smoothstep(-0.30, 0.015, h));
        // A soft blue city-glow band at night, inspired by the Frutiger night references.
        col += vec3(0.018, 0.070, 0.18) * exp(-abs(h) * 16.0) * uCityGlow;

        float cloudCover = 0.0;
        // Lightweight cartoon take on the WebGPU volumetric-cloud reference:
        // a flat world-space cloud plane projected into the sky, with two FBM
        // layers, soft thresholds and restrained underside shading. This keeps
        // the meadow WebGL-friendly while avoiding low sprite-cloud haze.
        if (uCloudAmount > 0.002 && h > 0.012) {
          vec2 plane = d.xz / (h + 0.09);
          vec2 drift = vec2(uCloudTime * 0.0052, uCloudTime * 0.0023);
          float n1 = cloudFbm(plane * 0.36 + drift);
          float n2 = cloudFbm(plane * 0.78 - drift * 1.7 + vec2(17.0, 4.0));
          float n = n1 * 0.68 + n2 * 0.32;
          float cover = smoothstep(0.47, 0.60, n);
          cover *= smoothstep(0.010, 0.10, h);
          cloudCover = cover * uCloudAmount;
          float underside = smoothstep(0.30, 0.72, n2);
          vec3 cloud = mix(uCloudColor * 0.78, uCloudColor * 1.06, underside);
          col = mix(col, cloud, cover * uCloudAmount * 0.92);
        }

        float s = max(dot(d, uSunDir), 0.0);
        col += uSunColor * (pow(s, 420.0) * 1.7 + pow(s, 14.0) * 0.16) * uSunStrength;

        // Soft Aero sun spokes. These live in the dome, so they stay behind the
        // meadow silhouettes and cannot wash the foreground. Clouds mask them.
        vec3 sunRight = cross(uSunDir, vec3(0.0, 1.0, 0.0));
        sunRight = length(sunRight) > 1e-4 ? normalize(sunRight) : vec3(1.0, 0.0, 0.0);
        vec3 sunUp = normalize(cross(sunRight, uSunDir));
        float ang = atan(dot(d, sunUp), dot(d, sunRight));
        float spokes = .55
          + .25 * sin(ang * 19.0 + uCloudTime * .11)
          + .20 * sin(ang * 37.0 - uCloudTime * .07 + sin(ang * 5.0 + 1.3) * 2.0);
        float rayBroad = pow(s, 3.5) * pow(max(spokes, 0.0), 1.4);
        float rayFine = pow(s, 18.0) * pow(max(spokes, 0.0), 7.0);
        col += uSunColor * (rayBroad * .085 + rayFine * .20) * uSunStrength * (1.0 - cloudCover * .55);

        // gentle warm horizon band
        col += uSunColor * exp(-abs(h) * 13.0) * 0.035 * uSunStrength;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(180, 48, 24), domeMat);
  dome.name = 'meadowDome';
  dome.frustumCulled = false;
  dome.renderOrder = -1000;
  group.add(dome);

  // stars
  const starCount = 720;
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  let seed = 90210;
  const rand = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  for (let i = 0; i < starCount; i++) {
    const u = rand(), v = rand();
    const theta = u * Math.PI * 2;
    const y = Math.pow(v, 0.6) * 2 - 1;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    starPos[i*3] = Math.cos(theta) * r * 160;
    starPos[i*3+1] = y * 160;
    starPos[i*3+2] = Math.sin(theta) * r * 160;
    const warm = rand();
    starCol[i*3] = 0.75 + warm * 0.25;
    starCol[i*3+1] = 0.82 + rand() * 0.18;
    starCol[i*3+2] = 1.0;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));
  const starMat = new THREE.PointsMaterial({
    size: 1.15, sizeAttenuation: true, transparent: true, opacity: 0,
    depthWrite: false, vertexColors: true, toneMapped: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.name = 'meadowStars';
  stars.frustumCulled = false;
  group.add(stars);

  // sun + halo
  const sunTex = sunTexture();
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, transparent: true, alphaTest: .02, opacity: 0.34, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  }));
  sunGlow.scale.set(30, 30, 1);
  group.add(sunGlow);
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sunTex, transparent: true, alphaTest: .02, opacity: 1, depthWrite: false,
    blending: THREE.AdditiveBlending, toneMapped: false, fog: false,
  }));
  sun.scale.set(9, 9, 1);
  group.add(sun);

  const moonTex = moonTexture();
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: moonTex, transparent: true, alphaTest: .02, opacity: 0, depthWrite: false,
    toneMapped: false, fog: false,
  }));
  moon.scale.set(12, 12, 1);
  group.add(moon);

  // Clouds are shaded directly into the sky dome (see the dome fragment
  // shader). The old sprite bank caused large low-contrast puffs to drift over
  // the meadow at some camera angles; the single procedural layer is cleaner,
  // cheaper and reflects naturally in the pond.
  let cloudsVisible = true;

  // aurora borealis: a soft, additive curtain over the northern horizon.
  // It is generated once and only its time/night uniforms change per frame.
  let aurora = null;
  let auroraMat = null;
  {
    const segs = 80, rows = 14, R = 146;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= rows; j++) {
      const v = j / rows;
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const a = -.98 + u * 1.96;
        const y = 7 + v * 79;
        pos.push(Math.sin(a) * R, y, -Math.cos(a) * R);
        uv.push(u, v);
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < segs; i++) {
        const a = j * (segs + 1) + i;
        const b = a + 1;
        const c = a + segs + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    auroraMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, depthTest: true,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      toneMapped: false, fog: false,
      uniforms: { uTime: { value: 0 }, uNight: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vSky;
        void main(){
          vUv = uv;
          vSky = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform float uNight;
        varying vec2 vUv;
        varying vec3 vSky;

        void main(){
          // A broad, continuous curtain whose lower/upper edge undulates with
          // noise. Keep the vertical ray striation subtle so it reads as an
          // aurora veil rather than isolated searchlights.
          float edge = smoothstep(0.0, 0.10, vUv.x) * (1.0 - smoothstep(0.90, 1.0, vUv.x));
          float y0 = 0.035 + 0.055 * sin(vUv.x * 8.0 + uTime * 0.23);
          float y1 = 0.46 + 0.16 * sin(vUv.x * 4.3 - uTime * 0.16 + 1.4);
          float lower = smoothstep(y0 - 0.03, y0 + 0.08, vUv.y);
          float upper = 1.0 - smoothstep(y1 - 0.09, y1 + 0.20, vUv.y);
          float veil = lower * upper * edge;
          float broad = 0.58 + 0.42 * sin(vUv.x * 8.2 + uTime * 0.30 + sin(vUv.x * 3.1) * 2.0);
          float fine = 0.68 + 0.32 * sin(vUv.x * 54.0 - uTime * 0.16 + vUv.y * 2.4);
          float rays = broad * fine;
          float baseGlow = exp(-pow((vUv.y - 0.10) / 0.12, 2.0)) * .30;
          float alpha = veil * (0.12 + 0.25 * rays + baseGlow) * uNight;
          vec3 green = vec3(0.08, 0.96, 0.56);
          vec3 teal = vec3(0.08, 0.66, 0.84);
          vec3 blush = vec3(0.74, 0.30, 0.78);
          vec3 col = mix(green, teal, smoothstep(0.12, 0.76, vUv.y));
          col = mix(col, blush, smoothstep(0.62, 0.96, vUv.y) * 0.24);
          col *= 0.72 + rays * 0.55;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    });
    aurora = new THREE.Mesh(g, auroraMat);
    aurora.name = 'meadowAurora';
    aurora.renderOrder = -860;
    aurora.visible = false;
    group.add(aurora);
  }

  // lights
  const hemi = new THREE.HemisphereLight(0xaad8ff, 0x7e9a55, 1.0);
  group.add(hemi);
  const ambient = new THREE.AmbientLight(0xeaf8ff, 0.32);
  group.add(ambient);
  const cameraFill = new THREE.DirectionalLight(0xfff1dd, 1.8);
  cameraFill.position.set(26, 18, 36);
  group.add(cameraFill);
  const cameraFillTarget = new THREE.Object3D();
  group.add(cameraFillTarget);
  cameraFill.target = cameraFillTarget;
  const sunLight = new THREE.DirectionalLight(0xfff3df, 3.4);
  sunLight.position.set(-30, 35, -25);
  group.add(sunLight);
  const sunTarget = new THREE.Object3D();
  group.add(sunTarget);
  sunLight.target = sunTarget;
  const moonLight = new THREE.DirectionalLight(0x8aa8e8, 0.0);
  moonLight.position.set(30, 35, 20);
  group.add(moonLight);
  const moonTarget = new THREE.Object3D();
  group.add(moonTarget);
  moonLight.target = moonTarget;

  let shadowsEnabled = true;
  let shadowSize = 1024;
  for (const light of [sunLight, moonLight]) {
    light.castShadow = false;
    light.shadow.mapSize.set(shadowSize, shadowSize);
    const cam = light.shadow.camera;
    cam.left = -55; cam.right = 55; cam.top = 55; cam.bottom = -55;
    cam.near = .1; cam.far = 170;
    cam.updateProjectionMatrix();
    light.shadow.bias = -.00035;
    light.shadow.normalBias = .025;
    light.shadow.radius = 2.2;
  }
  function setShadows(on, size = 1024) {
    shadowsEnabled = !!on;
    const nextSize = Math.max(512, Math.min(2048, Number(size) || 1024));
    if (nextSize !== shadowSize) {
      shadowSize = nextSize;
      for (const light of [sunLight, moonLight]) {
        light.shadow.mapSize.set(shadowSize, shadowSize);
        if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
      }
    }
    apply(true);
    return { enabled: shadowsEnabled, size: shadowSize };
  }

  // share reflection layer with the pond
  group.traverse((o) => o.layers.enable(REFLECT_LAYER));

  let hours = 6.8;
  let totalHours = hours;
  let dayIndex = 0;
  let auto = true;
  let speed = 1;
  let lastApplied = -1;
  let mistOverride = null;
  // Named time-of-day looks: a fixed hour plus a small overhang on the palette
  // (cloud density, mist, exposure) so Dawn/Day/Dusk/Night read as complete
  // looks rather than just four slider positions.
  const LOOKS = {
    dawn:  { hours: 6.35, mist: .55, cloudScale: 1.05, exposureScale: .98 },
    day:   { hours: 12.0, mist: 0,   cloudScale: 1.00, exposureScale: 1.00 },
    dusk:  { hours: 18.6, mist: .15, cloudScale: .95, exposureScale: 1.00 },
    night: { hours: 22.0, mist: 0,   cloudScale: .75, exposureScale: .95 },
  };
  let lookName = null;
  let cloudScale = 1;
  let exposureScale = 1;
  const dayHash = (d) => {
    const n = Math.sin((d + 1) * 127.13 + 4.71) * 43758.5453;
    return n - Math.floor(n);
  };
  let mistToday = dayHash(dayIndex) < 0.34;
  const sunDir = new THREE.Vector3(-1, 0.15, -0.38).normalize();
  const moonDir = new THREE.Vector3();
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  const api = {
    group, sunDir, moonDir,
    get hours() { return hours; },
    get auto() { return auto; },
    get speed() { return speed; },
    get exposure() { return expValue; },
    get night() { return nightValue; },
    get fogColor() { return fogCol; },
    get sunVisible() { return Math.max(0, sunDir.y) > 0.005; },
    get sunDir() { return sunDir.clone(); },
    get sunLight() { return sunLight; },
    get moonVisible() { return Math.max(0, moonDir.y) > 0.005; },
    get moonDir() { return moonDir.clone(); },
    get moonLight() { return moonLight; },
    setShadows,
    get shadowState() {
      return {
        enabled: shadowsEnabled,
        size: shadowSize,
        sun: sunLight.castShadow,
        moon: moonLight.castShadow,
      };
    },
    get mist() {
      if (mistOverride !== null) return mistOverride;
      if (!mistToday) return 0;
      const rise = THREE.MathUtils.smoothstep(hours, 4.7, 6.0);
      const fall = 1 - THREE.MathUtils.smoothstep(hours, 7.0, 8.8);
      return Math.max(0, rise * fall) * 0.62;
    },
    get mistToday() { return mistToday; },
    get look() { return lookName; },
    setMistOverride(v) { mistOverride = v === null || v === undefined ? null : THREE.MathUtils.clamp(Number(v) || 0, 0, 1); },
    setLook(name) {
      const look = LOOKS[name];
      if (!look) return null;
      api.setTime(look.hours);
      lookName = name;
      auto = false;
      mistOverride = look.mist;
      cloudScale = look.cloudScale;
      exposureScale = look.exposureScale;
      apply(true);
      return lookName;
    },
    setTime(h) {
      lookName = null;
      cloudScale = 1;
      exposureScale = 1;
      mistOverride = null;
      hours = ((Number(h) || 0) % 24 + 24) % 24;
      totalHours = Math.floor(totalHours / 24) * 24 + hours;
      const d = Math.floor(totalHours / 24);
      if (d !== dayIndex) { dayIndex = d; mistToday = dayHash(dayIndex) < 0.34; }
      apply(true);
    },
    setAuto(v) {
      auto = !!v;
      if (auto) { lookName = null; cloudScale = 1; exposureScale = 1; mistOverride = null; }
    },
    setSpeed(v) { speed = Math.max(0.25, Math.min(4, Number(v) || 1)); },
    setCloudsVisible(v) { cloudsVisible = !!v; apply(true); },
    get cloudsVisible() { return cloudsVisible; },
    setVisible(v) { group.visible = !!v; },
    update(dt) {
      if (auto) {
        totalHours += dt * 24 / DAY_SECONDS * speed;
        hours = totalHours % 24;
        const d = Math.floor(totalHours / 24);
        if (d !== dayIndex) { dayIndex = d; mistToday = dayHash(dayIndex) < 0.34; }
      }
      stars.rotation.y += dt * 0.004;
      domeMat.uniforms.uCloudTime.value += dt;
      if (auroraMat) auroraMat.uniforms.uTime.value += dt;
      const diff = Math.abs(hours - lastApplied);
      if (diff > 0.003 || lastApplied < 0) apply(false);
      // sprites follow the current hour every frame for smoothness
      placeCelestial();
    },
  };

  let expValue = 1.0;
  let nightValue = 0;

  function apply(force) {
    lastApplied = hours;
    const { a, b, t } = pickKey(hours);
    const lerp = (x, y) => x + (y - x) * t;
    blendColor(top, a.top, b.top, t);
    blendColor(horizon, a.horizon, b.horizon, t);
    blendColor(ground, a.ground, b.ground, t);
    blendColor(sunCol, a.sunColor, b.sunColor, t);
    blendColor(fogCol, a.fog, b.fog, t);
    domeMat.uniforms.uTop.value.copy(top);
    domeMat.uniforms.uHorizon.value.copy(horizon);
    domeMat.uniforms.uGround.value.copy(ground);
    domeMat.uniforms.uSunColor.value.copy(sunCol);

    // sun arc: low and warm on the left at dawn, high at noon, low right at dusk
    const dayT = (hours - 6) / 12;
    const ang = dayT * Math.PI;
    sunDir.set(-Math.cos(ang) * 0.55, Math.sin(ang), -0.9).normalize();
    const lunar = (hours < 6.2 || hours > 19.2) ? 0.26 : -0.4;
    moonDir.set(-sunDir.x * 0.85, lunar, -0.9).normalize();
    const sunUp = Math.max(0, sunDir.y);
    const sunFade = THREE.MathUtils.smoothstep(sunDir.y, -0.06, 0.08);
    domeMat.uniforms.uSunDir.value.copy(sunDir);
    domeMat.uniforms.uSunStrength.value = sunFade * (0.5 + 0.9 * (1 - sunUp));
    sun.visible = sunFade > 0.01;
    sunGlow.visible = sun.visible;
    moon.visible = moonDir.y > -0.02;
    sun.material.color.copy(tmpA.setHex(0xffffff)).lerp(sunCol, 0.35);
    sunGlow.material.color.copy(tmpA.setHex(0xffffff)).lerp(sunCol, 0.55);
    const nightStrength = lerp(a.stars, b.stars, t);
    moon.material.opacity = THREE.MathUtils.smoothstep(moonDir.y, -0.02, 0.14) * (0.82 + 0.18 * (1 - nightStrength));
    moon.scale.setScalar(18 + 4 * nightStrength);

    const sunI = lerp(a.sunI, b.sunI, t);
    const moonI = lerp(a.moonI, b.moonI, t);
    sunLight.color.copy(sunCol);
    sunLight.intensity = sunI * (0.25 + 0.75 * sunFade) * 0.44;
    moonLight.intensity = moonI;
    const sunCast = shadowsEnabled && sunFade > .02 && sunI > .10;
    sunLight.castShadow = sunCast;
    moonLight.castShadow = shadowsEnabled && !sunCast && moonI > .08;
    const hemiSky = blendColor(tmpA, a.hemiSky, b.hemiSky, t);
    const hemiGround = blendColor(tmpB, a.hemiGround, b.hemiGround, t);
    hemi.color.copy(hemiSky);
    hemi.groundColor.copy(hemiGround);
    hemi.intensity = lerp(a.hemiI, b.hemiI, t) * 0.55;
    ambient.intensity = 0.025 + 0.035 * (1 - nightValue);
    cameraFill.intensity = 0.10 + 0.20 * (1 - nightValue);
    nightValue = lerp(a.stars, b.stars, t);
    starMat.opacity = nightValue;
    domeMat.uniforms.uCityGlow.value = THREE.MathUtils.smoothstep(nightValue, 0.25, 1.0) * 0.85;
    if (auroraMat){
      auroraMat.uniforms.uNight.value = THREE.MathUtils.smoothstep(nightValue, 0.15, 0.92);
      aurora.visible = nightValue > 0.03;
    }
    const cloudCol = blendColor(tmpA, a.cloud, b.cloud, t);
    const cloudO = lerp(a.cloudO, b.cloudO, t);
    domeMat.uniforms.uCloudColor.value.copy(cloudCol);
    domeMat.uniforms.uCloudAmount.value = cloudsVisible ? cloudO * cloudScale : 0;
    expValue = lerp(a.exposure, b.exposure, t) * 0.84 * exposureScale;
    if (renderer) renderer.toneMappingExposure = expValue;
    placeCelestial();
  }

  function placeCelestial() {
    sun.position.copy(sunDir).multiplyScalar(150);
    sunGlow.position.copy(sun.position);
    moon.position.copy(moonDir).multiplyScalar(150);
    sunLight.position.copy(sunDir).multiplyScalar(65);
    sunLight.target.position.set(0, 0, 0);
    sunLight.target.updateMatrixWorld();
    moonLight.position.copy(moonDir).multiplyScalar(65);
    moonLight.target.position.set(0, 0, 0);
    moonLight.target.updateMatrixWorld();
  }

  apply(true);
  return api;
}
