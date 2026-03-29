# Union SDK

대학생 슈퍼앱 **Union**의 미니앱 개발을 위한 Bridge SDK 및 CLI 도구 모노레포입니다.

퍼블리셔(개발자, 학생회, 동아리)가 React 기반 미니앱을 만들면, Union 네이티브 앱의 WebView 위에서 실행됩니다. 이 SDK는 미니앱과 네이티브 기능 사이의 브릿지 역할을 합니다.

## 구조

```
union-sdk/
├── packages/
│   ├── sdk/       # @union-miniapp/sdk — Bridge SDK
│   └── cli/       # @union-miniapp/cli — CLI 도구
└── templates/
    └── default/   # 미니앱 스타터 템플릿
```

## 시작하기

### 요구 사항

- Node.js >= 18

### 설치

```bash
git clone https://github.com/dku-union/union-sdk.git
cd union-sdk
npm install
npm run build
```

### 새 미니앱 만들기

```bash
npx union create my-app
cd my-app
npm install
npx union dev
```

`union.config.json`이 자동 생성됩니다:

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

### 기본 사용

```ts
import Union from '@union-miniapp/sdk';

// 인증
const { code } = await Union.auth.login();
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
Union.device.vibrate('medium');

// 저장소
await Union.storage.set('key', { value: 'data' });
const data = await Union.storage.get('key');

// HTTP 요청 (mTLS 자동 적용)
const result = await Union.request({
  url: '/api/data',
  method: 'GET',
});

// 애널리틱스
Union.analytics.trackEvent('button_click', { screen: 'home' });

// 이벤트 구독
Union.on('push-received', (data) => {
  console.log('푸시 알림:', data);
});
```

### 모듈 요약

| 모듈 | 메서드 | 설명 |
|------|--------|------|
| `auth` | `login()`, `logout()`, `getProfile()` | 사용자 인증 |
| `ui` | `showToast()`, `showModal()`, `setNavigationBar()`, `close()` | 네이티브 UI |
| `device` | `getLocation()`, `scanQRCode()`, `vibrate()`, `getDeviceInfo()` | 디바이스 기능 |
| `storage` | `get()`, `set()`, `remove()`, `clear()` | 키-값 저장소 |
| `analytics` | `trackEvent()`, `trackScreen()` | 이벤트 추적 |
| `request()` | — | mTLS HTTP 요청 |

### 권한 (Permissions)

`union.config.json`의 `permissions` 필드에 필요한 권한을 선언합니다:

| 권한 | 설명 |
|------|------|
| `user.profile` | 닉네임, 프로필 이미지 |
| `user.email` | 이메일 주소 |
| `user.university` | 대학교 정보 |
| `device.location` | GPS 위치 |
| `device.camera` | 카메라 (QR 스캔 등) |
| `device.storage` | 파일 시스템 접근 |

## CLI 명령어

| 명령어 | 설명 |
|--------|------|
| `union create <name>` | 템플릿에서 새 미니앱 생성 |
| `union dev` | Mock Bridge 포함 개발 서버 실행 |
| `union build` | 프로덕션 빌드 + 매니페스트 생성 |
| `union validate` | 필수 파일, 매니페스트, 보안 검사 |
| `union upload` | 빌드 결과물 업로드 (준비 중) |

## 개발

```bash
npm run build          # 전체 빌드
npm run build:sdk      # SDK만 빌드
npm run build:cli      # CLI만 빌드
npm run dev            # SDK watch 모드
npm run clean          # 빌드 산출물 정리
```

## 아키텍처

```
미니앱 (React in WebView)
    ↕ Union SDK (postMessage)
네이티브 브릿지 핸들러 (Swift/Kotlin)
    ↕ 네이티브 API (카메라, 위치, 저장소 등)
```

- 브라우저 환경에서는 `MockAdapter`가 자동 활성화되어 네이티브 없이 개발 가능
- iOS WebView에서는 `WKWebView.postMessage`를 통해 네이티브와 통신
- `window.Union`으로 전역 접근 가능

## 라이선스

MIT
