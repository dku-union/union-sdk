/** SDK → Native 요청 메시지 */
export interface BridgeRequest {
  /** 고유 요청 ID (UUID v4) */
  id: string;
  /** 모듈명 */
  module: BridgeModule;
  /** 메서드명 */
  action: string;
  /** 메서드 파라미터 */
  params?: Record<string, unknown>;
  /** SDK 버전 (호환성 체크용) */
  sdkVersion: string;
  /** 요청 시각 (ms) */
  timestamp: number;
}

/** Native → SDK 응답 메시지 */
export interface BridgeResponse {
  /** 매칭되는 요청 ID */
  id: string;
  /** 성공 여부 */
  success: boolean;
  /** 응답 데이터 */
  data?: unknown;
  /** 에러 정보 */
  error?: BridgeError;
}

/** Native → SDK 이벤트 (요청 없이 네이티브에서 푸시) */
export interface BridgeEvent {
  type: 'event';
  /** 이벤트명 */
  event: UnionEvent;
  /** 이벤트 데이터 */
  data?: unknown;
}

export interface BridgeError {
  /** 에러 코드 */
  code: string;
  /** 에러 메시지 */
  message: string;
}

export type BridgeModule =
  | 'auth'
  | 'ui'
  | 'device'
  | 'storage'
  | 'analytics'
  | 'network'
  | 'navigation'
  | 'notification';

export type UnionEvent =
  | 'app:pause'
  | 'app:resume'
  | 'app:destroy'
  | 'auth:expired'
  | 'auth:revoked'
  | 'network:online'
  | 'network:offline'
  | 'navigation:didPush'
  | 'navigation:didPop'
  | 'notification:received';

/** Bridge 어댑터 인터페이스 */
export interface BridgeAdapter {
  /** 메시지 전송 */
  send(message: BridgeRequest): void;
  /** 플랫폼 식별자 */
  readonly platform: 'ios' | 'android' | 'mock';
}

/** Pending 상태의 요청 */
export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
}
