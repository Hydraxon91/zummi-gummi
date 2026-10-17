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
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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

export function createEffects({ renderer, scene, camera, width = 1, height = 1 }) {
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
  const tint = new THREE.Color();
  const bufferSize = new THREE.Vector2();

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

  const aoPass = new GTAOPass(scene, camera, 1, 1);
  aoPass.output = GTAOPass.OUTPUT.Default;
  aoPass.blendIntensity = .20;
  aoPass.updateGtaoMaterial({
    radius: .34, distanceExponent: 1.35, thickness: .90,
    distanceFallOff: 1.0, scale: .92, samples: 8,
  });
  aoPass.updatePdMaterial({ lumaPhi: 9, depthPhi: 2, normalPhi: 3, radius: 6 });

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), .16, .42, .94);
  const gradePass = new ShaderPass(GradeShader);
  const smaaPass = new SMAAPass();
  const outputPass = new OutputPass();

  composer.addPass(renderPass);
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
    bloomPass.threshold = threshold;
    aoPass.blendIntensity = .12 + ao * .25;
  }

  function resolveMode() {
    let mode = requestedMode;
    if (mode === 'full' && qualityLevel > 1) mode = 'soft';
    if (mode === 'soft' && qualityLevel >= 3) mode = 'off';
    activeMode = mapEnabled ? mode : 'off';
    aoPass.enabled = activeMode === 'full';
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
    const bloomW = Math.max(1, Math.round(bufferSize.x * .5));
    const bloomH = Math.max(1, Math.round(bufferSize.y * .5));
    bloomPass.resolution.set(bloomW, bloomH);
    bloomPass.setSize(bloomW, bloomH);
  }

  function render(dt) {
    if (activeMode === 'off' || !mapEnabled) return false;
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

  return {
    render, resize, setMode, setQuality, setEnabled, setTimeOfDay, setBloomScale, setExposureScale,
    stats, state,
    get active() { return activeMode; },
    get enabled() { return activeMode !== 'off'; },
  };
}
