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
 * - Promise 기반 요청-응답 매칭
 * - 타임아웃 처리
 * - 네이티브 이벤트 수신
 */
export class BridgeCore {
  private pending = new Map<string, PendingRequest>();
  private eventListeners = new Map<string, Set<(data?: unknown) => void>>();
  public readonly adapter: BridgeAdapter;
  private defaultTimeout = 30_000; // 30초

  constructor() {
    this.adapter = this.detectAdapter();
    this.listenForResponses();
    this.listenForEvents();
  }

  /**
   * 네이티브 모듈 메서드 호출
   * @returns Promise<T> 네이티브 응답 데이터
   */
  invoke<T = unknown>(
    module: BridgeModule,
    action: string,
    params?: Record<string, unknown>,
    timeout?: number,
  ): Promise<T> {
    const id = generateUUID();
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
        reject(new UnionError('TIMEOUT', `${module}.${action} timed out after ${timeout ?? this.defaultTimeout}ms`));
      }, timeout ?? this.defaultTimeout);

      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });

      this.adapter.send(request);
    });
  }

  /**
   * fire-and-forget 방식 호출 (응답 불필요)
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
   * 네이티브 이벤트 구독
   */
  on(event: UnionEvent, callback: (data?: unknown) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(callback);
  }

  /**
   * 네이티브 이벤트 구독 해제
   */
  off(event: UnionEvent, callback: (data?: unknown) => void): void {
    this.eventListeners.get(event)?.delete(callback);
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
