/**
 * ColorManager — Applies simulation color overrides.
 *
 * Correct @thatopen/fragments v3.x API:
 * - model.getGuidsByLocalIds(ids[])  → (string | null)[]
 * - model.getLocalIdsByGuids(guids[]) → (number | null)[]
 * - model.setColor(ids[], color)     → 2 args, no opacity flag
 * - model.resetColor(ids[])          → requires localIds array
 */

import * as THREE from 'three'
import * as FRAGS from '@thatopen/fragments'

export class ColorManager {
  /**
   * Applies a GlobalId → hex color map to all loaded models.
   * Resolves GlobalIds to localIds using getLocalIdsByGuids().
   */
  applyOverrides(
    overrides:     Map<string, string>,
    loadedModels:  FRAGS.FragmentsModel[]
  ): void {
    for (const model of loadedModels) {
      this.applyToModel(model, overrides).catch(() => {
        // Color update failed — visual only, not critical
      })
    }
  }

  /**
   * Resets all color overrides on all models.
   */
  resetAll(loadedModels: FRAGS.FragmentsModel[]): void {
    for (const model of loadedModels) {
      this.resetModel(model).catch(() => {
        // Reset failed — not critical
      })
    }
  }

  private async applyToModel(
    model:     FRAGS.FragmentsModel,
    overrides: Map<string, string>
  ): Promise<void> {
    try {
      const guids    = Array.from(overrides.keys())
      if (guids.length === 0) return

      // Resolve all GlobalIds → localIds in one batch call
      const localIds = await model.getLocalIdsByGuids(guids)

      // Group localIds by color
      const colorGroups = new Map<string, number[]>()

      guids.forEach((guid, index) => {
        const localId = localIds[index]
        if (localId === null || localId === undefined) return

        const color = overrides.get(guid)
        if (!color) return

        const group = colorGroups.get(color) ?? []
        group.push(localId)
        colorGroups.set(color, group)
      })

      // Apply each color group
      for (const [hexColor, ids] of colorGroups) {
        if (ids.length === 0) continue
        const color = new THREE.Color(hexColor)
        // Correct signature: setColor(ids[], color) — 2 args only
        model.setColor(ids, color)
      }

    } catch {
      // Ignore — color is visual only
    }
  }

  private async resetModel(model: FRAGS.FragmentsModel): Promise<void> {
    try {
      const localIds = await model.getLocalIds()
      if (localIds.length > 0) {
        // resetColor requires the localIds array
        model.resetColor(localIds)
      }
    } catch {
      // Ignore
    }
  }
}