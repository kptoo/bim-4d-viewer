import { useState, useCallback, useEffect } from 'react'
import { useCreateActivity, useUpdateActivity, useDeleteActivity } from '../../hooks/useActivities'
import { useSelectionStore }   from '../../store/selection.store'
import type { Activity }       from '../../types'

// ── Colour palette (same as ZonePanel) ───────────────────────────────────────

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

export default function ActivityForm({ activity, onClose }: ActivityFormProps) {
  const isEditMode = Boolean(activity)

  // ── Form state ──────────────────────────────────────────────
  const [name,      setName]      = useState(activity?.name      ?? '')
  const [startDate, setStartDate] = useState(activity?.startDate ?? '')
  const [endDate,   setEndDate]   = useState(activity?.endDate   ?? '')
  const [color,     setColor]     = useState(activity?.color     ?? randomColor)
  const [errors,    setErrors]    = useState<FormErrors>({})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Reset form when activity prop changes (switching between edit targets)
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

  // ── Submit ──────────────────────────────────────────────────
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
          // linkedGlobalIds intentionally NOT included here — linking is
          // managed by the ZoneAssignWidget-equivalent in the Inspector panel.
          // Updating links here would overwrite assignments made elsewhere.
        },
        {
          onSuccess: () => {
            setTimeout(() => {
              updateMutation.reset()
              onClose?.()
            }, 1500)
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
            // Reset form for next create
            setName('')
            setStartDate('')
            setEndDate('')
            setColor(randomColor())
            setTimeout(() => {
              createMutation.reset()
              onClose?.()
            }, 1500)
          },
        }
      )
    }
  }, [
    name, startDate, endDate, color, isEditMode, activity,
    createMutation, updateMutation, onClose,
  ])

  // ── Delete ──────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    if (!activity) return

    deleteMutation.mutate(
      activity.id,
      {
        onSuccess: () => {
          // Clear selection if this activity was selected
          clearSelection()
          setTimeout(() => {
            deleteMutation.reset()
            onClose?.()
          }, 800)
        },
      }
    )
  }, [activity, deleteMutation, clearSelection, onClose])

  // ── Shared mutation error ────────────────────────────────────
  const mutationError =
    (createMutation.error ?? updateMutation.error ?? deleteMutation.error) as Error | null

  const isSuccess = createMutation.isSuccess || updateMutation.isSuccess

  return (
    <div className="act-form">

      {/* ── Header ─────────────────────────────────────────── */}
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
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div className="act-form__body">

        {/* Name field */}
        <div className="act-form__field">
          <label className="act-form__label">Activity Name</label>
          <div className="act-form__name-row">
            <input
              className={`act-form__input${errors.name ? ' act-form__input--error' : ''}`}
              type="text"
              placeholder="e.g. Foundation Works, Structural Frame…"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              maxLength={120}
              disabled={isPending}
            />
            <input
              type="color"
              className="act-form__color"
              value={color}
              onChange={e => setColor(e.target.value)}
              title="Activity colour"
              disabled={isPending}
            />
          </div>
          {errors.name && (
            <span className="act-form__field-error">{errors.name}</span>
          )}
        </div>

        {/* Date range */}
        <div className="act-form__dates">
          <div className="act-form__field">
            <label className="act-form__label">Start Date</label>
            <input
              className={`act-form__input act-form__input--date${errors.startDate ? ' act-form__input--error' : ''}`}
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              disabled={isPending}
            />
            {errors.startDate && (
              <span className="act-form__field-error">{errors.startDate}</span>
            )}
          </div>

          <div className="act-form__field">
            <label className="act-form__label">End Date</label>
            <input
              className={`act-form__input act-form__input--date${errors.endDate ? ' act-form__input--error' : ''}`}
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              disabled={isPending}
            />
            {errors.endDate && (
              <span className="act-form__field-error">{errors.endDate}</span>
            )}
          </div>
        </div>

        {/* Colour preview strip */}
        <div
          className="act-form__color-preview"
          style={{ background: color }}
          title={`Activity colour: ${color}`}
        />

        {/* Submit */}
        <button
          className="act-form__submit"
          onClick={handleSubmit}
          disabled={isPending || !name.trim() || !startDate || !endDate}
        >
          {isPending && !deleteMutation.isPending
            ? '…'
            : isEditMode
              ? '✓ Save Changes'
              : '＋ Create Activity'}
        </button>

        {/* Success feedback */}
        {isSuccess && (
          <div className="act-form__success">
            {isEditMode ? '✓ Activity updated' : '✓ Activity created'}
          </div>
        )}

        {/* Error feedback */}
        {mutationError && !deleteMutation.isError && (
          <div className="act-form__error">
            {mutationError.message}
          </div>
        )}
      </div>

      {/* ── Delete section (edit mode only) ────────────────── */}
      {isEditMode && activity && (
        <div className="act-form__delete-zone">
          {!showDeleteConfirm ? (
            <button
              className="act-form__delete-btn"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={isPending}
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
                <div className="act-form__error">
                  {(deleteMutation.error as Error).message}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}