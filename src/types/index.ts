/**
 * Barrel export for all domain types.
 * Import from here throughout the application:
 *   import type { IFCObject, Activity } from '../types'
 */

export type {
  IFCObject,
  IFCProperty,
  IFCClassification,
  IFCType,
  IFCClassificationSystem,
} from './ifc.types'

export type {
  Activity,
  CreateActivityPayload,
  UpdateActivityPayload,
} from './activity.types'

export type {
  InformationLayer,
  LayerAssignment,
  LayerCategory,
  CreateLayerPayload,
  LayerCategoryMeta,
} from './layer.types'

export { LAYER_CATEGORY_META } from './layer.types'

export type {
  SimulationStatus,
  SimulationFrame,
} from './simulation.types'

export { SIMULATION_COLORS, SELECTION_COLOR } from './simulation.types'

export type {
  PickResult,
  ColorOverride,
  VisibilityOverride,
  ViewerEvent,
  ViewerEventType,
} from './viewer.types'