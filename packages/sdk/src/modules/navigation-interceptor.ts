import type { NavigationModule } from './navigation';

const TAG = '[Union Nav]';

/**
 * <a> 태그 자동 가로채기 + viewport prefetch
 * SDK 초기화 시 자동으로 설치됨
 */
export function installNavigationInterceptor(navigation: NavigationModule): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  console.log(`${TAG} Interceptor installing...`);

  const cleanups: (() => void)[] = [];

  // 1. <a> 클릭 가로채기 (capture phase — 프레임워크 핸들러보다 먼저 실행)
  const clickHandler = (e: Event) => {
    const anchor = (e.target as Element)?.closest?.('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    console.log(`${TAG} Click detected: <a href="${href}"> data-union-nav="${anchor.getAttribute('data-union-nav')}"`);

    // data-union-nav="false" → opt-out
    if (anchor.getAttribute('data-union-nav') === 'false') {
      console.log(`${TAG} Skipped (opt-out): ${href}`);
      return;
    }

    if (!href || isExternalLink(href)) {
      console.log(`${TAG} Skipped (external/empty): ${href}`);
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    console.log(`${TAG} Intercepted → navigation.push("${href}")`);
    navigation.push(href);
  };

  document.addEventListener('click', clickHandler, true);
  cleanups.push(() => document.removeEventListener('click', clickHandler, true));

  // 2. IntersectionObserver — viewport 진입 시 prefetch
  if ('IntersectionObserver' in window) {
    const prefetched = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const href = (entry.target as HTMLAnchorElement).getAttribute('href');
          if (href && !isExternalLink(href) && !prefetched.has(href)) {
            prefetched.add(href);
            console.log(`${TAG} Prefetch (viewport): ${href}`);
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

    // 초기 관찰
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', observeAnchors, { once: true });
    } else {
      observeAnchors();
    }

    // 3. MutationObserver — 동적으로 추가되는 <a> 태그 감지
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
