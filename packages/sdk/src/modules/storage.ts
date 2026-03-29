import type { BridgeCore } from '../core/bridge';

/**
 * Storage Module — 미니앱별 격리된 Key-Value 저장소
 *
 * @example
 * ```ts
 * await Union.storage.set('user_settings', { theme: 'dark' });
 * const settings = await Union.storage.get('user_settings');
 * ```
 */
export class StorageModule {
  constructor(private bridge: BridgeCore) {}

  /** 값 조회 */
  get<T = unknown>(key: string): Promise<T | null> {
    return this.bridge.invoke<T | null>('storage', 'get', { key });
  }

  /** 값 저장 */
  set(key: string, value: unknown): Promise<void> {
    return this.bridge.invoke<void>('storage', 'set', { key, value });
  }

  /** 값 삭제 */
  remove(key: string): Promise<void> {
    return this.bridge.invoke<void>('storage', 'remove', { key });
  }

  /** 전체 삭제 */
  clear(): Promise<void> {
    return this.bridge.invoke<void>('storage', 'clear');
  }
}
