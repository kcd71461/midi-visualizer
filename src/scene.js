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

// 동적 조명 참조 (음악 반응형)
let keyLightRef, rimLightRef, pianoSpotRef;

// ─── God Rays Shader (볼류메트릭 라이트 스캐터링) ───
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    lightPosition: { value: new THREE.Vector2(0.5, 0.9) },
    exposure: { value: 0.12 },    // 이전 0.18: God Rays 약하게 → 건반 위 번짐 감소
    decay: { value: 0.95 },
    density: { value: 0.5 },      // 이전 0.6: 광선 밀도 줄여 선명도 확보
    weight: { value: 0.3 },       // 이전 0.4: 가중치 줄여 원본 보존
    samples: { value: 40 },       // 이전 60: 샘플 수 줄여 뭉개짐 감소
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

      vec4 origColor = texture2D(tDiffuse, texCoord);
      float illuminationDecay = 1.0;
      vec4 godRays = vec4(0.0);

      for (int i = 0; i < 40; i++) {
        if (i >= samples) break;
        texCoord -= deltaTexCoord;
        vec4 sampleColor = texture2D(tDiffuse, texCoord);
        // 휘도 임계값 — 밝은 픽셀만 광선 소스로 사용 (가짜 번짐 방지)
        float luma = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
        sampleColor.rgb *= smoothstep(0.55, 0.9, luma);  // 이전 0.4~0.8: 임계값 올려 건반 표면 번짐 방지
        sampleColor *= illuminationDecay * weight;
        godRays += sampleColor;
        illuminationDecay *= decay;
      }

      // 원본에 God Rays만 additive (이중 합산 방지)
      gl_FragColor = origColor + godRays * exposure;
    }
  `,
};

// ─── 시네마틱 셰이더 (비네팅 + 필름 그레인 + 컬러 그레이딩 통합) ───
const CinematicShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    vignetteStrength: { value: 0.25 },    // 이전 0.35: 비네팅 약화로 건반 밝기 보존
    grainIntensity: { value: 0.035 },     // 이전 0.08: 그레인 대폭 줄여 선명도 확보
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
  renderer.toneMappingExposure = 1.3;  // 이전 1.6 → 1.3: 하이라이트 보존, 건반 디테일 살림
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020010);
  scene.fog = new THREE.FogExp2(0x020010, 0.004);

  // 환경맵 (건반 반사용) — 고대비 환경으로 clearcoat 반사가 선명하게 맺히도록
  // 밝은 하이라이트 포인트를 여러 방향에 배치 → 흑건에 빛나는 반사점 생성
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x050515);
  const envHemi = new THREE.HemisphereLight(0xbbccff, 0x111122, 2.5);  // 이전: 1.0
  envScene.add(envHemi);
  const envDir1 = new THREE.DirectionalLight(0xffffff, 3.0);  // 이전: 0.8
  envDir1.position.set(2, 3, 2);
  envScene.add(envDir1);
  const envDir2 = new THREE.DirectionalLight(0x8899ff, 1.5);
  envDir2.position.set(-3, 1, -1);
  envScene.add(envDir2);
  const envDir3 = new THREE.DirectionalLight(0xffeedd, 2.0);
  envDir3.position.set(0, -1, 3);  // 아래에서 올라오는 반사 — 흑건 상면에 catchlight
  envScene.add(envDir3);
  scene.environment = pmremGenerator.fromScene(envScene, 0.04).texture;
  pmremGenerator.dispose();

  // --- 조명 ---
  // HemisphereLight (AO 시뮬레이션) — sky/ground 대비 강화로 그림자 콘트라스트 확보
  const hemiLight = new THREE.HemisphereLight(0x8899bb, 0x0a0a15, 0.6);
  scene.add(hemiLight);

  // 키 라이트 — 낮은 그레이징 앵글로 건반 모서리를 가로질러 비춤
  // y를 낮추고 z를 키워 건반 표면을 사선으로 긁듯이 조명 → 에지 하이라이트 극대화
  const keyLight = new THREE.DirectionalLight(0xfff5e0, 2.5);
  keyLightRef = keyLight;
  keyLight.position.set(6, 4, 12);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 4096;
  keyLight.shadow.mapSize.height = 4096;
  keyLight.shadow.camera.left = -18;
  keyLight.shadow.camera.right = 18;
  keyLight.shadow.camera.top = 6;
  keyLight.shadow.camera.bottom = -6;
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 60;
  keyLight.shadow.bias = -0.0003;
  keyLight.shadow.normalBias = 0.01;
  scene.add(keyLight);

  // 반대편 그레이징 라이트 — 좌측 낮은 앵글에서 우측으로 가로질러 검은 건반 전면 에지 밝힘
  const fillLight = new THREE.DirectionalLight(0xc8d8ff, 1.2);
  fillLight.position.set(-8, 3, 10);  // 이전: (-5, 4, 3) → z를 크게 키워 전방에서 사선
  scene.add(fillLight);

  // 림 라이트 — 뒤에서 건반 상단 모서리 실루엣 강조 (검은 건반이 배경에서 분리되도록)
  const rimLight = new THREE.DirectionalLight(0x4466ff, 1.8);
  rimLightRef = rimLight;
  rimLight.position.set(0, 5, -10);
  scene.add(rimLight);

  // 카운터 림 라이트 — 우측 뒤에서 비대칭 윤곽 (시네마틱 룩)
  const counterRimLight = new THREE.DirectionalLight(0x221144, 0.8);
  counterRimLight.position.set(8, 3, -6);
  scene.add(counterRimLight);

  // 건반 전용 로우 앵글 스포트라이트 — 정면 낮은 곳에서 건반 앞면을 비춤
  // Math.PI / 8 = 22.5도 좁은 빔으로 건반 표면에 집중
  const pianoSpotLight = new THREE.SpotLight(0xffeedd, 5.0, 40, Math.PI / 8, 0.3, 1.5);  // 이전 4.0: 건반 조명 강화
  pianoSpotRef = pianoSpotLight;
  pianoSpotLight.position.set(0, 6, 14);
  pianoSpotLight.target.position.set(0, 0, 0);
  pianoSpotLight.castShadow = true;
  pianoSpotLight.shadow.mapSize.width = 2048;
  pianoSpotLight.shadow.mapSize.height = 2048;
  pianoSpotLight.shadow.bias = -0.0003;
  scene.add(pianoSpotLight);
  scene.add(pianoSpotLight.target);

  // 검은 건반 전면 에지 전용 언더라이트 — 살짝 아래에서 올려비춤
  // 검은 건반의 앞 면을 밝혀 배경과 분리
  const underLight = new THREE.DirectionalLight(0x334466, 0.9);
  underLight.position.set(0, -1, 8);
  scene.add(underLight);

  // --- 반사면 (Reflective Floor) ---
  // 피아노 아래에 은은한 반사 평면 배치
  const reflectorGeometry = new THREE.PlaneGeometry(30, 50);
  const reflector = new Reflector(reflectorGeometry, {
    textureWidth: 2048,
    textureHeight: 2048,
    color: 0x020010,
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

  // 별 색상 변화 추가 (청백~황백)
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const temp = Math.random(); // 0=cool blue, 1=warm yellow
    colors[i * 3] = 0.8 + temp * 0.2;
    colors[i * 3 + 1] = 0.85 + temp * 0.1;
    colors[i * 3 + 2] = 1.0 - temp * 0.3;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.3,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    vertexColors: true,
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
  // threshold를 0.75 → 0.88로 올려 흰 건반 표면이 bloom에 씻기지 않게 함
  // 발광 노트(emissive)와 눌린 키만 glow되고, 흰 건반 자체는 선명하게 유지
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    0.35,  // strength — 글로우 유지하되 건반 washout 방지
    0.15,  // radius — 이전 0.3: 번짐 반경 대폭 축소로 건반 경계 보존
    0.7    // threshold — 이전 0.65: emissive 강한 것만 bloom
  );
  composer.addPass(bloomPass);

  // 3. God Rays (볼류메트릭 라이트 스캐터링)
  godRaysPass = new ShaderPass(GodRaysShader);
  godRaysPass.uniforms.lightPosition.value.set(0.5, 0.9);
  composer.addPass(godRaysPass);

  // 4. BokehPass (DOF) — 건반에 초점, aperture 좁혀 선명도 확보
  bokehPass = new BokehPass(scene, camera, {
    focus: 10.0,
    aperture: 0.0003,  // 이전 0.0008: 극도로 좁은 조리개 → 거의 전체 선명
    maxblur: 0.0015,   // 이전 0.004: 최대 블러 대폭 축소 → 배경도 거의 선명
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
  // threshold 0.7 + radius 0.15로 건반 washout 최소화
  // strength 0.15~0.45: 노트 글로우 유지하되 건반 선명도 우선
  bloomPass.strength = 0.15 + clamped * 0.3;
}

/**
 * DOF 초점 거리를 업데이트합니다.
 * @param {number} focusDistance - 초점 거리 (기본값 15.0)
 */
export function updateDOF(focusDistance = 10.0) {
  if (!bokehPass) return;
  bokehPass.uniforms['focus'].value = focusDistance;
  // 거리에 따라 aperture 미세 조정 — 항상 좁게 유지하여 건반 선명도 보장
  const normalizedDist = THREE.MathUtils.clamp((focusDistance - 5) / 25, 0, 1);
  bokehPass.uniforms['aperture'].value = 0.0002 + normalizedDist * 0.0003;
}

// 동적 조명용 컬러 상수
const _coolColor = new THREE.Color(0x8899cc);
const _warmColor = new THREE.Color(0xffaa44);
const _tempColor = new THREE.Color();

/**
 * 음악 에너지에 따라 조명을 동적으로 변화시킵니다.
 * - 키 라이트: 차가운 블루(pp) ↔ 따뜻한 앰버(ff)
 * - 림 라이트: 에너지에 비례하여 강도 증가
 * - 스포트라이트: 에너지에 따라 빔 각도 확장
 * - God Rays: 에너지에 따라 노출 증가
 * @param {number} musicEnergy - 0~1 EMA 스무딩된 음악 에너지
 */
export function updateDynamicLighting(musicEnergy) {
  const e = THREE.MathUtils.clamp(musicEnergy, 0, 1);

  if (keyLightRef) {
    _tempColor.copy(_coolColor).lerp(_warmColor, e);
    keyLightRef.color.copy(_tempColor);
    keyLightRef.intensity = 2.0 + e * 1.5; // 2.0~3.5
  }

  if (rimLightRef) {
    rimLightRef.intensity = 1.5 + e * 2.5; // 1.5~4.0
  }

  if (pianoSpotRef) {
    pianoSpotRef.angle = Math.PI / 10 + e * Math.PI / 15; // 18~30도
  }

  if (godRaysPass) {
    godRaysPass.uniforms.exposure.value = 0.06 + e * 0.12; // 0.06~0.18 (이전 0.1~0.3: 선명도 위해 대폭 축소)
  }
}

/**
 * God Rays 광원 위치를 카메라 기준으로 업데이트합니다.
 * 3D 광원 위치를 화면 UV 좌표로 투영하여 God Rays의 원점을 갱신.
 * @param {THREE.Camera} cam - 현재 카메라
 */
export function updateGodRaysLightPosition(cam) {
  if (!godRaysPass || !cam) return;
  // 고정 광원 위치 (피아노 위쪽 뒤편)
  const lightWorldPos = new THREE.Vector3(0, 15, -10);
  const projected = lightWorldPos.clone().project(cam);
  // NDC(-1~1) → UV(0~1)
  const u = (projected.x + 1) / 2;
  const v = (projected.y + 1) / 2;
  godRaysPass.uniforms.lightPosition.value.set(
    THREE.MathUtils.clamp(u, 0.1, 0.9),
    THREE.MathUtils.clamp(v, 0.1, 0.95)
  );
}

export function getScene() { return scene; }
export function getRenderer() { return renderer; }
