import type { BridgeCore } from '../core/bridge';
import type { EventParams } from '../types';

/**
 * Analytics Module — 사용자 행동 트래킹
 *
 * @example
 * ```ts
 * Union.analytics.trackPageView('home');
 * Union.analytics.trackEvent('button_click', { buttonId: 'signup' });
 * ```
 */
export class AnalyticsModule {
  constructor(private bridge: BridgeCore) {}

  /** 커스텀 이벤트 트래킹 */
  trackEvent(eventName: string, params?: EventParams): void {
    this.bridge.fire('analytics', 'trackEvent', { eventName, params });
  }

  /** 페이지 뷰 트래킹 */
  trackPageView(pageName: string): void {
    this.bridge.fire('analytics', 'trackPageView', { pageName });
  }
}
