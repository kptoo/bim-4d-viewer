export interface IFCObject {
  /** IFC GlobalId — primary key used across the entire app */
  globalId: string

  /**
   * Internal IFC parser express ID (= local ID in That Open Engine).
   * Used by That Open Engine for direct mesh lookups.
   * Optional because mock data does not have it yet.
   */
  expressId?: number

  /** Human-readable name from the IFC model (IfcRoot.Name) */
  name: string

  /** IFC entity type, e.g. IfcWall, IfcColumn, IfcSlab */
  type: IFCType

  /**
   * IfcElement.Tag — manufacturer or construction mark (e.g. "W1").
   * null when not present in the model.
   */
  tag: string | null

  /**
   * IfcRoot.Description — free-text description of the element.
   * null when not present in the model.
   */
  description: string | null

  /**
   * IfcObject.ObjectType — user-defined object type / family name
   * (e.g. "Basic Wall:Bearing Wall").
   * null when not present in the model.
   */
  objectType: string | null

  /**
   * IfcElement.PredefinedType — enumeration from the IFC schema
   * (e.g. "DOOR", "STANDARDCASE", "NOTDEFINED").
   * null when not present in the model.
   */
  predefinedType: string | null

  /** Flat list of property set entries extracted from the IFC model */
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
 * A single IFC property from a property set or quantity set.
 */
export interface IFCProperty {
  /** Name of the property set (e.g. "Pset_WallCommon") or quantity set (e.g. "BaseQuantities") */
  set: string
  /** Property name */
  name: string
  /** Property value — typed to match IFC value types */
  value: string | number | boolean | null
  /** Optional unit string (e.g. "m", "m²", "m³") extracted from IfcQuantity* */
  unit?: string
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

// ─── Spatial tree ─────────────────────────────────────────────────────────────

/**
 * A node in the IFC spatial decomposition tree.
 *
 * Spatial nodes (IfcProject / IfcSite / IfcBuilding / IfcBuildingStorey / IfcSpace)
 * have their children listed in childGlobalIds.
 *
 * Physical element nodes (walls, doors, etc.) have no children in this tree —
 * their storey membership is captured in IFCSpatialTree.elementsByStorey.
 */
export interface IFCSpatialNode {
  globalId:   string
  expressId?: number
  name:       string
  ifcType:    string
  /** GlobalIds of child spatial nodes (from IfcRelAggregates) */
  childGlobalIds: string[]
}

/**
 * The fully resolved IFC spatial decomposition extracted from
 * IFCRELAGGREGATES and IFCRELCONTAINEDINSPATIALSTRUCTURE.
 *
 * Produced once by IFCLoaderWrapper and stored in viewer.store.
 * Consumed by IFCObjectTree to render the correct hierarchy.
 */
export interface IFCSpatialTree {
  /**
   * Ordered list of root node GlobalIds (usually one IfcProject).
   */
  rootIds: string[]

  /**
   * Map from spatial node GlobalId → IFCSpatialNode.
   * Covers IfcProject, IfcSite, IfcBuilding, IfcBuildingStorey, IfcSpace.
   */
  spatialNodes: Map<string, IFCSpatialNode>

  /**
   * Map from storey GlobalId → array of physical element GlobalIds
   * contained in that storey (from IFCRELCONTAINEDINSPATIALSTRUCTURE).
   *
   * Elements that have no storey membership appear in the special key
   * "__unassigned__".
   */
  elementsByStorey: Map<string, string[]>

  /**
   * Map from element GlobalId → storey GlobalId (reverse of elementsByStorey).
   * Used for O(1) storey lookup during ancestor-path building in the tree.
   */
  storeyByElement: Map<string, string>

  /**
   * Map from physical element GlobalId → opening element GlobalIds
   * (from IFCRELVOIDSELEMENT).  E.g. wall → [opening1, opening2]
   */
  elementToOpenings: Map<string, string[]>

  /**
   * Map from opening element GlobalId → filler GlobalIds
   * (from IFCRELFILLSELEMENT). E.g. opening → [door]
   */
  openingToFillers: Map<string, string[]>

  /**
   * Basic info (name + ifcType) for each opening element.
   * Allows the tree to label opening nodes correctly.
   */
  openingDetails: Map<string, { name: string; ifcType: string }>
}

// ─── IFC Types ────────────────────────────────────────────────────────────────

/**
 * Supported IFC entity types.
 * Extendable — add new types here as the model grows.
 */
export type IFCType =
  | 'IfcWall'
  | 'IfcWallStandardCase'
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
  | 'IfcProject'
  | 'IfcSite'
  | 'IfcBuilding'
  | 'IfcBuildingStorey'
  | 'IfcSpace'
  | string // Allow any IFC type string for forward compatibility

/**
 * Supported classification systems.
 */
export type IFCClassificationSystem =
  | 'CoClass'
  | 'Uniclass'
  | 'OmniClass'
  | 'NBS'
  | 'AI'
  | string