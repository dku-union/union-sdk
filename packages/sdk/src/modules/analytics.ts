import type { BridgeCore } from '../core/bridge';
import type {
  EventParams,
  TrackingEventType,
  TrackingPayload,
  ErrorContext,
  ConversionParams,
  UserPropertyValue,
} from '../types';

// ============================================
// Constants
// ============================================

const TAG = '[Union Analytics]';

/** bridge_latency 샘플링 비율 (0.0 ~ 1.0). 모든 호출을 추적하면 과부하 */
const BRIDGE_LATENCY_SAMPLE_RATE = 0.2;

/** 스택 트레이스 최대 길이 (chars). 네이티브 페이로드 과부하 방지 */
const MAX_STACK_LENGTH = 1_000;

/** 이벤트명 최대 길이 */
const MAX_EVENT_NAME_LENGTH = 100;

/** 파라미터 문자열 값 최대 길이 */
const MAX_PARAM_VALUE_LENGTH = 500;

/** 이벤트명 허용 패턴: 소문자로 시작, 소문자/숫자/언더스코어만 허용 */
const EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,99}$/;

/** 사용자 속성 키 허용 패턴 */
const PROPERTY_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9_]{0,49}$/;

/**
 * PII 감지 패턴 목록.
 * SDK 레이어에서 1차 마스킹 후, 네이티브에서 2차 마스킹 수행 (defense-in-depth).
 */
const PII_PATTERNS: ReadonlyArray<RegExp> = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,   // 이메일
  /\d{3}[-.\s]?\d{3,4}[-.\s]?\d{4}/g,                    // 전화번호
  /\d{6}-[1-4]\d{6}/g,                                    // 주민등록번호
  /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g,            // 카드번호
];

const PII_PLACEHOLDER = '[REDACTED]';

// ============================================
// Analytics Module
// ============================================

/**
 * Analytics Module — 사용자 행동, 성능, 에러 트래킹
 *
 * ## 자동 수집 (install() 호출 시 활성화)
 * - JS 전역 에러 (`window.onerror`)
 * - 미처리 Promise rejection (`unhandledrejection`)
 * - Core Web Vitals: FCP, LCP (`PerformanceObserver`)
 * - Navigation Timing: dom_content_loaded, page_load
 * - Bridge 호출 레이턴시 (20% 샘플링)
 *
 * ## 수동 수집
 * - `trackEvent()` — 커스텀 이벤트
 * - `trackPageView()` — 화면 전환
 * - `trackError()` — 명시적 에러 리포팅
 * - `trackConversion()` — 전환 이벤트
 * - `setUserProperty()` — 사용자 속성
 *
 * ## 보안
 * - 이벤트 파라미터에서 이메일/전화/주민번호/카드번호 패턴 자동 마스킹
 * - 이벤트명은 `/^[a-z][a-z0-9_]+$/` 형식만 허용 (SQL injection 방지)
 * - 실제 전송 및 PII 필터링의 최종 책임은 네이티브 레이어에 있음
 *
 * @example
 * ```ts
 * Union.analytics.trackPageView('home');
 * Union.analytics.trackEvent('button_click', { buttonId: 'signup' });
 * Union.analytics.trackConversion('ticket_purchase', { value: 5000, currency: 'KRW' });
 * ```
 */
export class AnalyticsModule {
  private installed = false;
  private perfObserver: PerformanceObserver | null = null;

  // 동일한 함수 참조를 유지해야 removeEventListener 가 정상 동작함
  private readonly boundGlobalErrorHandler: (e: ErrorEvent) => void;
  private readonly boundRejectionHandler: (e: PromiseRejectionEvent) => void;

  constructor(private readonly bridge: BridgeCore) {
    this.boundGlobalErrorHandler = this.handleGlobalError.bind(this);
    this.boundRejectionHandler = this.handleUnhandledRejection.bind(this);
  }

  // ============================================
  // Public API
  // ============================================

  /**
   * 커스텀 이벤트 트래킹.
   *
   * @param eventName - 이벤트명 (`[a-z][a-z0-9_]+`, 최대 100자)
   * @param params    - 추가 파라미터. 문자열 값은 500자로 자동 truncate.
   *                    이메일/전화번호 등 PII 패턴은 자동 마스킹.
   *
   * @example
   * ```ts
   * Union.analytics.trackEvent('join_club', { clubId: 'soccer_001', source: 'home' });
   * ```
   */
  trackEvent(eventName: string, params?: EventParams): void {
    if (!validateEventName(eventName)) return;
    this.dispatch('custom', eventName, params ? sanitizeParams(params) : undefined);
  }

  /**
   * 화면 전환 트래킹.
   * Navigation Interceptor 에서 자동 호출되지만 직접 호출도 가능.
   *
   * @param pageName - 화면 식별자 (URL 경로 또는 임의 이름)
   * @param referrer - 이전 화면 식별자 (없으면 생략)
   *
   * @example
   * ```ts
   * Union.analytics.trackPageView('/club/soccer_001', '/home');
   * ```
   */
  trackPageView(pageName: string, referrer?: string): void {
    this.dispatch('screen', 'screen_view', {
      pageName: pageName.slice(0, 200),
      referrer: (referrer ?? '').slice(0, 500),
    });
  }

  /**
   * 에러 트래킹.
   * `window.onerror`로 잡히지 않는 catch 블록 내 에러를 수동으로 전송할 때 사용.
   *
   * @param error   - Error 객체 또는 에러 메시지 문자열
   * @param context - 추가 컨텍스트 정보 (PII 포함 금지)
   *
   * @example
   * ```ts
   * try {
   *   await riskyOperation();
   * } catch (err) {
   *   Union.analytics.trackError(err, {
   *     fatal: false,
   *     context: { screen: 'payment', step: 'confirm' },
   *   });
   * }
   * ```
   */
  trackError(error: Error | string, context?: ErrorContext): void {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const stack = error instanceof Error ? truncateStack(error.stack) : undefined;

    const params: EventParams = {
      message,
      fatal: context?.fatal === true ? 1 : 0,
    };

    if (stack !== undefined) {
      params['stack'] = stack;
    }

    if (context?.context) {
      const sanitized = sanitizeStringRecord(context.context);
      Object.assign(params, sanitized);
    }

    this.dispatch('error', 'tracked_error', params);
  }

  /**
   * 전환 이벤트 트래킹 (구매, 신청, 가입 등 핵심 액션).
   *
   * @param conversionType - 전환 타입 식별자 (`[a-z][a-z0-9_]+`)
   * @param params         - 전환 상세 정보
   *
   * @example
   * ```ts
   * Union.analytics.trackConversion('ticket_purchase', {
   *   value: 5000,
   *   currency: 'KRW',
   *   label: '2024_sports_festival',
   * });
   * ```
   */
  trackConversion(conversionType: string, params?: ConversionParams): void {
    if (!validateEventName(conversionType)) return;

    const { value, currency, label, ...rest } = params ?? {};

    const eventParams: EventParams = { conversionType };

    if (value !== undefined) eventParams['value'] = Number(value);
    if (currency !== undefined) eventParams['currency'] = String(currency).slice(0, 10);
    if (label !== undefined) eventParams['label'] = String(label).slice(0, 200);

    // 나머지 커스텀 파라미터: undefined 제거 후 PII 마스킹
    const cleanRest: EventParams = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) cleanRest[k] = v as string | number | boolean;
    }
    Object.assign(eventParams, sanitizeParams(cleanRest));

    this.dispatch('conversion', 'conversion', eventParams);
  }

  /**
   * 사용자 속성 설정.
   * 속성은 세션 내 모든 후속 이벤트에 자동 첨부됨 (네이티브에서 관리).
   * JWT claim 과 결합되어 풍부한 사용자 컨텍스트를 형성함.
   *
   * @param key   - 속성 키 (`[a-zA-Z][a-zA-Z0-9_]+`, 최대 50자)
   * @param value - 속성 값
   *
   * @example
   * ```ts
   * Union.analytics.setUserProperty('major', '소프트웨어학과');
   * Union.analytics.setUserProperty('grade', 3);
   * Union.analytics.setUserProperty('is_club_member', true);
   * ```
   */
  setUserProperty(key: string, value: UserPropertyValue): void {
    if (!PROPERTY_KEY_PATTERN.test(key)) {
      console.warn(
        `${TAG} Invalid user property key: "${key}". Must match /^[a-zA-Z][a-zA-Z0-9_]{0,49}$/`,
      );
      return;
    }

    const sanitizedValue =
      typeof value === 'string' ? sanitizePIIString(value).slice(0, 200) : value;

    this.bridge.fire('analytics', 'setUserProperty', { key, value: sanitizedValue });
  }

  // ============================================
  // Auto-Capture Lifecycle (SDK 내부 전용)
  // ============================================

  /**
   * 자동 수집 초기화. `index.ts` 에서 자동 호출됨.
   * @internal
   */
  install(): void {
    if (this.installed || typeof window === 'undefined') return;
    this.installed = true;

    this.installErrorCapture();
    this.installPerformanceCapture();
    this.installNavigationTimingCapture();

    // BridgeCore 에 레이턴시 측정 콜백 등록
    this.bridge.registerPerfCallback((metricName: string, valueMs: number) => {
      this.dispatchPerformanceMetric(metricName, valueMs, 'ms');
    });
  }

  /**
   * 자동 수집 해제. 미니앱 언마운트 시 호출하면 메모리 누수를 방지.
   * @internal
   */
  uninstall(): void {
    if (!this.installed || typeof window === 'undefined') return;
    this.installed = false;

    window.removeEventListener('error', this.boundGlobalErrorHandler);
    window.removeEventListener('unhandledrejection', this.boundRejectionHandler);

    this.perfObserver?.disconnect();
    this.perfObserver = null;
  }

  /**
   * Navigation Interceptor 에서 화면 전환 발생 시 호출.
   * @internal
   */
  onNavigate(to: string, from: string): void {
    this.trackPageView(to, from);
  }

  // ============================================
  // Private — Dispatch
  // ============================================

  private dispatch(
    eventType: TrackingEventType,
    eventName: string,
    params?: EventParams,
  ): void {
    const payload: TrackingPayload = {
      eventType,
      eventName,
      timestamp: Date.now(),
      ...(params !== undefined && { params }),
    };

    // TrackingPayload 를 BridgeRequest.params (Record<string, unknown>) 로 전달
    this.bridge.fire('analytics', 'track', payload as unknown as Record<string, unknown>);
  }

  private dispatchPerformanceMetric(
    name: string,
    value: number,
    unit: 'ms' | 'bytes' | 'score',
  ): void {
    this.dispatch('performance', 'performance_metric', {
      metricName: name,
      value,
      unit,
    });
  }

  // ============================================
  // Private — Auto-Capture Installers
  // ============================================

  private installErrorCapture(): void {
    window.addEventListener('error', this.boundGlobalErrorHandler);
    window.addEventListener('unhandledrejection', this.boundRejectionHandler);
  }

  private handleGlobalError(event: ErrorEvent): void {
    this.dispatch('error', 'js_error', {
      message: (event.message ?? 'Unknown error').slice(0, 500),
      filename: (event.filename ?? '').slice(0, 200),
      lineno: event.lineno ?? 0,
      colno: event.colno ?? 0,
      fatal: 0,
    });
  }

  private handleUnhandledRejection(event: PromiseRejectionEvent): void {
    const { reason } = event;
    const message = (
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : safeStringify(reason)
    ).slice(0, 500);

    const stack = reason instanceof Error ? truncateStack(reason.stack) : undefined;

    const params: EventParams = { message, fatal: 0 };
    if (stack !== undefined) params['stack'] = stack;

    this.dispatch('error', 'unhandled_rejection', params);
  }

  private installPerformanceCapture(): void {
    if (typeof PerformanceObserver === 'undefined') return;

    try {
      const supported = PerformanceObserver.supportedEntryTypes ?? [];
      const targets = ['paint', 'largest-contentful-paint'].filter((t) =>
        supported.includes(t),
      );
      if (targets.length === 0) return;

      this.perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.dispatchPerformanceMetric(
              'first_contentful_paint',
              Math.round(entry.startTime),
              'ms',
            );
          } else if (entry.entryType === 'largest-contentful-paint') {
            this.dispatchPerformanceMetric(
              'largest_contentful_paint',
              Math.round(entry.startTime),
              'ms',
            );
          }
        }
      });

      this.perfObserver.observe({ entryTypes: targets });
    } catch {
      // PerformanceObserver 미지원 환경 무시
    }
  }

  private installNavigationTimingCapture(): void {
    const capture = () => {
      try {
        const [nav] = performance.getEntriesByType(
          'navigation',
        ) as PerformanceNavigationTiming[];
        if (!nav) return;

        if (nav.domContentLoadedEventEnd > 0) {
          this.dispatchPerformanceMetric(
            'dom_content_loaded',
            Math.round(nav.domContentLoadedEventEnd),
            'ms',
          );
        }
        if (nav.loadEventEnd > 0) {
          this.dispatchPerformanceMetric('page_load', Math.round(nav.loadEventEnd), 'ms');
        }
        if (nav.transferSize !== undefined && nav.transferSize > 0) {
          this.dispatchPerformanceMetric('transfer_size', nav.transferSize, 'bytes');
        }
      } catch {
        // navigation timing 미지원 환경 무시
      }
    };

    if (document.readyState === 'complete') {
      capture();
    } else {
      window.addEventListener('load', capture, { once: true });
    }
  }
}

// ============================================
// Module-Private Helpers
// ============================================

/** 이벤트명 유효성 검사. false 반환 시 console.warn 출력. */
function validateEventName(name: string): boolean {
  if (name.length > MAX_EVENT_NAME_LENGTH) {
    console.warn(`${TAG} Event name too long (max ${MAX_EVENT_NAME_LENGTH}): "${name}"`);
    return false;
  }
  if (!EVENT_NAME_PATTERN.test(name)) {
    console.warn(
      `${TAG} Invalid event name: "${name}". Must match /^[a-z][a-z0-9_]{0,99}$/`,
    );
    return false;
  }
  return true;
}

/**
 * 이벤트 파라미터 정제.
 * - 문자열 값: MAX_PARAM_VALUE_LENGTH truncate + PII 마스킹
 * - 숫자/불리언: 그대로 통과
 */
function sanitizeParams(params: EventParams): EventParams {
  const result: EventParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') {
      result[key] = sanitizePIIString(value).slice(0, MAX_PARAM_VALUE_LENGTH);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/** Record<string, string> PII 마스킹 + truncate */
function sanitizeStringRecord(record: Record<string, string>): EventParams {
  const result: EventParams = {};
  for (const [k, v] of Object.entries(record)) {
    result[k] = sanitizePIIString(v).slice(0, MAX_PARAM_VALUE_LENGTH);
  }
  return result;
}

/**
 * 문자열에서 PII 패턴 마스킹.
 * RegExp 는 stateful(lastIndex)이므로 매 호출 전 reset.
 */
function sanitizePIIString(value: string): string {
  let sanitized = value;
  for (const pattern of PII_PATTERNS) {
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, PII_PLACEHOLDER);
  }
  return sanitized;
}

/** Error.stack 을 MAX_STACK_LENGTH 로 truncate */
function truncateStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return stack.length > MAX_STACK_LENGTH
    ? `${stack.slice(0, MAX_STACK_LENGTH)}…[truncated]`
    : stack;
}

/** JSON.stringify 실패에 안전한 직렬화 */
function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null';
  } catch {
    return String(value);
  }
}

// BRIDGE_LATENCY_SAMPLE_RATE 는 install() 에서 registerPerfCallback 클로저에서 사용
// 클래스 외부 상수로 두어 테스트에서 주입 가능하도록 export
export { BRIDGE_LATENCY_SAMPLE_RATE };
