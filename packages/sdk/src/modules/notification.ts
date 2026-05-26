import type { BridgeCore } from '../core/bridge';
import type {
  NotificationPermissionResult,
  NotificationPermissionStatus,
  DeviceTokenResult,
  LocalNotificationOptions,
  LocalNotificationResult,
  NotificationPayload,
} from '../types';

/**
 * Notification Module — 푸시 / 로컬 알림 / 미니앱 구독 관리.
 *
 * 보안 모델:
 * - **원격 푸시 발송은 SDK 에서 직접 할 수 없다.** publisher 백엔드가
 *   `X-Union-Api-Key` 헤더로 Spring `POST /api/v1/publishers/notifications` 를
 *   호출하는 경로만 허용된다. WebView 내부 JS 에 API Key 가 노출되면 안 되기 때문.
 * - SDK 에서 가능한 것: 권한 요청, 로컬(타이머) 알림, 미니앱별 구독 토글, 원격 푸시 수신 이벤트.
 *
 * @example
 * ```ts
 * // 1) 사용자에게 알림 권한 받기
 * const { granted } = await Union.notification.requestPermission();
 *
 * // 2) 본 미니앱의 알림 구독 (사용자가 명시적으로 ON)
 * await Union.notification.subscribe();
 *
 * // 3) 원격 푸시 수신 이벤트 구독
 * Union.on('notification:received', (payload) => {
 *   console.log('알림 도착', payload);
 * });
 *
 * // 4) 5초 후 로컬 알림 (앱 백그라운드일 때만 노출)
 * await Union.notification.scheduleLocal({
 *   title: '확인하세요',
 *   body: '5초 뒤 이 메시지가 표시됩니다',
 *   delaySeconds: 5,
 * });
 * ```
 */
export class NotificationModule {
  constructor(private bridge: BridgeCore) {}

  /**
   * 사용자에게 알림 권한을 요청한다.
   * iOS 는 거부 후에는 다시 요청 다이얼로그가 뜨지 않으니 (시스템 정책) UI 흐름을 잘 설계해야 한다.
   */
  requestPermission(): Promise<NotificationPermissionResult> {
    return this.bridge.invoke<NotificationPermissionResult>(
      'notification',
      'requestPermission'
    );
  }

  /** 현재 알림 권한 상태 조회 — 다이얼로그를 띄우지 않음 */
  async getPermissionStatus(): Promise<NotificationPermissionStatus> {
    const result = await this.bridge.invoke<{ status: NotificationPermissionStatus }>(
      'notification',
      'getPermissionStatus'
    );
    return result.status;
  }

  /**
   * APNs / FCM 디바이스 토큰 조회.
   * 토큰은 네이티브가 자동으로 Spring 에 등록한다 — 미니앱이 직접 서버에 보낼 필요 없음.
   * 디버깅 / 사용자 표시용 정도로만 활용.
   */
  getDeviceToken(): Promise<DeviceTokenResult> {
    return this.bridge.invoke<DeviceTokenResult>('notification', 'getDeviceToken');
  }

  /**
   * N초 뒤 발사되는 로컬 알림 예약.
   * 앱이 포그라운드면 배너로 표시, 백그라운드면 알림 센터에 추가된다.
   */
  scheduleLocal(options: LocalNotificationOptions): Promise<LocalNotificationResult> {
    return this.bridge.invoke<LocalNotificationResult>(
      'notification',
      'scheduleLocal',
      options as unknown as Record<string, unknown>
    );
  }

  /** 예약된 로컬 알림 취소 */
  cancelLocal(notificationId: string): void {
    this.bridge.fire('notification', 'cancelLocal', { notificationId });
  }

  /** 예약된 모든 로컬 알림 취소 */
  cancelAllLocal(): void {
    this.bridge.fire('notification', 'cancelAllLocal');
  }

  /**
   * 본 미니앱에 대한 알림 구독.
   * 사용자가 미니앱을 실행하면 네이티브가 자동으로 구독 처리하지만,
   * 명시적으로 구독 토글 UI 를 제공하려면 이 메서드를 호출.
   */
  subscribe(): Promise<void> {
    return this.bridge.invoke<void>('notification', 'subscribe');
  }

  /** 본 미니앱의 알림 구독 해지 */
  unsubscribe(): Promise<void> {
    return this.bridge.invoke<void>('notification', 'unsubscribe');
  }

  /** 본 미니앱 알림 ON/OFF 토글 (구독은 유지하면서 푸시만 끔) */
  setPushEnabled(enabled: boolean): Promise<void> {
    return this.bridge.invoke<void>('notification', 'setPushEnabled', { enabled });
  }

  /**
   * 원격 푸시 수신 이벤트 구독 헬퍼.
   * `Union.on('notification:received', handler)` 의 sugar — 반환된 함수를 호출하면 구독 해제.
   */
  onReceived(handler: (payload: NotificationPayload) => void): () => void {
    const wrapped = (data?: unknown) => handler((data ?? {}) as NotificationPayload);
    this.bridge.on('notification:received', wrapped);
    return () => this.bridge.off('notification:received', wrapped);
  }
}
