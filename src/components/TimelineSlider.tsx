/**
 * TimelineSlider.tsx — 4D Construction Playback Controls
 *
 * Drives the SimulationEngine via useSimulationStore. Every control here
 * calls an action on the store — no business logic lives in this component.
 *
 * Controls:
 *   ⏮  Reset    — calls resetPlayback() → deactivates + returns to window start
 *   ▶  Play     — calls setPlaying(true)  → activates simulation + auto-advances
 *   ⏸  Pause   — calls setPlaying(false) → pauses at current date (keeps colours)
 *   ⏹  Stop    — calls resetPlayback()   → deactivates + returns to window start
 *
 * Activity-scoped timeline (this iteration):
 *   This component now calls `useActivityTimeline()` — a side-effect hook that
 *   watches the selected activity and narrows the timeline window to that
 *   activity's exact Start Date → End Date. When no activity is selected, the
 *   window covers the full project range.
 *
 *   The component itself does not contain any of this logic — it simply displays
 *   whatever projectStart / projectEnd the store currently exposes.
 *
 *   When an activity is selected, a contextual banner appears below the
 *   transport controls showing the activity name and its dates.
 *
 * Slider drag:
 *   Dragging automatically activates the simulation so the viewer updates
 *   immediately. Colour overlay stays on after releasing the slider.
 *
 * Project date range:
 *   The slider spans `projectStart` → `projectEnd` from the store.
 *   In activity-scoped mode these equal the activity's startDate / endDate.
 *   In full-project mode these span the entire construction schedule.
 *
 * @module TimelineSlider
 */

import { useEffect, useRef }     from 'react'
import { useSimulationStore }    from '../store/simulation.store'
import { useActivityStore }      from '../store/activity.store'
import { useSelectionStore }     from '../store/selection.store'
import { useActivityTimeline }   from '../hooks/useActivityTimeline'
import { formatDisplayDate }     from '../utils/date.utils'

export default function TimelineSlider() {
  // ── Activity-scoped timeline: side-effect only, no return value ───────────
  //
  // This is the single call site that syncs the simulation window to the
  // currently selected activity. See useActivityTimeline.ts for details.
  useActivityTimeline()

  // ── Store reads ───────────────────────────────────────────────────────────

  const progress             = useSimulationStore(s => s.progress)
  const currentDate          = useSimulationStore(s => s.currentDate)
  const isPlaying            = useSimulationStore(s => s.isPlaying)
  const isSimulationActive   = useSimulationStore(s => s.isSimulationActive)
  const projectStart         = useSimulationStore(s => s.projectStart)
  const projectEnd           = useSimulationStore(s => s.projectEnd)
  const fullProjectStart     = useSimulationStore(s => s.fullProjectStart)
  const fullProjectEnd       = useSimulationStore(s => s.fullProjectEnd)

  const setProgress          = useSimulationStore(s => s.setProgress)
  const setPlaying           = useSimulationStore(s => s.setPlaying)
  const activateSimulation   = useSimulationStore(s => s.activateSimulation)
  const resetPlayback        = useSimulationStore(s => s.resetPlayback)
  const tick                 = useSimulationStore(s => s.tick)
  const computeAllFrames     = useSimulationStore(s => s.computeAllFrames)

  const activities           = useActivityStore(s => s.activities)
  const getActivityById      = useActivityStore(s => s.getActivityById)
  const selectedActivityId   = useSelectionStore(s => s.selectedActivityId)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Auto-play loop ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(tick, 100)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isPlaying, tick])

  // ── Status counts ──────────────────────────────────────────────────────────

  const frames = computeAllFrames(activities)
  const counts = { completed: 0, active: 0, future: 0 }
  frames.forEach(frame => { counts[frame.status]++ })

  // ── Derived: is the window scoped to a single activity? ───────────────────
  //
  // True when projectStart / projectEnd differ from the full project range.
  // Used to show the activity context banner and to label the buttons.

  const selectedActivity  = selectedActivityId ? getActivityById(selectedActivityId) : undefined
  const isActivityScoped  = selectedActivityId !== null && selectedActivity !== undefined

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handlePlayPause = () => {
    if (isPlaying) {
      setPlaying(false)
    } else {
      setPlaying(true)
    }
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPlaying(false)
    activateSimulation()
    setProgress(Number(e.target.value))
  }

  // ── Formatted labels ──────────────────────────────────────────────────────

  const startLabel = formatDisplayDate(projectStart)
  const endLabel   = formatDisplayDate(projectEnd)

  return (
    <div className="timeline-panel">

      {/* ── Activity scope banner ─────────────────────────────────────────
          Shown when the timeline is scoped to a single activity.
          Gives the user clear context about which activity is playing.
      ── */}
      {isActivityScoped && selectedActivity && (
        <div className="timeline-scope-banner">
          <span className="timeline-scope-banner__icon">📅</span>
          <span className="timeline-scope-banner__label">
            <strong>{selectedActivity.name}</strong>
            &nbsp;·&nbsp;
            {formatDisplayDate(new Date(selectedActivity.startDate))}
            &nbsp;→&nbsp;
            {formatDisplayDate(new Date(selectedActivity.endDate))}
          </span>
          <span className="timeline-scope-banner__hint">
            Click elsewhere to return to full project view
          </span>
        </div>
      )}

      {/* ── Transport controls + scrubber ── */}
      <div className="timeline-top">

        {/* Label — changes based on scope mode */}
        <span className="timeline-label">
          {isActivityScoped ? 'Activity Sequence' : '4D Construction Sequence'}
        </span>

        {/* ⏮ Reset to window start */}
        <button
          className="play-btn"
          onClick={resetPlayback}
          title={
            isActivityScoped
              ? 'Reset to activity start'
              : 'Reset to project start and clear simulation'
          }
          style={{ opacity: (isSimulationActive || progress > 0) ? 1 : 0.4 }}
          aria-label="Reset to start"
        >
          ⏮
        </button>

        {/* ▶ / ⏸  Play / Pause */}
        <button
          className={`play-btn${isPlaying ? ' playing' : ''}`}
          onClick={handlePlayPause}
          title={
            isPlaying
              ? 'Pause simulation'
              : isActivityScoped
                ? `Play ${selectedActivity?.name ?? 'activity'}`
                : 'Play full construction sequence'
          }
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        {/* ⏹ Stop */}
        <button
          className="play-btn"
          onClick={resetPlayback}
          title="Stop simulation"
          style={{ opacity: isSimulationActive ? 1 : 0.4 }}
          aria-label="Stop simulation"
        >
          ⏹
        </button>

        {/* Scrubber */}
        <div className="timeline-slider-wrap">
          <div className="timeline-slider-track">
            <div className="timeline-slider-fill" style={{ width: `${progress}%` }} />
            <div className="timeline-slider-thumb" style={{ left: `${progress}%` }} />
            <input
              type="range"
              className="timeline-input"
              min={0}
              max={100}
              step={0.1}
              value={progress}
              onChange={handleSliderChange}
              aria-label={
                isActivityScoped
                  ? `Position within ${selectedActivity?.name ?? 'activity'}`
                  : 'Simulation timeline position'
              }
            />
          </div>

          {/* Window date range labels */}
          <div className="timeline-date-range">
            <span className="timeline-date-range__start">{startLabel}</span>
            <span className="timeline-date-range__end">{endLabel}</span>
          </div>
        </div>

        {/* Current simulation date */}
        <span className="timeline-date-display" aria-live="polite">
          {formatDisplayDate(currentDate)}
        </span>

      </div>

      {/* ── Status summary row ── */}
      <div className="timeline-bottom">
        <div className="timeline-pills">

          <div className="timeline-pill">
            <div className="timeline-pill__dot" style={{ background: '#2ECC71' }} />
            <span>Completed</span>
            <span className="timeline-pill__count" style={{ color: '#2ECC71' }}>
              {counts.completed}
            </span>
          </div>

          <div className="timeline-pill">
            <div className="timeline-pill__dot" style={{ background: '#2F6BFF' }} />
            <span>Active</span>
            <span className="timeline-pill__count" style={{ color: '#2F6BFF' }}>
              {counts.active}
            </span>
          </div>

          <div className="timeline-pill">
            <div className="timeline-pill__dot" style={{ background: '#B0B0B0' }} />
            <span>Upcoming</span>
            <span className="timeline-pill__count" style={{ color: '#B0B0B0' }}>
              {counts.future}
            </span>
          </div>

          {/* Right-aligned: scope indicator or progress */}
          <div className="timeline-pill" style={{ marginLeft: 'auto' }}>
            {isSimulationActive ? (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>Progress</span>
                <span
                  className="timeline-pill__count"
                  style={{ color: 'var(--accent-blue)' }}
                >
                  {Math.round(progress)}%
                </span>
              </>
            ) : (
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                {isActivityScoped
                  ? `Select ▶ to play ${selectedActivity?.name ?? 'activity'}`
                  : 'Press ▶ to start construction sequence'}
              </span>
            )}
          </div>

        </div>
      </div>

    </div>
  )
}