# union-sdk

> **Union** 대학생 전용 미니앱 플랫폼의 Bridge SDK 및 CLI 도구 모노레포입니다.  
> 단국대학교 캡스톤디자인 프로젝트

---

## 개요

퍼블리셔(개발자, 학생회, 동아리)가 React 기반 미니앱을 만들 때 사용하는 SDK와 CLI 도구입니다.  
Union 네이티브 앱의 WebView 위에서 실행되며, `postMessage` 기반 JavaScript Bridge를 통해 네이티브 기능에 접근합니다.

## 패키지 구조

```
union-sdk/
├── packages/
│   ├── sdk/          # @union-miniapp/sdk — Bridge SDK 코어
│   └── cli/          # @union-miniapp/cli — 프로젝트 생성/빌드/배포 CLI
└── templates/
    └── default/      # 미니앱 스타터 템플릿 (React + Vite)
```

## 빠른 시작

### 요구사항

- Node.js >= 18

### 새 미니앱 만들기

```bash
npx @union-miniapp/cli create my-app
cd my-app
npm install
npx union dev
```

`union.config.json`이 자동 생성됩니다.

```json
{
  "appId": "com.union.my-app",
  "name": "My Union App",
  "version": "1.0.0",
  "category": "utility",
  "permissions": ["user.profile"],
  "build": {
    "entry": "src/main.tsx",
    "outDir": "dist",
    "maxBundleSize": "2MB"
  }
}
```

## SDK 사용법

### 설치

```bash
npm install @union-miniapp/sdk
```

### 기본 예시

```ts
import Union from '@union-miniapp/sdk';

// 인증
const profile = await Union.auth.getProfile();

// UI
Union.ui.showToast({ message: '안녕하세요!' });
const { confirmed } = await Union.ui.showModal({
  title: '확인',
  content: '진행하시겠습니까?',
});

// 디바이스
const location = await Union.device.getLocation();
const qr = await Union.device.scanQRCode();

// 저장소 (미니앱별 격리)
await Union.storage.set('key', { value: 'data' });
const data = await Union.storage.get('key');

// HTTP 요청 (mTLS 자동 적용)
const result = await Union.request({ url: '/api/data', method: 'GET' });

// 애널리틱스
Union.analytics.trackEvent('button_click', { screen: 'home' });

// 푸시 이벤트 구독
Union.on('push-received', (data) => console.log(data));
```

### API 모듈 요약

| 모듈 | 주요 메서드 | 설명 |
|------|-------------|------|
| `auth` | `login()`, `logout()`, `getProfile()` | 사용자 인증 및 프로필 조회 |
| `ui` | `showToast()`, `showModal()`, `setNavigationBar()`, `close()` | 네이티브 UI 제어 |
| `device` | `getLocation()`, `scanQRCode()`, `vibrate()`, `getDeviceInfo()` | 디바이스 기능 |
| `storage` | `get()`, `set()`, `remove()`, `clear()` | 앱별 격리 Key-Value 저장소 |
| `analytics` | `trackEvent()`, `trackScreen()` | 이벤트 및 화면 추적 |
| `request()` | — | mTLS 자동 적용 HTTP 요청 |

### 권한 선언 (Permissions)

`union.config.json`의 `permissions` 필드에 필요한 권한을 미리 선언해야 합니다.

| 권한 | 설명 | 사용자 동의 |
|------|------|-------------|
| `user.profile` | 닉네임, 프로필 이미지 | 자동 (기본 제공) |
| `user.email` | 이메일 주소 | 명시적 동의 필요 |
| `user.university` | 대학교 정보 | 명시적 동의 필요 |
| `device.location` | GPS 위치 | 명시적 동의 필요 |
| `device.camera` | 카메라 (QR 스캔) | 명시적 동의 필요 |
| `device.storage` | 파일 시스템 접근 | 자동 (앱별 격리) |

## CLI 명령어

| 명령어 | 설명 |
|--------|------|
| `union create <name>` | 스타터 템플릿으로 새 미니앱 생성 |
| `union dev` | Mock Bridge 포함 개발 서버 실행 |
| `union build` | 프로덕션 빌드 + 매니페스트 생성 |
| `union validate` | 필수 파일, 매니페스트, 보안 검사 |
| `union upload` | 빌드 결과물 업로드 (준비 중) |

> `union dev` 실행 시 브라우저 환경에서는 `MockAdapter`가 자동 활성화되어 네이티브 앱 없이도 개발할 수 있습니다.

## Bridge 동작 원리

```
미니앱 (React in WebView)
    ↕  Union SDK (window.postMessage)
Native Bridge Handler (Swift / Kotlin)
    ↕  네이티브 API (카메라, 위치, Keychain 등)
```

- iOS: `WKWebView.postMessage` → `BridgeHandler` → 각 Native 모듈
- 브라우저: `MockAdapter`가 Bridge 응답을 시뮬레이션
- `window.Union`으로 전역 접근 가능

## 개발

```bash
git clone https://github.com/dku-union/union-sdk.git
cd union-sdk
npm install
npm run build        # 전체 빌드
npm run build:sdk    # SDK만 빌드
npm run build:cli    # CLI만 빌드
npm run dev          # SDK watch 모드
npm run clean        # 빌드 산출물 정리
```

## 라이선스

MIT
