import type { BridgeCore } from '../core/bridge';
import type { LoginResult, UserProfile } from '../types';

/**
 * Auth Module — 사용자 인증
 *
 * @example
 * ```ts
 * const { code } = await Union.auth.login();
 * const profile = await Union.auth.getUserProfile();
 *
 * // 자체 백엔드에 신원 증명 (publisher 백엔드가 JWKS 로 검증)
 * const idToken = await Union.auth.getIdToken();
 * fetch('/api/me', { headers: { Authorization: `Bearer ${idToken}` } });
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

  /**
   * 이 미니앱에 스코프된 사용자 ID 토큰을 조회한다 (publisher 자체 백엔드 인증용).
   *
   * RS256 으로 서명된 OIDC 스타일 토큰이며 `aud` 가 이 미니앱의 appId 로 한정된다.
   * publisher 백엔드는 Union JWKS(`{issuer}/.well-known/jwks.json`) 공개키로 시크릿 공유 없이
   * 검증한다. 사용자의 Union 세션 토큰은 미니앱에 노출되지 않는다.
   *
   * 토큰에 담기는 신원 claim(`nickname`, `email`, `university`)은 사용자가 동의한
   * 권한 스코프에 한해 포함된다. `sub`(사용자 식별자)는 항상 포함된다.
   */
  getIdToken(): Promise<string> {
    return this.bridge.invoke<string>('auth', 'getIdToken');
  }

  /**
   * @deprecated 세션 access token 이 아니라 {@link getIdToken} 과 동일한 앱 스코프 ID 토큰을 반환한다.
   * 신규 코드는 `getIdToken()` 을 사용할 것. (하위호환을 위해 유지)
   */
  getAccessToken(): Promise<string> {
    return this.bridge.invoke<string>('auth', 'getAccessToken');
  }

  /** 로그아웃 */
  logout(): Promise<void> {
    return this.bridge.invoke<void>('auth', 'logout');
  }
}
