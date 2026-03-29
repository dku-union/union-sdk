import type { BridgeAdapter, BridgeRequest } from '../types';

/**
 * iOS WKWebView 어댑터
 * window.webkit.messageHandlers.union.postMessage() 사용
 */
export class IOSAdapter implements BridgeAdapter {
  readonly platform = 'ios' as const;

  send(message: BridgeRequest): void {
    window.webkit!.messageHandlers.union.postMessage(message);
  }
}

/**
 * Android WebView 어댑터
 * window.UnionBridge.postMessage() 사용
 */
export class AndroidAdapter implements BridgeAdapter {
  readonly platform = 'android' as const;

  send(message: BridgeRequest): void {
    (window as any).UnionBridge.postMessage(JSON.stringify(message));
  }
}

// Global type augmentation for native bridge interfaces
declare global {
  interface Window {
    webkit?: {
      messageHandlers: {
        union: {
          postMessage(message: unknown): void;
        };
      };
    };
    UnionBridge?: {
      postMessage(message: string): void;
    };
  }
}
