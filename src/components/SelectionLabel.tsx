/**
 * SelectionLabel.tsx — Floating 3D callout label for the selected IFC object.
 *
 * This component renders a callout bubble that tracks the selected object
 * in world space using a requestAnimationFrame loop. It was previously
 * information-only (name, type, GlobalId). It now also exposes two action
 * buttons directly inside the bubble:
 *
 * Phase 6 selection UX additions:
 *
 * 1. **✕ Clear** button — always shown when an object is selected.
 *    Calls `clearSelection()`. The viewer's Effect 2 and Effect 1 react
 *    to the selection.store change and remove color overrides automatically.
 *    This is the most discoverable deselect affordance: it's physically
 *    attached to the selected object's label, exactly where the user's
 *    eye is looking after clicking something.
 *
 * 2. **👁 Show All** button — shown only when `isIsolated === true`.
 *    Calls `isolateObjects([])` + `setIsIsolated(false)`.
 *    Restores visibility of all hidden objects in one click without
 *    requiring the user to open the Inspector side panel.
 *
 * Both buttons are intentionally compact and use a muted style so they
 * don't dominate the callout — they are secondary to the object identity
 * information (name, type, GlobalId) that the user just selected.
 *
 * Keyboard shortcut hint:
 * The Escape shortcut is wired in IFCViewer Effect 5. The label shows
 * a small "Esc" keyboard hint next to the Clear button so first-time
 * users discover it immediately.
 *
 * Performance note:
 * The action buttons are rendered as React children of a div that has
 * `pointerEvents: 'auto'` explicitly set. The outer wrapper remains
 * `pointerEvents: 'none'` so click-through to the 3D canvas is preserved
 * everywhere except the button area.
 *
 * @module SelectionLabel
 */

import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { useSelectionStore } from '../store/selection.store'
import { useViewerStore }    from '../store/viewer.store'
import type { ViewerEngine } from '../viewer/ViewerEngine'
import type { IFCObject }    from '../types'

// ── Props ─────────────────────────────────────────────────────────────────────

interface SelectionLabelProps {
  engineRef: React.RefObject<ViewerEngine | null>
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SelectionLabel({ engineRef }: SelectionLabelProps) {
  // ── Store subscriptions ──────────────────────────────────
  const primaryGlobalId     = useSelectionStore(s => s.primaryGlobalId)
  const clearSelection      = useSelectionStore(s => s.clearSelection)
  const getObjectByGlobalId = useViewerStore(s => s.getObjectByGlobalId)
  const isolateObjects      = useViewerStore(s => s.isolateObjects)
  const isIsolated          = useViewerStore(s => s.isIsolated)
  const setIsIsolated       = useViewerStore(s => s.setIsIsolated)

  // ── Refs ─────────────────────────────────────────────────

  const labelRef   = useRef<HTMLDivElement>(null)
  const nameRef    = useRef<HTMLSpanElement>(null)
  const typeRef    = useRef<HTMLSpanElement>(null)
  const guidRef    = useRef<HTMLSpanElement>(null)
  const anchorRef  = useRef<THREE.Vector3 | null>(null)
  const projectedRef = useRef(new THREE.Vector3())
  const rafRef     = useRef<number>(0)
  const visibleRef = useRef(false)

  // ── Show / hide helpers (imperative) ─────────────────────

  const showLabel = useCallback(() => {
    const el = labelRef.current
    if (!el || visibleRef.current) return
    el.style.opacity       = '1'
    el.style.pointerEvents = 'none'
    visibleRef.current     = true
  }, [])

  const hideLabel = useCallback(() => {
    const el = labelRef.current
    if (!el || !visibleRef.current) return
    el.style.opacity       = '0'
    el.style.pointerEvents = 'none'
    visibleRef.current     = false
  }, [])

  // ── RAF loop: project anchor → screen position ────────────

  const startRAF = useCallback(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)

      const anchor = anchorRef.current
      const label  = labelRef.current

      if (!anchor || !label) { hideLabel(); return }

      const engine = engineRef.current
      if (!engine)            { hideLabel(); return }

      const camera    = engine.getCamera()
      const container = engine.getContainerElement()
      if (!camera || !container) { hideLabel(); return }

      projectedRef.current.copy(anchor).project(camera)

      const ndcX = projectedRef.current.x
      const ndcY = projectedRef.current.y
      const ndcZ = projectedRef.current.z

      if (ndcZ > 1) { hideLabel(); return }

      const w  = container.clientWidth
      const h  = container.clientHeight
      const px =  (ndcX + 1) / 2 * w
      const py = (-ndcY + 1) / 2 * h

      if (px < -200 || px > w + 200 || py < -200 || py > h + 200) {
        hideLabel()
        return
      }

      label.style.left = `${px}px`
      label.style.top  = `${py}px`
      showLabel()
    }

    rafRef.current = requestAnimationFrame(loop)
  }, [engineRef, showLabel, hideLabel])

  const stopRAF = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [])

  useEffect(() => {
    startRAF()
    return () => stopRAF()
  }, [startRAF, stopRAF])

  // ── React to selection changes ────────────────────────────

  useEffect(() => {
    anchorRef.current = null

    if (!primaryGlobalId) {
      if (nameRef.current) nameRef.current.textContent = ''
      if (typeRef.current) typeRef.current.textContent = ''
      if (guidRef.current) guidRef.current.textContent = ''
      return
    }

    const obj: IFCObject | undefined = getObjectByGlobalId(primaryGlobalId)
    if (obj) {
      const displayName = obj.name?.trim() || obj.type
      if (nameRef.current) nameRef.current.textContent = displayName
      if (typeRef.current) typeRef.current.textContent = obj.type
      if (guidRef.current) guidRef.current.textContent = obj.globalId
    } else {
      if (nameRef.current) nameRef.current.textContent = primaryGlobalId
      if (typeRef.current) typeRef.current.textContent = ''
      if (guidRef.current) guidRef.current.textContent = primaryGlobalId
    }

    const engine = engineRef.current
    if (!engine) return

    let cancelled = false
    engine.getObjectWorldTop(primaryGlobalId).then(worldTop => {
      if (cancelled) return
      anchorRef.current = worldTop
    }).catch(() => {
      if (!cancelled) anchorRef.current = null
    })

    return () => { cancelled = true }
  }, [primaryGlobalId, getObjectByGlobalId, engineRef])

  // ── Action handlers ───────────────────────────────────────

  /**
   * Clear selection: deselects the object, removes colour overrides.
   * Does NOT restore visibility — that requires Show All or Escape.
   */
  const handleClear = useCallback(() => {
    clearSelection()
  }, [clearSelection])

  /**
   * Show All: exits isolation mode and restores all hidden objects.
   * Does NOT clear the colour selection highlight — the object stays
   * selected (highlighted), just no longer isolated.
   */
  const handleShowAll = useCallback(() => {
    if (isolateObjects) {
      isolateObjects([])
    }
    setIsIsolated(false)
  }, [isolateObjects, setIsIsolated])

  // ── Whether the callout should be visible ─────────────────
  //
  // Show the callout when an object is selected (primaryGlobalId is set)
  // OR when the model is isolated (isIsolated) so the Show All button
  // remains accessible even if the user deselected the object.

  const hasSelection = primaryGlobalId !== null
  const showCallout  = hasSelection || isIsolated

  // ── Render ────────────────────────────────────────────────
  //
  // Outer div: absolute, pointer-events none, tracks anchor in world space.
  // Inner callout: visible bubble + action buttons with pointer-events auto.

  return (
    <div
      ref={labelRef}
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        pointerEvents: 'none',
        opacity:       0,
        willChange:    'transform, opacity',
        transition:    'opacity 0.15s ease',
        overflow:      'visible',
        zIndex:        50,
        // When showing the isolation-only state (no selection), pin the callout
        // to a fixed corner of the viewer rather than a world-space anchor.
        // This is achieved by keeping the outer div's top/left at 0,0 and
        // using a different transform on the inner div (see below).
      }}
    >
      {showCallout && (
        <div
          style={{
            transform:     hasSelection
              ? 'translate(-50%, calc(-100% - 12px))'
              : 'translate(12px, 12px)',   // fixed top-left offset when no selection
            display:       'flex',
            flexDirection: 'column',
            alignItems:    hasSelection ? 'center' : 'flex-start',
            gap:           0,
          }}
        >
          {/* Callout bubble */}
          <div
            style={{
              background:    'rgba(13, 17, 23, 0.92)',
              border:        '1px solid rgba(47, 107, 255, 0.5)',
              borderRadius:  8,
              padding:       '8px 12px',
              minWidth:      140,
              maxWidth:      260,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: [
                '0 4px 24px rgba(0, 0, 0, 0.6)',
                '0 0 0 1px rgba(47, 107, 255, 0.15)',
                'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
              ].join(', '),
              display:       'flex',
              flexDirection: 'column',
              gap:           3,
              // Enable pointer events on the bubble only
              pointerEvents: 'auto',
            }}
          >
            {/* Object identity — shown only when something is selected */}
            {hasSelection && (
              <>
                <span
                  ref={nameRef}
                  style={{
                    fontSize:   13,
                    fontWeight: 600,
                    color:      '#E6EDF3',
                    lineHeight: 1.3,
                    wordBreak:  'break-word',
                    fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
                  }}
                />
                <span
                  ref={typeRef}
                  style={{
                    fontSize:      10,
                    fontWeight:    600,
                    color:         '#2F6BFF',
                    letterSpacing: '0.04em',
                    fontFamily:    "'Segoe UI', system-ui, -apple-system, sans-serif",
                  }}
                />
                <div style={{ height: 1, background: 'rgba(48, 54, 61, 0.8)', margin: '2px 0' }} />
                <span
                  ref={guidRef}
                  style={{
                    fontSize:      9,
                    color:         '#8B949E',
                    fontFamily:    'ui-monospace, SFMono-Regular, monospace',
                    letterSpacing: '0.02em',
                    overflow:      'hidden',
                    textOverflow:  'ellipsis',
                    whiteSpace:    'nowrap',
                  }}
                />
                <div style={{ height: 1, background: 'rgba(48, 54, 61, 0.6)', margin: '4px 0 2px' }} />
              </>
            )}

            {/* Action row ── */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>

              {/* Clear selection button */}
              {hasSelection && (
                <button
                  onClick={handleClear}
                  title="Deselect object (Escape)"
                  style={{
                    background:   'rgba(231, 76, 60, 0.12)',
                    border:       '1px solid rgba(231, 76, 60, 0.3)',
                    borderRadius: 5,
                    color:        '#e74c3c',
                    cursor:       'pointer',
                    fontSize:     10,
                    fontWeight:   600,
                    padding:      '3px 8px',
                    display:      'flex',
                    alignItems:   'center',
                    gap:          4,
                    transition:   'background 0.15s',
                    whiteSpace:   'nowrap',
                    fontFamily:   "'Segoe UI', system-ui, -apple-system, sans-serif",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(231, 76, 60, 0.22)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(231, 76, 60, 0.12)')}
                >
                  ✕ Clear
                  <kbd style={{
                    background:    'rgba(255,255,255,0.07)',
                    border:        '1px solid rgba(255,255,255,0.15)',
                    borderRadius:  3,
                    fontSize:      9,
                    padding:       '1px 4px',
                    color:         '#8B949E',
                    fontFamily:    'ui-monospace, monospace',
                  }}>Esc</kbd>
                </button>
              )}

              {/* Show All button — only when isolated */}
              {isIsolated && (
                <button
                  onClick={handleShowAll}
                  title="Show all hidden objects"
                  style={{
                    background:   'rgba(47, 107, 255, 0.12)',
                    border:       '1px solid rgba(47, 107, 255, 0.3)',
                    borderRadius: 5,
                    color:        '#2F6BFF',
                    cursor:       'pointer',
                    fontSize:     10,
                    fontWeight:   600,
                    padding:      '3px 8px',
                    display:      'flex',
                    alignItems:   'center',
                    gap:          4,
                    transition:   'background 0.15s',
                    whiteSpace:   'nowrap',
                    fontFamily:   "'Segoe UI', system-ui, -apple-system, sans-serif",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'rgba(47, 107, 255, 0.22)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'rgba(47, 107, 255, 0.12)')}
                >
                  👁 Show All
                </button>
              )}

            </div>
          </div>

          {/* Callout arrow — only shown when anchored to a world-space object */}
          {hasSelection && (
            <div
              style={{
                width:       0,
                height:      0,
                borderLeft:  '7px solid transparent',
                borderRight: '7px solid transparent',
                borderTop:   '8px solid rgba(13, 17, 23, 0.92)',
                filter:      'drop-shadow(0 2px 3px rgba(0,0,0,0.4))',
                position:    'relative',
              }}
            >
              <div
                style={{
                  position:    'absolute',
                  top:         -9,
                  left:        -6,
                  width:       0,
                  height:      0,
                  borderLeft:  '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop:   '7px solid rgba(47, 107, 255, 0.5)',
                  zIndex:      -1,
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}