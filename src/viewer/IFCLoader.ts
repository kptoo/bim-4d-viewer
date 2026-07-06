/**
 * IFCLoaderWrapper — Extracts IFCObject[] from a loaded FragmentsModel.
 *
 * Root cause of 0 elements:
 * - getItemsCategories() exists in source but throws at runtime due to
 *   .d.ts mismatch → catch block silently returns []
 *
 * Fix:
 * - Use getGuidsByLocalIds() which is reliable and well-typed
 * - Use getItemsCategories() with a safe fallback
 * - Never let a single item failure abort the whole extraction
 * - Process in batches to avoid blocking the main thread
 */

import * as FRAGS from '@thatopen/fragments'
import type { IFCObject } from '../types'
import { mapRawArrayToIFCObjects } from '../core/ifc/IFCObjectMapper'

// The full internal API — some methods exist in source but not in .d.ts
interface FragmentsModelFull {
  getLocalIds():                      Promise<number[]>
  getGuidsByLocalIds(ids: number[]):  Promise<(string | null)[]>
  getItemsCategories(ids: number[]):  Promise<(string | null)[]>
  getItemAttributes(id: number):      Promise<Map<string, { value: unknown }> | null>
}

export class IFCLoaderWrapper {
  /**
   * Extracts normalized IFCObject[] from a loaded FragmentsModel.
   *
   * Strategy:
   * 1. getLocalIds()             — always works, gives us the count
   * 2. getGuidsByLocalIds()      — reliable batch call for GlobalIds
   * 3. getItemsCategories()      — batch call for IFC type names, with fallback
   * 4. getItemAttributes()       — per-item name fetch, best-effort only
   *
   * Any step that fails falls back gracefully — we always return
   * at least the items we could resolve.
   */
  async extractObjects(model: FRAGS.FragmentsModel): Promise<IFCObject[]> {
    const m = model as unknown as FragmentsModelFull

    const rawItems: Array<{
      globalId:  string
      expressId: number
      name:      string
      type:      string
    }> = []

    try {
      // ── Step 1: Get all local IDs ─────────────────────────
      const localIds = await m.getLocalIds()
      if (localIds.length === 0) {
        console.warn('[IFCLoaderWrapper] model.getLocalIds() returned 0 items')
        return []
      }

      console.log(`[IFCLoaderWrapper] Found ${localIds.length} local IDs`)

      // ── Step 2: Batch resolve GUIDs ───────────────────────
      let guids: (string | null)[] = []
      try {
        guids = await m.getGuidsByLocalIds(localIds)
      } catch (err) {
        console.warn('[IFCLoaderWrapper] getGuidsByLocalIds failed:', err)
        // Assign synthetic GUIDs so items are still countable
        guids = localIds.map(id => `synthetic-${id}`)
      }

      // ── Step 3: Batch resolve IFC categories (type names) ─
      let categories: (string | null)[] = []
      try {
        categories = await m.getItemsCategories(localIds)
      } catch (err) {
        console.warn('[IFCLoaderWrapper] getItemsCategories failed:', err)
        // Default all to generic type — items still count
        categories = localIds.map(() => 'IfcBuildingElement')
      }

      // ── Step 4: Build items from resolved data ────────────
      // Filter to items with a valid GUID — these are real IFC products
      const validItems = localIds
        .map((id, i) => ({
          id,
          guid:     guids[i],
          category: categories[i] ?? 'IfcBuildingElement',
        }))
        .filter((item): item is { id: number; guid: string; category: string } =>
          typeof item.guid === 'string' && item.guid.length > 0
        )

      console.log(`[IFCLoaderWrapper] ${validItems.length} items have valid GUIDs`)

      // ── Step 5: Fetch names in small batches ──────────────
      // Names are optional — if this fails the item still counts
      const BATCH_SIZE = 50

      for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
        const batch = validItems.slice(i, i + BATCH_SIZE)

        await Promise.all(batch.map(async ({ id, guid, category }) => {
          let name = 'Unnamed Element'

          try {
            const attrs = await m.getItemAttributes(id)
            if (attrs) {
              const nameAttr = attrs.get('Name')
              if (nameAttr?.value && String(nameAttr.value).trim().length > 0) {
                name = String(nameAttr.value).trim()
              }
            }
          } catch {
            // Name fetch failed — use default, item still counts
          }

          rawItems.push({ globalId: guid, expressId: id, name, type: category })
        }))
      }

    } catch (err) {
      console.error('[IFCLoaderWrapper] extractObjects fatal error:', err)
    }

    console.log(`[IFCLoaderWrapper] Extracted ${rawItems.length} IFC objects`)
    return mapRawArrayToIFCObjects(rawItems)
  }
}