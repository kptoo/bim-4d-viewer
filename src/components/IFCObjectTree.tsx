import {
  useState, useEffect, useCallback, useMemo, useRef, memo,
} from 'react'
import { useViewerStore }    from '../store/viewer.store'
import { useSelectionStore } from '../store/selection.store'
import { ifcTypeIcon }       from '../utils/ifc.utils'
import type { IFCObject, IFCSpatialTree, IFCType } from '../types'

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_HEIGHT = 26
const OVERSCAN   = 8

const SPATIAL_ICONS: Record<string, string> = {
  IfcProject:          '🏗',
  IfcSite:             '🌍',
  IfcBuilding:         '🏢',
  IfcBuildingStorey:   '📐',
  IfcSpace:            '📦',
  IfcOpeningElement:   '🔲',
  IfcVirtualElement:   '🔲',
}

const UNASSIGNED_KEY = '__unassigned__'

// ─── Display node ─────────────────────────────────────────────────────────────

interface DisplayNode {
  id:       string
  label:    string
  ifcType:  string
  globalId: string | null   // null for synthetic group nodes
  isGroup:  boolean
  childIds: string[]
  parentId: string | null
  depth:    number
}

// ─── Build display tree ───────────────────────────────────────────────────────

/**
 * Converts IFCSpatialTree + IFCObject[] into a flat DisplayNode map.
 *
 * Prints the full debug summary requested:
 *   - Relationship graph traversal
 *   - Detected hierarchy
 *   - Counts of each relationship type
 */
function buildDisplayTree(
  spatialTree: IFCSpatialTree,
  objectMap:   Map<string, IFCObject>,
  modelName:   string
): { nodes: Map<string, DisplayNode>; rootIds: string[] } {
  const nodes:   Map<string, DisplayNode> = new Map()
  const rootIds: string[]                 = []

  // ── Counters for debug output ────────────────────────────────────────────
  let aggregateRelCount   = 0
  let containmentCount    = 0
  let openingRelCount     = 0
  let fillingRelCount     = 0
  let groupedCategories   = 0
  let orphanNodeCount     = 0

  function addNode(node: DisplayNode): void {
    nodes.set(node.id, node)
  }

  // ── Build element type-group subtree ──────────────────────────────────────
  function buildElementGroups(
    elementGlobalIds: string[],
    parentId:         string,
    depth:            number,
    spatialNodeId:    string   // storey/space that owns these elements
  ): string[] {
    const byType = new Map<string, string[]>()

    for (const gid of elementGlobalIds) {
      const obj = objectMap.get(gid)
      if (!obj) continue
      const arr = byType.get(obj.type) ?? []
      arr.push(gid)
      byType.set(obj.type, arr)
    }

    const sortedTypes = Array.from(byType.keys()).sort()
    groupedCategories += sortedTypes.length
    const groupIds: string[] = []

    for (const ifcType of sortedTypes) {
      const elemGids = byType.get(ifcType)!
      elemGids.sort((a, b) => (objectMap.get(a)?.name ?? '').localeCompare(objectMap.get(b)?.name ?? ''))

      const groupId  = `grp:${spatialNodeId}:${ifcType}`
      const leafIds: string[] = []

      for (const gid of elemGids) {
        const obj     = objectMap.get(gid)
        const leafId  = `leaf:${spatialNodeId}:${gid}`

        // ── Void/fill sub-children ─────────────────────────────────────────
        const openingIds   = spatialTree.elementToOpenings.get(gid) ?? []
        const openingNodes: string[] = []

        for (const openingGid of openingIds) {
          const details      = spatialTree.openingDetails.get(openingGid)
          const openingNodeId = `opening:${leafId}:${openingGid}`
          const fillerGids   = spatialTree.openingToFillers.get(openingGid) ?? []
          const fillerNodeIds: string[] = []

          for (const fillerGid of fillerGids) {
            const fillerObj    = objectMap.get(fillerGid)
            const fillerNodeId = `filler:${openingNodeId}:${fillerGid}`
            addNode({
              id:       fillerNodeId,
              label:    fillerObj?.name ?? 'Unnamed',
              ifcType:  fillerObj?.type ?? 'IfcDoor',
              globalId: fillerGid,
              isGroup:  false,
              childIds: [],
              parentId: openingNodeId,
              depth:    depth + 4,
            })
            fillerNodeIds.push(fillerNodeId)
            fillingRelCount++
          }

          addNode({
            id:       openingNodeId,
            label:    details?.name ?? 'Opening',
            ifcType:  details?.ifcType ?? 'IfcOpeningElement',
            globalId: openingGid,
            isGroup:  false,
            childIds: fillerNodeIds,
            parentId: leafId,
            depth:    depth + 3,
          })
          openingNodes.push(openingNodeId)
          openingRelCount++
        }

        addNode({
          id:       leafId,
          label:    obj?.name ?? 'Unnamed',
          ifcType:  obj?.type ?? ifcType,
          globalId: gid,
          isGroup:  false,
          childIds: openingNodes,
          parentId: groupId,
          depth:    depth + 1,
        })
        leafIds.push(leafId)
      }

      const typeName = ifcType.replace(/^Ifc/, '')
      addNode({
        id:       groupId,
        label:    `${typeName} (${elemGids.length})`,
        ifcType,
        globalId: null,
        isGroup:  true,
        childIds: leafIds,
        parentId,
        depth,
      })
      groupIds.push(groupId)
    }

    return groupIds
  }

  // ── Walk spatial tree from root ───────────────────────────────────────────
  function walkSpatialNode(
    globalId: string,
    parentId: string | null,
    depth:    number
  ): void {
    const spatialNode = spatialTree.spatialNodes.get(globalId)
    if (!spatialNode) return

    const childIds: string[] = []

    // Child spatial nodes (from IFCRELAGGREGATES)
    for (const childGlobalId of spatialNode.childGlobalIds) {
      walkSpatialNode(childGlobalId, globalId, depth + 1)
      childIds.push(childGlobalId)
      aggregateRelCount++
    }

    // Physical elements in this spatial container (from IFCRELCONTAINEDINSPATIALSTRUCTURE)
    const elementGids = spatialTree.elementsByStorey.get(globalId) ?? []
    if (elementGids.length > 0) {
      const groupIds = buildElementGroups(elementGids, globalId, depth + 1, globalId)
      childIds.push(...groupIds)
      containmentCount += elementGids.length
    }

    addNode({
      id:       globalId,
      label:    spatialNode.name || spatialNode.ifcType,
      ifcType:  spatialNode.ifcType,
      globalId,
      isGroup:  false,
      childIds,
      parentId,
      depth,
    })
  }

  // ── Add model filename root wrapper ───────────────────────────────────────
  const modelRootId = 'root:model'

  for (const rootId of spatialTree.rootIds) {
    walkSpatialNode(rootId, modelRootId, 1)
    aggregateRelCount--  // compensate for the extra count from the top level
  }

  addNode({
    id:       modelRootId,
    label:    modelName || 'Model',
    ifcType:  'IfcProject',
    globalId: null,
    isGroup:  false,
    childIds: [...spatialTree.rootIds],
    parentId: null,
    depth:    0,
  })
  rootIds.push(modelRootId)

  // ── Unassigned elements (no storey membership) ────────────────────────────
  const unassigned = spatialTree.elementsByStorey.get(UNASSIGNED_KEY) ?? []
  if (unassigned.length > 0) {
    const unassignedId = 'grp:unassigned'
    const groupIds = buildElementGroups(unassigned, unassignedId, 1, UNASSIGNED_KEY)
    addNode({
      id:       unassignedId,
      label:    `Unassigned (${unassigned.length})`,
      ifcType:  'IfcBuildingElement',
      globalId: null,
      isGroup:  true,
      childIds: groupIds,
      parentId: null,
      depth:    0,
    })
    rootIds.push(unassignedId)
  }

  // ── Count orphans: spatial nodes not reached from any root ────────────────
  const visitedIds = new Set<string>()
  function markVisited(id: string): void {
    if (visitedIds.has(id)) return
    visitedIds.add(id)
    const node = nodes.get(id)
    if (node) node.childIds.forEach(markVisited)
  }
  rootIds.forEach(markVisited)
  for (const id of spatialTree.spatialNodes.keys()) {
    if (!visitedIds.has(id)) orphanNodeCount++
  }

  // ── Debug: relationship graph ─────────────────────────────────────────────
  console.log('\n[IFCObjectTree] ── Building relationship graph ────────────────────')
  for (const node of spatialTree.spatialNodes.values()) {
    if (node.childGlobalIds.length > 0) {
      console.log(`  ${node.ifcType} "${node.name}"`)
      for (const childId of node.childGlobalIds) {
        const child = spatialTree.spatialNodes.get(childId)
        console.log(`      -> ${child?.ifcType ?? '?'} "${child?.name ?? childId}"`)
      }
    }
    const contained = spatialTree.elementsByStorey.get(node.globalId) ?? []
    if (contained.length > 0) {
      console.log(`  ${node.ifcType} "${node.name}" contains:`)
      // Group by type for display
      const byType = new Map<string, number>()
      for (const gid of contained) {
        const t = objectMap.get(gid)?.type ?? '?'
        byType.set(t, (byType.get(t) ?? 0) + 1)
      }
      for (const [t, count] of byType) {
        console.log(`      ${t} ×${count}`)
      }
    }
  }

  for (const [elGid, openings] of spatialTree.elementToOpenings) {
    const elName = objectMap.get(elGid)?.name ?? elGid
    console.log(`  ${elName} voids:`)
    for (const oGid of openings) {
      const oName    = spatialTree.openingDetails.get(oGid)?.name ?? 'Opening'
      const fillers  = spatialTree.openingToFillers.get(oGid) ?? []
      console.log(`      Opening "${oName}"`)
      for (const fGid of fillers) {
        const fName = objectMap.get(fGid)?.name ?? fGid
        console.log(`          filled by "${fName}"`)
      }
    }
  }

  // ── Debug: hierarchy summary ──────────────────────────────────────────────
  console.log('\n[IFCObjectTree] ── Detected hierarchy ─────────────────────────────')
  function printHierarchy(id: string, indent: string): void {
    const node = nodes.get(id)
    if (!node) return
    console.log(`${indent}${node.label} (${node.ifcType})`)
    for (const childId of node.childIds.slice(0, 6)) {  // cap at 6 to avoid flooding
      printHierarchy(childId, indent + '  ')
    }
    if (node.childIds.length > 6) {
      console.log(`${indent}  ... (${node.childIds.length - 6} more)`)
    }
  }
  for (const rid of rootIds) printHierarchy(rid, '  ')

  // ── Debug: statistics ─────────────────────────────────────────────────────
  console.log('\n[IFCObjectTree] ── Statistics ──────────────────────────────────────')
  console.log(`  IfcRelAggregates resolved:      ${aggregateRelCount}`)
  console.log(`  ContainedInStructure resolved:  ${containmentCount}`)
  console.log(`  IfcRelVoidsElement resolved:    ${openingRelCount}`)
  console.log(`  IfcRelFillsElement resolved:    ${fillingRelCount}`)
  console.log(`  Grouped IFC categories:         ${groupedCategories}`)
  console.log(`  Root nodes:                     ${rootIds.length}`)
  console.log(`  Orphan spatial nodes:           ${orphanNodeCount}`)
  console.log(`  Total display nodes:            ${nodes.size}`)
  console.log('')

  return { nodes, rootIds }
}

// ─── Fallback: type-grouped tree when no spatial data ────────────────────────

function buildFlatFallbackTree(
  objects: IFCObject[]
): { nodes: Map<string, DisplayNode>; rootIds: string[] } {
  const nodes:   Map<string, DisplayNode> = new Map()
  const rootIds: string[]                 = []

  const byType = new Map<string, IFCObject[]>()
  for (const obj of objects) {
    const arr = byType.get(obj.type) ?? []
    arr.push(obj)
    byType.set(obj.type, arr)
  }

  const sortedTypes = Array.from(byType.keys()).sort()
  const typeGroupIds: string[] = []

  for (const ifcType of sortedTypes) {
    const items   = byType.get(ifcType)!
    const groupId = `grp:type:${ifcType}`
    const leafIds: string[] = []

    items.sort((a, b) => a.name.localeCompare(b.name))
    for (const obj of items) {
      nodes.set(obj.globalId, {
        id: obj.globalId, label: obj.name || 'Unnamed', ifcType: obj.type,
        globalId: obj.globalId, isGroup: false, childIds: [], parentId: groupId, depth: 2,
      })
      leafIds.push(obj.globalId)
    }

    nodes.set(groupId, {
      id: groupId, label: `${ifcType.replace(/^Ifc/, '')} (${items.length})`, ifcType,
      globalId: null, isGroup: true, childIds: leafIds, parentId: 'grp:model', depth: 1,
    })
    typeGroupIds.push(groupId)
  }

  nodes.set('grp:model', {
    id: 'grp:model', label: 'Model', ifcType: 'IfcProject',
    globalId: null, isGroup: true, childIds: typeGroupIds, parentId: null, depth: 0,
  })
  rootIds.push('grp:model')

  return { nodes, rootIds }
}

// ─── Visible row generation ───────────────────────────────────────────────────

function buildVisibleRows(
  rootIds:     string[],
  nodes:       Map<string, DisplayNode>,
  expandedIds: Set<string>,
  query:       string
): string[] {
  const rows:   string[] = []
  const lowerQ = query.toLowerCase().trim()

  if (lowerQ) {
    const toShow = new Set<string>()
    for (const [id, node] of nodes) {
      const matches =
        node.label.toLowerCase().includes(lowerQ) ||
        node.ifcType.toLowerCase().includes(lowerQ) ||
        (node.globalId?.toLowerCase().includes(lowerQ) ?? false)

      if (matches) {
        let cur: DisplayNode | undefined = node
        while (cur) { toShow.add(cur.id); cur = cur.parentId ? nodes.get(cur.parentId) : undefined }
        for (const cid of node.childIds) toShow.add(cid)
      }
    }
    function dfsSearch(id: string): void {
      if (!toShow.has(id)) return
      rows.push(id)
      const node = nodes.get(id)
      if (!node) return
      for (const childId of node.childIds) dfsSearch(childId)
    }
    for (const rid of rootIds) dfsSearch(rid)
    return rows
  }

  function dfs(id: string): void {
    rows.push(id)
    const node = nodes.get(id)
    if (!node || !expandedIds.has(id)) return
    for (const childId of node.childIds) dfs(childId)
  }
  for (const rid of rootIds) dfs(rid)
  return rows
}

function getAncestorIds(nodes: Map<string, DisplayNode>, nodeId: string): Set<string> {
  const result = new Set<string>()
  let cur = nodes.get(nodeId)
  while (cur?.parentId) { result.add(cur.parentId); cur = nodes.get(cur.parentId) }
  return result
}

// ─── Single row ───────────────────────────────────────────────────────────────

const TreeRow = memo(function TreeRow({
  node, isExpanded, isSelected, onToggle, onSelect,
}: {
  node: DisplayNode; isExpanded: boolean; isSelected: boolean
  onToggle: (id: string) => void; onSelect: (globalId: string) => void
}) {
  const hasChildren = node.childIds.length > 0
  const icon        = SPATIAL_ICONS[node.ifcType] ?? ifcTypeIcon(node.ifcType as IFCType)

  const handleClick = useCallback(() => {
    if (hasChildren)   onToggle(node.id)
    if (node.globalId) onSelect(node.globalId)
  }, [node.id, node.globalId, hasChildren, onToggle, onSelect])

  const handleChevron = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasChildren) onToggle(node.id)
  }, [node.id, hasChildren, onToggle])

  return (
    <div
      className={['tree-node', isSelected ? 'tree-node--selected' : '', node.isGroup ? 'tree-node--group' : ''].filter(Boolean).join(' ')}
      style={{ paddingLeft: 8 + node.depth * 14 }}
      onClick={handleClick}
      title={node.globalId ? `GlobalId: ${node.globalId}` : node.label}
    >
      <span
        className={['tree-chevron', hasChildren ? 'tree-chevron--visible' : '', isExpanded ? 'tree-chevron--open' : ''].filter(Boolean).join(' ')}
        onClick={handleChevron}
        aria-hidden
      >▶</span>
      <span className="tree-icon">{icon}</span>
      <span className="tree-label">{node.label}</span>
      {!node.isGroup && node.childIds.length === 0 && !SPATIAL_ICONS[node.ifcType] && (
        <span className="tree-type-badge">{node.ifcType.replace(/^Ifc/, '')}</span>
      )}
    </div>
  )
})

// ─── Virtual list ─────────────────────────────────────────────────────────────

function VirtualList({
  rowIds, nodes, expandedIds, selectedGlobalId, onToggle, onSelect,
}: {
  rowIds: string[]; nodes: Map<string, DisplayNode>; expandedIds: Set<string>
  selectedGlobalId: string | null; onToggle: (id: string) => void; onSelect: (globalId: string) => void
}) {
  const scrollRef             = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height,    setHeight]    = useState(400)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(e => setHeight(e[0].contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const handleScroll = useCallback(() => { setScrollTop(scrollRef.current?.scrollTop ?? 0) }, [])

  const totalHeight  = rowIds.length * ROW_HEIGHT
  const startIndex   = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const endIndex     = Math.min(rowIds.length, startIndex + Math.ceil(height / ROW_HEIGHT) + OVERSCAN * 2)
  const visibleIds   = rowIds.slice(startIndex, endIndex)

  return (
    <div ref={scrollRef} className="tree-scroll" onScroll={handleScroll}>
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div style={{ position: 'absolute', top: startIndex * ROW_HEIGHT, width: '100%' }}>
          {visibleIds.map(id => {
            const node = nodes.get(id)
            if (!node) return null
            return (
              <TreeRow
                key={id}
                node={node}
                isExpanded={expandedIds.has(id)}
                isSelected={node.globalId !== null && node.globalId === selectedGlobalId}
                onToggle={onToggle}
                onSelect={onSelect}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function IFCObjectTree() {
  const ifcObjects      = useViewerStore(s => s.ifcObjects)
  const spatialTree     = useViewerStore(s => s.spatialTree)
  const modelLoadState  = useViewerStore(s => s.modelLoadState)
  const modelFileName   = useViewerStore(s => s.modelFileName)
  const primaryGlobalId = useSelectionStore(s => s.primaryGlobalId)
  const selectObject    = useSelectionStore(s => s.selectObject)

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  const objectMap = useMemo<Map<string, IFCObject>>(() => {
    const m = new Map<string, IFCObject>()
    for (const obj of ifcObjects) m.set(obj.globalId, obj)
    return m
  }, [ifcObjects])

  const modelName = modelFileName?.replace(/\.[^.]+$/, '') ?? 'Model'

  const { nodes, rootIds } = useMemo(() => {
    if (spatialTree && spatialTree.spatialNodes.size > 0 && ifcObjects.length > 0) {
      return buildDisplayTree(spatialTree, objectMap, modelName)
    }
    if (ifcObjects.length > 0) {
      console.warn('[IFCObjectTree] No spatial tree — falling back to type grouping')
      return buildFlatFallbackTree(ifcObjects)
    }
    return { nodes: new Map<string, DisplayNode>(), rootIds: [] as string[] }
  }, [spatialTree, ifcObjects, objectMap, modelName])

  useEffect(() => {
    if (modelLoadState === 'idle') { setExpandedIds(new Set()); setSearchQuery(''); return }
    if (modelLoadState === 'loaded' && rootIds.length > 0) {
      // Auto-expand root + first two levels
      const initial = new Set<string>()
      function expand(id: string, depth: number): void {
        if (depth > 2) return
        initial.add(id)
        nodes.get(id)?.childIds.forEach(cid => expand(cid, depth + 1))
      }
      expand(rootIds[0], 0)
      setExpandedIds(initial)
    }
  }, [modelLoadState, rootIds, nodes])

  const prevSelectedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!primaryGlobalId || primaryGlobalId === prevSelectedRef.current) return
    prevSelectedRef.current = primaryGlobalId

    // The leaf node for a selected element may have id = "leaf:storeyId:globalId"
    // Find it by looking for a node whose globalId matches
    let targetId: string | undefined
    for (const [id, node] of nodes) {
      if (node.globalId === primaryGlobalId) { targetId = id; break }
    }
    if (!targetId) return

    const ancestors = getAncestorIds(nodes, targetId)
    if (ancestors.size === 0) return

    setExpandedIds(prev => {
      const next = new Set(prev)
      ancestors.forEach(id => next.add(id))
      return next
    })
  }, [primaryGlobalId, nodes])

  const visibleRowIds = useMemo(
    () => buildVisibleRows(rootIds, nodes, expandedIds, searchQuery),
    [rootIds, nodes, expandedIds, searchQuery]
  )

  const handleToggle      = useCallback((id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  }, [])
  const handleSelect      = useCallback((globalId: string) => selectObject(globalId, false), [selectObject])
  const handleExpandAll   = useCallback(() => setExpandedIds(new Set(nodes.keys())), [nodes])
  const handleCollapseAll = useCallback(() => setExpandedIds(new Set()), [])

  if (modelLoadState !== 'loaded') {
    return <div className="tree-empty"><div className="tree-empty__icon">🌲</div><p>Load an IFC model to view the object tree</p></div>
  }
  if (ifcObjects.length === 0) {
    return <div className="tree-empty"><div className="tree-empty__icon">📭</div><p>No objects found in model</p></div>
  }

  const hasSpatial = spatialTree && spatialTree.spatialNodes.size > 0

  return (
    <div className="tree-panel">
      <div className="tree-toolbar">
        <input
          className="tree-search"
          type="text"
          placeholder="Search objects…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
        <button className="tree-action-btn" onClick={handleExpandAll}  title="Expand all">⊞</button>
        <button className="tree-action-btn" onClick={handleCollapseAll} title="Collapse all">⊟</button>
      </div>

      <div className="tree-stats-bar">
        <span className="tree-stats-count">{ifcObjects.length.toLocaleString()} elements</span>
        {searchQuery.trim() && <span className="tree-stats-matches">{visibleRowIds.length} visible</span>}
        <span
          className={`tree-stats-mode${hasSpatial ? '' : ' tree-stats-mode--fallback'}`}
          title={hasSpatial ? 'Hierarchy from IFC relationships' : 'Type-grouped (no spatial data)'}
        >
          {hasSpatial ? '📐 Spatial' : '📋 Grouped'}
        </span>
      </div>

      {visibleRowIds.length === 0 ? (
        <div className="tree-empty tree-empty--inline"><p>No results for "{searchQuery}"</p></div>
      ) : (
        <VirtualList
          rowIds={visibleRowIds}
          nodes={nodes}
          expandedIds={expandedIds}
          selectedGlobalId={primaryGlobalId}
          onToggle={handleToggle}
          onSelect={handleSelect}
        />
      )}
    </div>
  )
}