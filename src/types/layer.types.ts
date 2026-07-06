/**
 * Information Layer domain types.
 *
 * Information Layers are first-class entities that allow users
 * to enrich IFC objects with project-specific metadata.
 *
 * Categories are intentionally NOT an enum — they are an
 * extensible string type so new categories (including
 * AI-generated ones) can be added without a code change.
 */

export interface InformationLayer {
  /** UUID — primary key in the database */
  id: string

  /** Human-readable layer name */
  name: string

  /**
   * Layer category.
   * Intentionally a string type, not a strict enum,
   * to allow future AI-generated or custom categories.
   */
  category: LayerCategory

  /** Display color as hex string */
  color: string

  /** Optional description */
  description: string | null

  /** ISO timestamp */
  createdAt: string
}

/**
 * Known layer categories.
 * New categories can be added here or passed as plain strings.
 */
export type LayerCategory =
  | 'building-elements'
  | 'zones'
  | 'costs'
  | 'resources'
  | 'quality'
  | 'waste'
  | 'safety'
  | 'coclass'
  | 'ai-generated'
  | 'custom'
  | string // Forward-compatible for user-defined categories

/**
 * A single assignment linking a layer to an IFC object.
 */
export interface LayerAssignment {
  /** UUID */
  id: string
  /** References InformationLayer.id */
  layerId: string
  /** IFC object GlobalId */
  globalId: string
  /** ISO timestamp */
  assignedAt: string
}

/**
 * Payload for creating a new layer.
 */
export type CreateLayerPayload = Omit<
  InformationLayer,
  'id' | 'createdAt'
>

/**
 * Display metadata for layer categories shown in the UI.
 */
export interface LayerCategoryMeta {
  value: LayerCategory
  label: string
  icon: string
}

export const LAYER_CATEGORY_META: LayerCategoryMeta[] = [
  { value: 'building-elements', label: 'Building Elements', icon: '🏗' },
  { value: 'zones',             label: 'Zones',             icon: '📐' },
  { value: 'costs',             label: 'Costs',             icon: '💰' },
  { value: 'resources',         label: 'Resources',         icon: '👷' },
  { value: 'quality',           label: 'Quality',           icon: '✅' },
  { value: 'waste',             label: 'Waste',             icon: '♻️' },
  { value: 'safety',            label: 'Safety',            icon: '⛑️' },
  { value: 'coclass',           label: 'CoClass',           icon: '📋' },
  { value: 'ai-generated',      label: 'AI Generated',      icon: '🤖' },
  { value: 'custom',            label: 'Custom',            icon: '🏷️' },
]