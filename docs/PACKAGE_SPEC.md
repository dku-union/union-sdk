# Union Mini-App Package Spec (.unionapp)

> 버전: 1.0.0 | 최종 수정: 2026-03-26

## 개요

`.unionapp`은 Union 플랫폼에서 미니앱을 배포하기 위한 패키지 포맷이다.
내부적으로 **zip 아카이브**이며, 정해진 디렉토리 구조와 메타데이터를 포함한다.

## 패키지 구조

```
<appId>-<version>.unionapp (zip archive)
│
├── manifest.json          # [필수] 앱 메타데이터
├── signature              # [필수] manifest.json의 HMAC-SHA256 서명
├── index.html             # [필수] 엔트리포인트
├── icon.png               # [선택] 앱 아이콘 (없으면 기본 아이콘 사용)
└── assets/                # [선택] 정적 에셋
    ├── index-<hash>.js    # 번들 JS
    └── index-<hash>.css   # 번들 CSS
```

## 파일명 규칙

```
<appId>-<version>.unionapp
```

예시: `com.union.sample-app-1.0.0.unionapp`

## manifest.json

```jsonc
{
  // 필수 필드
  "appId": "com.union.sample-app",     // reverse-domain, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*)+$/
  "name": "Sample App",                // 사람이 읽는 앱 이름
  "version": "1.0.0",                  // semver, /^\d+\.\d+\.\d+$/
  "sdkVersion": "1.0.0",               // 빌드에 사용된 SDK 버전
  "minSdkVersion": "1.0.0",            // 최소 호환 SDK 버전
  "permissions": ["user.profile"],      // 요청하는 권한 목록
  "entry": "index.html",               // 엔트리포인트 (항상 "index.html")

  // 사이즈 정보
  "bundleSize": 87654,                 // 압축 전 dist/ 전체 크기 (bytes)
  "packageSize": 32100,                // 압축 후 .unionapp 크기 (bytes)

  // 무결성
  "checksum": "sha256:abcdef...",      // dist/ 내 파일들의 SHA-256 (manifest.json, signature 제외)
  "buildTime": "2026-03-26T12:00:00Z"  // ISO 8601
}
```

### 필드 상세

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `appId` | string | O | reverse-domain 형식 앱 식별자 |
| `name` | string | O | 표시용 앱 이름 |
| `version` | string | O | semver 버전 |
| `sdkVersion` | string | O | 빌드 시 SDK 버전 |
| `minSdkVersion` | string | O | 최소 호환 SDK 버전 (네이티브 앱이 호환성 판단에 사용) |
| `permissions` | string[] | O | 요청 권한 (`user.profile`, `device.location` 등) |
| `entry` | string | O | 엔트리포인트 파일 (고정: `"index.html"`) |
| `bundleSize` | number | O | 압축 전 전체 바이트 |
| `packageSize` | number | O | .unionapp 파일 바이트 |
| `checksum` | string | O | `sha256:<hex>` 형식 콘텐츠 해시 |
| `buildTime` | string | O | ISO 8601 빌드 시각 |

### 권한 목록 (PermissionScope)

| 권한 | 설명 |
|------|------|
| `user.profile` | 사용자 기본 프로필 (닉네임, 프로필 이미지) |
| `user.email` | 사용자 이메일 |
| `user.university` | 사용자 소속 대학 |
| `device.location` | GPS 위치 |
| `device.camera` | 카메라 (QR 스캔 등) |
| `device.storage` | 기기 저장소 |

## signature 파일

manifest.json의 무결성을 보장하기 위한 HMAC-SHA256 서명 파일이다.

### 생성

```
HMAC-SHA256(key = signingKey, message = manifest.json 파일 내용)
```

- **signingKey**: `union-sdk-v1:<appId>` (고정 prefix + appId)
  - 캡스톤 데모 수준의 간이 서명. 프로덕션에서는 퍼블리셔별 비대칭 키로 교체 권장.
- **출력**: hex 인코딩 문자열 (64자)
- **파일 내용**: hex 문자열만 저장 (줄바꿈 없음)

### 검증 (백엔드)

```
1. .unionapp에서 signature, manifest.json 추출
2. signingKey = "union-sdk-v1:" + manifest.appId
3. expected = HMAC-SHA256(signingKey, manifest.json 내용)
4. expected === signature 파일 내용 → 통과
5. manifest.checksum으로 나머지 파일 무결성 검증
```

## 사이즈 제한

| 구분 | 기본값 | 설정 위치 |
|------|--------|----------|
| 압축 전 (bundleSize) | 2MB | `union.config.json → build.maxBundleSize` |
| 압축 후 (packageSize) | 제한 없음 (백엔드 업로드 제한에 의존) | 백엔드 API |

## 빌드 → 업로드 플로우

```
[union build]
  1. Vite 프로덕션 빌드       → dist/
  2. 에셋 처리 (아이콘 복사)   → dist/icon.png
  3. manifest.json 생성       → dist/manifest.json
  4. .unionapp 패키징         → <appId>-<version>.unionapp
     ├── dist/ 내용을 zip 압축
     ├── signature 생성 후 zip에 추가
     └── manifest.json에 packageSize 기록

[union validate]
  - 기존 dist/ 검증 그대로 유지 (파일/매니페스트/사이즈/보안)
  - .unionapp 존재 시 signature 검증 추가

[union upload]
  POST /api/v1/publisher/apps/{appId}/versions
  Content-Type: multipart/form-data
  Body: file=<appId>-<version>.unionapp

  백엔드 처리:
  1. .unionapp 수신 → zip 해제
  2. signature 검증 (HMAC)
  3. checksum 재계산 후 manifest.checksum과 비교
  4. manifest 메타데이터 DB 저장
  5. 정적 파일을 저장소(S3)에 업로드
  6. 응답: { url, status }
```

## iOS 앱 다운로드 플로우

```
1. 앱 스토어에서 미니앱 선택
2. GET /api/v1/apps/{appId}/versions/{version}/download
3. .unionapp 다운로드
4. zip 해제 → Library/Caches/MiniApps/{appId}/{version}/
5. manifest.json에서 minSdkVersion 확인
   - 호환 → WebView에 index.html 로드
   - 비호환 → 사용자에게 앱 업데이트 안내
6. checksum 검증 (선택, 캐시 무결성)
```

## 버전 호환성

| 패키지 minSdkVersion | iOS 앱 지원 SDK | 결과 |
|----------------------|----------------|------|
| 1.0.0 | 1.0.0 ~ 1.2.0 | 실행 가능 |
| 1.3.0 | 1.0.0 ~ 1.2.0 | 실행 불가 (업데이트 필요) |

비교 로직: `semver.gte(appSdkVersion, packageMinSdkVersion)` → 실행 허용

## 변경 이력

| 버전 | 날짜 | 변경 내용 |
|------|------|----------|
| 1.0.0 | 2026-03-26 | 최초 스펙 작성 |
