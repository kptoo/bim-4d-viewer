/**
 * ActivityPanel — Displays the list of construction schedule activities.
 *
 * Responsibilities:
 * - Fetches and displays all activities from the database via useActivities().
 * - Renders loading, empty, and error states.
 * - Allows selecting, creating, and editing activities.
 * - Syncs selection into the selection store for bidirectional Gantt ↔ Viewer sync.
 *
 * Architecture notes:
 * - useActivities() drives the React Query fetch; the result is automatically
 *   synced into useActivityStore via the hook's internal useEffect.
 * - Components read from useActivityStore (Zustand) rather than the query
 *   result directly, so they are always in sync with optimistic updates.
 *
 * @module ActivityPanel
 */

import { useState, useCallback, memo }  from 'react'
import { useActivityStore }              from '../../store/activity.store'
import { useSelectionStore }             from '../../store/selection.store'
import { useActivities }                 from '../../hooks/useActivities'
import { LoadingSpinner }                from '../ui/LoadingSpinner'
import { EmptyState }                    from '../ui/EmptyState'
import { ErrorMessage }                  from '../ui/ErrorMessage'
import ActivityForm                      from './ActivityForm'
import type { Activity }                 from '../../types'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Computes the duration of an activity in calendar days.
 * Used for the compact metadata display on each card.
 */
function getActivityDurationDays(activity: Activity): number {
  const start = new Date(activity.startDate).getTime()
  const end   = new Date(activity.endDate).getTime()
  return Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)))
}

/**
 * Formats an ISO date string for display in the user's locale.
 * Output example: "01 Jan 2026".
 */
function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── ActivityCard ──────────────────────────────────────────────────────────────

interface ActivityCardProps {
  activity:   Activity
  isSelected: boolean
  onSelect:   (activity: Activity) => void
  onEdit:     (activity: Activity) => void
}

/**
 * Compact card representing a single activity in the list.
 * Memoised to prevent re-renders when sibling activities change.
 */
const ActivityCard = memo(function ActivityCard({
  activity,
  isSelected,
  onSelect,
  onEdit,
}: ActivityCardProps) {
  const linkedCount = activity.linkedGlobalIds.length
  const duration    = getActivityDurationDays(activity)

  const handleEditClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    onEdit(activity)
  }, [activity, onEdit])

  const handleCardClick = useCallback(() => {
    onSelect(activity)
  }, [activity, onSelect])

  return (
    <div
      className={`act-card${isSelected ? ' act-card--selected' : ''}`}
      onClick={handleCardClick}
      role="button"
      aria-pressed={isSelected}
      aria-label={`Activity: ${activity.name}`}
    >
      <div
        className="act-card__stripe"
        style={{ background: activity.color }}
        aria-hidden="true"
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
        onClick={handleEditClick}
        title="Edit activity"
        aria-label={`Edit ${activity.name}`}
      >
        ✏️
      </button>
    </div>
  )
})

// ── ActivityPanel ─────────────────────────────────────────────────────────────

/**
 * Main activities panel component.
 *
 * State machine:
 *   idle / loading → Loading spinner
 *   error          → Error message with retry
 *   empty          → Empty state with "Create first" CTA
 *   populated      → Scrollable list of ActivityCard rows
 *
 * Above the list, a create/edit form is shown inline when the user
 * opens it via the ＋ New button or clicks the edit icon on a card.
 */
export default function ActivityPanel() {
  // ── Store reads ──────────────────────────────────────────
  const activities         = useActivityStore(s => s.activities)
  const isLoaded           = useActivityStore(s => s.isLoaded)
  const selectedActivityId = useSelectionStore(s => s.selectedActivityId)
  const selectActivity     = useSelectionStore(s => s.selectActivity)

  // ── Data fetching ────────────────────────────────────────
  // useActivities() drives the fetch and syncs into the store.
  // React Query deduplicates concurrent calls (e.g. GanttPanel also calls it).
  const { isLoading, isError, error, refetch } = useActivities()

  // ── Local UI state ───────────────────────────────────────
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null)
  const [showCreateForm,  setShowCreateForm]  = useState(false)

  // ── Handlers ─────────────────────────────────────────────

  const handleSelectActivity = useCallback((activity: Activity) => {
    selectActivity(activity.id, activity.linkedGlobalIds[0])
  }, [selectActivity])

  const handleEditActivity = useCallback((activity: Activity) => {
    setEditingActivity(activity)
    setShowCreateForm(false)
  }, [])

  const handleCloseForm = useCallback(() => {
    setEditingActivity(null)
    setShowCreateForm(false)
  }, [])

  const handleNewClick = useCallback(() => {
    setEditingActivity(null)
    setShowCreateForm(prev => !prev)
  }, [])

  const handleRetry = useCallback(() => {
    void refetch()
  }, [refetch])

  const handleCreateFromEmpty = useCallback(() => {
    setShowCreateForm(true)
    setEditingActivity(null)
  }, [])

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="act-panel">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="act-panel__header">
        <span className="act-panel__title">Activities</span>
        {isLoaded && activities.length > 0 && (
          <span className="act-panel__count">{activities.length}</span>
        )}
        <button
          className={`act-panel__new-btn${showCreateForm ? ' act-panel__new-btn--active' : ''}`}
          onClick={handleNewClick}
          title={showCreateForm ? 'Cancel' : 'Create a new activity'}
          disabled={isLoading && !isLoaded}
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

      {/* ── List area ──────────────────────────────────────── */}
      <div className="act-panel__list">

        {/* Loading */}
        {isLoading && !isLoaded && (
          <LoadingSpinner message="Loading activities…" />
        )}

        {/* Error */}
        {isError && !isLoading && (
          <ErrorMessage
            message={(error as Error)?.message ?? 'Failed to load activities'}
            context="ActivityPanel"
            onRetry={handleRetry}
          />
        )}

        {/* Empty */}
        {isLoaded && !isError && activities.length === 0 && (
          <EmptyState
            icon="📅"
            title="No Activities Yet"
            hint={
              <>
                Create your first construction activity to get started.<br />
                Activities link IFC elements to schedule tasks.
              </>
            }
            action={{
              label:   '＋ Create First Activity',
              onClick: handleCreateFromEmpty,
            }}
          />
        )}

        {/* Activity list */}
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