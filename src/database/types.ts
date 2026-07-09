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