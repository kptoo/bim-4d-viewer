import { useEffect, useRef, useState } from 'react'
import { useBIMStore } from '../state/bimStore'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function TimelineSlider() {
  const progress         = useBIMStore(s => s.timelineProgress)
  const currentDate      = useBIMStore(s => s.currentDate)
  const setProgress      = useBIMStore(s => s.setTimelineProgress)
  const getElementStatus = useBIMStore(s => s.getElementStatus)
  const elements         = useBIMStore(s => s.ifcElements)

  const [playing, setPlaying] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const counts = { completed: 0, active: 0, future: 0 }
  elements.forEach(el => { counts[getElementStatus(el.globalId)]++ })

  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        useBIMStore.setState(s => {
          const next = s.timelineProgress + 1
          if (next >= 100) {
            setPlaying(false)
            return { timelineProgress: 100 }
          }
          return { timelineProgress: next, currentDate: new Date(
            new Date('2024-01-01').getTime() +
            ((new Date('2024-12-31').getTime() - new Date('2024-01-01').getTime()) * next) / 100
          )}
        })
      }, 100)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing])

  return (
    <div className="timeline-panel">
      <div className="timeline-top">
        <span className="timeline-label">4D Timeline Control</span>

        <button
          className={`play-btn${playing ? ' playing' : ''}`}
          onClick={() => setPlaying(p => !p)}
          title={playing ? 'Pause' : 'Play simulation'}
        >
          {playing ? '⏸' : '▶'}
        </button>

        <div className="timeline-slider-wrap">
          <div className="timeline-slider-track">
            <div
              className="timeline-slider-fill"
              style={{ width: `${progress}%` }}
            />
            <div
              className="timeline-slider-thumb"
              style={{ left: `${progress}%` }}
            />
            <input
              type="range"
              className="timeline-input"
              min={0}
              max={100}
              value={progress}
              onChange={e => {
                setPlaying(false)
                setProgress(Number(e.target.value))
              }}
            />
          </div>
          <div className="timeline-months">
            {MONTHS.map(m => <span key={m}>{m}</span>)}
          </div>
        </div>

        <span className="timeline-date-display">{formatDate(currentDate)}</span>
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
            <span style={{ color: 'var(--text-secondary)' }}>Progress</span>
            <span className="timeline-pill__count" style={{ color: 'var(--accent-blue)' }}>
              {Math.round(progress)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
