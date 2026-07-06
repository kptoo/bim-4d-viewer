/**
 * Date utilities for the simulation engine.
 * Pure functions — no side effects.
 */

/**
 * Linearly interpolates a Date between two boundary dates
 * based on a 0–100 progress value.
 *
 * @param progress - Number from 0 to 100
 * @param startDate - Project start date
 * @param endDate - Project end date
 * @returns Interpolated Date
 */
export function progressToDate(
  progress: number,
  startDate: Date,
  endDate: Date
): Date {
  const clamped = Math.max(0, Math.min(100, progress))
  const startMs = startDate.getTime()
  const endMs   = endDate.getTime()
  const t       = startMs + ((endMs - startMs) * clamped) / 100
  return new Date(t)
}

/**
 * Converts a Date to a 0–100 progress value within
 * the given project date range.
 *
 * @param date - The date to convert
 * @param startDate - Project start date
 * @param endDate - Project end date
 * @returns Progress value 0–100
 */
export function dateToProgress(
  date: Date,
  startDate: Date,
  endDate: Date
): number {
  const startMs = startDate.getTime()
  const endMs   = endDate.getTime()
  const dateMs  = date.getTime()

  if (endMs === startMs) return 0
  const raw = ((dateMs - startMs) / (endMs - startMs)) * 100
  return Math.max(0, Math.min(100, raw))
}

/**
 * Formats a Date for display in the timeline UI.
 *
 * @param date - Date to format
 * @returns Formatted string, e.g. "Mar 15, 2024"
 */
export function formatDisplayDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day:   'numeric',
    year:  'numeric',
  })
}

/**
 * Formats a Date as an ISO date string (YYYY-MM-DD).
 * Used when storing dates in the database.
 */
export function toISODateString(date: Date): string {
  return date.toISOString().split('T')[0]
}

/**
 * Returns true if a date falls within a range (inclusive).
 */
export function isDateInRange(
  date: Date,
  start: Date,
  end: Date
): boolean {
  const t = date.getTime()
  return t >= start.getTime() && t <= end.getTime()
}