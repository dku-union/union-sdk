import type { BridgeAdapter, BridgeRequest, BridgeResponse, PermissionScope } from '../types';

/**
 * Mock 어댑터 — 브라우저 개발 환경용
 * 네이티브 앱 없이 SDK API를 시뮬레이션한다.
 */
export class MockAdapter implements BridgeAdapter {
  readonly platform = 'mock' as const;

  send(message: BridgeRequest): void {
    // 비동기로 시뮬레이션 (네이티브 지연 모방)
    setTimeout(() => {
      const response = this.handleMessage(message);
      window.dispatchEvent(
        new CustomEvent('union-bridge-response', { detail: response }),
      );
    }, 50);
  }

  private handleMessage(request: BridgeRequest): BridgeResponse {
    const handler = MOCK_HANDLERS[request.module]?.[request.action];

    if (!handler) {
      return {
        id: request.id,
        success: false,
        error: {
          code: 'NOT_SUPPORTED',
          message: `Mock: ${request.module}.${request.action} is not implemented`,
        },
      };
    }

    // 권한 게이트 — 네이티브 BridgeHandler 의 동의 집행과 동일한 규칙을 mock 에서도 재현.
    const requiredScope = MOCK_SCOPE_MAP[request.module]?.[request.action];
    if (requiredScope && !mockGrantedScopes().has(requiredScope)) {
      this.log(request, false);
      return {
        id: request.id,
        success: false,
        error: {
          code: 'PERMISSION_DENIED',
          message: `Mock: '${requiredScope}' 권한이 거부되었습니다`,
        },
      };
    }

    try {
      const data = handler(request.params);
      this.log(request, true);
      return { id: request.id, success: true, data };
    } catch (err) {
      this.log(request, false);
      return {
        id: request.id,
        success: false,
        error: {
          code: 'MOCK_ERROR',
          message: err instanceof Error ? err.message : 'Unknown mock error',
        },
      };
    }
  }

  private log(request: BridgeRequest, success: boolean): void {
    const status = success ? '\u2705' : '\u274c';
    console.log(
      `[Union Mock] ${status} ${request.module}.${request.action}`,
      request.params ?? '',
    );
  }
}

// ============================================
// Mock 핸들러 정의
// ============================================

const STORAGE_PREFIX = 'union_mock_';

// ============================================
// 권한 시뮬레이션 (정본 스코프 계약 — 네이티브/백엔드와 동일)
// ============================================

/** (module, action) → 필요한 권한 스코프. 매핑이 없으면 게이트 없음. */
const MOCK_SCOPE_MAP: Record<string, Record<string, PermissionScope>> = {
  auth: { getUserProfile: 'user.profile' },
  device: { getLocation: 'device.location', scanQRCode: 'device.camera' },
  storage: { get: 'device.storage', set: 'device.storage', remove: 'device.storage', clear: 'device.storage' },
  notification: {
    requestPermission: 'notification',
    scheduleLocal: 'notification',
    subscribe: 'notification',
    unsubscribe: 'notification',
    setPushEnabled: 'notification',
  },
};

const ALL_SCOPES = [
  'user.profile', 'user.email', 'user.university',
  'device.location', 'device.camera', 'device.storage', 'notification',
] as const;

/**
 * Mock 환경에서 허용된 권한 스코프 집합.
 *
 * 기본값은 전체 허용이라 기존 dev 플로우에는 영향이 없다. 권한 거부 UX 를 테스트하려면
 * 콘솔/부트스트랩에서 허용할 스코프만 지정한다:
 *
 * ```js
 * window.__UNION_MOCK_GRANTED__ = ['user.profile'];
 * // 이후 device.getLocation() 등은 PERMISSION_DENIED 로 거부됨
 * ```
 */
function mockGrantedScopes(): Set<string> {
  const override = typeof window !== 'undefined'
    ? (window as any).__UNION_MOCK_GRANTED__
    : undefined;
  if (Array.isArray(override)) return new Set(override.map(String));
  return new Set(ALL_SCOPES);
}

/** Analytics 이벤트 타입별 레이블 (개발 콘솔 가독성) */
const ANALYTICS_ICONS: Record<string, string> = {
  lifecycle: '[lifecycle]',
  screen: '[screen   ]',
  performance: '[perf    ]',
  error: '[error    ]',
  custom: '[custom   ]',
  conversion: '[convert ]',
};

/** Mock 환경에서 setUserProperty 로 설정된 값을 메모리에 보관 */
const MOCK_USER_PROPERTIES: Record<string, string | number | boolean> = {};

const MOCK_HANDLERS: Record<string, Record<string, (params?: any) => unknown>> = {
  auth: {
    login: () => ({
      code: 'mock_auth_code_' + Math.random().toString(36).substring(2, 10),
    }),
    getUserProfile: () => {
      // user.profile 게이트는 handleMessage 에서 처리. 여기서는 email/university 를 필드 단위로 게이팅.
      const granted = mockGrantedScopes();
      const profile: Record<string, unknown> = {
        userId: 'mock-user-001',
        nickname: 'Mock유저',
        profileImage: undefined,
      };
      if (granted.has('user.university')) profile.university = '단국대학교';
      if (granted.has('user.email')) profile.email = 'mock@dankook.ac.kr';
      return profile;
    },
    getAccessToken: () => 'mock_access_token_' + Date.now(),
    logout: () => undefined,
  },

  ui: {
    showToast: (params) => {
      showMockToast(params?.message ?? '', params?.duration ?? 'short');
      return undefined;
    },
    showModal: (params) => {
      const confirmed = window.confirm(
        `${params?.title ?? ''}\n\n${params?.content ?? ''}`,
      );
      return { confirmed };
    },
    showLoading: () => undefined,
    hideLoading: () => undefined,
    setNavigationBar: (params) => {
      if (params?.title) {
        document.title = params.title;
      }
      return undefined;
    },
    close: () => {
      window.close();
      return undefined;
    },
  },

  device: {
    getLocation: () => {
      // 단국대학교 죽전캠퍼스 기본 좌표
      return {
        latitude: 37.3219,
        longitude: 127.1268,
        accuracy: 10,
      };
    },
    scanQRCode: () => {
      const result = window.prompt('Mock QR Code 값 입력:') ?? '';
      return { result };
    },
    getClipboard: () => '',
    setClipboard: () => undefined,
    vibrate: () => {
      navigator.vibrate?.(100);
      return undefined;
    },
  },

  storage: {
    get: (params) => {
      const raw = localStorage.getItem(STORAGE_PREFIX + params?.key);
      return raw ? JSON.parse(raw) : null;
    },
    set: (params) => {
      localStorage.setItem(
        STORAGE_PREFIX + params?.key,
        JSON.stringify(params?.value),
      );
      return undefined;
    },
    remove: (params) => {
      localStorage.removeItem(STORAGE_PREFIX + params?.key);
      return undefined;
    },
    clear: () => {
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith(STORAGE_PREFIX),
      );
      keys.forEach((k) => localStorage.removeItem(k));
      return undefined;
    },
  },

  analytics: {
    /**
     * 통합 트래킹 핸들러 — 모든 이벤트 타입 처리.
     * 네이티브에서는 이 단일 액션으로 수신 후 eventType 으로 분기함.
     */
    track: (params) => {
      const { eventType, eventName, timestamp, params: eventParams } = params ?? {};
      const icon = ANALYTICS_ICONS[eventType as string] ?? '📊';
      const timeStr = timestamp ? new Date(timestamp as number).toISOString().slice(11, 23) : '';

      // 개발 환경에서 시각적으로 명확한 로그 출력
      console.groupCollapsed(
        `%c[Union Analytics]%c ${icon} ${eventType}:${eventName}  %c${timeStr}`,
        'color:#6366f1;font-weight:bold',
        'color:inherit',
        'color:#9ca3af;font-size:0.85em',
      );
      if (eventParams && Object.keys(eventParams as object).length > 0) {
        console.log('params:', eventParams);
      }
      // 수집된 사용자 속성 컨텍스트 표시
      if (Object.keys(MOCK_USER_PROPERTIES).length > 0) {
        console.log('userProps:', { ...MOCK_USER_PROPERTIES });
      }
      console.groupEnd();

      return undefined;
    },

    setUserProperty: (params) => {
      const { key, value } = params ?? {};
      MOCK_USER_PROPERTIES[key as string] = value as string | number | boolean;
      console.log(
        `%c[Union Analytics]%c [user-prop]  %c${key} = ${JSON.stringify(value)}`,
        'color:#6366f1;font-weight:bold',
        'color:inherit',
        'color:#10b981',
      );
      return undefined;
    },

    // 하위 호환성 — 이전 버전 SDK 와 함께 사용하는 경우를 위한 폴백
    trackEvent: (params) => {
      console.log('[Union Analytics] [custom] (legacy) Event:', params?.eventName, params?.params);
      return undefined;
    },
    trackPageView: (params) => {
      console.log('[Union Analytics] [screen] (legacy) PageView:', params?.pageName);
      return undefined;
    },
  },

  network: {
    request: async (params) => {
      const resp = await fetch(params.url, {
        method: params.method,
        headers: params.headers,
        body: params.body ? JSON.stringify(params.body) : undefined,
      });
      const data = await resp.json().catch(() => resp.text());
      const headers: Record<string, string> = {};
      resp.headers.forEach((v, k) => { headers[k] = v; });
      return { statusCode: resp.status, headers, data };
    },
  },

  navigation: {
    push: (params) => {
      console.log('[Union Mock] Navigation push:', params?.url);
      if (params?.url) {
        window.history.pushState({}, '', params.url);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      return { success: true };
    },
    back: () => {
      window.history.back();
      return undefined;
    },
    replace: (params) => {
      if (params?.url) window.history.replaceState({}, '', params.url);
      return undefined;
    },
    prefetch: (params) => {
      console.log('[Union Mock] Prefetch:', params?.url);
      return undefined;
    },
  },

  notification: {
    requestPermission: () => {
      // 브라우저 Notification API 가 있으면 실제 권한 요청. 없으면 mock granted.
      if (typeof Notification !== 'undefined' && Notification.requestPermission) {
        return Notification.requestPermission().then((perm) => ({
          granted: perm === 'granted',
          status: perm === 'granted' ? 'authorized'
            : perm === 'denied' ? 'denied' : 'undetermined',
        }));
      }
      return { granted: true, status: 'authorized' };
    },
    getPermissionStatus: () => {
      if (typeof Notification === 'undefined') return { status: 'undetermined' };
      const perm = Notification.permission;
      return {
        status: perm === 'granted' ? 'authorized'
          : perm === 'denied' ? 'denied' : 'undetermined',
      };
    },
    getDeviceToken: () => ({ token: 'mock-device-token-' + Math.random().toString(36).slice(2, 10) }),
    scheduleLocal: (params) => {
      const id = (params?.notificationId as string) ?? 'mock_' + Date.now();
      const title = (params?.title as string) ?? '';
      const body = (params?.body as string) ?? '';
      const delay = (params?.delaySeconds as number) ?? 5;
      console.log(`[Union Mock] scheduleLocal "${title}" (in ${delay}s) → id=${id}`);
      // 브라우저 환경에서 진짜 알림 띄우기 시뮬레이션
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        setTimeout(() => {
          try { new Notification(title, { body }); } catch { /* noop */ }
        }, Math.max(1, delay) * 1000);
      }
      return { notificationId: id };
    },
    cancelLocal: (params) => {
      console.log('[Union Mock] cancelLocal:', params?.notificationId);
      return undefined;
    },
    cancelAllLocal: () => {
      console.log('[Union Mock] cancelAllLocal');
      return undefined;
    },
    subscribe: () => {
      console.log('[Union Mock] subscribe (현재 미니앱)');
      return undefined;
    },
    unsubscribe: () => {
      console.log('[Union Mock] unsubscribe (현재 미니앱)');
      return undefined;
    },
    setPushEnabled: (params) => {
      console.log('[Union Mock] setPushEnabled:', params?.enabled);
      return undefined;
    },
  },
};

// ============================================
// Mock UI Helpers
// ============================================

function showMockToast(message: string, duration: string): void {
  const el = document.createElement('div');
  el.textContent = message;
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '80px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.8)',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '14px',
    zIndex: '99999',
    transition: 'opacity 0.3s',
    pointerEvents: 'none',
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, duration === 'long' ? 3000 : 1500);
}
