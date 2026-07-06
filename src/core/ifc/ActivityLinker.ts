/**
 * ActivityLinker — Computes bidirectional relationships between
 * IFC objects and construction activities.
 *
 * This logic must not live in React components or stores.
 * Components read pre-computed link maps from the activity store.
 */

import type { Activity, IFCObject } from '../../types'

export interface LinkMap {
  /** GlobalId → Activity IDs */
  objectToActivities: Map<string, string[]>
  /** Activity ID → GlobalIds */
  activityToObjects:  Map<string, string[]>
}

export class ActivityLinker {
  /**
   * Builds a complete bidirectional link map from an array of activities.
   * Called once when activities are loaded, result stored in activity store.
   *
   * @param activities - All activities in the project
   * @returns LinkMap with both directions pre-computed
   */
  static buildLinkMap(activities: Activity[]): LinkMap {
    const objectToActivities = new Map<string, string[]>()
    const activityToObjects  = new Map<string, string[]>()

    for (const activity of activities) {
      activityToObjects.set(activity.id, [...activity.linkedGlobalIds])

      for (const globalId of activity.linkedGlobalIds) {
        const existing = objectToActivities.get(globalId) ?? []
        if (!existing.includes(activity.id)) {
          existing.push(activity.id)
        }
        objectToActivities.set(globalId, existing)
      }
    }

    return { objectToActivities, activityToObjects }
  }

  /**
   * Returns all activity IDs linked to a given IFC object.
   * Returns empty array if the object has no linked activities.
   */
  static getActivitiesForObject(
    globalId: string,
    linkMap: LinkMap
  ): string[] {
    return linkMap.objectToActivities.get(globalId) ?? []
  }

  /**
   * Returns all GlobalIds linked to a given activity.
   * Returns empty array if the activity has no linked objects.
   */
  static getObjectsForActivity(
    activityId: string,
    linkMap: LinkMap
  ): string[] {
    return linkMap.activityToObjects.get(activityId) ?? []
  }

  /**
   * Synchronizes IFCObject.activityIds from the link map.
   * Returns a new array — does not mutate the input.
   */
  static enrichObjectsWithActivityIds(
    objects: IFCObject[],
    linkMap: LinkMap
  ): IFCObject[] {
    return objects.map(obj => ({
      ...obj,
      activityIds: ActivityLinker.getActivitiesForObject(obj.globalId, linkMap),
    }))
  }
}