/**
 * NavRail.tsx — Left vertical icon navigation rail.
 *
 * Renders a compact column of icons corresponding to side panels.
 * Clicking an icon opens (or toggles closed) the matching slide-out panel.
 * The active icon is highlighted.
 *
 * Phase 6 continuation change:
 * - Added a 📊 "Gantt / 4D Timeline" icon that calls `toggleGantt()`.
 *   It mirrors the exact highlight behaviour of every other rail icon:
 *   active (highlighted) when the dock is open, inactive when collapsed.
 * - Gantt icon carries an activity badge so the user sees schedule size
 *   without opening the dock.
 *
 * Design decisions:
 * - Icons only — no text labels — keeps the rail narrow (48 px).
 * - Tooltip on hover (native title attribute; lightweight, no extra library).
 * - Badge counts on Layers, Activities, and Gantt so users see live counts.
 * - Separator divides navigation items from the Settings item.
 * - Zero business logic here; all state goes through workspace.store.
 *
 * @module NavRail
 */

import React from 'react'
import { useWorkspaceStore, type SidePanel } from '../../store/workspace.store'
import { useLayerStore }    from '../../store/layer.store'
import { useActivityStore } from '../../store/activity.store'

// ── Types ─────────────────────────────────────────────────────────────────────

/** A normal side-panel nav item — calls openPanel(id). */
interface PanelNavItem {
  kind:   'panel'
  id:     SidePanel
  icon:   string
  label:  string
  badge?: number
}

/** The Gantt dock toggle — calls toggleGantt() instead of openPanel(). */
interface GanttNavItem {
  kind:  'gantt'
  icon:  string
  label: string
  badge?: number
}

type NavItem = PanelNavItem | GanttNavItem

// ── Component ─────────────────────────────────────────────────────────────────

const NavRail: React.FC = () => {
  const activePanel    = useWorkspaceStore(s => s.activePanel)
  const ganttCollapsed = useWorkspaceStore(s => s.ganttCollapsed)
  const openPanel      = useWorkspaceStore(s => s.openPanel)
  const toggleGantt    = useWorkspaceStore(s => s.toggleGantt)

  const layerCount    = useLayerStore(s => s.layers.length)
  const activityCount = useActivityStore(s => s.activities.length)

  // ── Navigation items ──────────────────────────────────────────────────────

  const topItems: NavItem[] = [
    { kind: 'panel', id: 'ifc',        icon: '📂', label: 'IFC Model' },
    { kind: 'panel', id: 'layers',     icon: '🏷',  label: 'Layers',              badge: layerCount || undefined },
    { kind: 'panel', id: 'activities', icon: '📅', label: 'Activities',            badge: activityCount || undefined },
    { kind: 'panel', id: 'inspector',  icon: '🔍', label: 'Inspector' },
    {
      kind:  'gantt',
      icon:  '📊',
      label: 'Gantt / 4D Timeline',
      badge: activityCount || undefined,
    },
  ]

  const bottomItems: NavItem[] = [
    { kind: 'panel', id: 'settings', icon: '⚙', label: 'Settings' },
  ]

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderItem = (item: NavItem, index: number) => {
    // Determine active state:
    //   - panel items: active when that panel is open in the slide-out area
    //   - gantt item: active when the dock is NOT collapsed
    const isActive =
      item.kind === 'panel'
        ? activePanel === item.id
        : !ganttCollapsed

    const handleClick = () => {
      if (item.kind === 'panel') {
        openPanel(item.id)
      } else {
        toggleGantt()
      }
    }

    const badge = item.badge

    return (
      <button
        key={item.kind === 'panel' ? item.id : 'gantt'}
        className={`nav-rail__btn${isActive ? ' nav-rail__btn--active' : ''}`}
        onClick={handleClick}
        title={item.label}
        aria-label={item.label}
        aria-pressed={isActive}
      >
        <span className="nav-rail__icon" aria-hidden="true">{item.icon}</span>
        {badge !== undefined && badge > 0 && (
          <span className="nav-rail__badge" aria-label={`${badge} items`}>
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>
    )
  }

  return (
    <nav className="nav-rail" aria-label="Tool panels">
      <div className="nav-rail__top">
        {topItems.map((item, i) => renderItem(item, i))}
      </div>
      <div className="nav-rail__bottom">
        <div className="nav-rail__separator" aria-hidden="true" />
        {bottomItems.map((item, i) => renderItem(item, i))}
      </div>
    </nav>
  )
}

export default NavRail