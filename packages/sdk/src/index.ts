import { BridgeCore, UnionError } from './core/bridge';
import { AuthModule } from './modules/auth';
import { UIModule } from './modules/ui';
import { DeviceModule } from './modules/device';
import { StorageModule } from './modules/storage';
import { AnalyticsModule } from './modules/analytics';
import { NetworkModule } from './modules/network';
import { NavigationModule } from './modules/navigation';
import { NotificationModule } from './modules/notification';
import { installNavigationInterceptor } from './modules/navigation-interceptor';
import { SDK_VERSION } from './version';
import type { UnionEvent, RequestOptions, RequestResult } from './types';

// Re-export types
export type * from './types';
export { UnionError, UnionErrorCode } from './core/bridge';

// ============================================
// Union SDK 초기화
// ============================================

const bridge = new BridgeCore();

const auth = new AuthModule(bridge);
const ui = new UIModule(bridge);
const device = new DeviceModule(bridge);
const storage = new StorageModule(bridge);
const analytics = new AnalyticsModule(bridge);
const network = new NetworkModule(bridge);
const navigation = new NavigationModule(bridge);
const notification = new NotificationModule(bridge);

/**
 * Union SDK
 *
 * 미니앱이 슈퍼앱의 네이티브 기능에 접근하기 위한 Bridge SDK.
 *
 * @example
 * ```ts
 * import Union from '@union-miniapp/sdk';
 *
 * // 로그인
 * await Union.auth.login();
 *
 * // 토스트 표시
 * Union.ui.showToast({ message: '안녕하세요!' });
 *
 * // 커스텀 이벤트 트래킹
 * Union.analytics.trackEvent('join_club', { clubId: 'soccer_001' });
 *
 * // 전환 이벤트
 * Union.analytics.trackConversion('ticket_purchase', { value: 5000, currency: 'KRW' });
 * ```
 */
const Union = {
  /** 인증 모듈 */
  auth,
  /** UI 모듈 */
  ui,
  /** 디바이스 모듈 */
  device,
  /** 저장소 모듈 */
  storage,
  /** 애널리틱스 모듈 */
  analytics,
  /** 네비게이션 모듈 (네이티브 페이지 스택) */
  navigation,
  /** 알림 모듈 (권한/로컬알림/구독/원격 푸시 수신) */
  notification,

  /** HTTP 요청 (mTLS 인증 자동 적용) */
  request(options: RequestOptions): Promise<RequestResult> {
    return network.request(options);
  },

  /** SDK 버전 */
  version: SDK_VERSION,

  /** 현재 플랫폼 ('ios' | 'android' | 'mock') */
  platform: bridge.adapter.platform,

  /** 네이티브 이벤트 구독 */
  on(event: UnionEvent, callback: (data?: unknown) => void): void {
    bridge.on(event, callback);
  },

  /** 네이티브 이벤트 구독 해제 */
  off(event: UnionEvent, callback: (data?: unknown) => void): void {
    bridge.off(event, callback);
  },
} as const;

// ============================================
// 전역 등록 + 자동 수집 초기화
// ============================================

/**
 * 푸시 딥링크 초기 경로(`?__route=`) 적용.
 *
 * 네이티브(iOS `MiniAppSchemeHandler`/원격 launch URL)는 미니앱을 특정 화면으로 열 때
 * 진입 URL 에 `?__route=<path>` 를 붙인다. 미니앱 라우터(History API 기반)가 인식하도록,
 * React 앱 마운트 전에 실제 경로로 `replaceState` 한다.
 *
 * `__route` 가 없으면 아무 일도 하지 않으므로 일반 진입에는 영향이 없다.
 */
function applyInitialRoute(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const route = params.get('__route');
    if (!route) return;
    // __route 쿼리를 제거하고 실제 경로로 치환 → BrowserRouter 가 초기 경로로 인식.
    window.history.replaceState(window.history.state, '', route);
  } catch {
    // location 접근 불가/cross-origin 경로 등은 무시 (미니앱은 루트에서 시작).
  }
}

if (typeof window !== 'undefined') {
  // window.Union 으로 WebView 환경에서도 접근 가능
  (window as any).Union = Union;

  // 푸시 딥링크 초기 경로 적용 — 라우터 마운트/네비게이션 인터셉터보다 먼저.
  applyInitialRoute();

  // Analytics 자동 수집 활성화 (JS 에러, Web Vitals, Bridge 레이턴시)
  analytics.install();

  // <a> 태그 자동 가로채기 + viewport prefetch + screen_view 트래킹 연결
  installNavigationInterceptor(navigation, {
    onNavigate: (to: string, from: string) => analytics.onNavigate(to, from),
  });
}

export default Union;
