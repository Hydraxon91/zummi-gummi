// Optional meadow post-processing.
//
// The Studio deliberately keeps the direct renderer path. This module owns the
// composer and all effect-sized targets so app.js stays focused on the scene,
// physics and UI. Effects are tiered: Off, Soft (grade + bloom) and Full (the
// same plus GTAO). Orbit/quality changes may force a lower tier.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GRAPHICS_DEFAULTS } from './graphics.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSaturation: { value: 1.07 },
    uContrast: { value: 1.06 },
    uLift: { value: .002 },
    uVignette: { value: .014 },
    uTint: { value: new THREE.Color(1, 1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uLift;
    uniform float uVignette;
    uniform vec3 uTint;
    varying vec2 vUv;

    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(.2126, .7152, .0722));
      c = mix(vec3(l), c, uSaturation);
      c = (c - .5) * uContrast + .5;
      c *= uTint;
      // A small cool/neutral lift keeps shadows from going muddy without
      // washing out the pastel palette.
      c += uLift * (1.0 - smoothstep(.0, .55, l));
      float d = distance(vUv, vec2(.5));
      c *= 1.0 - uVignette * smoothstep(.34, .86, d);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uSun: { value: new THREE.Vector2(.5, .5) },
    uStrength: { value: 0 },
    uThreshold: { value: .72 },
    uColor: { value: new THREE.Color(0xffd9a4) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uSun;
    uniform float uStrength;
    uniform float uThreshold;
    uniform vec3 uColor;
    varying vec2 vUv;

    float luma(vec3 c) { return dot(c, vec3(.2126, .7152, .0722)); }
    vec3 lightSource(vec2 uv) {
      vec3 c = texture2D(tDiffuse, uv).rgb;
      return c * smoothstep(uThreshold, uThreshold + .22, luma(c));
    }

    void main() {
      vec3 scene = texture2D(tDiffuse, vUv).rgb;
      vec2 delta = vUv - uSun;
      vec3 shafts = vec3(0.0);
      float weight = 0.0;
      for (int i = 0; i < 20; i++) {
        float t = float(i) / 19.0;
        float w = 1.0 - t;
        shafts += lightSource(vUv - delta * t) * w;
        weight += w;
      }
      shafts /= max(weight, .0001);
      // The depth prepass renders everything except the sky. A depth of ~1 is
      // therefore a clear line to the sun; tree branches and buildings mask the
      // shaft at that pixel.
      float d = texture2D(tDepth, vUv).x;
      float sky = smoothstep(.9990, .9998, d);
      scene += shafts * uColor * (uStrength * sky);
      gl_FragColor = vec4(scene, 1.0);
    }
  `,
};

// Prototype raymarch pass, flag-gated with ?godrays=good and Full tier only.
// Technique ported from three-good-godrays by Casey Primozic (zlib licence),
// itself adapted from n8python/goodGodRays. This is a three/addons ShaderPass
// reimplementation, not the upstream pmndrs pass; see the attribution note in
// ROADMAP.md. It reads a copy of the sun/moon shadow-map depth texture and the
// composer's scene depth, so no extra scene pass is rendered.
/*
Copyright © 2022 Casey Primozic

Adapted from original code (https://github.com/N8python/goodGodRays)
by https://github.com/n8python

This software is provided 'as-is', without any express or implied warranty. In
no event will the authors be held liable for any damages arising from the use of
this software.

Permission is granted to anyone to use this software for any purpose, including
commercial applications, and to alter it and redistribute it freely, subject to
the following restrictions:

1. The origin of this software must not be misrepresented; you must not claim
   that you wrote the original software. If you use this software in a product,
   an acknowledgment in the product documentation would be appreciated but is
   not required.

2. Altered source versions must be plainly marked as such, and must not be
   misrepresented as being the original software.

3. This notice may not be removed or altered from any source distribution.
*/
const GoodGodRaysShader = {
  uniforms: {
    tDepth: { value: null },
    tShadow: { value: null },
    uProjInv: { value: new THREE.Matrix4() },
    uCamWorld: { value: new THREE.Matrix4() },
    uLightViewProj: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunUv: { value: new THREE.Vector2(.5, .5) },
    uSunOn: { value: 0 },
    uColor: { value: new THREE.Color(0xffd9a4) },
    uSteps: { value: 24 },
    uDistance: { value: 90 },
    uDensity: { value: 1 / 85 },
    uMaxDensity: { value: .6 },
    uAttenuation: { value: .03 },
    uStrength: { value: 1.4 },
    uBias: { value: .0018 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDepth;
    uniform sampler2D tShadow;
    uniform mat4 uProjInv;
    uniform mat4 uCamWorld;
    uniform mat4 uLightViewProj;
    uniform vec3 uCamPos;
    uniform vec3 uLightDir;
    uniform vec2 uSunUv;
    uniform float uSunOn;
    uniform vec3 uColor;
    uniform float uSteps;
    uniform float uDistance;
    uniform float uDensity;
    uniform float uMaxDensity;
    uniform float uAttenuation;
    uniform float uStrength;
    uniform float uBias;
    varying vec2 vUv;

    void main() {
      float d = texture2D(tDepth, vUv).x;
      vec4 clip = vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      vec4 view = uProjInv * clip;
      view /= max(view.w, 1e-5);
      vec3 world = (uCamWorld * vec4(view.xyz, 1.0)).xyz;

      vec3 delta = world - uCamPos;
      float dist = length(delta);
      vec3 dir = delta / max(dist, 1e-4);
      float maxT = min(dist, uDistance);
      float stepLen = maxT / max(uSteps, 1.0);
      float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      float illum = 0.0;

      for (int i = 0; i < 64; i++) {
        if (float(i) >= uSteps) break;
        float t = (float(i) + jitter) * stepLen;
        if (t > maxT) break;
        vec3 p = uCamPos + dir * t;
        vec4 lp = uLightViewProj * vec4(p, 1.0);
        lp.xyz /= max(lp.w, 1e-5);
        vec3 suv = lp.xyz * 0.5 + 0.5;
        if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0 || suv.z < 0.0 || suv.z > 1.0) {
          continue;
        }
        float shadowDepth = texture2D(tShadow, suv.xy).x;
        float shadowed = step(shadowDepth + uBias, suv.z);
        illum += (1.0 - shadowed) * stepLen * exp(-t * uAttenuation);
      }

      float rays = clamp(1.0 - exp(-illum * uDensity), 0.0, uMaxDensity);
      float toward = smoothstep(0.15, 0.95, dot(dir, uLightDir));
      vec2 sunDelta = vUv - uSunUv;
      float sunMask = exp(-dot(sunDelta, sunDelta) * 22.0);
      // Carry endpoint depth to the full-resolution composite. A sky ray must
      // not be interpolated across a nearby leaf/card silhouette.
      gl_FragColor = vec4(uColor * rays * uStrength * toward * sunMask * uSunOn, -view.z);
    }
  `,
};

const GoodRaysCompositeShader = {
  uniforms: {
    tDiffuse: { value: null },
    tRays: { value: null },
    tDepth: { value: null },
    uProjInv: { value: new THREE.Matrix4() },
    uRaySize: { value: new THREE.Vector2(1, 1) },
    uDepthAware: { value: true },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform sampler2D tRays;
    uniform sampler2D tDepth;
    uniform mat4 uProjInv;
    uniform vec2 uRaySize;
    uniform bool uDepthAware;
    varying vec2 vUv;
    void main() {
      vec3 scene = texture2D(tDiffuse, vUv).rgb;
      float d = texture2D(tDepth, vUv).x;
      vec4 view = uProjInv * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      float endpoint = -view.z / max(view.w, 1e-5);
      vec2 grid = vUv * uRaySize - 0.5;
      vec2 base = floor(grid);
      vec2 blend = fract(grid);
      vec3 rays = vec3(0.0);
      float weight = 0.0;
      for (int y = 0; y < 2; y++) {
        for (int x = 0; x < 2; x++) {
          vec2 offset = vec2(float(x), float(y));
          vec4 sampleRay = texture2D(tRays, (base + offset + 0.5) / uRaySize);
          vec2 bilinear = mix(vec2(1.0) - blend, blend, offset);
          float depthWeight = uDepthAware ? exp(-abs(sampleRay.a - endpoint) / max(0.05, endpoint * 0.02)) : 1.0;
          float w = bilinear.x * bilinear.y * depthWeight;
          rays += sampleRay.rgb * w;
          weight += w;
        }
      }
      rays /= max(weight, 1e-5);
      float l = dot(scene, vec3(.2126, .7152, .0722));
      float mask = 1.0 - 0.65 * smoothstep(.35, 1.0, l);
      gl_FragColor = vec4(scene + rays * mask, 1.0);
    }
  `,
};

class GoodRaysPass {
  constructor() {
    this.enabled = false;
    this.needsSwap = true;
    this.renderToScreen = false;
    this.clear = false;
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, depthBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    });
    this.rayMaterial = new THREE.ShaderMaterial({
      ...GoodGodRaysShader, uniforms: THREE.UniformsUtils.clone(GoodGodRaysShader.uniforms), depthTest: false, depthWrite: false,
    });
    this.compositeMaterial = new THREE.ShaderMaterial({
      ...GoodRaysCompositeShader, uniforms: THREE.UniformsUtils.clone(GoodRaysCompositeShader.uniforms), depthTest: false, depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.rayMaterial);
    this.rayUniforms = this.rayMaterial.uniforms;
    this.light = null;
    this.depthCopy = null;
    this.depthCopyReady = false;
    this.resolution = .25;
  }
  copyDepth(renderer) {
    const shadow = this.light && this.light.shadow;
    if (!shadow || !shadow.map || !shadow.map.depthTexture) return null;
    const width = shadow.map.width, height = shadow.map.height;
    if (!this.depthCopy || this.depthCopy.width !== width || this.depthCopy.height !== height) {
      if (this.depthCopy) this.depthCopy.dispose();
      this.depthCopy = new THREE.WebGLRenderTarget(width, height);
      const depth = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
      depth.format = THREE.DepthFormat;
      depth.compareFunction = null;
      depth.minFilter = THREE.NearestFilter;
      depth.magFilter = THREE.NearestFilter;
      this.depthCopy.depthTexture = depth;
      this.depthCopyReady = false;
    }
    const gl = renderer.getContext();
    if (!this.depthCopyReady) {
      renderer.setRenderTarget(this.depthCopy);
      renderer.clear();
      renderer.setRenderTarget(null);
      this.depthCopyReady = true;
    }
    const src = renderer.properties.get(shadow.map).__webglFramebuffer;
    const dst = renderer.properties.get(this.depthCopy).__webglFramebuffer;
    if (!src || !dst) return null;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
    return this.depthCopy.depthTexture;
  }
  setSize(w, h) {
    // Beams are low-frequency; quarter-res keeps the raymarch off the fill budget.
    this.target.setSize(Math.max(1, Math.round(w * this.resolution)), Math.max(1, Math.round(h * this.resolution)));
    this.compositeMaterial.uniforms.uRaySize.value.set(this.target.width, this.target.height);
  }
  render(renderer, writeBuffer, readBuffer) {
    if (!readBuffer.depthTexture) return;
    this.rayUniforms.tDepth.value = readBuffer.depthTexture;
    const shadowTexture = this.copyDepth(renderer);
    if (!shadowTexture) return;
    this.rayUniforms.tShadow.value = shadowTexture;
    this.quad.material = this.rayMaterial;
    renderer.setRenderTarget(this.target);
    this.quad.render(renderer);
    this.quad.material = this.compositeMaterial;
    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.tRays.value = this.target.texture;
    this.compositeMaterial.uniforms.tDepth.value = readBuffer.depthTexture;
    this.compositeMaterial.uniforms.uProjInv.value.copy(this.rayUniforms.uProjInv.value);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
  dispose() {
    this.target.dispose();
    this.rayMaterial.dispose();
    this.compositeMaterial.dispose();
    if (this.quad.dispose) this.quad.dispose();
  }
}

function clamp01(n) {
  return n < 0 ? 0 : (n > 1 ? 1 : n);
}

function mixColor(out, a, b, t) {
  out.setRGB(
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  );
  return out;
}

const MOODS = [
  { h: 0.0, tint: [.94, .98, 1.06], sat: 1.025, bloom: .30, threshold: .84, ao: .24, exp: .96 },
  { h: 5.4, tint: [1.035, .995, .965], sat: 1.055, bloom: .22, threshold: .88, ao: .30, exp: .82 },
  { h: 8.0, tint: [1.0, 1.0, 1.0], sat: 1.03, bloom: .08, threshold: .98, ao: .32, exp: .89 },
  { h: 16.5, tint: [1.0, 1.0, 1.0], sat: 1.03, bloom: .10, threshold: .96, ao: .32, exp: .90 },
  { h: 18.6, tint: [1.045, .995, .985], sat: 1.055, bloom: .22, threshold: .88, ao: .30, exp: .83 },
  { h: 20.0, tint: [.98, .99, 1.045], sat: 1.02, bloom: .28, threshold: .86, ao: .27, exp: .94 },
  { h: 24.0, tint: [.94, .98, 1.06], sat: 1.025, bloom: .30, threshold: .84, ao: .24, exp: .96 },
];

export function createEffects({ renderer, scene, camera, width = 1, height = 1, getSky = null }) {
  let requestedMode = 'soft';
  let qualityLevel = 0;
  let mapEnabled = true;
  let activeMode = 'soft';
  let sceneCalls = 0;
  let sceneTris = 0;
  let lastHour = 12;
  let bloomScale = 1;
  let exposureScale = 1;
  let moodExposure = .89;
  let dofEnabled = false;
  let focusDistance = 8;
  let focusActive = false;
  let focusStrength = 1;
  let raysActive = false;
  let goodRequested = false;
  let controls = { ...GRAPHICS_DEFAULTS };
  const rayTint = new THREE.Color();
  try { goodRequested = new URLSearchParams(location.search).get('godrays') === 'good'; } catch (err) {}
  const BOKEH_APERTURE = .0012;
  const BOKEH_MAXBLUR = .007;
  const tint = new THREE.Color();
  const bufferSize = new THREE.Vector2();
  const rayDir = new THREE.Vector3();
  const rayWorld = new THREE.Vector3();
  const rayNdc = new THREE.Vector3();
  const rayUv = new THREE.Vector2();
  const sunNdc = new THREE.Vector3();
  const camForward = new THREE.Vector3();
  const clearColor = new THREE.Color();

  // Multisampled AO targets were unreliable in the headless driver; SMAA
  // below gives the composed image its edge cleanup instead.
  const target = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: 0,
  });
  const composer = new EffectComposer(renderer, target);

  const renderPass = new RenderPass(scene, camera);
  const originalRender = renderPass.render.bind(renderPass);
  renderPass.render = (...args) => {
    const result = originalRender(...args);
    sceneCalls = renderer.info.render.calls;
    sceneTris = renderer.info.render.triangles;
    return result;
  };

  const depthTexture = new THREE.DepthTexture(1, 1);
  depthTexture.type = THREE.UnsignedIntType;
  const depthTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.UnsignedByteType,
    depthTexture,
  });
  const depthMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.BasicDepthPacking,
  });
  const godRaysPass = new ShaderPass(GodRaysShader);
  const goodPass = new GoodRaysPass();
  // The composer targets get real depth textures, so the raymarch can read the
  // scene depth without the extra half-res depth prepass the old pass needed.
  function rayDepthTexture(){
    const t = new THREE.DepthTexture(1, 1);
    t.type = THREE.UnsignedIntType;
    t.format = THREE.DepthFormat;
    return t;
  }
  function syncRayDepth(on) {
    // RenderPass writes to the current read buffer; composer ping-pong means
    // either target can own scene depth on the next frame.
    for (const target of [composer.renderTarget1, composer.renderTarget2]) {
      if (on === !!target.depthTexture) continue;
      if (target.depthTexture) target.depthTexture.dispose();
      target.depthTexture = on ? rayDepthTexture() : null;
      target.dispose(); // rebuild framebuffer attachments on next use
    }
  }

  const aoPass = new GTAOPass(scene, camera, 1, 1);
  aoPass.output = GTAOPass.OUTPUT.Default;
  aoPass.blendIntensity = .20;
  aoPass.updateGtaoMaterial({
    radius: .34, distanceExponent: 1.35, thickness: .90,
    distanceFallOff: 1.0, scale: .92, samples: 8,
  });
  aoPass.updatePdMaterial({ lumaPhi: 9, depthPhi: 2, normalPhi: 3, radius: 6 });
  // GTAO renders the sky group (including transparent sun/moon sprites) into
  // its normal/depth buffer. That leaves a hard dark square around the sun in
  // Full. The sky is already in the composer read buffer, so hide the group for
  // the AO prepass only and let the clear depth stand in for empty sky.
  const originalAORender = aoPass.render.bind(aoPass);
  aoPass.render = (...args) => {
    const sk = getSky ? getSky() : null;
    const skyGroup = sk && sk.group;
    const skyVisible = skyGroup ? skyGroup.visible : null;
    if (skyGroup) skyGroup.visible = false;
    try {
      return originalAORender(...args);
    } finally {
      if (skyGroup) skyGroup.visible = skyVisible;
    }
  };

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), .16, .42, .94);
  const bokehPass = new BokehPass(scene, camera, {
    focus: 8, aperture: BOKEH_APERTURE, maxblur: BOKEH_MAXBLUR,
  });
  // BokehPass blurs on both sides of the focal plane. For a camera-focus look
  // we only want the background behind the focal object to soften.
  bokehPass.materialBokeh.fragmentShader = bokehPass.materialBokeh.fragmentShader.replace(
    'float factor = ( focus + viewZ );',
    'float factor = min( 0.0, focus + viewZ );'
  );
  bokehPass.materialBokeh.needsUpdate = true;
  // The depth prepass must match the double-sided foliage cards; otherwise
  // grass and leaf backs are missing their depth and get treated as sky.
  bokehPass._materialDepth.side = THREE.DoubleSide;
  const gradePass = new ShaderPass(GradeShader);
  const smaaPass = new SMAAPass();
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
  composer.addPass(goodPass);
  composer.addPass(godRaysPass);
  composer.addPass(bokehPass);
  composer.addPass(aoPass);
  composer.addPass(bloomPass);
  composer.addPass(smaaPass);
  composer.addPass(outputPass);
  composer.addPass(gradePass);

  function setTimeOfDay(hours) {
    if (!Number.isFinite(hours)) return;
    lastHour = hours;
    let a = MOODS[0];
    let b = MOODS[0];
    for (let i = 0; i < MOODS.length - 1; i++) {
      if (hours >= MOODS[i].h && hours <= MOODS[i + 1].h) {
        a = MOODS[i];
        b = MOODS[i + 1];
        break;
      }
    }
    const span = Math.max(.001, b.h - a.h);
    const t = clamp01((hours - a.h) / span);
    mixColor(tint, a.tint, b.tint, t);
    gradePass.uniforms.uTint.value.copy(tint);
    gradePass.uniforms.uSaturation.value = a.sat + (b.sat - a.sat) * t;
    const bloom = a.bloom + (b.bloom - a.bloom) * t;
    const threshold = a.threshold + (b.threshold - a.threshold) * t;
    const ao = a.ao + (b.ao - a.ao) * t;
    moodExposure = a.exp + (b.exp - a.exp) * t;
    bloomPass.strength = bloom * bloomScale;
    bloomPass.threshold = Math.max(0, threshold + controls.threshold);
    aoPass.blendIntensity = (.12 + ao * .25) * controls.ao;
  }

  function computeRay() {
    if (!getSky) return null;
    const sk = getSky();
    if (!sk) return null;
    const dir = sk.sunVisible ? sk.sunDir : (sk.moonVisible ? sk.moonDir : null);
    if (!dir) return null;
    camera.getWorldDirection(rayDir);
    if (rayDir.dot(dir) <= .03) return null;
    rayWorld.copy(camera.position).addScaledVector(dir, 100);
    rayNdc.copy(rayWorld).project(camera);
    if (rayNdc.z < -1 || rayNdc.z > 1) return null;
    rayUv.set(rayNdc.x * .5 + .5, rayNdc.y * .5 + .5);
    if (rayUv.x < -.35 || rayUv.x > 1.35 || rayUv.y < -.35 || rayUv.y > 1.35) return null;
    const sun = sk.sunVisible;
    return {
      uv: rayUv,
      color: sun ? 0xffd9a4 : 0xbfd5ff,
      strength: sun ? 1 : .82,
      moon: !sun,
    };
  }

  function renderDepth() {
    const sk = getSky ? getSky() : null;
    const skyGroup = sk && sk.group;
    const skyVisible = skyGroup ? skyGroup.visible : null;
    if (skyGroup) skyGroup.visible = false;
    const oldOverride = scene.overrideMaterial;
    const oldBackground = scene.background;
    const oldAutoClear = renderer.autoClear;
    const oldShadowAuto = renderer.shadowMap.autoUpdate;
    renderer.getClearColor(clearColor);
    const oldAlpha = renderer.getClearAlpha();
    scene.overrideMaterial = depthMaterial;
    scene.background = null;
    renderer.autoClear = true;
    renderer.shadowMap.autoUpdate = false;
    renderer.setClearColor(0xffffff, 1);
    try {
      renderer.setRenderTarget(depthTarget);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
      renderer.setClearColor(clearColor, oldAlpha);
      renderer.shadowMap.autoUpdate = oldShadowAuto;
      renderer.autoClear = oldAutoClear;
      scene.background = oldBackground;
      scene.overrideMaterial = oldOverride;
      if (skyGroup) skyGroup.visible = skyVisible;
    }
    godRaysPass.uniforms.tDepth.value = depthTexture;
  }

  function resolveMode() {
    let mode = requestedMode;
    if (mode === 'full' && qualityLevel > 1) mode = 'soft';
    if (mode === 'soft' && qualityLevel >= 3) mode = 'off';
    activeMode = mapEnabled ? mode : 'off';
    if (activeMode !== 'full' || !goodRequested) {
      goodPass.enabled = false;
      raysActive = false;
      syncRayDepth(false);
    }
    aoPass.enabled = activeMode === 'full';
    bokehPass.enabled = dofEnabled && focusActive && activeMode !== 'off';
    godRaysPass.enabled = false;
    bloomPass.enabled = activeMode !== 'off';
    gradePass.enabled = activeMode !== 'off';
    smaaPass.enabled = activeMode !== 'off';
    outputPass.enabled = activeMode !== 'off';
  }

  function setMode(mode) {
    requestedMode = ['off', 'soft', 'full'].includes(mode) ? mode : 'soft';
    resolveMode();
    return requestedMode;
  }

  function setQuality(level) {
    qualityLevel = Math.max(0, Math.min(3, level | 0));
    resolveMode();
    return activeMode;
  }

  function setEnabled(on) {
    mapEnabled = !!on;
    resolveMode();
    return mapEnabled;
  }

  function goodLightSource() {
    const sk = getSky ? getSky() : null;
    if (!sk) return null;
    const st = sk.shadowState;
    if (st.sun && sk.sunLight && sk.sunLight.shadow.map) {
      return { light: sk.sunLight, dir: sk.sunDir, color: 0xffd9a4 };
    }
    if (st.moon && sk.moonLight && sk.moonLight.shadow.map) {
      return { light: sk.moonLight, dir: sk.moonDir, color: 0xbfd5ff };
    }
    return null;
  }

  function updateGoodGodRays() {
    const entry = goodLightSource();
    if (!entry) return false;
    const { light, dir, color } = entry;
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    const shadowCamera = light.shadow.camera;
    shadowCamera.updateMatrixWorld();
    const u = goodPass.rayUniforms;
    goodPass.light = light;
    u.uCamPos.value.copy(camera.position);
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(camera.matrixWorld);
    u.uLightViewProj.value.multiplyMatrices(shadowCamera.projectionMatrix, shadowCamera.matrixWorldInverse);
    u.uLightDir.value.copy(dir);
    u.uColor.value.set(color).multiply(rayTint.set(controls.rayTint));
    sunNdc.copy(camera.position).addScaledVector(dir, 100).project(camera);
    u.uSunUv.value.set(sunNdc.x * .5 + .5, sunNdc.y * .5 + .5);
    camera.getWorldDirection(camForward);
    u.uSunOn.value = camForward.dot(dir) > 0.02 && sunNdc.z > -1 && sunNdc.z < 1 ? 1 : 0;
    return u.uSunOn.value > 0 && u.uStrength.value > 0;
  }

  function setGodrays(mode) {
    goodRequested = mode === 'good';
    goodPass.enabled = false;
    if (!goodRequested) syncRayDepth(false);
    return goodRequested ? 'good' : 'off';
  }

  function setControls(v) {
    controls = { ...controls, ...v };
    goodRequested = controls.rays;
    bloomScale = controls.bloom;
    exposureScale = controls.exposure;
    const u = goodPass.rayUniforms;
    u.uStrength.value = controls.rayStrength;
    u.uDensity.value = controls.rayDensity;
    u.uMaxDensity.value = controls.rayMaxDensity;
    u.uDistance.value = controls.rayDistance;
    u.uSteps.value = controls.raySteps;
    goodPass.resolution = controls.rayResolution;
    goodPass.compositeMaterial.uniforms.uDepthAware.value = controls.rayDepthAware;
    goodPass.setSize(composer.renderTarget1.width, composer.renderTarget1.height);
    setTimeOfDay(lastHour);
    resolveMode();
  }

  function resize(w, h) {
    const cw = Math.max(1, Math.floor(w));
    const ch = Math.max(1, Math.floor(h));
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(cw, ch);
    renderer.getDrawingBufferSize(bufferSize);
    aoPass.setSize(
      Math.max(1, Math.round(bufferSize.x * .5)),
      Math.max(1, Math.round(bufferSize.y * .5)),
    );
    depthTarget.setSize(
      Math.max(1, Math.round(bufferSize.x * .5)),
      Math.max(1, Math.round(bufferSize.y * .5)),
    );
    const bloomW = Math.max(1, Math.round(bufferSize.x * .5));
    const bloomH = Math.max(1, Math.round(bufferSize.y * .5));
    bloomPass.resolution.set(bloomW, bloomH);
    bloomPass.setSize(bloomW, bloomH);
  }

  function render(dt) {
    if (activeMode === 'off' || !mapEnabled) return false;
    // The legacy radial pass stays off. The prototype raymarch only runs when
    // ?godrays=good (or setGodrays('good')) selects it on the Full tier and a
    // shadow-casting sun/moon exists.
    godRaysPass.enabled = false;
    goodPass.enabled = false;
    if (goodRequested && activeMode === 'full') goodPass.enabled = updateGoodGodRays();
    raysActive = goodPass.enabled;
    syncRayDepth(raysActive);
    smaaPass.enabled = controls.aa;
    if (bokehPass.enabled) {
      bokehPass.uniforms.focus.value = focusDistance;
      bokehPass.uniforms.aperture.value = BOKEH_APERTURE * focusStrength * controls.aperture;
      bokehPass.uniforms.maxblur.value = BOKEH_MAXBLUR * focusStrength;
    }
    const exposure = renderer.toneMappingExposure;
    renderer.toneMappingExposure = exposure * exposureScale * moodExposure;
    try {
      composer.render(dt);
    } finally {
      renderer.toneMappingExposure = exposure;
    }
    return true;
  }

  function stats() {
    return { calls: sceneCalls, tris: sceneTris };
  }

  function state() {
    return {
      requested: requestedMode,
      active: activeMode,
      quality: qualityLevel,
      map: mapEnabled,
      hour: lastHour,
      bloomScale,
      exposureScale,
      moodExposure,
      dof: dofEnabled,
      dofFocus: focusActive,
      focusDistance,
      focusStrength,
      rays: raysActive,
      godrays: { requested: goodRequested ? 'good' : 'off', enabled: goodPass.enabled, steps: goodPass.rayUniforms.uSteps.value },
      rayDepthAllocated: !!composer.renderTarget1.depthTexture,
      controls: { ...controls },
      scene: { calls: sceneCalls, tris: sceneTris },
      composer: { w: composer._width, h: composer._height, ratio: composer._pixelRatio },
      target: { w: composer.renderTarget1.width, h: composer.renderTarget1.height },
      ao: { w: aoPass.width, h: aoPass.height },
      bloom: { w: bloomPass.resolution.x, h: bloomPass.resolution.y },
    };
  }

  setTimeOfDay(12);
  resize(width, height);
  resolveMode();

  function setBloomScale(v) {
    bloomScale = Math.max(0, Math.min(2, Number(v) || 0));
    setTimeOfDay(lastHour);
    return bloomScale;
  }

  function setExposureScale(v) {
    exposureScale = Math.max(.25, Math.min(1.5, Number(v) || 1));
    return exposureScale;
  }

  function setDof(on) {
    dofEnabled = !!on;
    resolveMode();
    return dofEnabled;
  }

  function setFocus(v, active = true, strength = 1) {
    focusDistance = Math.max(.5, Math.min(40, Number(v) || 8));
    focusStrength = Math.max(0, Math.min(1, Number(strength) || 0));
    const next = !!active;
    if (next !== focusActive) {
      focusActive = next;
      resolveMode();
    }
    return focusDistance;
  }

  return {
    render, resize, setMode, setQuality, setEnabled, setTimeOfDay, setBloomScale, setExposureScale,
    setDof, setFocus, setGodrays, setControls, stats, state,
    get active() { return activeMode; },
    get enabled() { return activeMode !== 'off'; },
    get dof() { return dofEnabled; },
  };
}
