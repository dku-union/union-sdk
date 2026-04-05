import type { NavigationModule } from './navigation';

const TAG = '[Union Nav]';

/**
 * Navigation Interceptor 설정 옵션
 */
export interface NavigationInterceptorOptions {
  /**
   * 네비게이션 발생 시 호출되는 콜백.
   * Analytics 연동에 사용 — `analytics.onNavigate(to, from)` 을 여기서 호출.
   *
   * @param to   - 이동할 URL (href)
   * @param from - 현재 URL (window.location.pathname + search)
   */
  onNavigate?: (to: string, from: string) => void;
}

/**
 * `<a>` 태그 자동 가로채기 + viewport prefetch
 *
 * SDK 초기화 시 자동으로 설치됨.
 * 네비게이션 발생 시 `options.onNavigate` 콜백을 통해 Analytics 로 screen_view 이벤트 전달.
 *
 * @returns cleanup 함수 — 인터셉터 제거 시 호출
 */
export function installNavigationInterceptor(
  navigation: NavigationModule,
  options: NavigationInterceptorOptions = {},
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  console.log(`${TAG} Interceptor installing...`);

  const cleanups: (() => void)[] = [];

  // ============================================
  // 1. <a> 클릭 가로채기
  //    capture phase — 프레임워크 핸들러보다 먼저 실행
  // ============================================
  const clickHandler = (e: Event) => {
    const anchor = (e.target as Element)?.closest?.('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');

    // data-union-nav="false" → opt-out
    if (anchor.getAttribute('data-union-nav') === 'false') {
      return;
    }

    if (!href || isExternalLink(href)) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    // Analytics: screen_view (네비게이션 직전 현재 경로를 referrer 로 전달)
    const from = window.location.pathname + window.location.search;
    options.onNavigate?.(href, from);

    navigation.push(href);
  };

  document.addEventListener('click', clickHandler, true);
  cleanups.push(() => document.removeEventListener('click', clickHandler, true));

  // ============================================
  // 2. IntersectionObserver — viewport 진입 시 prefetch
  // ============================================
  if ('IntersectionObserver' in window) {
    const prefetched = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const href = (entry.target as HTMLAnchorElement).getAttribute('href');
          if (href && !isExternalLink(href) && !prefetched.has(href)) {
            prefetched.add(href);
            navigation.prefetch(href);
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: '200px' },
    );

    const observeAnchors = () => {
      let count = 0;
      document.querySelectorAll('a[href]:not([data-union-observed])').forEach((a) => {
        const href = a.getAttribute('href');
        if (href && !isExternalLink(href) && a.getAttribute('data-union-nav') !== 'false') {
          a.setAttribute('data-union-observed', '');
          observer.observe(a);
          count++;
        }
      });
      if (count > 0) {
        console.log(`${TAG} Observing ${count} new <a> tags for prefetch`);
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observeAnchors, { once: true });
    } else {
      observeAnchors();
    }

    // ============================================
    // 3. MutationObserver — 동적으로 추가되는 <a> 태그 감지
    // ============================================
    const mutationObserver = new MutationObserver(() => observeAnchors());
    mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

    cleanups.push(() => {
      observer.disconnect();
      mutationObserver.disconnect();
    });
  }

  console.log(`${TAG} Interceptor installed`);
  return () => cleanups.forEach((fn) => fn());
}

function isExternalLink(href: string): boolean {
  return (
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('#') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:') ||
    href.startsWith('javascript:')
  );
}
