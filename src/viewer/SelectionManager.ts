/**
 * SelectionManager — Stub for OBC v3.x.
 *
 * Object picking is handled directly in ViewerEngine
 * using model.raycast() which is the correct fragment-aware
 * picking API in @thatopen/fragments v3.x.
 *
 * This class is retained for future Highlighter integration
 * via @thatopen/components-front.
 */

export interface SelectionManagerConfig {
  onPicked: (globalId: string | null, isMulti: boolean) => void
}

export class SelectionManager {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(_config: SelectionManagerConfig) {}

  init(): void {
    // Picking handled in ViewerEngine.handleClick via model.raycast()
  }

  dispose(): void {
    // Nothing to dispose
  }
}