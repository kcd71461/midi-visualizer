import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

let renderer, scene, composer, sceneCamera;
let stars;
let bloomPass, bokehPass, fxaaPass, godRaysPass, cinematicPass;

// ─── God Rays Shader (볼류메트릭 라이트 스캐터링) ───
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    lightPosition: { value: new THREE.Vector2(0.5, 0.9) },
    exposure: { value: 0.18 },
    decay: { value: 0.96 },
    density: { value: 0.6 },
    weight: { value: 0.4 },
    samples: { value: 60 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 lightPosition;
    uniform float exposure;
    uniform float decay;
    uniform float density;
    uniform float weight;
    uniform int samples;
    varying vec2 vUv;

    void main() {
      vec2 texCoord = vUv;
      vec2 deltaTexCoord = (texCoord - lightPosition);
      deltaTexCoord *= 1.0 / float(samples) * density;

      vec4 color = texture2D(tDiffuse, texCoord);
      vec4 origColor = color;
      float illuminationDecay = 1.0;

      for (int i = 0; i < 60; i++) {
        if (i >= samples) break;
        texCoord -= deltaTexCoord;
        vec4 sampleColor = texture2D(tDiffuse, texCoord);
        sampleColor *= illuminationDecay * weight;
        color += sampleColor;
        illuminationDecay *= decay;
      }

      // 원본 색상에 God Rays를 부드럽게 합성 (additive blend)
      gl_FragColor = origColor + color * exposure;
    }
  `,
};

// ─── 시네마틱 셰이더 (비네팅 + 필름 그레인 + 컬러 그레이딩 통합) ───
const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    vignetteStrength: { value: 0.35 },
    grainIntensity: { value: 0.08 },
    // 컬러 그레이딩: lift(shadows) / gamma(midtones) / gain(highlights)
    colorLift: { value: new THREE.Vector3(0.0, 0.0, 0.02) },    // 약간의 블루 리프트
    colorGamma: { value: new THREE.Vector3(1.0, 1.0, 0.98) },   // 미드톤 살짝 따뜻하게
    colorGain: { value: new THREE.Vector3(1.02, 1.0, 0.98) },   // 하이라이트에 따뜻한 틴트
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float vignetteStrength;
    uniform float grainIntensity;
    uniform vec3 colorLift;
    uniform vec3 colorGamma;
    uniform vec3 colorGain;
    varying vec2 vUv;

    // 고품질 해시 함수 (필름 그레인용)
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);

      // 1. 컬러 그레이딩 (Lift / Gamma / Gain)
      vec3 c = color.rgb;
      c = colorGain * (colorLift * (1.0 - c) + c);
      c = pow(max(c, vec3(0.0)), 1.0 / colorGamma);

      // 2. 비네팅
      vec2 uv = vUv;
      float dist = distance(uv, vec2(0.5));
      float vignette = smoothstep(0.45, 1.0, dist);
      c *= 1.0 - vignette * vignetteStrength;

      // 3. 필름 그레인
      float grain = hash(vUv * 1000.0 + time * 100.0) - 0.5;
      c += grain * grainIntensity;

      gl_FragColor = vec4(clamp(c, 0.0, 1.0), color.a);
    }
  `,
};

export function createScene(container) {
  // WebGL2 지원 체크
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    container.innerHTML = '<div style="color:#fff;text-align:center;padding:40px;font-family:sans-serif;">' +
      '<h2>WebGL2를 지원하지 않는 브라우저입니다.</h2>' +
      '<p>Chrome, Firefox, Safari, Edge 최신 버전을 사용해주세요.</p></div>';
    throw new Error('WebGL2 not supported');
  }

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020010);
  scene.fog = new THREE.FogExp2(0x020010, 0.008);

  // 환경맵 (건반 반사용)
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x020010);
  const envHemi = new THREE.HemisphereLight(0x8899bb, 0x222233, 0.5);
  envScene.add(envHemi);
  scene.environment = pmremGenerator.fromScene(envScene, 0.04).texture;
  pmremGenerator.dispose();

  // --- 조명 ---
  // HemisphereLight (AO 시뮬레이션)
  const hemiLight = new THREE.HemisphereLight(0x8899bb, 0x111118, 0.15);
  scene.add(hemiLight);

  // 앰비언트 (약한 기본)
  const ambientLight = new THREE.AmbientLight(0x1a1a30, 0.2);
  scene.add(ambientLight);

  // 키 라이트 — 대각선 위에서 (그림자 포함)
  const keyLight = new THREE.DirectionalLight(0xfff8f0, 1.0);
  keyLight.position.set(4, 10, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 4096;
  keyLight.shadow.mapSize.height = 4096;
  keyLight.shadow.camera.left = -8;
  keyLight.shadow.camera.right = 8;
  keyLight.shadow.camera.top = 2;
  keyLight.shadow.camera.bottom = -2;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 50;
  keyLight.shadow.bias = -0.0005;
  keyLight.shadow.normalBias = 0.02;
  scene.add(keyLight);

  // 필 라이트
  const fillLight = new THREE.DirectionalLight(0x8899bb, 0.25);
  fillLight.position.set(-5, 4, 3);
  scene.add(fillLight);

  // 림 라이트 (은은)
  const rimLight = new THREE.DirectionalLight(0x4466aa, 0.2);
  rimLight.position.set(0, 2, -8);
  scene.add(rimLight);

  // Edge graze light (건반 모서리 하이라이트)
  const grazeLight = new THREE.DirectionalLight(0xaabbcc, 0.3);
  grazeLight.position.set(3, 0.5, 6);
  scene.add(grazeLight);

  // --- 반사면 (Reflective Floor) ---
  // 피아노 아래에 은은한 반사 평면 배치
  const reflectorGeometry = new THREE.PlaneGeometry(30, 50);
  const reflector = new Reflector(reflectorGeometry, {
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x020010, // 배경과 동일한 반사 색상
  });
  reflector.rotation.x = -Math.PI / 2; // 수평으로 눕힘
  reflector.position.y = -0.01;        // 피아노 바로 아래
  scene.add(reflector);

  // 반사면 위에 반투명 오버레이로 반사 강도 조절
  const overlayGeometry = new THREE.PlaneGeometry(30, 50);
  const overlayMaterial = new THREE.MeshBasicMaterial({
    color: 0x020010,
    transparent: true,
    opacity: 0.7, // 1 - 0.3 = 0.7 → 반사가 30%만 보임
    depthWrite: false,
  });
  const overlay = new THREE.Mesh(overlayGeometry, overlayMaterial);
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.y = -0.009; // 반사면 살짝 위
  scene.add(overlay);

  stars = createStars();
  scene.add(stars);

  return { renderer, scene };
}

function createStars() {
  const count = 3000;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 200;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 200;
    sizes[i] = Math.random() * 2 + 0.5;
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const material = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 0.3,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
  });

  return new THREE.Points(geometry, material);
}

export function setupPostProcessing(camera) {
  sceneCamera = camera;
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  const pixelRatio = renderer.getPixelRatio();

  composer = new EffectComposer(renderer);

  // 1. RenderPass
  composer.addPass(new RenderPass(scene, camera));

  // 2. UnrealBloomPass
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    0.6,   // strength — 은은한 글로우
    0.3,   // radius
    0.75   // threshold
  );
  composer.addPass(bloomPass);

  // 3. God Rays (볼류메트릭 라이트 스캐터링)
  godRaysPass = new ShaderPass(GodRaysShader);
  godRaysPass.uniforms.lightPosition.value.set(0.5, 0.9);
  composer.addPass(godRaysPass);

  // 4. BokehPass (DOF)
  bokehPass = new BokehPass(scene, camera, {
    focus: 15.0,
    aperture: 0.002,
    maxblur: 0.008,
  });
  composer.addPass(bokehPass);

  // 5. 시네마틱 셰이더 (비네팅 + 필름 그레인 + 컬러 그레이딩)
  cinematicPass = new ShaderPass(CinematicShader);
  composer.addPass(cinematicPass);

  // 6. FXAA (최종 안티앨리어싱)
  fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms['resolution'].value.set(
    1 / (w * pixelRatio),
    1 / (h * pixelRatio)
  );
  composer.addPass(fxaaPass);

  return composer;
}

export function updateScene(delta) {
  if (stars) {
    stars.rotation.y += delta * 0.01;
    stars.rotation.x += delta * 0.005;
  }
  // 시네마틱 셰이더 시간 업데이트 (필름 그레인 애니메이션)
  if (cinematicPass) {
    cinematicPass.uniforms.time.value += delta;
  }
}

export function renderScene() {
  if (composer) {
    composer.render();
  } else if (sceneCamera) {
    renderer.render(scene, sceneCamera);
  }
}

export function handleResize(camera, container) {
  const w = container.clientWidth;
  const h = container.clientHeight;
  const pixelRatio = renderer.getPixelRatio();

  renderer.setSize(w, h);
  if (composer) composer.setSize(w, h);

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  // FXAA resolution uniform 업데이트
  if (fxaaPass) {
    fxaaPass.uniforms['resolution'].value.set(
      1 / (w * pixelRatio),
      1 / (h * pixelRatio)
    );
  }
}

/**
 * 음악 에너지(0~1)에 따라 bloom strength를 동적으로 조절합니다.
 * @param {number} musicEnergy - 0.0 ~ 1.0 범위의 음악 에너지 값
 */
export function updateDynamicBloom(musicEnergy) {
  if (!bloomPass) return;
  const clamped = Math.max(0, Math.min(1, musicEnergy));
  // 0.4 ~ 1.2 사이로 선형 보간
  bloomPass.strength = 0.4 + clamped * 0.8;
}

/**
 * DOF 초점 거리를 업데이트합니다.
 * @param {number} focusDistance - 초점 거리 (기본값 15.0)
 */
export function updateDOF(focusDistance = 15.0) {
  if (!bokehPass) return;
  bokehPass.uniforms['focus'].value = focusDistance;
}

export function getScene() { return scene; }
export function getRenderer() { return renderer; }
