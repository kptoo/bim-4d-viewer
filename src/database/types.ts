export interface LayerRow {
  readonly id:          string
  readonly name:        string
  readonly category:    string
  readonly color:       string
  readonly description: string | null
  readonly created_at:  string
}

/**
 * Raw row from the `layer_assignments` table.
 */
export interface AssignmentRow {
  readonly id:          string
  readonly layer_id:    string
  readonly global_id:   string
  readonly assigned_at: string
}

/**
 * Raw row from the `activities` table.
 */
export interface ActivityRow {
  readonly id:           string
  readonly name:         string
  readonly start_date:   string
  readonly end_date:     string
  readonly progress:     number
  readonly color:        string
  readonly parent_id:    string | null
  readonly dependencies: string[]
  readonly created_at:   string
  readonly updated_at:   string
}

/**
 * Raw row from the `activity_object_links` table.
 */
export interface ActivityLinkRow {
  readonly id:          string
  readonly activity_id: string
  readonly global_id:   string
  readonly linked_at:   string
}