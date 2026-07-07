import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useViewerStore } from '../store/viewer.store'
import { useSelectionStore } from '../store/selection.store'
import { ifcTypeIcon } from '../utils/ifc.utils'
import type { IFCObject, IFCType } from '../types'

// ─── Hierarchy configuration ────────────────────────────────────────────────

/**
 * IFC spatial structure types, in hierarchy order.
 * Everything not listed here becomes a leaf "Element" node.
 */
const SPATIAL_TYPES: IFCType[] = [
  'IfcProject',
  'IfcSite',
  'IfcBuilding',
  'IfcBuildingStorey',
  'IfcSpace',
]

const SPATIAL_TYPE_SET = new Set<string>(SPATIAL_TYPES)

const SPATIAL_ICONS: Record<string, string> = {
  IfcProject:         '🏗',
  IfcSite:            '🌍',
  IfcBuilding:        '🏢',
  IfcBuildingStorey:  '📐',
  IfcSpace:           '📦',
}

// ─── Tree node types ─────────────────────────────────────────────────────────

interface TreeNode {
  id:         string        // globalId or synthetic group id
  label:      string        // Display name
  ifcType:    string        // IFC entity type string
  globalId:   string | null // null for synthetic group nodes
  children:   TreeNode[]
  isGroup:    boolean       // true = synthetic group (not a real IFC object)
}

// ─── Tree builder ────────────────────────────────────────────────────────────

/**
 * Builds a spatial hierarchy tree from the flat IFCObject[] array.
 *
 * Strategy (without RelationsIndexer, which requires async model access):
 *   1. Split objects into "spatial" (Project/Site/Building/Storey/Space) and "elements"
 *   2. Group spatial objects by type in hierarchy order
 *   3. Group element objects by IFC type under a synthetic "Elements" container
 *   4. Nest everything under the deepest spatial container available
 *
 * This gives a clean, browseable hierarchy from data already in the store.
 */
function buildTree(objects: IFCObject[]): TreeNode[] {
  if (objects.length === 0) return []

  // Split spatial vs element objects
  const spatialObjects  = objects.filter(o => SPATIAL_TYPE_SET.has(o.type))
  const elementObjects  = objects.filter(o => !SPATIAL_TYPE_SET.has(o.type))

  // ── Build spatial branch ──────────────────────────────────────────────────
  // Sort by hierarchy order so Project > Site > Building > Storey > Space
  const spatialOrdered = [...spatialObjects].sort((a, b) => {
    const ai = SPATIAL_TYPES.indexOf(a.type as IFCType)
    const bi = SPATIAL_TYPES.indexOf(b.type as IFCType)
    const ar = ai === -1 ? 999 : ai
    const br = bi === -1 ? 999 : bi
    return ar - br
  })

  // Build spatial nodes (flat list, will be nested below)
  const spatialNodes: TreeNode[] = spatialOrdered.map(obj => ({
    id:       obj.globalId,
    label:    obj.name || obj.type,
    ifcType:  obj.type,
    globalId: obj.globalId,
    children: [],
    isGroup:  false,
  }))

  // ── Build element branch — group by IFC type ──────────────────────────────
  const typeMap = new Map<string, IFCObject[]>()
  for (const obj of elementObjects) {
    const existing = typeMap.get(obj.type) ?? []
    existing.push(obj)
    typeMap.set(obj.type, existing)
  }

  // Sort type groups alphabetically
  const sortedTypes = Array.from(typeMap.keys()).sort()

  const elementTypeNodes: TreeNode[] = sortedTypes.map(ifcType => {
    const items = typeMap.get(ifcType)!
    const children: TreeNode[] = items.map(obj => ({
      id:       obj.globalId,
      label:    obj.name || 'Unnamed Element',
      ifcType:  obj.type,
      globalId: obj.globalId,
      children: [],
      isGroup:  false,
    }))

    return {
      id:       `group:${ifcType}`,
      label:    `${ifcType.replace(/^Ifc/, '')} (${items.length})`,
      ifcType,
      globalId: null,
      children,
      isGroup:  true,
    }
  })

  // ── Assemble root ─────────────────────────────────────────────────────────
  // If we have spatial structure: nest elements under the last (deepest) spatial node
  // If no spatial structure: show a flat "Model" root
  if (spatialNodes.length === 0) {
    // No spatial hierarchy — flat model root
    const modelRoot: TreeNode = {
      id:       'group:model',
      label:    'Model',
      ifcType:  'IfcProject',
      globalId: null,
      children: elementTypeNodes,
      isGroup:  true,
    }
    return [modelRoot]
  }

  // Nest each spatial level inside the previous one (chain)
  // Last spatial node gets the element type nodes as children
  const chainedSpatial = [...spatialNodes]
  if (elementTypeNodes.length > 0) {
    const elementsGroupNode: TreeNode = {
      id:       'group:elements',
      label:    `Elements (${elementObjects.length})`,
      ifcType:  'IfcBuildingElement',
      globalId: null,
      children: elementTypeNodes,
      isGroup:  true,
    }
    chainedSpatial[chainedSpatial.length - 1].children.push(elementsGroupNode)
  }

  // Nest from deepest → shallowest so that each node contains the next
  for (let i = chainedSpatial.length - 2; i >= 0; i--) {
    chainedSpatial[i].children.unshift(chainedSpatial[i + 1])
  }

  return [chainedSpatial[0]]
}

/**
 * Returns the set of node IDs that are ancestors of the given globalId,
 * so we can auto-expand the path to the selected node.
 */
function findAncestorIds(nodes: TreeNode[], targetGlobalId: string): Set<string> {
  const result = new Set<string>()

  function search(node: TreeNode, path: string[]): boolean {
    if (node.globalId === targetGlobalId) {
      path.forEach(id => result.add(id))
      return true
    }
    for (const child of node.children) {
      if (search(child, [...path, node.id])) return true
    }
    return false
  }

  for (const root of nodes) {
    search(root, [])
  }
  return result
}

// ─── Tree node component ─────────────────────────────────────────────────────

interface TreeNodeProps {
  node:             TreeNode
  depth:            number
  expandedIds:      Set<string>
  selectedGlobalId: string | null
  onToggle:         (id: string) => void
  onSelect:         (globalId: string) => void
}

function TreeNodeRow({
  node,
  depth,
  expandedIds,
  selectedGlobalId,
  onToggle,
  onSelect,
}: TreeNodeProps) {
  const isExpanded = expandedIds.has(node.id)
  const isSelected = node.globalId !== null && node.globalId === selectedGlobalId
  const hasChildren = node.children.length > 0

  const icon = SPATIAL_ICONS[node.ifcType] ?? ifcTypeIcon(node.ifcType as IFCType)

  const handleClick = useCallback(() => {
    if (hasChildren) onToggle(node.id)
    if (node.globalId) onSelect(node.globalId)
  }, [node.id, node.globalId, hasChildren, onToggle, onSelect])

  const handleChevronClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (hasChildren) onToggle(node.id)
  }, [node.id, hasChildren, onToggle])

  return (
    <>
      <div
        className={`tree-node${isSelected ? ' tree-node--selected' : ''}${node.isGroup ? ' tree-node--group' : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={handleClick}
        title={node.globalId ? `GlobalId: ${node.globalId}` : undefined}
      >
        {/* Chevron */}
        <span
          className={`tree-chevron${hasChildren ? ' tree-chevron--visible' : ''}${isExpanded ? ' tree-chevron--open' : ''}`}
          onClick={handleChevronClick}
        >
          ▶
        </span>

        {/* Icon */}
        <span className="tree-icon">{icon}</span>

        {/* Label */}
        <span className="tree-label">{node.label}</span>

        {/* IFC type badge for leaf elements */}
        {!node.isGroup && (
          <span className="tree-type-badge">{node.ifcType.replace(/^Ifc/, '')}</span>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && node.children.map(child => (
        <TreeNodeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          expandedIds={expandedIds}
          selectedGlobalId={selectedGlobalId}
          onToggle={onToggle}
          onSelect={onSelect}
        />
      ))}
    </>
  )
}

// ─── Main tree panel ─────────────────────────────────────────────────────────

export default function IFCObjectTree() {
  const ifcObjects        = useViewerStore(s => s.ifcObjects)
  const modelLoadState    = useViewerStore(s => s.modelLoadState)
  const primaryGlobalId   = useSelectionStore(s => s.primaryGlobalId)
  const selectObject      = useSelectionStore(s => s.selectObject)

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  // Build tree from flat objects
  const tree = useMemo(() => buildTree(ifcObjects), [ifcObjects])

  // Reset tree when a new model loads
  useEffect(() => {
    if (modelLoadState === 'loaded' && tree.length > 0) {
      // Auto-expand root node
      setExpandedIds(new Set([tree[0].id]))
    }
    if (modelLoadState === 'idle') {
      setExpandedIds(new Set())
      setSearchQuery('')
    }
  }, [modelLoadState, tree])

  // Auto-expand path to selected node when 3D viewer picks an object
  const prevSelectedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!primaryGlobalId || primaryGlobalId === prevSelectedRef.current) return
    prevSelectedRef.current = primaryGlobalId

    const ancestorIds = findAncestorIds(tree, primaryGlobalId)
    if (ancestorIds.size > 0) {
      setExpandedIds(prev => {
        const next = new Set(prev)
        ancestorIds.forEach(id => next.add(id))
        return next
      })
    }
  }, [primaryGlobalId, tree])

  const handleToggle = useCallback((id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else               next.add(id)
      return next
    })
  }, [])

  const handleSelect = useCallback((globalId: string) => {
    selectObject(globalId, false)
  }, [selectObject])

  const handleExpandAll = useCallback(() => {
    const allIds = new Set<string>()
    function collect(node: TreeNode) {
      allIds.add(node.id)
      node.children.forEach(collect)
    }
    tree.forEach(collect)
    setExpandedIds(allIds)
  }, [tree])

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  // Search filtering — builds a filtered tree keeping any node
  // whose label or type matches, plus all its ancestors
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree

    const q = searchQuery.toLowerCase()

    function nodeMatches(node: TreeNode): boolean {
      return (
        node.label.toLowerCase().includes(q) ||
        node.ifcType.toLowerCase().includes(q) ||
        (node.globalId?.toLowerCase().includes(q) ?? false)
      )
    }

    function filterNode(node: TreeNode): TreeNode | null {
      const filteredChildren = node.children
        .map(filterNode)
        .filter((n): n is TreeNode => n !== null)

      if (nodeMatches(node) || filteredChildren.length > 0) {
        return { ...node, children: filteredChildren }
      }
      return null
    }

    return tree.map(filterNode).filter((n): n is TreeNode => n !== null)
  }, [tree, searchQuery])

  // Auto-expand all when searching
  useEffect(() => {
    if (!searchQuery.trim()) return
    const allIds = new Set<string>()
    function collect(node: TreeNode) {
      allIds.add(node.id)
      node.children.forEach(collect)
    }
    filteredTree.forEach(collect)
    setExpandedIds(allIds)
  }, [filteredTree, searchQuery])

  // ── Empty states ──────────────────────────────────────────────────────────

  if (modelLoadState !== 'loaded') {
    return (
      <div className="tree-empty">
        <div className="tree-empty__icon">🌲</div>
        <p>Load an IFC model to view the object tree</p>
      </div>
    )
  }

  if (ifcObjects.length === 0) {
    return (
      <div className="tree-empty">
        <div className="tree-empty__icon">📭</div>
        <p>No objects found in model</p>
      </div>
    )
  }

  return (
    <div className="tree-panel">
      {/* Search + toolbar */}
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

      {/* Tree */}
      <div className="tree-scroll">
        {filteredTree.length === 0 ? (
          <div className="tree-empty tree-empty--inline">
            <p>No results for "{searchQuery}"</p>
          </div>
        ) : (
          filteredTree.map(node => (
            <TreeNodeRow
              key={node.id}
              node={node}
              depth={0}
              expandedIds={expandedIds}
              selectedGlobalId={primaryGlobalId}
              onToggle={handleToggle}
              onSelect={handleSelect}
            />
          ))
        )}
      </div>
    </div>
  )
}