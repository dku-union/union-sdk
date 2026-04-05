// ============================================
// Auth Module Types
// ============================================

export interface UserProfile {
  userId: string;
  nickname: string;
  profileImage?: string;
  /** user.university 권한 필요 */
  university?: string;
  /** user.email 권한 필요 */
  email?: string;
}

export interface LoginResult {
  code: string;
}

// ============================================
// UI Module Types
// ============================================

export interface ToastOptions {
  message: string;
  duration?: 'short' | 'long';
}

export interface ModalOptions {
  title: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
}

export interface ModalResult {
  confirmed: boolean;
}

export interface NavigationBarOptions {
  title?: string;
  backgroundColor?: string;
  textColor?: string;
}

// ============================================
// Device Module Types
// ============================================

export interface LocationResult {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export interface QRCodeResult {
  result: string;
}

export type VibrationType = 'light' | 'medium' | 'heavy';

// ============================================
// Network Module Types
// ============================================

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  url: string;
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

export interface RequestResult {
  statusCode: number;
  headers: Record<string, string>;
  data: unknown;
}

// ============================================
// Analytics Module Types
// ============================================

export type EventParams = Record<string, string | number | boolean>;

/** 트래킹 이벤트 분류 */
export type TrackingEventType =
  | 'lifecycle'   // 앱 실행/종료/백그라운드 (네이티브 자동 수집)
  | 'screen'      // 화면 전환
  | 'performance' // 성능 지표 (FCP, LCP, bridge_latency 등)
  | 'error'       // JS 에러, 미처리 Promise rejection
  | 'custom'      // 개발자 정의 커스텀 이벤트
  | 'conversion'; // 전환 이벤트 (구매, 가입 등)

/**
 * JS → Native 로 전달되는 트래킹 페이로드.
 * 네이티브에서 sessionId, userId(hashed), deviceInfo 등을 보강하여 최종 이벤트를 구성함.
 */
export interface TrackingPayload {
  eventType: TrackingEventType;
  eventName: string;
  /** 이벤트 발생 시각 (epoch ms, client-side) */
  timestamp: number;
  /** 이벤트별 추가 파라미터 */
  params?: EventParams;
}

/** trackError() 컨텍스트 */
export interface ErrorContext {
  /** true이면 앱이 복구 불가능한 치명적 에러 */
  fatal?: boolean;
  /** 에러 발생 위치/상황에 대한 추가 정보 (PII 포함 금지) */
  context?: Record<string, string>;
}

/** trackConversion() 파라미터 */
export interface ConversionParams {
  /** 전환 금액 (원 단위) */
  value?: number;
  /** 통화 코드 (ISO 4217, e.g. 'KRW') */
  currency?: string;
  /** 전환 레이블 (자유 형식) */
  label?: string;
  /** 추가 커스텀 파라미터 */
  [key: string]: string | number | boolean | undefined;
}

/** setUserProperty() 허용 값 타입 */
export type UserPropertyValue = string | number | boolean;

// ============================================
// Permission Scopes
// ============================================

export type PermissionScope =
  | 'user.profile'
  | 'user.email'
  | 'user.university'
  | 'device.location'
  | 'device.camera'
  | 'device.storage';

// ============================================
// Navigation Module Types
// ============================================

export interface NavigationPushOptions {
  url: string;
  title?: string;
  animated?: boolean;
}

export interface NavigationPushResult {
  success: boolean;
}
