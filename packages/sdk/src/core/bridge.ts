import type {
  BridgeAdapter,
  BridgeModule,
  BridgeRequest,
  BridgeResponse,
  BridgeEvent,
  PendingRequest,
  UnionEvent,
} from '../types';
import { IOSAdapter, AndroidAdapter } from './adapter';
import { MockAdapter } from './mock';
import { SDK_VERSION } from '../version';

/**
 * Bridge 레이턴시 측정 콜백 타입.
 * AnalyticsModule 이 install() 시 등록하며, analytics 모듈 자체 호출은 측정에서 제외됨.
 */
type PerfCallback = (metricName: string, valueMs: number) => void;

/** 커스텀 에러 클래스 */
export class UnionError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'UnionError';
  }
}

/**
 * Bridge Core
 * SDK ↔ Native 간 메시지 패싱의 핵심 엔진.
 *
 * - 플랫폼 자동 감지 (iOS / Android / Mock)
 * - Promise 기반 요청-응답 매칭 (UUID v4)
 * - 30초 기본 타임아웃
 * - 네이티브 이벤트 수신 (CustomEvent)
 * - Bridge 호출 레이턴시 측정 (analytics 연동)
 */
export class BridgeCore {
  private pending = new Map<string, PendingRequest>();
  private eventListeners = new Map<string, Set<(data?: unknown) => void>>();
  public readonly adapter: BridgeAdapter;
  private defaultTimeout = 30_000; // 30초

  /**
   * analytics 모듈에서 등록하는 성능 측정 콜백.
   * analytics 모듈 자신의 요청(module === 'analytics')은 재귀 방지를 위해 측정에서 제외.
   */
  private perfCallback: PerfCallback | null = null;

  constructor() {
    this.adapter = this.detectAdapter();
    this.listenForResponses();
    this.listenForEvents();
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * 네이티브 모듈 메서드 호출 (응답 대기).
   * 성공 응답 시 bridge_latency 를 perfCallback 으로 전달.
   *
   * @returns Promise<T> 네이티브 응답 데이터
   */
  invoke<T = unknown>(
    module: BridgeModule,
    action: string,
    params?: Record<string, unknown>,
    timeout?: number,
  ): Promise<T> {
    const id = generateUUID();
    // performance.now() 가 없는 환경(SSR 등) 대비
    const startTime = typeof performance !== 'undefined' ? performance.now() : 0;

    const request: BridgeRequest = {
      id,
      module,
      action,
      params,
      sdkVersion: SDK_VERSION,
      timestamp: Date.now(),
    };

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new UnionError(
            'TIMEOUT',
            `${module}.${action} timed out after ${timeout ?? this.defaultTimeout}ms`,
          ),
        );
      }, timeout ?? this.defaultTimeout);

      // resolve 를 래핑하여 레이턴시 측정 삽입.
      // analytics 모듈 자체 요청은 재귀 측정 제외.
      const wrappedResolve = (value: unknown) => {
        if (module !== 'analytics' && startTime > 0 && this.perfCallback) {
          const latencyMs = Math.round(performance.now() - startTime);
          this.perfCallback('bridge_latency', latencyMs);
        }
        (resolve as (v: unknown) => void)(value);
      };

      this.pending.set(id, {
        resolve: wrappedResolve,
        reject,
        timer,
      });

      this.adapter.send(request);
    });
  }

  /**
   * fire-and-forget 방식 호출 (응답 불필요).
   * analytics.track, navigation.prefetch 등 응답을 기다릴 필요 없는 작업에 사용.
   */
  fire(module: BridgeModule, action: string, params?: Record<string, unknown>): void {
    const request: BridgeRequest = {
      id: generateUUID(),
      module,
      action,
      params,
      sdkVersion: SDK_VERSION,
      timestamp: Date.now(),
    };
    this.adapter.send(request);
  }

  /**
   * 네이티브 이벤트 구독.
   */
  on(event: UnionEvent, callback: (data?: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * 네이티브 이벤트 구독 해제.
   */
  off(event: UnionEvent, callback: (data?: unknown) => void): void {
    this.eventListeners.get(event)?.delete(callback);
  }

  /**
   * Bridge 레이턴시 측정 콜백 등록.
   * AnalyticsModule.install() 에서 자동 호출됨.
   *
   * @internal
   */
  registerPerfCallback(callback: PerfCallback): void {
    this.perfCallback = callback;
  }

  // ============================================
  // Private
  // ============================================

  private detectAdapter(): BridgeAdapter {
    if (typeof window === 'undefined') {
      return new MockAdapter();
    }
    // iOS WKWebView
    if (window.webkit?.messageHandlers?.union) {
      return new IOSAdapter();
    }
    // Android WebView
    if ((window as any).UnionBridge) {
      return new AndroidAdapter();
    }
    // 브라우저 개발 환경
    return new MockAdapter();
  }

  private listenForResponses(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('union-bridge-response', ((event: CustomEvent<BridgeResponse>) => {
      const response = event.detail;
      const pending = this.pending.get(response.id);
      if (!pending) return;

      clearTimeout(pending.timer);
      this.pending.delete(response.id);

      if (response.success) {
        pending.resolve(response.data);
      } else {
        pending.reject(
          new UnionError(
            response.error?.code ?? 'UNKNOWN',
            response.error?.message ?? 'Unknown error',
          ),
        );
      }
    }) as EventListener);
  }

  private listenForEvents(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('union-bridge-event', ((event: CustomEvent<BridgeEvent>) => {
      const bridgeEvent = event.detail;
      const listeners = this.eventListeners.get(bridgeEvent.event);
      if (listeners) {
        listeners.forEach((cb) => cb(bridgeEvent.data));
      }
    }) as EventListener);
  }
}

// ============================================
// Utils
// ============================================

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
