/**
 * Simulation store — owns the 4D timeline state.
 *
 * Delegates ALL status computation to SimulationEngine.
 * React components never compute simulation status directly.
 */

import { create } from 'zustand'
import { SimulationEngine } from '../core/simulation/SimulationEngine'
import { progressToDate } from '../utils/date.utils'
import type { SimulationStatus, SimulationFrame, Activity } from '../types'

const PROJECT_START = new Date('2024-01-01')
const PROJECT_END   = new Date('2024-12-31')

interface SimulationState {
  /** Current simulation date derived from progress */
  currentDate:   Date
  /** Slider value 0–100 */
  progress:      number
  /** Whether auto-play is active */
  isPlaying:     boolean
  /** Project boundary dates — will be set from loaded model in Phase 2 */
  projectStart:  Date
  projectEnd:    Date

  // ── Actions ──────────────────────────────────────────────
  setProgress:      (value: number) => void
  setPlaying:       (playing: boolean) => void
  tick:             () => void

  // ── Derived computation (delegated to SimulationEngine) ──
  getObjectStatus:  (globalId: string, activities: Activity[]) => SimulationStatus
  computeAllFrames: (activities: Activity[]) => Map<string, SimulationFrame>
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  currentDate:  progressToDate(35, PROJECT_START, PROJECT_END),
  progress:     35,
  isPlaying:    false,
  projectStart: PROJECT_START,
  projectEnd:   PROJECT_END,

  setProgress: (value) => {
    const clamped = Math.max(0, Math.min(100, value))
    set({
      progress:    clamped,
      currentDate: progressToDate(clamped, PROJECT_START, PROJECT_END),
    })
  },

  setPlaying: (playing) => set({ isPlaying: playing }),

  tick: () => {
    const { progress, setProgress, setPlaying } = get()
    const next = progress + 1
    if (next >= 100) {
      setProgress(100)
      setPlaying(false)
    } else {
      setProgress(next)
    }
  },

  getObjectStatus: (globalId, activities) =>
    SimulationEngine.computeObjectStatus(globalId, get().currentDate, activities),

  computeAllFrames: (activities) =>
    SimulationEngine.computeFrames(get().currentDate, activities),
}))