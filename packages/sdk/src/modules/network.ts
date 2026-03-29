import type { BridgeCore } from '../core/bridge';
import type { RequestOptions, RequestResult } from '../types';

/**
 * Network Module — mTLS 인증이 자동 적용되는 HTTP 요청
 *
 * @example
 * ```ts
 * const result = await Union.request({
 *   url: 'https://api.example.com/data',
 *   method: 'GET',
 * });
 * console.log(result.data);
 * ```
 */
export class NetworkModule {
  constructor(private bridge: BridgeCore) {}

  /** HTTP 요청 (mTLS 자동 적용) */
  request(options: RequestOptions): Promise<RequestResult> {
    return this.bridge.invoke<RequestResult>(
      'network',
      'request',
      { ...options } as Record<string, unknown>,
      options.timeout,
    );
  }
}
