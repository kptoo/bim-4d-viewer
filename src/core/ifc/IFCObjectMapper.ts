/**
 * IFCObjectMapper — Normalizes raw IFC parser output into
 * the application's IFCObject domain model.
 *
 * This layer isolates the rest of the application from
 * changes in the IFC parser library (That Open Engine).
 * If the parser API changes, only this file needs updating.
 *
 * Phase 1: Works with mock data.
 * Phase 2: Will receive real data from IFCParserService.
 */

import type { IFCObject, IFCType } from '../../types'

/**
 * Raw IFC data shape from the parser (Phase 1: mock shape).
 * In Phase 2, this will be replaced with That Open Engine types.
 */
export interface RawIFCData {
  globalId:  string
  expressId?: number
  name:      string
  type:      string
  properties?: Array<{ set: string; name: string; value: string | number | boolean | null }>
}

/**
 * Converts raw IFC parser data into a normalized IFCObject.
 * Applies safe defaults for all optional fields.
 */
export function mapRawToIFCObject(raw: RawIFCData): IFCObject {
  return {
    globalId:      raw.globalId,
    expressId:     raw.expressId,
    name:          raw.name || 'Unnamed Element',
    type:          raw.type as IFCType,
    properties:    raw.properties ?? [],
    layerIds:      [],     // Populated from database in Phase 3
    activityIds:   [],     // Populated from database in Phase 4
    visible:       true,
    colorOverride: null,
  }
}

/**
 * Converts an array of raw IFC data into IFCObject[].
 * Filters out any items with missing GlobalIds.
 */
export function mapRawArrayToIFCObjects(rawItems: RawIFCData[]): IFCObject[] {
  return rawItems
    .filter(item => typeof item.globalId === 'string' && item.globalId.length > 0)
    .map(mapRawToIFCObject)
}

/**
 * The mock dataset used in Phase 1.
 * Will be removed in Phase 2 once real IFC upload is implemented.
 */
export const MOCK_IFC_DATA: RawIFCData[] = [
  { globalId: 'A1',  name: 'Wall-N-001',    type: 'IfcWall'        },
  { globalId: 'A2',  name: 'Wall-S-001',    type: 'IfcWall'        },
  { globalId: 'A3',  name: 'Slab-GF-001',   type: 'IfcSlab'        },
  { globalId: 'A4',  name: 'Column-A1',     type: 'IfcColumn'      },
  { globalId: 'A5',  name: 'Column-B1',     type: 'IfcColumn'      },
  { globalId: 'A6',  name: 'Beam-AB-001',   type: 'IfcBeam'        },
  { globalId: 'A7',  name: 'Slab-L1-001',   type: 'IfcSlab'        },
  { globalId: 'A8',  name: 'Wall-Facade-N', type: 'IfcCurtainWall' },
  { globalId: 'A9',  name: 'Pipe-HVAC-001', type: 'IfcFlowSegment' },
  { globalId: 'A10', name: 'Duct-001',      type: 'IfcFlowSegment' },
  { globalId: 'A11', name: 'Stair-Core',    type: 'IfcStair'       },
  { globalId: 'A12', name: 'Floor-Fin-1',   type: 'IfcCovering'    },
]