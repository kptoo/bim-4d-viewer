/**
 * Activity (Gantt task) domain types.
 *
 * An Activity represents a construction schedule task.
 * It links to one or more IFC objects via their GlobalIds.
 * Stored in PostgreSQL (Neon) — not in the IFC model.
 */

export interface Activity {
  /** UUID — primary key in the database */
  id: string

  /** Human-readable activity name */
  name: string

  /** ISO date string — activity start date */
  startDate: string

  /** ISO date string — activity end date */
  endDate: string

  /** Display color as hex string (e.g. "#3498DB") */
  color: string

  /**
   * IFC GlobalIds of objects linked to this activity.
   * This is the primary link between schedule and model.
   */
  linkedGlobalIds: string[]

  /**
   * IDs of activities this activity depends on.
   * Prepared for Gantt dependency arrows in a future phase.
   */
  dependencies: string[]

  /** ISO timestamp */
  createdAt: string

  /** ISO timestamp */
  updatedAt: string
}

/**
 * Payload for creating a new activity.
 * Omits server-generated fields.
 */
export type CreateActivityPayload = Omit<
  Activity,
  'id' | 'createdAt' | 'updatedAt'
>

/**
 * Payload for updating an existing activity.
 * All fields optional except id.
 */
export type UpdateActivityPayload = Partial<
  Omit<Activity, 'id' | 'createdAt' | 'updatedAt'>
> & { id: string }