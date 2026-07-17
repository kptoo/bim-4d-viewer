/**
 * ActivityForm — Create and edit construction schedule activities.
 *
 * Supports two modes:
 * - **Create mode** (no `activity` prop) — creates a new activity.
 * - **Edit mode** (`activity` prop provided) — edits an existing activity.
 *
 * Validation:
 * - Name is required, max 120 characters.
 * - Start date and end date are required.
 * - End date must be on or after the start date.
 * - Validation runs on submit, not on each keystroke.
 *
 * Architecture:
 * - Uses useCreateActivity / useUpdateActivity / useDeleteActivity mutations.
 * - Does NOT manage linked IFC objects — linking is handled separately via
 *   the ZoneAssignWidget-equivalent in the Inspector panel.
 * - Calls `onClose()` after a short success-feedback delay so the user
 *   can see the confirmation before the form closes.
 *
 * @module ActivityForm
 */

import { useState, useCallback, useEffect, memo } from 'react'
import {
  useCreateActivity,
  useUpdateActivity,
  useDeleteActivity,
} from '../../hooks/useActivities'
import { useSelectionStore }   from '../../store/selection.store'
import type { Activity }       from '../../types'

// ── Color palette ─────────────────────────────────────────────────────────────

const PALETTE = [
  '#E67E22', '#3498DB', '#9B59B6', '#1ABC9C', '#E74C3C',
  '#2ECC71', '#F39C12', '#E91E63', '#00BCD4', '#8BC34A',
  '#FF5722', '#607D8B', '#795548', '#FF9800', '#CDDC39',
]

function randomColor(): string {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)]
}

// ── Validation ────────────────────────────────────────────────────────────────

interface FormErrors {
  name?:      string
  startDate?: string
  endDate?:   string
}

/**
 * Validates the activity form fields.
 * Returns an empty object if all fields are valid.
 *
 * @param name      - Activity name (trimmed)
 * @param startDate - ISO date string or empty string
 * @param endDate   - ISO date string or empty string
 */
function validateForm(
  name:      string,
  startDate: string,
  endDate:   string
): FormErrors {
  const errors: FormErrors = {}

  if (!name.trim()) {
    errors.name = 'Activity name is required'
  } else if (name.trim().length > 120) {
    errors.name = 'Name must be 120 characters or fewer'
  }

  if (!startDate) {
    errors.startDate = 'Start date is required'
  }

  if (!endDate) {
    errors.endDate = 'End date is required'
  } else if (startDate && endDate < startDate) {
    errors.endDate = 'End date must be on or after start date'
  }

  return errors
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface ActivityFormProps {
  /** When provided, the form is in edit mode for this activity */
  activity?: Activity
  /** Called when the form should close (after success or cancel) */
  onClose?: () => void
}

// ── ActivityForm ──────────────────────────────────────────────────────────────

/**
 * Create/edit activity form.
 * Memoised to prevent re-renders when parent panel re-renders.
 */
export default memo(function ActivityForm({ activity, onClose }: ActivityFormProps) {
  const isEditMode = Boolean(activity)

  // ── Form state ──────────────────────────────────────────────
  const [name,      setName]      = useState(activity?.name      ?? '')
  const [startDate, setStartDate] = useState(activity?.startDate ?? '')
  const [endDate,   setEndDate]   = useState(activity?.endDate   ?? '')
  const [color,     setColor]     = useState(activity?.color     ?? randomColor)
  const [errors,    setErrors]    = useState<FormErrors>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Reset form fields when the activity prop changes
  // (e.g. user switches from editing Activity A to Activity B)
  useEffect(() => {
    if (activity) {
      setName(activity.name)
      setStartDate(activity.startDate)
      setEndDate(activity.endDate)
      setColor(activity.color)
    } else {
      setName('')
      setStartDate('')
      setEndDate('')
      setColor(randomColor())
    }
    setErrors({})
    setShowDeleteConfirm(false)
  }, [activity])

  // ── Mutations ───────────────────────────────────────────────
  const createMutation = useCreateActivity()
  const updateMutation = useUpdateActivity()
  const deleteMutation = useDeleteActivity()
  const clearSelection = useSelectionStore(s => s.clearSelection)

  const isPending =
    createMutation.isPending ||
    updateMutation.isPending ||
    deleteMutation.isPending

  // ── Submit handler ──────────────────────────────────────────

  const handleSubmit = useCallback(() => {
    const trimmedName = name.trim()
    const validationErrors = validateForm(trimmedName, startDate, endDate)

    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors({})

    if (isEditMode && activity) {
      updateMutation.mutate(
        {
          id:        activity.id,
          name:      trimmedName,
          startDate,
          endDate,
          color,
          // linkedGlobalIds is NOT updated here — linking is managed
          // via the separate IFC object assignment panel.
        },
        {
          onSuccess: () => {
            setTimeout(() => {
              updateMutation.reset()
              onClose?.()
            }, 1200)
          },
        }
      )
    } else {
      createMutation.mutate(
        {
          name:            trimmedName,
          startDate,
          endDate,
          color,
          linkedGlobalIds: [],
          dependencies:    [],
        },
        {
          onSuccess: () => {
            // Reset form for the next create
            setName('')
            setStartDate('')
            setEndDate('')
            setColor(randomColor())
            setTimeout(() => {
              createMutation.reset()
              onClose?.()
            }, 1200)
          },
        }
      )
    }
  }, [
    name, startDate, endDate, color, isEditMode, activity,
    createMutation, updateMutation, onClose,
  ])

  // ── Delete handler ──────────────────────────────────────────

  const handleDelete = useCallback(() => {
    if (!activity) return

    deleteMutation.mutate(
      activity.id,
      {
        onSuccess: () => {
          clearSelection()
          setTimeout(() => {
            deleteMutation.reset()
            onClose?.()
          }, 800)
        },
      }
    )
  }, [activity, deleteMutation, clearSelection, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }, [handleSubmit])

  // ── Derived state ───────────────────────────────────────────

  const mutationError =
    (createMutation.error ?? updateMutation.error ?? deleteMutation.error) as Error | null

  const isSuccess = createMutation.isSuccess || updateMutation.isSuccess
  const isSubmitDisabled = isPending || !name.trim() || !startDate || !endDate

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="act-form">

      {/* Header */}
      <div className="act-form__header">
        <span className="act-form__title">
          {isEditMode ? '✏️ Edit Activity' : '＋ New Activity'}
        </span>
        {onClose && (
          <button
            className="act-form__close"
            onClick={onClose}
            disabled={isPending}
            title="Close"
            aria-label="Close form"
          >
            ✕
          </button>
        )}
      </div>

      {/* Body */}
      <div className="act-form__body">

        {/* Name + color */}
        <div className="act-form__field">
          <label className="act-form__label" htmlFor="act-name">Activity Name</label>
          <div className="act-form__name-row">
            <input
              id="act-name"
              className={`act-form__input${errors.name ? ' act-form__input--error' : ''}`}
              type="text"
              placeholder="e.g. Foundation Works, Structural Frame…"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={120}
              disabled={isPending}
              aria-describedby={errors.name ? 'act-name-error' : undefined}
            />
            <input
              type="color"
              className="act-form__color"
              value={color}
              onChange={e => setColor(e.target.value)}
              title="Activity colour"
              disabled={isPending}
              aria-label="Activity colour"
            />
          </div>
          {errors.name && (
            <span id="act-name-error" className="act-form__field-error" role="alert">
              {errors.name}
            </span>
          )}
        </div>

        {/* Date range */}
        <div className="act-form__dates">
          <div className="act-form__field">
            <label className="act-form__label" htmlFor="act-start">Start Date</label>
            <input
              id="act-start"
              className={`act-form__input act-form__input--date${errors.startDate ? ' act-form__input--error' : ''}`}
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              disabled={isPending}
              aria-describedby={errors.startDate ? 'act-start-error' : undefined}
            />
            {errors.startDate && (
              <span id="act-start-error" className="act-form__field-error" role="alert">
                {errors.startDate}
              </span>
            )}
          </div>

          <div className="act-form__field">
            <label className="act-form__label" htmlFor="act-end">End Date</label>
            <input
              id="act-end"
              className={`act-form__input act-form__input--date${errors.endDate ? ' act-form__input--error' : ''}`}
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              disabled={isPending}
              aria-describedby={errors.endDate ? 'act-end-error' : undefined}
            />
            {errors.endDate && (
              <span id="act-end-error" className="act-form__field-error" role="alert">
                {errors.endDate}
              </span>
            )}
          </div>
        </div>

        {/* Color preview */}
        <div
          className="act-form__color-preview"
          style={{ background: color }}
          aria-hidden="true"
        />

        {/* Submit button */}
        <button
          className="act-form__submit"
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          aria-label={isEditMode ? 'Save changes' : 'Create activity'}
        >
          {isPending && !deleteMutation.isPending
            ? '…'
            : isEditMode
              ? '✓ Save Changes'
              : '＋ Create Activity'}
        </button>

        {/* Success feedback */}
        {isSuccess && (
          <div className="act-form__success" role="status">
            {isEditMode ? '✓ Activity updated' : '✓ Activity created'}
          </div>
        )}

        {/* Mutation error */}
        {mutationError && !deleteMutation.isError && (
          <div className="act-form__error" role="alert">
            {mutationError.message}
          </div>
        )}
      </div>

      {/* Delete section (edit mode only) */}
      {isEditMode && activity && (
        <div className="act-form__delete-zone">
          {!showDeleteConfirm ? (
            <button
              className="act-form__delete-btn"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isPending}
              aria-label={`Delete ${activity.name}`}
            >
              🗑 Delete Activity
            </button>
          ) : (
            <div className="act-form__delete-confirm">
              <p className="act-form__delete-warning">
                Delete <strong>{activity.name}</strong>? This cannot be undone.
              </p>
              <div className="act-form__delete-actions">
                <button
                  className="act-form__delete-confirm-btn"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {deleteMutation.isPending ? '…' : 'Yes, Delete'}
                </button>
                <button
                  className="act-form__delete-cancel-btn"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteMutation.isPending}
                >
                  Cancel
                </button>
              </div>
              {deleteMutation.isError && (
                <div className="act-form__error" role="alert">
                  {(deleteMutation.error as Error).message}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
})