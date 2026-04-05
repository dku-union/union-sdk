# Union SDK — Native Analytics Integration Guide

> **대상 독자**: iOS / Android 네이티브 개발자  
> **SDK 버전**: 1.0.0+  
> **최종 수정**: 2026-04-05

---

## 목차

1. [개요 및 설계 원칙](#1-개요-및-설계-원칙)
2. [Bridge 메시지 프로토콜](#2-bridge-메시지-프로토콜)
3. [이벤트 스키마](#3-이벤트-스키마)
4. [네이티브 처리 책임](#4-네이티브-처리-책임)
5. [JWT 사용자 식별](#5-jwt-사용자-식별)
6. [이벤트 보강 (Enrichment)](#6-이벤트-보강-enrichment)
7. [PII 필터링](#7-pii-필터링)
8. [이벤트 버퍼 및 배치 전송](#8-이벤트-버퍼-및-배치-전송)
9. [오프라인 큐 (Disk Queue)](#9-오프라인-큐-disk-queue)
10. [백엔드 HTTP API 명세](#10-백엔드-http-api-명세)
11. [라이프사이클 이벤트 (자동 수집)](#11-라이프사이클-이벤트-자동-수집)
12. [iOS 구현 가이드 (Swift)](#12-ios-구현-가이드-swift)
13. [Android 구현 가이드 (Kotlin)](#13-android-구현-가이드-kotlin)
14. [보안 체크리스트](#14-보안-체크리스트)

---

## 1. 개요 및 설계 원칙

### 왜 네이티브에서 처리하는가

| 이유 | 상세 |
|------|------|
| **신뢰성** | JS는 WebView 닫힘/새로고침 시 이벤트 유실 가능. 네이티브 큐는 앱 종료 전 flush 보장 |
| **배터리 효율** | 개별 HTTP 요청 대신 배치로 묶어 전송 → 네트워크 웨이크업 횟수 최소화 |
| **오프라인 대응** | 네트워크 없을 때 Disk Queue에 저장, 복귀 시 자동 재전송 |
| **크로스 미니앱 세션** | 여러 미니앱 간 세션 연속성은 네이티브만 보장 가능 |
| **데이터 무결성** | 미니앱이 자신의 analytics 데이터를 위변조 불가 |
| **PII 보호** | 2차 PII 필터링을 네이티브 레이어에서 강제 적용 |

### 이벤트 흐름

```
미니앱 JS
  │  Union.analytics.trackEvent('join_club', {...})
  ▼
SDK (analytics.ts)
  │  PII 1차 마스킹 + 이벤트명 유효성 검사
  │  bridge.fire('analytics', 'track', TrackingPayload)
  ▼
BridgeCore.fire() → postMessage → Native
  │
  ▼
[Native Analytics Handler]
  ├─ (1) PII 2차 필터링
  ├─ (2) JWT에서 userId 추출 → SHA-256 해시
  ├─ (3) 이벤트 보강 (sessionId, deviceInfo, appVersion ...)
  ├─ (4) In-Memory Buffer에 적재
  └─ (5) Flush 조건 충족 시 → Batch HTTP POST
              │
              └─ 실패 시 → Disk Queue → 재시도
```

---

## 2. Bridge 메시지 프로토콜

### SDK → Native 메시지 구조

JS SDK는 `window.webkit.messageHandlers.union.postMessage(json)` (iOS) 또는 `window.UnionBridge.postMessage(json)` (Android) 로 전송합니다.

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "module": "analytics",
  "action": "track",
  "sdkVersion": "1.0.0",
  "timestamp": 1712323200000,
  "params": {
    "eventType": "custom",
    "eventName": "join_club",
    "timestamp": 1712323200000,
    "params": {
      "clubId": "soccer_001",
      "source": "home"
    }
  }
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `id` | string (UUID v4) | 요청 고유 식별자. fire-and-forget 이므로 응답 불필요 |
| `module` | string | 항상 `"analytics"` |
| `action` | string | `"track"` 또는 `"setUserProperty"` |
| `sdkVersion` | string | SDK semver (호환성 검사용) |
| `timestamp` | number | 메시지 생성 시각 (epoch ms) |
| `params` | object | 액션별 페이로드 (하단 참조) |

### Analytics 액션 목록

| action | 설명 | 응답 필요 여부 |
|--------|------|----------------|
| `track` | 모든 트래킹 이벤트 (단일 진입점) | ❌ fire-and-forget |
| `setUserProperty` | 사용자 속성 설정 | ❌ fire-and-forget |

---

## 3. 이벤트 스키마

### 3.1 `action: "track"` 페이로드

```typescript
interface TrackPayload {
  eventType: 'lifecycle' | 'screen' | 'performance' | 'error' | 'custom' | 'conversion';
  eventName: string;          // 이벤트 식별자 (예: "join_club", "js_error")
  timestamp: number;          // client-side epoch ms (서버 시각과 비교용)
  params?: Record<string, string | number | boolean>; // 이벤트별 파라미터
}
```

### 3.2 이벤트 타입별 상세

#### `eventType: "screen"` — 화면 전환

```json
{
  "eventType": "screen",
  "eventName": "screen_view",
  "timestamp": 1712323200000,
  "params": {
    "pageName": "/club/soccer_001",
    "referrer": "/home"
  }
}
```

| params 키 | 타입 | 설명 |
|-----------|------|------|
| `pageName` | string | 이동한 화면 경로 (최대 200자) |
| `referrer` | string | 이전 화면 경로 (없으면 빈 문자열) |

---

#### `eventType: "performance"` — 성능 지표

```json
{
  "eventType": "performance",
  "eventName": "performance_metric",
  "timestamp": 1712323200000,
  "params": {
    "metricName": "first_contentful_paint",
    "value": 342,
    "unit": "ms"
  }
}
```

| `metricName` | `unit` | 설명 |
|--------------|--------|------|
| `first_contentful_paint` | ms | FCP — 첫 번째 컨텐츠 렌더링 시간 |
| `largest_contentful_paint` | ms | LCP — 가장 큰 컨텐츠 렌더링 시간 |
| `dom_content_loaded` | ms | DOMContentLoaded 이벤트 시간 |
| `page_load` | ms | load 이벤트 시간 |
| `transfer_size` | bytes | 네트워크 전송 크기 |
| `bridge_latency` | ms | invoke() 요청-응답 왕복 시간 (20% 샘플링) |

---

#### `eventType: "error"` — JS 에러

**자동 수집 (window.onerror)**
```json
{
  "eventType": "error",
  "eventName": "js_error",
  "timestamp": 1712323200000,
  "params": {
    "message": "Cannot read properties of undefined",
    "filename": "https://cdn.union.app/mini/soccer/main.js",
    "lineno": 42,
    "colno": 17,
    "fatal": 0
  }
}
```

**자동 수집 (unhandledrejection)**
```json
{
  "eventType": "error",
  "eventName": "unhandled_rejection",
  "params": {
    "message": "NetworkError: fetch failed",
    "stack": "Error: ...\n    at fetchData (main.js:100)\n…[truncated]",
    "fatal": 0
  }
}
```

**수동 수집 (trackError)**
```json
{
  "eventType": "error",
  "eventName": "tracked_error",
  "params": {
    "message": "결제 처리 실패",
    "fatal": 1,
    "screen": "payment",
    "step": "confirm"
  }
}
```

| params 키 | 타입 | 설명 |
|-----------|------|------|
| `message` | string | 에러 메시지 (최대 500자) |
| `filename` | string? | 에러 발생 파일 URL |
| `lineno` | number? | 에러 발생 줄 번호 |
| `colno` | number? | 에러 발생 열 번호 |
| `stack` | string? | 스택 트레이스 (최대 1,000자, `…[truncated]` 로 자름) |
| `fatal` | 0 \| 1 | 1이면 앱이 복구 불가능한 치명적 에러 |

---

#### `eventType: "custom"` — 개발자 정의 이벤트

```json
{
  "eventType": "custom",
  "eventName": "join_club",
  "timestamp": 1712323200000,
  "params": {
    "clubId": "soccer_001",
    "source": "home_banner"
  }
}
```

이벤트명 규칙: `/^[a-z][a-z0-9_]{0,99}$/` (SDK에서 강제 검증, 위반 시 전송 차단)

---

#### `eventType: "conversion"` — 전환 이벤트

```json
{
  "eventType": "conversion",
  "eventName": "conversion",
  "timestamp": 1712323200000,
  "params": {
    "conversionType": "ticket_purchase",
    "value": 5000,
    "currency": "KRW",
    "label": "2024_sports_festival"
  }
}
```

| params 키 | 타입 | 설명 |
|-----------|------|------|
| `conversionType` | string | 전환 타입 (`[a-z][a-z0-9_]+`) |
| `value` | number? | 전환 금액 |
| `currency` | string? | 통화 코드 (ISO 4217) |
| `label` | string? | 전환 레이블 (최대 200자) |

---

### 3.3 `action: "setUserProperty"` 페이로드

```json
{
  "module": "analytics",
  "action": "setUserProperty",
  "params": {
    "key": "major",
    "value": "소프트웨어학과"
  }
}
```

- `key`: 속성 키 (`[a-zA-Z][a-zA-Z0-9_]{0,49}`, SDK에서 강제 검증)
- `value`: string | number | boolean

네이티브에서 세션 단위 Map에 저장하고, 이후 모든 이벤트에 `userProperties` 필드로 첨부.

---

## 4. 네이티브 처리 책임

SDK는 이벤트를 전달하는 것까지만 책임집니다. 이후는 **전적으로 네이티브의 책임**입니다.

```
[필수]
✅ PII 2차 필터링 (이메일, 전화번호, 주민번호, 카드번호 마스킹)
✅ JWT에서 userId 추출 → SHA-256(userId + appId) 해시
✅ 이벤트 보강 (sessionId, superappSessionId, appId, appVersion, 기기정보)
✅ In-Memory Buffer 관리 (최대 100개)
✅ Batch HTTP 전송 (≥20개 누적 OR 30초 타이머 OR 백그라운드 진입)
✅ 실패 시 Disk Queue 저장 및 재시도
✅ 앱 라이프사이클 이벤트 자동 수집 (app_open, app_close, app_pause, app_resume)

[권장]
⬜ 이벤트 순서 보장 (sequenceNumber)
⬜ 중복 전송 방지 (idempotency key)
⬜ 배치 전송 실패 시 지수 백오프 재시도 (최대 3회)
```

---

## 5. JWT 사용자 식별

### 기본 원칙

- 미니앱(JS)에는 **절대로** userId를 원본으로 노출하지 않습니다.
- 네이티브에서 JWT Access Token의 `sub` 클레임을 읽어 해시합니다.
- JWT가 없는(미로그인) 상태에서는 `userId = null`로 전송합니다.

### JWT Claim 구조 (참고)

```json
{
  "sub": "user_12345",
  "nickname": "홍길동",
  "university": "단국대학교",
  "exp": 1712326800,
  "iat": 1712323200
}
```

### userId 해시 생성 방법

```
hashedUserId = SHA-256( sub + ":" + appId )
```

예시 (Swift):
```swift
import CryptoKit

func hashUserId(sub: String, appId: String) -> String {
    let input = "\(sub):\(appId)"
    let data = Data(input.utf8)
    let hash = SHA256.hash(data: data)
    return hash.compactMap { String(format: "%02x", $0) }.joined()
}
// 결과: "a3f1b2c4..." (64자 hex)
```

### 토큰 만료/갱신 처리

- 액세스 토큰 갱신 시 `hashedUserId`는 변하지 않음 (`sub`가 동일하므로).
- 로그아웃 시 `userId = null`, 새 `sessionId` 발급.

---

## 6. 이벤트 보강 (Enrichment)

네이티브에서 모든 이벤트에 아래 필드를 추가하여 최종 이벤트를 구성합니다.

### 최종 이벤트 구조

```json
{
  // JS에서 전달된 원본 데이터
  "eventType": "custom",
  "eventName": "join_club",
  "clientTimestamp": 1712323200000,
  "params": {
    "clubId": "soccer_001"
  },

  // 네이티브 자동 보강
  "sessionId": "sess_abc123def456",
  "superappSessionId": "app_sess_xyz789",
  "hashedUserId": "a3f1b2c4e5d6f7a8...",
  "appId": "com.union.soccer",
  "appVersion": "1.2.0",
  "sdkVersion": "1.0.0",
  "platform": "ios",
  "osVersion": "17.4",
  "deviceModel": "iPhone16,2",
  "sequenceNumber": 42,
  "serverTimestamp": 1712323200123,

  // setUserProperty 로 설정된 값들
  "userProperties": {
    "major": "소프트웨어학과",
    "grade": 3
  }
}
```

### 필드 정의

| 필드 | 타입 | 설명 |
|------|------|------|
| `sessionId` | string | 미니앱 단위 세션 UUID. 미니앱 실행마다 새로 발급 |
| `superappSessionId` | string | 슈퍼앱 전체 세션 UUID. 앱 포그라운드 복귀마다 갱신 |
| `hashedUserId` | string? | SHA-256(sub:appId). 미로그인 시 null |
| `appId` | string | `union.config.json`의 appId (bridge request에서 파악 가능) |
| `appVersion` | string | 미니앱 버전 (`union.config.json`의 version) |
| `sdkVersion` | string | SDK 버전 (BridgeRequest.sdkVersion) |
| `platform` | "ios" \| "android" | 실행 플랫폼 |
| `osVersion` | string | iOS/Android OS 버전 |
| `deviceModel` | string | 기기 모델명 (iOS: `UIDevice.current.model`, Android: `Build.MODEL`) |
| `sequenceNumber` | number | 세션 내 이벤트 순서 (0부터 증가). 이벤트 유실 감지용 |
| `clientTimestamp` | number | JS에서 전달된 원본 타임스탬프 (epoch ms) |
| `serverTimestamp` | number | 네이티브에서 추가하는 서버 시각 |
| `userProperties` | object | setUserProperty 로 설정된 세션 단위 사용자 속성 |

---

## 7. PII 필터링

### 2중 방어 전략

SDK(JS)에서 1차 마스킹, 네이티브에서 2차 마스킹. JS 코드는 조작 가능하므로 **네이티브 필터링이 최종 방어선**입니다.

### 필터링 대상 패턴

| 항목 | 패턴 | 마스킹 값 |
|------|------|-----------|
| 이메일 | `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` | `[REDACTED_EMAIL]` |
| 전화번호 | `\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}` | `[REDACTED_PHONE]` |
| 주민등록번호 | `\d{6}-[1-4]\d{6}` | `[REDACTED_RRNO]` |
| 카드번호 | `\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}` | `[REDACTED_CARD]` |

### 필터링 범위

- `params` 의 모든 `string` 값
- `userProperties` 의 모든 `string` 값
- `params.message`, `params.stack` (에러 이벤트)

### 필터링 제외 대상

- `eventName`, `eventType` — SDK에서 형식 검증 완료
- `number`, `boolean` 타입 값 — PII 없음
- `clientTimestamp`, `sequenceNumber` 등 시스템 생성 값

---

## 8. 이벤트 버퍼 및 배치 전송

### In-Memory Buffer 스펙

```
최대 크기: 100개
초과 시:  오래된 이벤트부터 제거 (FIFO drop)
스레드:   단일 직렬 큐 (iOS: DispatchQueue, Android: SingleThreadExecutor)
```

### Flush 조건 (OR 조건)

| 조건 | 설명 |
|------|------|
| `buffer.count >= 20` | 이벤트 20개 누적 시 즉시 전송 |
| 30초 타이머 | 30초마다 버퍼에 이벤트가 있으면 전송 |
| `app:pause` | 백그라운드 진입 직전 즉시 전송 (iOS: `applicationWillResignActive`) |
| `app:destroy` | 앱 종료 직전 동기 전송 |
| 네트워크 복귀 | 오프라인 → 온라인 전환 시 Disk Queue + 현재 Buffer 전송 |

### 배치 HTTP 요청 구조

```
POST /api/v1/analytics/events
Content-Type: application/json
Authorization: Bearer <access_token>    ← JWT 액세스 토큰

Body: { "events": [ ...EnrichedEvent[] ] }
```

최대 배치 크기: 이벤트 100개 OR 1MB (초과 시 분할 전송)

---

## 9. 오프라인 큐 (Disk Queue)

### 개요

네트워크 요청 실패 시 이벤트를 디스크에 저장하고, 네트워크 복귀 시 재전송합니다.

### iOS 구현 권장

```swift
// Core Data 또는 SQLite (FMDB) 사용 권장
// UserDefaults 는 용량 제한으로 부적합

struct OfflineEvent: Codable {
    let id: String          // UUID
    let payload: Data       // JSON 직렬화된 EnrichedEvent[]
    let createdAt: Date
    let retryCount: Int     // 최대 3회
}
```

### 재시도 전략

```
실패 즉시 → Disk Queue 저장
1차 재시도: 1분 후
2차 재시도: 5분 후
3차 재시도: 30분 후
3회 초과:   이벤트 폐기 + 에러 로그
```

### 보존 기간 및 용량

```
최대 보존: 7일 (이후 자동 삭제)
최대 용량: 10MB (초과 시 오래된 배치부터 삭제)
```

---

## 10. 백엔드 HTTP API 명세

> **백엔드 개발자 (조성빈)에게 전달**

### POST /api/v1/analytics/events

#### 요청

```
POST /api/v1/analytics/events
Host: api.union.app
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
X-Union-AppId: com.union.soccer          ← 미니앱 식별
X-Union-SDKVersion: 1.0.0
X-Request-ID: 550e8400-e29b-41d4-a716-446655440000  ← 중복 방지
```

```json
{
  "events": [
    {
      "eventType": "custom",
      "eventName": "join_club",
      "clientTimestamp": 1712323200000,
      "serverTimestamp": 1712323200123,
      "params": {
        "clubId": "soccer_001"
      },
      "sessionId": "sess_abc123",
      "superappSessionId": "app_sess_xyz789",
      "hashedUserId": "a3f1b2c4e5d6...",
      "appId": "com.union.soccer",
      "appVersion": "1.2.0",
      "sdkVersion": "1.0.0",
      "platform": "ios",
      "osVersion": "17.4",
      "deviceModel": "iPhone16,2",
      "sequenceNumber": 42,
      "userProperties": {
        "major": "소프트웨어학과"
      }
    }
  ]
}
```

#### 응답

**성공 (200 OK)**
```json
{ "accepted": 1, "rejected": 0 }
```

**부분 실패 (207 Multi-Status)**
```json
{
  "accepted": 8,
  "rejected": 2,
  "errors": [
    { "index": 3, "code": "INVALID_APP_ID", "message": "appId not registered" }
  ]
}
```

**서버 오류 (500 / 503)** → 전체 배치를 Disk Queue에 저장 후 재시도

#### 응답 코드별 처리

| HTTP Status | 처리 방법 |
|-------------|-----------|
| 200 | 성공, 버퍼 클리어 |
| 207 | 거절된 이벤트만 폐기, 나머지 성공 처리 |
| 401 | JWT 갱신 후 1회 재시도 |
| 429 | Retry-After 헤더 대기 후 재시도 |
| 500/503 | Disk Queue 저장, 지수 백오프 재시도 |
| 기타 4xx | 이벤트 폐기 (재시도 무의미) |

---

## 11. 라이프사이클 이벤트 (자동 수집)

JS가 아닌 **네이티브에서 직접 생성**하는 이벤트입니다. SDK의 `track` 액션과 동일한 포맷으로 배치에 포함합니다.

### 이벤트 목록

| eventName | 트리거 시점 | 주요 params |
|-----------|-------------|-------------|
| `app_open` | 미니앱 WebView 로드 완료 | `source: 'home' \| 'search' \| 'notification' \| 'deeplink'` |
| `app_close` | WebView dismiss/pop | `session_duration_ms: number` |
| `app_pause` | 앱 백그라운드 전환 | — |
| `app_resume` | 앱 포그라운드 복귀 | `background_duration_ms: number` |

### iOS 트리거 포인트

```swift
// app_open: WKNavigationDelegate
func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    trackLifecycle("app_open", params: ["source": openSource])
}

// app_close: WKWebView dismiss 직전
func miniAppWillClose() {
    let duration = Date().timeIntervalSince(sessionStartTime) * 1000
    trackLifecycle("app_close", params: ["session_duration_ms": Int(duration)])
}

// app_pause: UIApplicationDelegate
func applicationWillResignActive(_ application: UIApplication) {
    trackLifecycle("app_pause", params: [:])
    analyticsManager.flushImmediate()  // 백그라운드 진입 전 즉시 전송
}

// app_resume: UIApplicationDelegate
func applicationDidBecomeActive(_ application: UIApplication) {
    let bgDuration = Date().timeIntervalSince(backgroundEnteredAt) * 1000
    trackLifecycle("app_resume", params: ["background_duration_ms": Int(bgDuration)])
}
```

---

## 12. iOS 구현 가이드 (Swift)

### 12.1 Bridge 핸들러에서 analytics 처리

```swift
// WKScriptMessageHandler 구현
extension MiniAppViewController: WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard message.name == "union",
              let body = message.body as? String,
              let data = body.data(using: .utf8),
              let bridgeRequest = try? JSONDecoder().decode(BridgeRequest.self, from: data)
        else { return }

        if bridgeRequest.module == "analytics" {
            AnalyticsManager.shared.handle(request: bridgeRequest, context: self.miniAppContext)
        }
        // 다른 모듈 처리...
    }
}
```

### 12.2 AnalyticsManager 구조

```swift
final class AnalyticsManager {
    static let shared = AnalyticsManager()

    private let queue = DispatchQueue(label: "com.union.analytics", qos: .utility)
    private var buffer: [EnrichedEvent] = []
    private var flushTimer: DispatchSourceTimer?
    private var userProperties: [String: AnyCodable] = [:]

    private init() {
        startFlushTimer()
        observeAppLifecycle()
    }

    func handle(request: BridgeRequest, context: MiniAppContext) {
        queue.async {
            switch request.action {
            case "track":
                guard let payload = request.params as? TrackPayload else { return }
                let enriched = self.enrich(payload, context: context)
                self.buffer(enriched)

            case "setUserProperty":
                guard let key = request.params?["key"] as? String,
                      let value = request.params?["value"] else { return }
                self.userProperties[key] = AnyCodable(value)

            default:
                break
            }
        }
    }

    // MARK: - Enrichment

    private func enrich(_ payload: TrackPayload, context: MiniAppContext) -> EnrichedEvent {
        let filtered = filterPII(payload)

        return EnrichedEvent(
            eventType: filtered.eventType,
            eventName: filtered.eventName,
            clientTimestamp: filtered.timestamp,
            serverTimestamp: Int64(Date().timeIntervalSince1970 * 1000),
            params: filtered.params,
            sessionId: context.sessionId,
            superappSessionId: SuperappSession.shared.sessionId,
            hashedUserId: hashUserId(context: context),
            appId: context.appId,
            appVersion: context.appVersion,
            sdkVersion: context.sdkVersion,
            platform: "ios",
            osVersion: UIDevice.current.systemVersion,
            deviceModel: deviceModel(),
            sequenceNumber: context.nextSequenceNumber(),
            userProperties: userProperties
        )
    }

    // MARK: - PII Filtering

    private func filterPII(_ payload: TrackPayload) -> TrackPayload {
        var filtered = payload
        filtered.params = payload.params?.mapValues { value in
            if let str = value as? String {
                return piiRegexes.reduce(str) { $0.replacingOccurrences(
                    of: $1.pattern,
                    with: $1.replacement,
                    options: .regularExpression
                )}
            }
            return value
        }
        return filtered
    }

    private let piiRegexes: [(pattern: String, replacement: String)] = [
        (#"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"#, "[REDACTED_EMAIL]"),
        (#"\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}"#,               "[REDACTED_PHONE]"),
        (#"\d{6}-[1-4]\d{6}"#,                               "[REDACTED_RRNO]"),
        (#"\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}"#,        "[REDACTED_CARD]"),
    ]

    // MARK: - Buffer & Flush

    private func buffer(_ event: EnrichedEvent) {
        if buffer.count >= 100 { buffer.removeFirst() }  // FIFO drop
        buffer.append(event)
        if buffer.count >= 20 { flush() }
    }

    private func startFlushTimer() {
        flushTimer = DispatchSource.makeTimerSource(queue: queue)
        flushTimer?.schedule(deadline: .now() + 30, repeating: 30)
        flushTimer?.setEventHandler { [weak self] in self?.flush() }
        flushTimer?.resume()
    }

    func flushImmediate() {
        queue.sync { self.flush() }
    }

    private func flush() {
        guard !buffer.isEmpty else { return }
        let batch = Array(buffer.prefix(100))
        buffer.removeFirst(min(batch.count, buffer.count))

        sendBatch(batch) { [weak self] result in
            if case .failure = result {
                self?.diskQueue.enqueue(batch)
            }
        }
    }

    // MARK: - JWT User ID

    private func hashUserId(context: MiniAppContext) -> String? {
        guard let sub = TokenManager.shared.currentSubClaim else { return nil }
        let input = "\(sub):\(context.appId)"
        guard let data = input.data(using: .utf8) else { return nil }
        let hash = SHA256.hash(data: data)
        return hash.compactMap { String(format: "%02x", $0) }.joined()
    }
}
```

### 12.3 배치 전송

```swift
private func sendBatch(_ events: [EnrichedEvent], completion: @escaping (Result<Void, Error>) -> Void) {
    guard let url = URL(string: "https://api.union.app/api/v1/analytics/events") else { return }

    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(TokenManager.shared.accessToken ?? "")", forHTTPHeaderField: "Authorization")
    request.setValue(UUID().uuidString, forHTTPHeaderField: "X-Request-ID")  // 멱등성

    let body = try? JSONEncoder().encode(["events": events])
    request.httpBody = body

    URLSession.shared.dataTask(with: request) { _, response, error in
        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0

        switch statusCode {
        case 200, 207:
            completion(.success(()))
        case 401:
            // JWT 갱신 후 1회 재시도
            TokenManager.shared.refresh { [weak self] in
                self?.sendBatch(events, completion: completion)
            }
        case 429:
            // Retry-After 준수
            let retryAfter = (response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Retry-After")
            let delay = Double(retryAfter ?? "60") ?? 60
            DispatchQueue.global().asyncAfter(deadline: .now() + delay) {
                self.sendBatch(events, completion: completion)
            }
        default:
            completion(.failure(AnalyticsError.sendFailed(statusCode)))
        }
    }.resume()
}
```

---

## 13. Android 구현 가이드 (Kotlin)

### 13.1 Bridge 핸들러

```kotlin
// WebViewClient / WebChromeClient 설정 후
webView.addJavascriptInterface(UnionBridgeInterface(miniAppContext), "UnionBridge")

class UnionBridgeInterface(private val context: MiniAppContext) {
    @JavascriptInterface
    fun postMessage(json: String) {
        val request = Json.decodeFromString<BridgeRequest>(json)
        if (request.module == "analytics") {
            AnalyticsManager.instance.handle(request, context)
        }
    }
}
```

### 13.2 배치 전송 (WorkManager)

```kotlin
// 백그라운드에서도 안정적으로 전송
class AnalyticsFlushWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val events = AnalyticsManager.instance.drainBuffer()
        if (events.isEmpty()) return Result.success()

        return try {
            val response = analyticsApi.sendEvents(EventBatch(events))
            if (response.isSuccessful) Result.success()
            else Result.retry()
        } catch (e: IOException) {
            Result.retry()
        }
    }
}

// 앱 시작 시 등록
WorkManager.getInstance(context)
    .enqueueUniquePeriodicWork(
        "analytics_flush",
        ExistingPeriodicWorkPolicy.KEEP,
        PeriodicWorkRequestBuilder<AnalyticsFlushWorker>(30, TimeUnit.SECONDS).build()
    )
```

---

## 14. 보안 체크리스트

### 전송 보안

- [ ] HTTPS only (TLS 1.2+), HTTP 차단
- [ ] Certificate Pinning 적용 (analytics API 도메인)
- [ ] JWT 액세스 토큰이 만료되어도 analytics 는 별도 서비스 키로 인증 가능하도록 설계 고려

### 데이터 보안

- [ ] `hashedUserId` 에 salt 적용 (appId 사용)
- [ ] 디스크 큐는 암호화된 저장소 사용 (iOS: `NSFileProtectionComplete`, Android: EncryptedSharedPreferences)
- [ ] 이벤트 params 에서 PII 2차 필터링 적용
- [ ] `stack` 필드에서 경로/환경 정보 마스킹 고려

### 무결성

- [ ] `X-Request-ID` 헤더로 중복 배치 전송 방지 (백엔드 idempotency 처리 필요)
- [ ] `sequenceNumber` 로 이벤트 유실 감지 (백엔드에서 gaps 모니터링)
- [ ] 미등록 appId 의 이벤트 거절 (백엔드에서 검증)

### 프라이버시

- [ ] 사용자에게 analytics 수집 동의 안내 (앱 최초 실행 시)
- [ ] 동의 철회 시 analytics.install() 미호출 또는 전송 차단
- [ ] 이벤트 보존 기간 명시 (권장: 90일)

---

## 변경 이력

| 날짜 | 버전 | 내용 |
|------|------|------|
| 2026-04-05 | 1.0.0 | 최초 작성 |
