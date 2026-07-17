import { create } from 'zustand'
import { SimulationEngine } from '../core/simulation/SimulationEngine'
import { progressToDate } from '../utils/date.utils'
import type { SimulationStatus, SimulationFrame, Activity } from '../types'

const PROJECT_START = new Date('2026-01-01')
const PROJECT_END   = new Date('2026-12-31')

interface SimulationState {
  /** Current simulation date derived from progress */
  currentDate:   Date
  /** Slider value 0–100 */
  progress:      number
  /** Whether auto-play is active */
  isPlaying:     boolean
  /**
   * Whether the 4D simulation overlay is active.
   *
   * TRUE  → simulation colors (future/active/completed) are applied to the model.
   * FALSE → IFC original materials are shown; no color override is applied.
   *
   * This is the master gate for the color override system.
   * `isPlaying` only controls auto-advance of the timeline.
   */
  isSimulationActive: boolean
  /** Project boundary dates — will be set from loaded model in Phase 2 */
  projectStart:  Date
  projectEnd:    Date

  // ── Actions ──────────────────────────────────────────────
  setProgress:          (value: number) => void
  setPlaying:           (playing: boolean) => void
  /**
   * Activates simulation mode — applies construction status colors to the model.
   * Call this when the user explicitly starts or resumes the 4D simulation.
   */
  activateSimulation:   () => void
  /**
   * Deactivates simulation mode — restores original IFC materials.
   * Call this when the user stops or exits the 4D simulation.
   */
  deactivateSimulation: () => void
  tick:                 () => void

  // ── Derived computation (delegated to SimulationEngine) ──
  getObjectStatus:  (globalId: string, activities: Activity[]) => SimulationStatus
  computeAllFrames: (activities: Activity[]) => Map<string, SimulationFrame>
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  currentDate:         progressToDate(35, PROJECT_START, PROJECT_END),
  progress:            35,
  isPlaying:           false,
  isSimulationActive:  false,    // ← IFC original colors shown by default
  projectStart:        PROJECT_START,
  projectEnd:          PROJECT_END,

  setProgress: (value) => {
    const clamped = Math.max(0, Math.min(100, value))
    set({
      progress:    clamped,
      currentDate: progressToDate(clamped, PROJECT_START, PROJECT_END),
    })
  },

  setPlaying: (playing) => {
    // Starting playback implicitly activates the simulation overlay
    if (playing) {
      set({ isPlaying: true, isSimulationActive: true })
    } else {
      set({ isPlaying: false })
    }
  },

  activateSimulation: () => set({ isSimulationActive: true }),

  deactivateSimulation: () => set({ isSimulationActive: false, isPlaying: false }),

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