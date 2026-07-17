/**
 * SlidePanel.tsx — Animated slide-out side panel container.
 *
 * Wraps any panel content with:
 * - A slide-in / slide-out CSS transition driven by the `isOpen` prop.
 * - A panel header bar with label and close button.
 * - The panel content area (scrollable).
 *
 * Performance design:
 * - The panel is NEVER unmounted while the app is running (avoids destroying
 *   component state, unsaved form fields, and expensive sub-tree mounts).
 * - Hidden state is achieved via CSS transform + visibility, not React
 *   conditional rendering. React.memo prevents re-renders of children when
 *   the panel is closed.
 * - `aria-hidden` is toggled so screen readers skip the hidden content.
 *
 * @module SlidePanel
 */

import React from 'react'
import { useWorkspaceStore } from '../../store/workspace.store'

interface SlidePanelProps {
  /** Whether this panel is currently visible */
  isOpen:   boolean
  /** Human-readable panel title shown in the header bar */
  title:    string
  /** Panel content — kept mounted at all times */
  children: React.ReactNode
}

const SlidePanel: React.FC<SlidePanelProps> = ({ isOpen, title, children }) => {
  const panelWidth = useWorkspaceStore(s => s.panelWidth)
  const closePanel = useWorkspaceStore(s => s.closePanel)

  return (
    <div
      className={`slide-panel${isOpen ? ' slide-panel--open' : ''}`}
      style={{ width: panelWidth }}
      aria-hidden={!isOpen}
      role="complementary"
      aria-label={title}
    >
      {/* Panel header */}
      <div className="slide-panel__header">
        <span className="slide-panel__title">{title}</span>
        <button
          className="slide-panel__close"
          onClick={closePanel}
          aria-label={`Close ${title} panel`}
          title="Close panel"
        >
          ✕
        </button>
      </div>

      {/* Panel body — scrollable */}
      <div className="slide-panel__body">
        {children}
      </div>
    </div>
  )
}

export default React.memo(SlidePanel)