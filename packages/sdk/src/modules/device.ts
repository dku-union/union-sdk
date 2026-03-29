import type { BridgeCore } from '../core/bridge';
import type { LocationResult, QRCodeResult, VibrationType } from '../types';

/**
 * Device Module — 디바이스 기능 접근
 *
 * @example
 * ```ts
 * const location = await Union.device.getLocation();
 * const { result } = await Union.device.scanQRCode();
 * ```
 */
export class DeviceModule {
  constructor(private bridge: BridgeCore) {}

  /** 위치 정보 조회 (device.location 권한 필요) */
  getLocation(): Promise<LocationResult> {
    return this.bridge.invoke<LocationResult>('device', 'getLocation');
  }

  /** QR 코드 스캔 (device.camera 권한 필요) */
  scanQRCode(): Promise<QRCodeResult> {
    return this.bridge.invoke<QRCodeResult>('device', 'scanQRCode');
  }

  /** 클립보드 텍스트 읽기 */
  getClipboard(): Promise<string> {
    return this.bridge.invoke<string>('device', 'getClipboard');
  }

  /** 클립보드에 텍스트 복사 */
  setClipboard(text: string): Promise<void> {
    return this.bridge.invoke<void>('device', 'setClipboard', { text });
  }

  /** 진동 피드백 */
  vibrate(type: VibrationType = 'medium'): void {
    this.bridge.fire('device', 'vibrate', { type });
  }
}
