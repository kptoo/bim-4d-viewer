import * as FRAGS from '@thatopen/fragments'
import { ifcCategoryMap, ifcClasses } from '@thatopen/fragments'
import type { IFCObject, IFCProperty, IFCSpatialNode, IFCSpatialTree } from '../types'
import { mapRawArrayToIFCObjects } from '../core/ifc/IFCObjectMapper'

// ─── Category regexp lists ────────────────────────────────────────────────────

const ELEMENT_CATEGORY_REGEXPS: RegExp[] = (() => {
  const regexps: RegExp[] = []
  for (const typeCode of ifcClasses.elements) {
    const name = ifcCategoryMap[typeCode as unknown as number]
    if (name) regexps.push(new RegExp(`^${name}$`, 'i'))
  }
  return regexps
})()

const SPATIAL_CATEGORY_REGEXPS: RegExp[] = [
  /^IFCPROJECT$/i,
  /^IFCSITE$/i,
  /^IFCBUILDING$/i,
  /^IFCBUILDINGSTOREY$/i,
  /^IFCSPACE$/i,
]

// Also fetch openings so we can resolve void/fill relationships
const OPENING_CATEGORY_REGEXPS: RegExp[] = [
  /^IFCOPENINGELEMENT$/i,
  /^IFCVIRTUALELEMENT$/i,
]

// ─── Reverse-map: numeric type code → uppercase IFC name ─────────────────────

const NUMERIC_CODE_TO_NAME: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const [code, name] of Object.entries(ifcCategoryMap)) {
    m.set(String(code), String(name).toUpperCase())
  }
  return m
})()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function categoryKeyToIfcType(rawKey: string): string {
  let upperName = rawKey.toUpperCase()
  if (/^\d+$/.test(rawKey)) {
    upperName = NUMERIC_CODE_TO_NAME.get(rawKey) ?? 'IFCBUILDINGELEMENTPROXY'
  }
  if (!upperName.startsWith('IFC')) return upperName
  return upperName.charAt(0).toUpperCase() + upperName.slice(1).toLowerCase()
}

function unwrapString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string')  { const s = raw.trim(); return s.length > 0 ? s : null }
  if (typeof raw === 'number')  return String(raw)
  if (typeof raw === 'boolean') return String(raw)
  if (typeof raw !== 'object')  return null

  let v = (raw as Record<string, unknown>)['value']
  if (v !== null && typeof v === 'object' && 'value' in (v as object)) {
    v = (v as { value: unknown }).value
  }
  if (typeof v === 'string')  { const s = v.trim(); return s.length > 0 ? s : null }
  if (typeof v === 'number')  return String(v)
  if (typeof v === 'boolean') return String(v)
  return null
}

function unwrapNumber(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw === 'number') return raw
  if (typeof raw !== 'object') return undefined

  let v = (raw as Record<string, unknown>)['value']
  if (v !== null && typeof v === 'object' && 'value' in (v as object)) {
    v = (v as { value: unknown }).value
  }
  if (typeof v === 'number') return v
  if (typeof v === 'string') { const n = Number(v); return isNaN(n) ? undefined : n }
  return undefined
}

function unwrapScalar(raw: unknown): string | number | boolean | null {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'string')  return raw.trim() || null
  if (typeof raw === 'number')  return raw
  if (typeof raw === 'boolean') return raw
  if (typeof raw !== 'object')  return null

  let v = (raw as Record<string, unknown>)['value']
  if (v !== null && typeof v === 'object' && 'value' in (v as object)) {
    v = (v as { value: unknown }).value
  }
  if (typeof v === 'string')  return v.trim() || null
  if (typeof v === 'number')  return v
  if (typeof v === 'boolean') return v
  return null
}

function readAttr(data: Record<string, unknown>, key: string): string | null {
  return unwrapString(data[key])
}

// ─── Pset / quantity extraction ───────────────────────────────────────────────

function extractPsets(itemData: Record<string, unknown>): IFCProperty[] {
  const props: IFCProperty[] = []
  const isDefinedBy = itemData['IsDefinedBy']
  if (!Array.isArray(isDefinedBy)) return props

  for (const rel of isDefinedBy as Record<string, unknown>[]) {
    if (!rel || typeof rel !== 'object') continue

    const psetEntry = rel['RelatingPropertyDefinition']
    if (!psetEntry || typeof psetEntry !== 'object') continue

    const pset     = psetEntry as Record<string, unknown>
    const psetName = readAttr(pset, 'Name') ?? 'UnknownPset'

    // Branch A: IfcPropertySet → HasProperties
    const hasProperties = pset['HasProperties']
    if (Array.isArray(hasProperties)) {
      for (const propEntry of hasProperties as Record<string, unknown>[]) {
        if (!propEntry || typeof propEntry !== 'object') continue
        const prop     = propEntry as Record<string, unknown>
        const propName = readAttr(prop, 'Name')
        if (!propName) continue

        const nomRaw = prop['NominalValue']
        let propValue: string | number | boolean | null = null

        if (nomRaw !== null && nomRaw !== undefined) {
          propValue = unwrapScalar(nomRaw)
          if (propValue === null && typeof nomRaw === 'object') {
            const inner = (nomRaw as Record<string, unknown>)['value']
            if (typeof inner === 'object' && inner !== null && 'value' in (inner as object)) {
              propValue = unwrapScalar((inner as { value: unknown }).value)
            } else {
              propValue = unwrapScalar(inner)
            }
          }
        }

        props.push({ set: psetName, name: propName, value: propValue })
      }
      continue
    }

    // Branch B: IfcElementQuantity → Quantities
    const quantities = pset['Quantities']
    if (Array.isArray(quantities)) {
      const QTY_VALUE_KEYS = ['LengthValue','AreaValue','VolumeValue','WeightValue','CountValue','TimeValue']
      for (const qEntry of quantities as Record<string, unknown>[]) {
        if (!qEntry || typeof qEntry !== 'object') continue
        const q     = qEntry as Record<string, unknown>
        const qName = readAttr(q, 'Name')
        if (!qName) continue

        let qValue: string | number | boolean | null = null
        for (const key of QTY_VALUE_KEYS) {
          const raw = q[key]
          if (raw !== null && raw !== undefined) {
            const n = unwrapNumber(raw)
            if (n !== undefined) { qValue = n; break }
          }
        }

        const unitString = q['Unit'] ? unwrapString(q['Unit']) : undefined
        props.push({ set: psetName, name: qName, value: qValue, ...(unitString ? { unit: unitString } : {}) })
      }
    }
  }

  return props
}

// ─── Raw item type ────────────────────────────────────────────────────────────

type RawItem = Record<string, unknown>

/**
 * Safely iterate the items returned by getItemsData.
 * The API returns either an array or a keyed-by-localId object.
 */
function iterateRawItems(raw: unknown): RawItem[] {
  if (Array.isArray(raw)) {
    return (raw as unknown[]).filter(
      (el): el is RawItem => el !== null && typeof el === 'object' && !Array.isArray(el)
    )
  }
  if (raw !== null && typeof raw === 'object') {
    return Object.values(raw as Record<string, unknown>).filter(
      (el): el is RawItem => el !== null && typeof el === 'object' && !Array.isArray(el)
    )
  }
  return []
}

// ─── Spatial tree extraction ──────────────────────────────────────────────────

/**
 * Builds the IFCSpatialTree from the loaded FragmentsModel.
 *
 * FIXED: That Open Engine stores relations as direct object references.
 *
 * item['IsDecomposedBy']  = [ <child spatial node item>, ... ]
 * item['ContainsElements'] = [ <contained physical element item>, ... ]
 * item['HasOpenings']      = [ <opening element item>, ... ]    (on walls etc.)
 * item['HasFillings']      = [ <door/window item>, ... ]        (on openings)
 *
 * There is NO intermediate IfcRelAggregates object — the library resolved
 * it to the direct related items when building the fragment binary.
 */
async function extractSpatialTree(model: FRAGS.FragmentsModel): Promise<IFCSpatialTree> {
  const empty: IFCSpatialTree = {
    rootIds:           [],
    spatialNodes:      new Map(),
    elementsByStorey:  new Map(),
    storeyByElement:   new Map(),
    elementToOpenings: new Map(),
    openingToFillers:  new Map(),
    openingDetails:    new Map(),
  }

  // ── Step 1: localIds for spatial structure types ──────────────────────────
  let spatialCatMap: Record<string, number[]> = {}
  try {
    spatialCatMap = await (model as unknown as {
      getItemsOfCategories(r: RegExp[]): Promise<Record<string, number[]>>
    }).getItemsOfCategories(SPATIAL_CATEGORY_REGEXPS)
  } catch (err) {
    console.warn('[IFCLoader] getItemsOfCategories (spatial) failed:', err)
    return empty
  }

  const spatialLocalIds: number[] = []
  const spatialLocalIdToType = new Map<number, string>()

  for (const [cat, ids] of Object.entries(spatialCatMap)) {
    for (const id of ids) {
      spatialLocalIds.push(id)
      spatialLocalIdToType.set(id, cat)
    }
  }

  if (spatialLocalIds.length === 0) {
    console.warn('[IFCLoader] No spatial structure entities found in model')
    return empty
  }

  console.log(`[IFCLoader] Found ${spatialLocalIds.length} spatial entities`)

  // ── Step 2: Fetch spatial nodes with their relations ──────────────────────
  //
  // Relation keys (confirmed from @thatopen/fragments 3.4.6 source):
  //   IsDecomposedBy   → direct array of child spatial node items
  //   ContainsElements → direct array of contained physical element items
  //
  // Values are already-expanded item data objects, NOT intermediate rel entities.
  //
  let spatialDataRaw: unknown = {}
  try {
    spatialDataRaw = await (model as unknown as {
      getItemsData(
        ids:    number[],
        config: {
          attributesDefault: boolean
          relations: Record<string, { attributes: boolean; relations: boolean }>
        }
      ): Promise<unknown>
    }).getItemsData(spatialLocalIds, {
      attributesDefault: true,
      relations: {
        IsDecomposedBy:   { attributes: true, relations: false },
        ContainsElements: { attributes: true, relations: false },
      },
    })
  } catch (err) {
    console.warn('[IFCLoader] getItemsData (spatial) failed:', err)
    return empty
  }

  const spatialItems = iterateRawItems(spatialDataRaw)

  if (spatialItems.length === 0) {
    console.warn('[IFCLoader] getItemsData returned 0 spatial items')
    return empty
  }

  // ── Step 3: Instrument — print raw keys for first item ───────────────────
  {
    const first = spatialItems[0]
    const cat   = unwrapString(first['_category']) ?? '?'
    const guid  = unwrapString(first['_guid']) ?? '?'
    const keys  = Object.keys(first)
    console.log(`[IFCLoader] First spatial item: category=${cat} guid=${guid}`)
    console.log(`[IFCLoader] First spatial item keys: [${keys.join(', ')}]`)
    if (Array.isArray(first['IsDecomposedBy'])) {
      console.log(`[IFCLoader] IsDecomposedBy count: ${(first['IsDecomposedBy'] as unknown[]).length}`)
      const child0 = (first['IsDecomposedBy'] as RawItem[])[0]
      if (child0) console.log(`[IFCLoader] IsDecomposedBy[0] keys: [${Object.keys(child0).join(', ')}]`)
    } else {
      console.log(`[IFCLoader] IsDecomposedBy: not an array →`, typeof first['IsDecomposedBy'])
    }
    if (Array.isArray(first['ContainsElements'])) {
      console.log(`[IFCLoader] ContainsElements count: ${(first['ContainsElements'] as unknown[]).length}`)
    }
  }

  // ── Step 4: Build spatial node map ───────────────────────────────────────
  const spatialNodes = new Map<string, IFCSpatialNode>()

  for (const item of spatialItems) {
    const globalId = unwrapString(item['_guid'])
    if (!globalId) continue

    const expressId = unwrapNumber(item['_localId'])
    const rawCat    = unwrapString(item['_category'])
      ?? (expressId !== undefined ? spatialLocalIdToType.get(expressId) : undefined)
      ?? 'IFCBUILDINGELEMENTPROXY'
    const ifcType   = categoryKeyToIfcType(rawCat)
    const name      = readAttr(item, 'Name') ?? ifcType

    spatialNodes.set(globalId, {
      globalId,
      expressId,
      name,
      ifcType,
      childGlobalIds: [],   // populated in Step 5
    })
  }

  // ── Step 5: Resolve relationships ─────────────────────────────────────────
  //
  // IsDecomposedBy items ARE the child spatial nodes directly.
  // ContainsElements items ARE the physical elements directly.
  //
  const elementsByStorey = new Map<string, string[]>()
  const storeyByElement  = new Map<string, string>()

  let aggregateCount    = 0
  let containmentCount  = 0

  for (const item of spatialItems) {
    const parentGlobalId = unwrapString(item['_guid'])
    if (!parentGlobalId) continue

    const parentNode = spatialNodes.get(parentGlobalId)
    if (!parentNode) continue

    // ── IsDecomposedBy → child spatial nodes (FIXED) ─────────────────────
    // Each entry in this array IS a child spatial node item.
    const isDecomposedBy = item['IsDecomposedBy']
    if (Array.isArray(isDecomposedBy)) {
      for (const childItem of isDecomposedBy as RawItem[]) {
        if (!childItem || typeof childItem !== 'object') continue
        const childGlobalId = unwrapString(childItem['_guid'])
        if (!childGlobalId) continue
        if (!parentNode.childGlobalIds.includes(childGlobalId)) {
          parentNode.childGlobalIds.push(childGlobalId)
          aggregateCount++
        }
      }
    }

    // ── ContainsElements → physical elements (FIXED) ─────────────────────
    // Each entry IS a physical element item.
    const containsElements = item['ContainsElements']
    if (Array.isArray(containsElements)) {
      if (!elementsByStorey.has(parentGlobalId)) {
        elementsByStorey.set(parentGlobalId, [])
      }
      const bucket = elementsByStorey.get(parentGlobalId)!

      for (const elItem of containsElements as RawItem[]) {
        if (!elItem || typeof elItem !== 'object') continue
        const elGlobalId = unwrapString(elItem['_guid'])
        if (!elGlobalId) continue
        bucket.push(elGlobalId)
        storeyByElement.set(elGlobalId, parentGlobalId)
        containmentCount++
      }
    }
  }

  // ── Step 6: Identify root nodes ────────────────────────────────────────────
  // A root node has no parent — i.e. no other spatial node's childGlobalIds includes it.
  const nonRootIds = new Set<string>()
  for (const node of spatialNodes.values()) {
    for (const childId of node.childGlobalIds) {
      nonRootIds.add(childId)
    }
  }

  const rootIds: string[] = []
  for (const globalId of spatialNodes.keys()) {
    if (!nonRootIds.has(globalId)) rootIds.push(globalId)
  }

  // ── Step 7: Debug summary ─────────────────────────────────────────────────
  const orphanCount = Array.from(spatialNodes.keys()).filter(
    id => !rootIds.includes(id) && !nonRootIds.has(id)
  ).length

  console.log('\n[IFCLoader] ── Relationship graph ──────────────────────────────────')
  for (const node of spatialNodes.values()) {
    if (node.childGlobalIds.length > 0) {
      console.log(`  ${node.ifcType} "${node.name}"`)
      for (const childId of node.childGlobalIds) {
        const child = spatialNodes.get(childId)
        console.log(`      → ${child?.ifcType ?? '?'} "${child?.name ?? childId}"`)
      }
    }
    const contained = elementsByStorey.get(node.globalId)
    if (contained && contained.length > 0) {
      console.log(`  ${node.ifcType} "${node.name}" contains:`)
      const byType = new Map<string, number>()
      for (const gid of contained) {
        // We don't have type info here since elements are in a separate pass
        // Just count
        byType.set(gid, (byType.get(gid) ?? 0) + 1)
      }
      console.log(`      ${contained.length} elements`)
    }
  }

  console.log('\n[IFCLoader] ── Spatial tree summary ────────────────────────────────')
  console.log(`  Spatial nodes:               ${spatialNodes.size}`)
  console.log(`  Root nodes:                  ${rootIds.length}`)
  console.log(`  Orphan nodes:                ${orphanCount}`)
  console.log(`  IfcRelAggregates resolved:   ${aggregateCount}`)
  console.log(`  ContainsElements resolved:   ${containmentCount}`)
  console.log(`  Storeys with elements:       ${elementsByStorey.size}`)
  for (const rootId of rootIds) {
    const root = spatialNodes.get(rootId)
    console.log(`  Root: ${root?.ifcType} "${root?.name}"`)
  }
  console.log('')

  return {
    rootIds,
    spatialNodes,
    elementsByStorey,
    storeyByElement,
    elementToOpenings: new Map(),   // populated by extractVoidFillRelations()
    openingToFillers:  new Map(),
    openingDetails:    new Map(),
  }
}

// ─── Opening/void extraction ──────────────────────────────────────────────────

/**
 * For each physical element, fetches HasOpenings (voids in walls/slabs)
 * and for each opening, fetches HasFillings (doors/windows).
 *
 * Returns:
 *   elementToOpenings: Map<elementGlobalId, openingGlobalId[]>
 *   openingToFillers:  Map<openingGlobalId, fillerGlobalId[]>
 *   openingDetails:    Map<openingGlobalId, { name, ifcType }>
 */
async function extractVoidFillRelations(
  model:        FRAGS.FragmentsModel,
  elementGlobalIds: string[]
): Promise<{
  elementToOpenings: Map<string, string[]>
  openingToFillers:  Map<string, string[]>
  openingDetails:    Map<string, { name: string; ifcType: string }>
}> {
  const elementToOpenings = new Map<string, string[]>()
  const openingToFillers  = new Map<string, string[]>()
  const openingDetails    = new Map<string, { name: string; ifcType: string }>()

  if (elementGlobalIds.length === 0) {
    return { elementToOpenings, openingToFillers, openingDetails }
  }

  // Get localIds for openings separately
  let openingCatMap: Record<string, number[]> = {}
  try {
    openingCatMap = await (model as unknown as {
      getItemsOfCategories(r: RegExp[]): Promise<Record<string, number[]>>
    }).getItemsOfCategories(OPENING_CATEGORY_REGEXPS)
  } catch {
    return { elementToOpenings, openingToFillers, openingDetails }
  }

  const openingLocalIds: number[] = []
  for (const ids of Object.values(openingCatMap)) {
    openingLocalIds.push(...ids)
  }

  if (openingLocalIds.length === 0) {
    return { elementToOpenings, openingToFillers, openingDetails }
  }

  // Fetch opening items with HasFillings relation
  let openingDataRaw: unknown = {}
  try {
    openingDataRaw = await (model as unknown as {
      getItemsData(
        ids:    number[],
        config: { attributesDefault: boolean; relations: Record<string, { attributes: boolean; relations: boolean }> }
      ): Promise<unknown>
    }).getItemsData(openingLocalIds, {
      attributesDefault: true,
      relations: {
        HasFillings:   { attributes: true, relations: false },
        VoidsElements: { attributes: true, relations: false },
      },
    })
  } catch {
    return { elementToOpenings, openingToFillers, openingDetails }
  }

  const openingItems = iterateRawItems(openingDataRaw)
  let fillingCount = 0
  let voidCount    = 0

  for (const item of openingItems) {
    const openingGuid = unwrapString(item['_guid'])
    if (!openingGuid) continue

    const rawCat  = unwrapString(item['_category']) ?? 'IFCOPENINGELEMENT'
    const ifcType = categoryKeyToIfcType(rawCat)
    const name    = readAttr(item, 'Name') ?? 'Opening'
    openingDetails.set(openingGuid, { name, ifcType })

    // VoidsElements → the wall/slab this opening is cut into
    const voidsElements = item['VoidsElements']
    if (Array.isArray(voidsElements)) {
      for (const elItem of voidsElements as RawItem[]) {
        const elGuid = unwrapString(elItem['_guid'])
        if (!elGuid) continue
        if (!elementToOpenings.has(elGuid)) elementToOpenings.set(elGuid, [])
        if (!elementToOpenings.get(elGuid)!.includes(openingGuid)) {
          elementToOpenings.get(elGuid)!.push(openingGuid)
          voidCount++
        }
      }
    }

    // HasFillings → the doors/windows filling this opening
    const hasFillings = item['HasFillings']
    if (Array.isArray(hasFillings)) {
      if (!openingToFillers.has(openingGuid)) openingToFillers.set(openingGuid, [])
      for (const fItem of hasFillings as RawItem[]) {
        const fGuid = unwrapString(fItem['_guid'])
        if (!fGuid) continue
        if (!openingToFillers.get(openingGuid)!.includes(fGuid)) {
          openingToFillers.get(openingGuid)!.push(fGuid)
          fillingCount++
        }
      }
    }
  }

  console.log(`[IFCLoader] Void/fill: ${openingItems.length} openings, ${voidCount} voids, ${fillingCount} fillings`)

  return { elementToOpenings, openingToFillers, openingDetails }
}

// ─── IFCLoaderWrapper ─────────────────────────────────────────────────────────

export class IFCLoaderWrapper {

  async extractObjects(model: FRAGS.FragmentsModel): Promise<IFCObject[]> {

    // Step 1: Get physical product localIds
    let categoryMap: Record<string, number[]> = {}
    try {
      categoryMap = await (model as unknown as {
        getItemsOfCategories(r: RegExp[]): Promise<Record<string, number[]>>
      }).getItemsOfCategories(ELEMENT_CATEGORY_REGEXPS)
    } catch (err) {
      console.error('[IFCLoaderWrapper] getItemsOfCategories failed:', err)
      return []
    }

    const localIds:     number[] = []
    const localIdToCat = new Map<number, string>()

    for (const [cat, ids] of Object.entries(categoryMap)) {
      for (const id of ids) {
        localIds.push(id)
        localIdToCat.set(id, cat)
      }
    }

    if (localIds.length === 0) {
      console.warn('[IFCLoaderWrapper] No physical product entities found in model')
      return []
    }

    console.log(
      `[IFCLoaderWrapper] Found ${localIds.length} physical product entities ` +
      `across ${Object.keys(categoryMap).length} categories`
    )

    // Step 2: Fetch attributes + Psets
    let itemDataRaw: unknown = {}
    try {
      itemDataRaw = await (model as unknown as {
        getItemsData(
          ids:    number[],
          config: { attributesDefault: boolean; relations: Record<string, { attributes: boolean; relations: boolean }> }
        ): Promise<unknown>
      }).getItemsData(localIds, {
        attributesDefault: true,
        relations: {
          IsDefinedBy: { attributes: true, relations: true },
        },
      })
    } catch (err) {
      console.warn('[IFCLoaderWrapper] getItemsData with Psets failed, retrying attributes-only:', err)
      try {
        itemDataRaw = await (model as unknown as {
          getItemsData(ids: number[], config: { attributesDefault: boolean }): Promise<unknown>
        }).getItemsData(localIds, { attributesDefault: true })
      } catch (err2) {
        console.error('[IFCLoaderWrapper] getItemsData attributes-only also failed:', err2)
        return this.fallbackToGuidsOnly(model, localIds, localIdToCat)
      }
    }

    const items = iterateRawItems(itemDataRaw)

    if (items.length === 0) {
      console.error('[IFCLoaderWrapper] getItemsData returned no items')
      return this.fallbackToGuidsOnly(model, localIds, localIdToCat)
    }

    const rawItems: Parameters<typeof mapRawArrayToIFCObjects>[0] = []

    for (const item of items) {
      const globalId = unwrapString(item['_guid'])
      if (!globalId) continue

      const expressId      = unwrapNumber(item['_localId'])
      const rawCatFromItem = unwrapString(item['_category'])
      const rawCat = rawCatFromItem
        ?? (expressId !== undefined ? localIdToCat.get(expressId) : undefined)
        ?? 'IFCBUILDINGELEMENTPROXY'
      const ifcType = categoryKeyToIfcType(rawCat)

      const name           = readAttr(item, 'Name')         ?? 'Unnamed'
      const tag            = readAttr(item, 'Tag')
      const description    = readAttr(item, 'Description')
      const objectType     = readAttr(item, 'ObjectType')
      const predefinedType = readAttr(item, 'PredefinedType')
      const properties     = extractPsets(item)

      rawItems.push({
        globalId,
        ...(expressId !== undefined && { expressId }),
        name,
        type: ifcType,
        ...(tag            !== null && { tag }),
        ...(description    !== null && { description }),
        ...(objectType     !== null && { objectType }),
        ...(predefinedType !== null && { predefinedType }),
        ...(properties.length > 0   && { properties }),
      })
    }

    console.log(`[IFCLoaderWrapper] Extracted ${rawItems.length} IFC objects`)
    return mapRawArrayToIFCObjects(rawItems)
  }

  /**
   * Extracts the IFC spatial decomposition tree.
   * Reads IFCRELAGGREGATES (IsDecomposedBy) and
   * IFCRELCONTAINEDINSPATIALSTRUCTURE (ContainsElements).
   */
  async extractSpatialTree(model: FRAGS.FragmentsModel): Promise<IFCSpatialTree> {
    return extractSpatialTree(model)
  }

  /**
   * Extracts void/fill relationships.
   * Returns opening elements and their fillers (doors, windows).
   */
  async extractVoidFillRelations(
    model: FRAGS.FragmentsModel,
    elementGlobalIds: string[]
  ) {
    return extractVoidFillRelations(model, elementGlobalIds)
  }

  private async fallbackToGuidsOnly(
    model:         FRAGS.FragmentsModel,
    localIds:      number[],
    localIdToCat:  Map<number, string>
  ): Promise<IFCObject[]> {
    try {
      const guids    = await model.getGuidsByLocalIds(localIds)
      const rawItems: Parameters<typeof mapRawArrayToIFCObjects>[0] = []

      localIds.forEach((localId, i) => {
        const globalId = guids[i]
        if (typeof globalId !== 'string' || globalId.length === 0) return
        const rawCat  = localIdToCat.get(localId) ?? 'IFCBUILDINGELEMENTPROXY'
        const ifcType = categoryKeyToIfcType(rawCat)
        rawItems.push({ globalId, expressId: localId, name: 'Unnamed', type: ifcType })
      })

      console.log(`[IFCLoaderWrapper] Fallback: ${rawItems.length} objects (names unavailable)`)
      return mapRawArrayToIFCObjects(rawItems)
    } catch {
      return []
    }
  }
}