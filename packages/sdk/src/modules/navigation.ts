import type { BridgeCore } from '../core/bridge';
import type { NavigationPushOptions, NavigationPushResult } from '../types';

/**
 * Navigation Module — 네이티브 페이지 스택 관리
 *
 * @example
 * ```ts
 * await Union.navigation.push('/detail/123');
 * Union.navigation.back();
 * ```
 */
export class NavigationModule {
  constructor(private bridge: BridgeCore) {}

  /** 새 네이티브 WebView 화면을 push */
  push(url: string, options?: Omit<NavigationPushOptions, 'url'>): Promise<NavigationPushResult> {
    return this.bridge.invoke<NavigationPushResult>('navigation', 'push', {
      url,
      ...options,
    });
  }

  /** 현재 화면을 pop (이전 페이지로) */
  back(): void {
    this.bridge.fire('navigation', 'back');
  }

  /** 현재 WebView의 URL을 교체 (push 없이) */
  replace(url: string): void {
    this.bridge.fire('navigation', 'replace', { url });
  }

  /** URL을 warm WebView에 미리 로드 */
  prefetch(url: string): void {
    this.bridge.fire('navigation', 'prefetch', { url });
  }
}
