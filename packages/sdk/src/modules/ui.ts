import type { BridgeCore } from '../core/bridge';
import type { ToastOptions, ModalOptions, ModalResult, NavigationBarOptions } from '../types';

/**
 * UI Module — 네이티브 UI 컴포넌트
 *
 * @example
 * ```ts
 * Union.ui.showToast({ message: '저장되었습니다!' });
 * const { confirmed } = await Union.ui.showModal({ title: '확인', content: '삭제하시겠습니까?' });
 * ```
 */
export class UIModule {
  constructor(private bridge: BridgeCore) {}

  /** 토스트 메시지 표시 */
  showToast(options: ToastOptions): void {
    this.bridge.fire('ui', 'showToast', { ...options });
  }

  /** 모달 다이얼로그 표시 */
  showModal(options: ModalOptions): Promise<ModalResult> {
    return this.bridge.invoke<ModalResult>('ui', 'showModal', { ...options });
  }

  /** 로딩 인디케이터 표시 */
  showLoading(message?: string): void {
    this.bridge.fire('ui', 'showLoading', { message });
  }

  /** 로딩 인디케이터 숨기기 */
  hideLoading(): void {
    this.bridge.fire('ui', 'hideLoading');
  }

  /** 네비게이션 바 설정 */
  setNavigationBar(options: NavigationBarOptions): void {
    this.bridge.fire('ui', 'setNavigationBar', { ...options });
  }

  /** 미니앱 종료 */
  close(): void {
    this.bridge.fire('ui', 'close');
  }
}
