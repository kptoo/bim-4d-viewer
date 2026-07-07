import * as FRAGS from '@thatopen/fragments'
import { ifcCategoryMap, ifcClasses } from '@thatopen/fragments'
import type { IFCObject, IFCProperty } from '../types'
import { mapRawArrayToIFCObjects } from '../core/ifc/IFCObjectMapper'

// ─── Build the physical-product category regex list at module load time ───────
//
// ifcClasses.elements is a Set<number> of numeric IFC type codes covering all
// 147 physical product types (walls, doors, slabs, MEP, structure, etc.) as
// defined in the IFC schema.  ifcCategoryMap maps those codes to their
// uppercase string names (e.g. 159607094 → "IFCWALL").

const ELEMENT_CATEGORY_REGEXPS: RegExp[] = (() => {
  const regexps: RegExp[] = []
  for (const typeCode of ifcClasses.elements) {
    const name = ifcCategoryMap[typeCode as unknown as number]
    if (name) {
      regexps.push(new RegExp(`^${name}$`, 'i'))
    }
  }
  return regexps
})()

// ─── Reverse-map: numeric type code (as string) → uppercase IFC name ─────────

const NUMERIC_CODE_TO_NAME: Map<string, string> = (() => {
  const m = new Map<string, string>()
  for (const [code, name] of Object.entries(ifcCategoryMap)) {
    m.set(String(code), String(name).toUpperCase())
  }
  return m
})()

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts a raw category key to a PascalCase IFC type string.
 *   "IFCWALLSTANDARDCASE" → "IfcWallStandardCase"
 *   "659739252"           → resolves via ifcCategoryMap then converts
 */
function categoryKeyToIfcType(rawKey: string): string {
  let upperName = rawKey.toUpperCase()
  if (/^\d+$/.test(rawKey)) {
    upperName = NUMERIC_CODE_TO_NAME.get(rawKey) ?? 'IFCBUILDINGELEMENTPROXY'
  }
  if (!upperName.startsWith('IFC')) {
    return upperName
  }
  return upperName.charAt(0).toUpperCase() + upperName.slice(1).toLowerCase()
}

/**
 * Universal IFC value unwrapper — handles every shape returned by this build.
 *
 * ALL fields in the item object — including _guid, _localId, _category, Name,
 * ObjectType, Tag, Description — are wrapped as { value: <primitive> }.
 * None are bare primitives.
 *
 * Shapes handled:
 *   { value: "string" }                     → "string"
 *   { value: { value: "string", type: x } } → "string"  (nested wrap)
 *   "string"                                → "string"  (rare bare primitive)
 *   42                                      → "42"       (rare bare number)
 *   anything else / null                    → null
 *
 * Returns a trimmed non-empty string, or null.
 */
function unwrapString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null

  // Bare primitive fallback (safe to handle even if not the normal case)
  if (typeof raw === 'string') {
    const s = raw.trim()
    return s.length > 0 ? s : null
  }
  if (typeof raw === 'number') return String(raw)
  if (typeof raw === 'boolean') return String(raw)

  if (typeof raw !== 'object') return null

  // Standard wrapper: { value: x, type?: ... }
  let v = (raw as Record<string, unknown>)['value']

  // One level of nesting: { value: { value: x, type: ... }, type: ... }
  if (v !== null && typeof v === 'object' && 'value' in (v as object)) {
    v = (v as { value: unknown }).value
  }

  if (typeof v === 'string') {
    const s = v.trim()
    return s.length > 0 ? s : null
  }
  if (typeof v === 'number') return String(v)
  return null
}

/**
 * Same as unwrapString but returns a number for numeric IFC values.
 * Used for _localId which must be kept as a number for expressId.
 *
 * Returns a number, or undefined.
 */
function unwrapNumber(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined
  if (typeof raw === 'number') return raw

  if (typeof raw !== 'object') return undefined

  let v = (raw as Record<string, unknown>)['value']

  if (v !== null && typeof v === 'object' && 'value' in (v as object)) {
    v = (v as { value: unknown }).value
  }

  if (typeof v === 'number') return v
  if (typeof v === 'string') {
    const n = Number(v)
    return isNaN(n) ? undefined : n
  }
  return undefined
}

/**
 * Reads and unwraps a named field from an item record.
 * Thin wrapper around unwrapString for named-key access.
 */
function readAttr(
  data: Record<string, unknown>,
  key: string
): string | null {
  return unwrapString(data[key])
}

/**
 * Extracts IFCProperty entries from the IsDefinedBy relation tree.
 *
 * IFC traversal path:
 *   item['IsDefinedBy']                  → ItemData[]
 *     rel['RelatingPropertyDefinition']  → ItemData (IfcPropertySet)
 *       pset['Name']                     → Pset name
 *       pset['HasProperties']            → ItemData[] (IfcPropertySingleValue)
 *         prop['Name']                   → property name
 *         prop['NominalValue']           → property value
 */
function extractPsets(itemData: Record<string, unknown>): IFCProperty[] {
  const props: IFCProperty[] = []

  const isDefinedBy = itemData['IsDefinedBy']
  if (!Array.isArray(isDefinedBy)) return props

  for (const rel of isDefinedBy as Record<string, unknown>[]) {
    if (!rel || typeof rel !== 'object') continue

    const psetEntry = rel['RelatingPropertyDefinition']
    if (!psetEntry || typeof psetEntry !== 'object') continue

    const pset = psetEntry as Record<string, unknown>
    const psetName = readAttr(pset, 'Name') ?? 'UnknownPset'

    const hasProperties = pset['HasProperties']
    if (!Array.isArray(hasProperties)) continue

    for (const propEntry of hasProperties as Record<string, unknown>[]) {
      if (!propEntry || typeof propEntry !== 'object') continue
      const prop = propEntry as Record<string, unknown>

      const propName = readAttr(prop, 'Name')
      if (!propName) continue

      // NominalValue may itself be a wrapped IFC value of any scalar type
      const nomRaw = prop['NominalValue']
      let propValue: string | number | boolean | null = null

      if (nomRaw !== null && nomRaw !== undefined) {
        let v: unknown = nomRaw
        if (typeof v === 'object' && 'value' in (v as object)) {
          v = (v as { value: unknown }).value
        }
        if (typeof v === 'object' && v !== null && 'value' in (v as object)) {
          v = (v as { value: unknown }).value
        }
        if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          propValue = v
        } else if (v !== null && v !== undefined) {
          propValue = String(v)
        }
      }

      props.push({ set: psetName, name: propName, value: propValue })
    }
  }

  return props
}

// ─── IFCLoaderWrapper ─────────────────────────────────────────────────────────

export class IFCLoaderWrapper {
  /**
   * Extracts normalized IFCObject[] from a loaded FragmentsModel.
   *
   * Pipeline:
   *
   *  1. model.getItemsOfCategories(ELEMENT_CATEGORY_REGEXPS)
   *       → { [categoryKey]: localId[] }
   *
   *  2. Collect all localIds → category lookup.
   *
   *  3. model.getItemsData(localIds, config)
   *
   *       CONFIRMED item shape (@thatopen/components 3.4.6 / web-ifc 0.0.77):
   *
   *         {
   *           _guid:       { value: "1F6umJ5H50aeL3A1As_wUF" },
   *           _localId:    { value: 572 },
   *           _category:   { value: "IFCDOOR" },
   *           Name:        { value: "M_Single-Flush:Outside door:346843", type: "IFCLABEL" },
   *           ObjectType:  { value: "M_Single-Flush:Outside door",        type: "IFCLABEL" },
   *           Tag:         { value: "346843",                             type: "IFCIDENTIFIER" },
   *           Description: { value: null, ... },
   *           // ... further wrapped attrs
   *         }
   *
   *       Every field — including _guid, _localId, _category — is a
   *       { value: <primitive> } wrapper object.  None are bare primitives.
   *       All are unwrapped via unwrapString() / unwrapNumber().
   *
   *  4. mapRawArrayToIFCObjects() normalises into the app's IFCObject type.
   */
  async extractObjects(model: FRAGS.FragmentsModel): Promise<IFCObject[]> {

    // ── Step 1: Get physical product localIds, grouped by category ────────
    let categoryMap: Record<string, number[]> = {}
    try {
      categoryMap = await (model as unknown as {
        getItemsOfCategories(r: RegExp[]): Promise<Record<string, number[]>>
      }).getItemsOfCategories(ELEMENT_CATEGORY_REGEXPS)
    } catch (err) {
      console.error('[IFCLoaderWrapper] getItemsOfCategories failed:', err)
      return []
    }

    // ── Step 2: Build flat localId[] and localId → category lookup ────────
    const localIds:    number[] = []
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

    // ── Step 3: Fetch attributes + Psets for all products in one call ─────
    let itemDataRaw: unknown = {}
    try {
      itemDataRaw = await (model as unknown as {
        getItemsData(
          ids:    number[],
          config: {
            attributesDefault: boolean
            relations: Record<string, { attributes: boolean; relations: boolean }>
          }
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
          getItemsData(
            ids:    number[],
            config: { attributesDefault: boolean }
          ): Promise<unknown>
        }).getItemsData(localIds, { attributesDefault: true })
      } catch (err2) {
        console.error('[IFCLoaderWrapper] getItemsData attributes-only also failed:', err2)
        return this.fallbackToGuidsOnly(model, localIds, localIdToCat)
      }
    }

    // ── Step 3b: Detect top-level shape and build a unified item iterator ──
    //
    // Top-level is either:
    //   Array  → items positionally aligned with localIds[]
    //   Object → items keyed by localId string
    //
    // In both cases each item has the confirmed shape above.

    console.log('[IFCLoaderWrapper] getItemsData typeof:', typeof itemDataRaw, '| isArray:', Array.isArray(itemDataRaw))

    type RawItem = Record<string, unknown>

    let iterItems: () => Iterable<RawItem>

    if (Array.isArray(itemDataRaw)) {
      const arr = itemDataRaw as unknown[]
      console.log('[IFCLoaderWrapper] getItemsData returned array, length:', arr.length)
      if (arr.length > 0) {
        const s = arr[0]
        if (s && typeof s === 'object' && !Array.isArray(s)) {
          console.log('[IFCLoaderWrapper] INSTRUMENT arr[0] keys:', Object.keys(s as object))
          console.log('[IFCLoaderWrapper] INSTRUMENT arr[0]._guid:', (s as RawItem)['_guid'])
          console.log('[IFCLoaderWrapper] INSTRUMENT arr[0]._localId:', (s as RawItem)['_localId'])
          console.log('[IFCLoaderWrapper] INSTRUMENT arr[0]._category:', (s as RawItem)['_category'])
        }
      }
      iterItems = () => arr.filter(
        (el): el is RawItem => el !== null && typeof el === 'object' && !Array.isArray(el)
      )
    } else if (itemDataRaw !== null && typeof itemDataRaw === 'object') {
      const map = itemDataRaw as Record<string, unknown>
      const keys = Object.keys(map)
      console.log('[IFCLoaderWrapper] getItemsData returned keyed map, key count:', keys.length)
      if (keys.length > 0) {
        const s = map[keys[0]]
        if (s && typeof s === 'object' && !Array.isArray(s)) {
          console.log('[IFCLoaderWrapper] INSTRUMENT map[0] keys:', Object.keys(s as object))
          console.log('[IFCLoaderWrapper] INSTRUMENT map[0]._guid:', (s as RawItem)['_guid'])
          console.log('[IFCLoaderWrapper] INSTRUMENT map[0]._localId:', (s as RawItem)['_localId'])
          console.log('[IFCLoaderWrapper] INSTRUMENT map[0]._category:', (s as RawItem)['_category'])
        }
      }
      iterItems = () => Object.values(map).filter(
        (el): el is RawItem => el !== null && typeof el === 'object' && !Array.isArray(el)
      )
    } else {
      console.error('[IFCLoaderWrapper] getItemsData returned unexpected type:', typeof itemDataRaw)
      return this.fallbackToGuidsOnly(model, localIds, localIdToCat)
    }

    // ── Step 4: Normalise into RawIFCData ─────────────────────────────────
    //
    // Every field is a { value: <primitive> } wrapper — including _guid,
    // _localId, and _category.  All are unwrapped via unwrapString() /
    // unwrapNumber() before use.  No field is read as a bare primitive.

    const rawItems: Parameters<typeof mapRawArrayToIFCObjects>[0] = []

    for (const item of iterItems()) {
      // ── Instrument ─────────────────────────────────────────────────────
      console.log('[IFCLoaderWrapper] INSTRUMENT item keys:', Object.keys(item))
      console.log('  _guid:', item['_guid'], '| _localId:', item['_localId'], '| _category:', item['_category'])
      console.log('  Name:', item['Name'], '| ObjectType:', item['ObjectType'], '| Tag:', item['Tag'])

      // ── GlobalId — unwrap _guid.value ──────────────────────────────────
      const globalId = unwrapString(item['_guid'])
      if (!globalId) {
        console.warn('  SKIP: _guid.value missing or empty')
        continue
      }

      // ── ExpressId — unwrap _localId.value as a number ──────────────────
      const expressId = unwrapNumber(item['_localId'])

      // ── IFC type — unwrap _category.value, fall back to localIdToCat ───
      const rawCatFromItem = unwrapString(item['_category'])
      const rawCat = rawCatFromItem
        ?? (expressId !== undefined ? localIdToCat.get(expressId) : undefined)
        ?? 'IFCBUILDINGELEMENTPROXY'
      const ifcType = categoryKeyToIfcType(rawCat)

      // ── Named attribute fields — all wrapped; readAttr() unwraps them ───
      const name           = readAttr(item, 'Name')         ?? 'Unnamed'
      const tag            = readAttr(item, 'Tag')
      const description    = readAttr(item, 'Description')
      const objectType     = readAttr(item, 'ObjectType')
      const predefinedType = readAttr(item, 'PredefinedType')

      // ── Psets ───────────────────────────────────────────────────────────
      const properties = extractPsets(item)

      console.log(`  → ACCEPTED globalId=${globalId} expressId=${expressId} name="${name}" type=${ifcType}`)

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
   * Last-resort fallback: produce minimal IFCObjects using only
   * getGuidsByLocalIds(). Names will be 'Unnamed' but count and type correct.
   */
  private async fallbackToGuidsOnly(
    model:         FRAGS.FragmentsModel,
    localIds:      number[],
    localIdToCat:  Map<number, string>
  ): Promise<IFCObject[]> {
    try {
      const guids = await model.getGuidsByLocalIds(localIds)
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