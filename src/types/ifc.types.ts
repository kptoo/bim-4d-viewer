/**
 * Core IFC domain types.
 *
 * These types represent every IFC object as a normalized,
 * framework-agnostic data structure. They are the single
 * source of truth for IFC data across the entire application.
 *
 * Designed to be extended with classification systems
 * (CoClass, Uniclass, OmniClass, AI-generated) without
 * modifying existing consumers.
 */

export interface IFCObject {
  /** IFC GlobalId — primary key used across the entire app */
  globalId: string

  /**
   * Internal IFC parser express ID.
   * Used by That Open Engine for direct mesh lookups.
   * Optional because mock data does not have it yet.
   */
  expressId?: number

  /** Human-readable name from the IFC model */
  name: string

  /** IFC entity type, e.g. IfcWall, IfcColumn, IfcSlab */
  type: IFCType

  /** Flat list of property sets extracted from the IFC model */
  properties: IFCProperty[]

  /** IDs of information layers assigned to this object */
  layerIds: string[]

  /** IDs of activities this object is linked to */
  activityIds: string[]

  /**
   * Optional classification metadata.
   * Supports CoClass, Uniclass, OmniClass, and AI-generated
   * classifications without requiring a schema change.
   */
  classification?: IFCClassification

  /** Whether this object is currently visible in the viewer */
  visible: boolean

  /**
   * Hex color string to override the simulation color.
   * null means the simulation color applies.
   */
  colorOverride: string | null
}

/**
 * A single IFC property from a property set.
 */
export interface IFCProperty {
  /** Name of the property set (e.g. "Pset_WallCommon") */
  set: string
  /** Property name */
  name: string
  /** Property value — typed to match IFC value types */
  value: string | number | boolean | null
}

/**
 * Classification metadata for future AI and standard
 * classification system integration.
 */
export interface IFCClassification {
  /** Classification system identifier */
  system: IFCClassificationSystem
  /** Classification code (e.g. "E1.1") */
  code: string
  /** Human-readable classification label */
  label: string
}

/**
 * Supported IFC entity types.
 * Extendable — add new types here as the model grows.
 */
export type IFCType =
  | 'IfcWall'
  | 'IfcSlab'
  | 'IfcColumn'
  | 'IfcBeam'
  | 'IfcStair'
  | 'IfcFlowSegment'
  | 'IfcCurtainWall'
  | 'IfcCovering'
  | 'IfcDoor'
  | 'IfcWindow'
  | 'IfcRoof'
  | 'IfcFoundation'
  | 'IfcBuildingElementProxy'
  | string // Allow any IFC type string for forward compatibility

/**
 * Supported classification systems.
 * Extendable for future AI and standard system integrations.
 */
export type IFCClassificationSystem =
  | 'CoClass'
  | 'Uniclass'
  | 'OmniClass'
  | 'NBS'
  | 'AI'
  | string