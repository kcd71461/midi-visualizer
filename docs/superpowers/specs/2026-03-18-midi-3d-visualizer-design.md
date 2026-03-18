# 3D MIDI Visualizer — Design Spec

## Overview

웹 브라우저에서 MIDI 파일을 3D 피아노 롤 스타일로 시각화하는 애플리케이션. 노트가 뒤에서 앞으로 날아와 피아노 건반에 도달하면 소리와 함께 빛나는 효과를 보여준다. 우주 배경에서 반투명 글래스 + 네온 글로우 노트 블록이 떠다니는 몰입감 있는 시각화를 목표로 한다.

## Tech Stack

- **Vite** — 빌드 도구, ES 모듈 기반 개발 서버
- **Three.js** — 3D 렌더링
- **@tonejs/midi** — MIDI 파일 파싱
- **Tone.js** — 피아노 사운드폰트 오디오 재생
- **lil-gui** — 경량 UI 컨트롤 패널

## Project Structure

```
midi-visualizer/
├── index.html              # 진입점
├── vite.config.js          # Vite 설정
├── package.json
├── public/
│   ├── midi/               # 내장 샘플 MIDI 파일
│   │   ├── pachelbel-canon.mid
│   │   └── summer.mid
│   └── soundfont/          # 피아노 사운드폰트 (선택)
├── src/
│   ├── main.js             # 앱 초기화, 이벤트 바인딩
│   ├── scene.js            # Three.js 씬, 카메라, 렌더러, 우주 배경
│   ├── piano.js            # 3D 피아노 건반 모델
│   ├── notes.js            # 노트 블록 생성/애니메이션
│   ├── midi-parser.js      # MIDI 파일 로딩 및 파싱
│   ├── audio.js            # Tone.js 사운드폰트 재생, 음소거 토글
│   ├── controls.js         # lil-gui UI 컨트롤
│   └── camera.js           # 카메라 고정/자유 시점 전환
```

## 3D Scene

### 우주 배경

- `Points` 파티클 시스템으로 별 수천 개 배치 (랜덤 위치, 다양한 크기)
- 천천히 회전하는 배경으로 몰입감 부여
- 짙은 남색~검정 그라데이션 기본 배경색

### 피아노 건반

- 씬 하단(가까운 쪽)에 88건반 3D 모델 배치
- 흰 건반 / 검은 건반 구분, 적절한 비율
- 노트 히트 시 해당 건반이 살짝 눌리는 애니메이션 + 글로우 효과

### 노트 블록

- 건반 뒤쪽 멀리서 생성 → 건반 방향(앞쪽)으로 이동
- `MeshStandardMaterial`에 높은 `emissive` + 중간 `opacity`로 글래스+네온 효과 구현 (additive blending 적용으로 정렬 문제 회피)
- 노트 길이 = 블록의 Z축 길이, 음높이 = X축 위치
- 건반에 도달하면 빛이 번쩍이고 사라짐
- 트랙별 색상 구분: 트랙당 별도의 `InstancedMesh` 사용 (일반적으로 4~16개 트랙, 충분히 적은 드로우콜)
- 벨로시티 값을 노트 밝기/투명도에도 반영하여 시각적 풍부함 추가

### 조명

- 앰비언트 라이트 (약한 기본 조명)
- 노트 블록 자체가 emissive로 빛을 발산
- 건반 히트 시 포인트 라이트 순간 발생 (선택적)

### 후처리

- `UnrealBloomPass`로 네온 글로우 블룸 효과
- Additive blending으로 투명도 정렬 문제 회피 — 순서 무관하게 자연스러운 글로우 표현

## MIDI Parsing & Playback Engine

### MIDI 파싱

- `@tonejs/midi` 라이브러리로 MIDI 파일 파싱
- 각 노트의 시작 시간, 길이, 음높이, 벨로시티, 트랙/채널 정보 추출
- 파싱 결과를 내부 데이터 구조로 변환하여 씬과 오디오 양쪽에서 사용

### 재생 타이밍 및 오디오-비주얼 동기화

- `Tone.Transport`를 단일 시간 소스(single source of truth)로 사용
- 오디오: MIDI 로드 시 모든 노트를 `Tone.Transport`에 미리 스케줄링 (pre-scheduling)
- 비주얼: `requestAnimationFrame` 루프에서 `Tone.Transport.seconds`를 읽어 노트 위치 계산
- 이 분리를 통해 오디오는 정확한 타이밍 유지, 비주얼은 프레임 기반 렌더링
- 재생 속도: `Tone.Transport.bpm` 조절 (0.25x ~ 2.0x)
- 일시정지: `Tone.Transport.pause()` / `Tone.Transport.start()`

### 오디오 재생

- Tone.js의 `Sampler`로 피아노 사운드폰트 로딩
- 사운드폰트 소스: `tonejs-instruments` 패키지 (개별 노트 샘플 제공)
- 벨로시티 값을 볼륨에 반영
- 음소거 토글: Tone.js의 마스터 볼륨 on/off
- 브라우저 오디오 정책: 첫 사용자 클릭/터치 시 `Tone.start()` 호출하여 AudioContext 활성화

### 파일 로딩

- 내장 샘플: `fetch`로 `public/midi/`에서 로드
- 사용자 파일: `<input type="file">` + 드래그 앤 드롭 영역
- 파일 로드 시 기존 씬 초기화 후 새 곡 데이터로 교체
- 내장 샘플: 파헬벨 캐논, 기쿠지로의 여름(Summer)
- MIDI 채널 10 (퍼커션)은 기본 숨김 처리 (트랙 관리에서 수동 표시 가능)

## UI Controls

### lil-gui 패널 (우측 상단)

- **재생**: 재생/일시정지 버튼, 시간 표시 (현재/전체)
- **속도**: 0.25x ~ 2.0x 슬라이더
- **음소거**: 토글 체크박스
- **볼륨**: 슬라이더 (0~100%)

### 트랙 관리

- 트랙별 표시/숨기기 체크박스
- 트랙별 색상 변경 컬러 피커
- 트랙 이름 표시 (MIDI에 이름이 있으면 사용, 없으면 "Track 1" 등)

### 카메라

- 고정/자유 토글 버튼
- 고정 모드: 기본 비스듬히 내려다보는 앵글
- 자유 모드: `OrbitControls`로 마우스 드래그 회전, 스크롤 줌
- 카메라 프리셋: "정면", "위에서", "측면" 버튼으로 원클릭 전환

### 시간 탐색

- 하단에 가로 프로그레스 바
- 클릭/드래그로 원하는 위치로 점프
- 현재 위치 인디케이터

### 파일 선택

- 초기 화면에 드롭존 + 샘플 곡 선택 버튼 2개 (캐논, Summer)

## Application State

```
idle → loading → ready → playing ⇄ paused
                           ↓
                        seeking → playing
```

- **idle**: 초기 상태, 파일 선택 화면 표시
- **loading**: MIDI 파일 파싱 + 사운드폰트 로딩 중, 로딩 인디케이터 표시
- **ready**: 로딩 완료, 재생 대기, 3D 씬에 노트 배치 완료
- **playing**: `Tone.Transport` 재생 중, 노트 애니메이션 활성
- **paused**: 일시정지, 씬 정지 상태 유지
- **seeking**: 탐색 중 — 모든 활성 오디오 정지, 노트 블록 초기화, 새 위치에서 오디오 재스케줄링

파일 변경 시: 현재 상태와 무관하게 → `idle` → `loading` → `ready` (기존 Three.js geometry/material/Tone.js 리소스 dispose 후 교체)

## Performance

- 트랙당 `InstancedMesh` 사용 (4~16개 트랙 = 4~16 드로우콜, 충분히 효율적)
- 화면 밖(이미 지나간) 노트는 인스턴스에서 제거
- 앞으로 일정 범위 내의 노트만 활성화 (시간 기반 컬링)
- 파일 전환 시 geometry, material, texture, Tone.js 리소스 명시적 dispose로 메모리 누수 방지
- 윈도우 리사이즈 시 렌더러 크기 + 카메라 aspect ratio 업데이트

## Error Handling

- 잘못된 MIDI 파일: 파싱 실패 시 에러 메시지 표시, idle 상태 유지
- WebGL 미지원: 지원 여부 체크 후 안내 메시지 표시
- 사운드폰트 로딩 실패: 시각화만 동작, 소리 없이 재생 (음소거 상태로 폴백)

## Browser Support

- WebGL2 기반, 모던 브라우저 대상 (Chrome, Firefox, Safari, Edge)
- 모바일은 우선 지원 범위 밖 (추후 고려)
