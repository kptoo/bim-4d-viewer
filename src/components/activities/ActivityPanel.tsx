import { useState }             from 'react'
import { useActivityStore }     from '../../store/activity.store'
import { useSelectionStore }    from '../../store/selection.store'
import { useActivities }        from '../../hooks/useActivities'
import ActivityForm             from './ActivityForm'
import type { Activity }        from '../../types'

// ── Status helpers ────────────────────────────────────────────────────────────

function getActivityDurationDays(activity: Activity): number {
  const start = new Date(activity.startDate).getTime()
  const end   = new Date(activity.endDate).getTime()
  return Math.round((end - start) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── ActivityCard ─────────────────────────────────────────────────────────────

interface ActivityCardProps {
  activity:   Activity
  isSelected: boolean
  onSelect:   (activity: Activity) => void
  onEdit:     (activity: Activity) => void
}

function ActivityCard({ activity, isSelected, onSelect, onEdit }: ActivityCardProps) {
  const linkedCount = activity.linkedGlobalIds.length
  const duration    = getActivityDurationDays(activity)

  return (
    <div
      className={`act-card${isSelected ? ' act-card--selected' : ''}`}
      onClick={() => onSelect(activity)}
    >
      <div
        className="act-card__stripe"
        style={{ background: activity.color }}
      />
      <div className="act-card__body">
        <div className="act-card__name">{activity.name}</div>
        <div className="act-card__dates">
          {formatDate(activity.startDate)} → {formatDate(activity.endDate)}
          <span className="act-card__duration"> · {duration}d</span>
        </div>
        <div className="act-card__meta">
          <span
            className="act-card__link-badge"
            title={`${linkedCount} IFC element${linkedCount !== 1 ? 's' : ''} linked`}
          >
            🔗 {linkedCount}
          </span>
        </div>
      </div>
      <button
        className="act-card__edit-btn"
        onClick={e => { e.stopPropagation(); onEdit(activity) }}
        title="Edit activity"
      >
        ✏️
      </button>
    </div>
  )
}

// ── ActivityPanel ─────────────────────────────────────────────────────────────

export default function ActivityPanel() {
  const activities         = useActivityStore(s => s.activities)
  const isLoaded           = useActivityStore(s => s.isLoaded)
  const selectedActivityId = useSelectionStore(s => s.selectedActivityId)
  const selectActivity     = useSelectionStore(s => s.selectActivity)

  // Trigger fetch + sync to store
  const { isLoading, isError, error } = useActivities()

  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [showCreateForm,  setShowCreateForm]  = useState(false)

  const handleSelectActivity = (activity: Activity) => {
    selectActivity(activity.id, activity.linkedGlobalIds[0])
    // Don't auto-open edit mode on selection — that's a separate action
  }

  const handleEditActivity = (activity: Activity) => {
    setEditingActivity(activity)
    setShowCreateForm(false)
  }

  const handleCloseForm = () => {
    setEditingActivity(null)
    setShowCreateForm(false)
  }

  const handleNewClick = () => {
    setEditingActivity(null)
    setShowCreateForm(prev => !prev)
  }

  return (
    <div className="act-panel">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="act-panel__header">
        <span className="act-panel__title">Activities</span>
        {isLoaded && (
          <span className="act-panel__count">{activities.length}</span>
        )}
        <button
          className={`act-panel__new-btn${showCreateForm ? ' act-panel__new-btn--active' : ''}`}
          onClick={handleNewClick}
          title={showCreateForm ? 'Cancel' : 'Create a new activity'}
        >
          {showCreateForm ? '✕' : '＋ New'}
        </button>
      </div>

      {/* ── Create form ────────────────────────────────────── */}
      {showCreateForm && (
        <div className="act-panel__form-wrap">
          <ActivityForm onClose={handleCloseForm} />
        </div>
      )}

      {/* ── Edit form ──────────────────────────────────────── */}
      {editingActivity && (
        <div className="act-panel__form-wrap">
          <ActivityForm
            activity={editingActivity}
            onClose={handleCloseForm}
          />
        </div>
      )}

      {/* ── List ───────────────────────────────────────────── */}
      <div className="act-panel__list">

        {isLoading && !isLoaded && (
          <div className="act-panel__state">
            <div className="act-panel__spinner" />
            <span>Loading activities…</span>
          </div>
        )}

        {isError && (
          <div className="act-panel__error">
            {(error as Error)?.message ?? 'Failed to load activities'}
          </div>
        )}

        {isLoaded && activities.length === 0 && (
          <div className="act-panel__empty">
            <div className="act-panel__empty-icon">📅</div>
            <p className="act-panel__empty-title">No Activities Yet</p>
            <p className="act-panel__empty-hint">
              Click <strong>＋ New</strong> to create your first construction activity.
            </p>
          </div>
        )}

        {activities.map(activity => (
          <ActivityCard
            key={activity.id}
            activity={activity}
            isSelected={selectedActivityId === activity.id}
            onSelect={handleSelectActivity}
            onEdit={handleEditActivity}
          />
        ))}
      </div>
    </div>
  )
}