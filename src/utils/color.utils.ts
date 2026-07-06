/**
 * Color utilities shared between the viewer engine
 * and the simulation system.
 * Pure functions — no side effects.
 */

import { SIMULATION_COLORS, SELECTION_COLOR } from '../types'
import type { SimulationStatus } from '../types'

/**
 * Returns the hex color string for a given simulation status.
 */
export function getSimulationColor(status: SimulationStatus): string {
  return SIMULATION_COLORS[status]
}

/**
 * Returns the selection highlight color.
 */
export function getSelectionColor(): string {
  return SELECTION_COLOR
}

/**
 * Converts a hex color string (e.g. "#2F6BFF") to
 * a numeric value for use with THREE.Color.setHex().
 *
 * @param hex - Hex string with or without leading #
 * @returns Numeric hex value
 */
export function hexToNumber(hex: string): number {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex
  return parseInt(clean, 16)
}

/**
 * Converts a numeric hex color to a hex string.
 *
 * @param value - Numeric color value
 * @returns Hex string with leading #
 */
export function numberToHex(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`
}

/**
 * Blends two hex colors at a given ratio (0 = a, 1 = b).
 * Used for hover effects and opacity blending.
 */
export function blendHex(hexA: string, hexB: string, ratio: number): string {
  const a = parseInt(hexA.replace('#', ''), 16)
  const b = parseInt(hexB.replace('#', ''), 16)

  const rA = (a >> 16) & 0xff
  const gA = (a >> 8)  & 0xff
  const bA =  a        & 0xff

  const rB = (b >> 16) & 0xff
  const gB = (b >> 8)  & 0xff
  const bB =  b        & 0xff

  const r = Math.round(rA + (rB - rA) * ratio)
  const g = Math.round(gA + (gB - gA) * ratio)
  const bl = Math.round(bA + (bB - bA) * ratio)

  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${bl.toString(16).padStart(2,'0')}`
}