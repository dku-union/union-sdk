import type { BridgeCore } from '../core/bridge';
import type { LoginResult, UserProfile } from '../types';

/**
 * Auth Module — 사용자 인증
 *
 * @example
 * ```ts
 * const { code } = await Union.auth.login();
 * const profile = await Union.auth.getUserProfile();
 * ```
 */
export class AuthModule {
  constructor(private bridge: BridgeCore) {}

  /** 사용자 로그인 (OAuth 동의 화면 표시) */
  login(): Promise<LoginResult> {
    return this.bridge.invoke<LoginResult>('auth', 'login');
  }

  /** 현재 로그인된 사용자 프로필 조회 */
  getUserProfile(): Promise<UserProfile> {
    return this.bridge.invoke<UserProfile>('auth', 'getUserProfile');
  }

  /** Access Token 조회 (서버 간 통신용) */
  getAccessToken(): Promise<string> {
    return this.bridge.invoke<string>('auth', 'getAccessToken');
  }

  /** 로그아웃 */
  logout(): Promise<void> {
    return this.bridge.invoke<void>('auth', 'logout');
  }
}
