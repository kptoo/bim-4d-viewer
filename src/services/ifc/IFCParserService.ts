import type { ViewerEngine }   from '../../viewer/ViewerEngine'
import { IFCLoaderWrapper }    from '../../viewer/IFCLoader'
import { IFCUploadService }    from './IFCUploadService'
import type { IFCObject, IFCSpatialTree } from '../../types'

export interface ParseResult {
  success:     boolean
  ifcObjects:  IFCObject[]
  spatialTree: IFCSpatialTree | null
  error?:      string
  fileName?:   string
  fileSize?:   number
}

export class IFCParserService {
  private readonly viewerEngine: ViewerEngine

  constructor(viewerEngine: ViewerEngine) {
    this.viewerEngine = viewerEngine
  }

  async parseFile(file: File): Promise<ParseResult> {
    // ── Step 1: Validate ─────────────────────────────────────
    const validation = await IFCUploadService.validateAndRead(file)

    if (!validation.valid || !validation.buffer) {
      return {
        success:     false,
        ifcObjects:  [],
        spatialTree: null,
        error:       validation.error ?? 'File validation failed',
        fileName:    validation.fileName,
        fileSize:    validation.fileSize,
      }
    }

    // ── Step 2: Load into viewer ─────────────────────────────
    let model
    try {
      const modelName = validation.fileName.replace(/\.[^.]+$/, '')
      model = await this.viewerEngine.loadIFC(validation.buffer, modelName)
    } catch (err) {
      return {
        success:     false,
        ifcObjects:  [],
        spatialTree: null,
        error:       err instanceof Error ? err.message : 'Failed to load IFC model',
        fileName:    validation.fileName,
        fileSize:    validation.fileSize,
      }
    }

    // ── Steps 3a + 3b: Elements and spatial tree in parallel ─
    const loaderWrapper = new IFCLoaderWrapper()

    let ifcObjects:  IFCObject[]           = []
    let spatialTree: IFCSpatialTree | null = null

    try {
      const [objects, tree] = await Promise.all([
        loaderWrapper.extractObjects(model),
        loaderWrapper.extractSpatialTree(model),
      ])
      ifcObjects  = objects
      spatialTree = tree

      // ── Step 3c: Void/fill relations ─────────────────────
      // Only attempt if we have elements to work with.
      if (ifcObjects.length > 0 && spatialTree) {
        try {
          const elementGlobalIds = ifcObjects.map(o => o.globalId)
          const voidFill = await loaderWrapper.extractVoidFillRelations(model, elementGlobalIds)
          spatialTree.elementToOpenings = voidFill.elementToOpenings
          spatialTree.openingToFillers  = voidFill.openingToFillers
          spatialTree.openingDetails    = voidFill.openingDetails
        } catch (vfErr) {
          console.warn('[IFCParserService] Void/fill extraction failed (non-fatal):', vfErr)
          // spatialTree already has empty maps from extractSpatialTree, that's fine
        }
      }

      console.log(
        `[IFCParserService] Extracted ${ifcObjects.length} objects, ` +
        `${spatialTree?.spatialNodes.size ?? 0} spatial nodes, ` +
        `${spatialTree?.elementToOpenings.size ?? 0} elements with openings ` +
        `from "${validation.fileName}"`
      )
    } catch (err) {
      console.warn('[IFCParserService] Extraction failed:', err)
      return {
        success:     true,
        ifcObjects:  [],
        spatialTree: null,
        error:       'Model rendered but element extraction failed.',
        fileName:    validation.fileName,
        fileSize:    validation.fileSize,
      }
    }

    return {
      success:  true,
      ifcObjects,
      spatialTree,
      fileName: validation.fileName,
      fileSize: validation.fileSize,
    }
  }
}