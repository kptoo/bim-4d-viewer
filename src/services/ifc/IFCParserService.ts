/**
 * IFCParserService — Orchestrates the full IFC load pipeline.
 *
 * Fix: setIFCObjects and onModelLoaded must share the same source of truth.
 * The UI count comes from ifcObjects.length — so we must call setIFCObjects
 * with the real extracted objects, not rely on onModelLoaded's raw count.
 */

import type { ViewerEngine } from '../../viewer/ViewerEngine'
import { IFCLoaderWrapper } from '../../viewer/IFCLoader'
import { IFCUploadService } from './IFCUploadService'
import type { IFCObject } from '../../types'

export interface ParseResult {
  success:    boolean
  ifcObjects: IFCObject[]
  error?:     string
  fileName?:  string
  fileSize?:  number
}

export class IFCParserService {
  private readonly viewerEngine: ViewerEngine

  constructor(viewerEngine: ViewerEngine) {
    this.viewerEngine = viewerEngine
  }

  /**
   * Full pipeline:
   *   1. Validate and read the file
   *   2. Load buffer into viewer  → renders 3D geometry
   *   3. Extract IFCObject[]      → populates the store / UI count
   *
   * Always returns — never throws unhandled exceptions.
   */
  async parseFile(file: File): Promise<ParseResult> {
    // ── Step 1: Validate ──────────────────────────────────
    const validation = await IFCUploadService.validateAndRead(file)

    if (!validation.valid || !validation.buffer) {
      return {
        success:    false,
        ifcObjects: [],
        error:      validation.error ?? 'File validation failed',
        fileName:   validation.fileName,
        fileSize:   validation.fileSize,
      }
    }

    // ── Step 2: Load into viewer (renders geometry) ───────
    let model
    try {
      // Strip extension from fileName to use as model ID
      const modelName = validation.fileName.replace(/\.[^.]+$/, '')
      model = await this.viewerEngine.loadIFC(validation.buffer, modelName)
    } catch (err) {
      return {
        success:    false,
        ifcObjects: [],
        error:      err instanceof Error ? err.message : 'Failed to load IFC model',
        fileName:   validation.fileName,
        fileSize:   validation.fileSize,
      }
    }

    // ── Step 3: Extract IFC objects ───────────────────────
    // This is what populates the UI element count.
    // Must complete BEFORE returning success so setIFCObjects
    // is called with real data, not an empty array.
    let ifcObjects: IFCObject[] = []

    try {
      const loaderWrapper = new IFCLoaderWrapper()
      ifcObjects = await loaderWrapper.extractObjects(model)

      console.log(`[IFCParserService] Extracted ${ifcObjects.length} IFC objects from "${validation.fileName}"`)

    } catch (err) {
      // Model rendered — extraction failed — partial success
      console.warn('[IFCParserService] Property extraction failed:', err)

      return {
        success:    true,
        ifcObjects: [],
        error:      'Model rendered but element extraction failed. Element count will show 0.',
        fileName:   validation.fileName,
        fileSize:   validation.fileSize,
      }
    }

    return {
      success:  true,
      ifcObjects,
      fileName: validation.fileName,
      fileSize: validation.fileSize,
    }
  }
}