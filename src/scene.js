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
let bloomPass, bokehPass, fxaaPass, godRaysPass, colorGradePass, vignetteGrainPass;

// 동적 조명 참조 (음악 반응형)
let keyLightRef, rimLightRef, pianoSpotRef;

// ─── God Rays Shader (볼류메트릭 라이트 스캐터링) ───
// #define SAMPLES로 정적 루프 — GPU 루프 언롤링 가능 (Apple M시리즈 등 성능 최적화)
const GodRaysShader = {
  uniforms: {
    tDiffuse: { value: null },
    lightPosition: { value: new THREE.Vector2(0.5, 0.9) },
    exposure: { value: 0.12 },
    decay: { value: 0.95 },
    density: { value: 0.5 },
    weight: { value: 0.3 },
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
    varying vec2 vUv;

    #define SAMPLES 40

    void main() {
      vec2 texCoord = vUv;
      vec2 deltaTexCoord = (texCoord - lightPosition);
      deltaTexCoord *= 1.0 / float(SAMPLES) * density;

      vec4 origColor = texture2D(tDiffuse, texCoord);
      float illuminationDecay = 1.0;
      vec4 godRays = vec4(0.0);

      for (int i = 0; i < SAMPLES; i++) {
        texCoord -= deltaTexCoord;
        vec4 sampleColor = texture2D(tDiffuse, texCoord);
        float luma = dot(sampleColor.rgb, vec3(0.299, 0.587, 0.114));
        sampleColor.rgb *= smoothstep(0.55, 0.9, luma);
        sampleColor *= illuminationDecay * weight;
        godRays += sampleColor;
        illuminationDecay *= decay;
      }

      gl_FragColor = origColor + godRays * exposure;
    }
  `,
};

// ─── 컬러 그레이딩 셰이더 (Bloom 전에 적용 — 톤매핑된 색상이 블룸에 올바르게 피딩) ───
const ColorGradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    colorLift: { value: new THREE.Vector3(0.0, 0.0, 0.02) },
    colorGamma: { value: new THREE.Vector3(1.0, 1.0, 0.98) },
    colorGain: { value: new THREE.Vector3(1.02, 1.0, 0.98) },
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
    uniform vec3 colorLift;
    uniform vec3 colorGamma;
    uniform vec3 colorGain;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 c = color.rgb;
      c = colorGain * (colorLift * (1.0 - c) + c);
      c = pow(max(c, vec3(0.0)), 1.0 / colorGamma);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), color.a);
    }
  `,
};

// ─── 비네팅 + 필름 그레인 셰이더 (FXAA 후 최종 패스 — 그레인이 블룸되거나 AA 스미어 안됨) ───
const VignetteGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    vignetteStrength: { value: 0.25 },
    grainIntensity: { value: 0.035 },
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
    varying vec2 vUv;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec3 c = color.rgb;

      // 비네팅
      float dist = distance(vUv, vec2(0.5));
      float vignette = smoothstep(0.45, 1.0, dist);
      c *= 1.0 - vignette * vignetteStrength;

      // 필름 그레인
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

  // 환경맵 — 실제 3점 조명 리그와 일치시켜 clearcoat 캐치라이트가 물리적으로 올바르게 맺히도록
  // 키라이트/림라이트/필라이트 위치와 색온도를 env에 미러링
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x020008);

  const envKey = new THREE.DirectionalLight(0xfff0cc, 6.0);   // warm, matches keyLight
  envKey.position.set(6, 4, 12);
  envScene.add(envKey);

  const envRim = new THREE.DirectionalLight(0x3355ff, 3.5);   // blue rim, matches rimLight
  envRim.position.set(0, 5, -10);
  envScene.add(envRim);

  const envFill = new THREE.DirectionalLight(0xaabbee, 1.5);  // cool fill
  envFill.position.set(-8, 3, 10);
  envScene.add(envFill);

  const envHemi = new THREE.HemisphereLight(0x112244, 0x000000, 0.8);
  envScene.add(envHemi);

  scene.environment = pmremGenerator.fromScene(envScene, 0.02).texture;
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

function createStarTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.2, 'rgba(255,255,255,0.7)');
  gradient.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
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

  // 소프트 글로우 텍스처 — 딱딱한 사각형 대신 부드러운 원형 별
  const starTexture = createStarTexture();

  const material = new THREE.PointsMaterial({
    size: 0.3,
    map: starTexture,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
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

  // ── 프로페셔널 컴포지팅 파이프라인 ──
  // 순서: Render → GodRays → ColorGrade → Bloom → DOF → FXAA → Vignette+Grain
  // 이유:
  // - 컬러 그레이딩은 블룸 전에 (톤매핑된 색상이 블룸에 올바르게 피딩)
  // - 비네팅+그레인은 FXAA 후 최종 (그레인이 블룸/AA에 의해 변형되지 않음)

  // 1. RenderPass — 원본 렌더
  composer.addPass(new RenderPass(scene, camera));

  // 2. God Rays — 클린 렌더에서 산란
  godRaysPass = new ShaderPass(GodRaysShader);
  godRaysPass.uniforms.lightPosition.value.set(0.5, 0.9);
  composer.addPass(godRaysPass);

  // 3. 컬러 그레이딩 (Lift/Gamma/Gain만 — 비네팅/그레인 분리)
  colorGradePass = new ShaderPass(ColorGradeShader);
  composer.addPass(colorGradePass);

  // 4. UnrealBloomPass — 그레이딩된 색상 위에 블룸
  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(w, h),
    0.20,  // strength — 동적 범위로 제어
    0.20,  // radius
    0.55   // threshold
  );
  composer.addPass(bloomPass);

  // 5. BokehPass (DOF)
  bokehPass = new BokehPass(scene, camera, {
    focus: 10.0,
    aperture: 0.0003,
    maxblur: 0.0015,
  });
  composer.addPass(bokehPass);

  // 6. FXAA
  fxaaPass = new ShaderPass(FXAAShader);
  fxaaPass.uniforms['resolution'].value.set(
    1 / (w * pixelRatio),
    1 / (h * pixelRatio)
  );
  composer.addPass(fxaaPass);

  // 7. 비네팅 + 필름 그레인 (최종 패스 — 모든 이펙트 위에 깨끗하게 적용)
  vignetteGrainPass = new ShaderPass(VignetteGrainShader);
  composer.addPass(vignetteGrainPass);

  return composer;
}

export function updateScene(delta) {
  if (stars) {
    stars.rotation.y += delta * 0.01;
    stars.rotation.x += delta * 0.005;
  }
  // 필름 그레인 시간 업데이트
  if (vignetteGrainPass) {
    vignetteGrainPass.uniforms.time.value += delta;
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
  // 0.20→0.65: 조용한 구간 어둡게, 클라이맥스 강렬하게
  bloomPass.strength = 0.20 + clamped * 0.45;
  // 고에너지 시 반경 좁혀 집중된 헤일로
  bloomPass.radius = 0.20 - clamped * 0.08;
}

/**
 * DOF 초점 거리를 업데이트합니다.
 * @param {number} focusDistance - 초점 거리 (기본값 15.0)
 */
export function updateDOF(focusDistance = 10.0, aperture = null) {
  if (!bokehPass) return;
  bokehPass.uniforms['focus'].value = focusDistance;
  if (aperture !== null) {
    bokehPass.uniforms['aperture'].value = aperture;
    bokehPass.uniforms['maxblur'].value = Math.min(aperture * 5.0, 0.01);
  } else {
    const normalizedDist = THREE.MathUtils.clamp((focusDistance - 5) / 25, 0, 1);
    bokehPass.uniforms['aperture'].value = 0.0002 + normalizedDist * 0.0003;
  }
}

// 동적 조명용 컬러 상수 — 시네마틱 문라이트 블루 ↔ 텅스텐 앰버
const _coolColor = new THREE.Color(0x1133bb);
const _warmColor = new THREE.Color(0xff9900);
const _tempColor = new THREE.Color();
const _rimCoolColor = new THREE.Color(0x2200aa);
const _rimWarmColor = new THREE.Color(0x0088ff);

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
    // 저에너지: 어둡게 — 긴장감 / 고에너지: 무대 조명 점등
    keyLightRef.intensity = 1.2 + e * 3.0; // 1.2→4.2
  }

  if (rimLightRef) {
    // 저에너지: 림 사라짐 → 피아노가 어둠에 녹아듦 / 고에너지: 실루엣 강조
    rimLightRef.intensity = 0.4 + e * 4.5; // 0.4→4.9
    // 색상 스무스 러프: 딥 인디고 → 일렉트릭 시안
    rimLightRef.color.copy(_rimCoolColor).lerp(_rimWarmColor, e);
  }

  if (pianoSpotRef) {
    pianoSpotRef.angle = Math.PI / 10 + e * Math.PI / 12; // 18→33도
    pianoSpotRef.intensity = 3.0 + e * 5.0; // 3→8 동적
  }

  if (godRaysPass) {
    godRaysPass.uniforms.exposure.value = 0.04 + e * 0.14; // 0.04→0.18
  }
}

/**
 * God Rays 광원 위치를 카메라 기준으로 업데이트합니다.
 * 3D 광원 위치를 화면 UV 좌표로 투영하여 God Rays의 원점을 갱신.
 * @param {THREE.Camera} cam - 현재 카메라
 */
// God Rays 시간적 안정성 — 카메라 이동 시 광선 방향 떨림 방지
const _godRaysTargetPos = new THREE.Vector2(0.5, 0.9);
const _godRaysSmoothPos = new THREE.Vector2(0.5, 0.9);

export function updateGodRaysLightPosition(cam) {
  if (!godRaysPass || !cam) return;
  const lightWorldPos = new THREE.Vector3(0, 15, -10);
  const projected = lightWorldPos.clone().project(cam);
  const u = THREE.MathUtils.clamp((projected.x + 1) / 2, 0.1, 0.9);
  const v = THREE.MathUtils.clamp((projected.y + 1) / 2, 0.1, 0.95);
  _godRaysTargetPos.set(u, v);
  _godRaysSmoothPos.lerp(_godRaysTargetPos, 0.12);
  godRaysPass.uniforms.lightPosition.value.copy(_godRaysSmoothPos);
}

export function getScene() { return scene; }
export function getRenderer() { return renderer; }
