import { useEffect, useRef } from 'react'
import { useSimulationStore } from '../store/simulation.store'
import { useActivityStore } from '../store/activity.store'
import { formatDisplayDate } from '../utils/date.utils'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export default function TimelineSlider() {
  const progress             = useSimulationStore(s => s.progress)
  const currentDate          = useSimulationStore(s => s.currentDate)
  const isPlaying            = useSimulationStore(s => s.isPlaying)
  const isSimulationActive   = useSimulationStore(s => s.isSimulationActive)
  const setProgress          = useSimulationStore(s => s.setProgress)
  const setPlaying           = useSimulationStore(s => s.setPlaying)
  const activateSimulation   = useSimulationStore(s => s.activateSimulation)
  const deactivateSimulation = useSimulationStore(s => s.deactivateSimulation)
  const tick                 = useSimulationStore(s => s.tick)
  const computeAllFrames     = useSimulationStore(s => s.computeAllFrames)
  const activities           = useActivityStore(s => s.activities)

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Auto-play loop ────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(tick, 100)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [isPlaying, tick])

  // ── Status counts (derived from SimulationEngine) ─────────
  const frames = computeAllFrames(activities)
  const counts = { completed: 0, active: 0, future: 0 }
  frames.forEach(frame => { counts[frame.status]++ })

  // ── Handlers ─────────────────────────────────────────────

  const handlePlayPause = () => {
    if (isPlaying) {
      // Pause: stop auto-advance but keep simulation colors visible
      setPlaying(false)
    } else {
      // Play: activate simulation + start auto-advance
      // setPlaying(true) in the store also sets isSimulationActive = true
      setPlaying(true)
    }
  }

  const handleReset = () => {
    // Stop playback and deactivate simulation — restores original IFC materials
    deactivateSimulation()
    setProgress(0)
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Dragging the slider = user is exploring the timeline = simulation is active
    setPlaying(false)
    activateSimulation()
    setProgress(Number(e.target.value))
  }

  return (
    <div className="timeline-panel">
      <div className="timeline-top">
        <span className="timeline-label">4D Timeline Control</span>

        {/* Reset button — returns to original IFC appearance */}
        <button
          className="play-btn"
          onClick={handleReset}
          title="Reset simulation — restore original IFC colors"
          style={{ fontSize: 14, opacity: isSimulationActive ? 1 : 0.4 }}
        >
          ⏮
        </button>

        {/* Play / Pause button */}
        <button
          className={`play-btn${isPlaying ? ' playing' : ''}`}
          onClick={handlePlayPause}
          title={isPlaying ? 'Pause simulation' : 'Play simulation'}
        >
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div className="timeline-slider-wrap">
          <div className="timeline-slider-track">
            <div className="timeline-slider-fill" style={{ width: `${progress}%` }} />
            <div className="timeline-slider-thumb" style={{ left: `${progress}%` }} />
            <input
              type="range"
              className="timeline-input"
              min={0}
              max={100}
              value={progress}
              onChange={handleSliderChange}
            />
          </div>
          <div className="timeline-months">
            {MONTHS.map(m => <span key={m}>{m}</span>)}
          </div>
        </div>

        <span className="timeline-date-display">{formatDisplayDate(currentDate)}</span>
      </div>

      <div className="timeline-bottom">
        <div className="timeline-pills">
          <div className="timeline-pill">
            <div className="timeline-pill__dot" style={{ background: '#2ECC71' }} />
            <span>Completed</span>
            <span className="timeline-pill__count" style={{ color: '#2ECC71' }}>{counts.completed}</span>
          </div>
          <div className="timeline-pill">
            <div className="timeline-pill__dot" style={{ background: '#2F6BFF' }} />
            <span>Active</span>
            <span className="timeline-pill__count" style={{ color: '#2F6BFF' }}>{counts.active}</span>
          </div>
          <div className="timeline-pill">
            <div className="timeline-pill__dot" style={{ background: '#B0B0B0' }} />
            <span>Upcoming</span>
            <span className="timeline-pill__count" style={{ color: '#B0B0B0' }}>{counts.future}</span>
          </div>
          <div className="timeline-pill" style={{ marginLeft: 'auto' }}>
            {isSimulationActive ? (
              <>
                <span style={{ color: 'var(--text-secondary)' }}>Progress</span>
                <span className="timeline-pill__count" style={{ color: 'var(--accent-blue)' }}>
                  {Math.round(progress)}%
                </span>
              </>
            ) : (
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>
                IFC original colors active
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}