import { useEffect, useRef, useCallback } from 'react'
import * as THREE from 'three'
import { useSelectionStore } from '../store/selection.store'
import { useViewerStore }    from '../store/viewer.store'
import type { ViewerEngine } from '../viewer/ViewerEngine'
import type { IFCObject }    from '../types'

// ── Props ─────────────────────────────────────────────────────────────────────

interface SelectionLabelProps {
  /** Live ref to the ViewerEngine instance. May be null before init or after dispose. */
  engineRef: React.RefObject<ViewerEngine | null>
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SelectionLabel({ engineRef }: SelectionLabelProps) {
  // ── Store subscriptions ──────────────────────────────────
  const primaryGlobalId     = useSelectionStore(s => s.primaryGlobalId)
  const getObjectByGlobalId = useViewerStore(s => s.getObjectByGlobalId)

  // ── Refs ─────────────────────────────────────────────────

  /** The outer wrapper div — controls visibility via opacity/pointerEvents */
  const labelRef = useRef<HTMLDivElement>(null)

  /** Text content refs — mutated directly, not via React state */
  const nameRef    = useRef<HTMLSpanElement>(null)
  const typeRef    = useRef<HTMLSpanElement>(null)
  const guidRef    = useRef<HTMLSpanElement>(null)

  /**
   * World-space anchor point (top-center of selected object bounding box).
   * Updated asynchronously when selection changes.
   * Read synchronously in the RAF loop.
   */
  const anchorRef = useRef<THREE.Vector3 | null>(null)

  /** Reusable projected vector — allocated once, mutated each frame */
  const projectedRef = useRef(new THREE.Vector3())

  /** RAF handle for cleanup */
  const rafRef = useRef<number>(0)

  /** Whether the label is currently shown (avoids redundant DOM writes) */
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

  // ── RAF loop: project anchor → screen position every frame ───────────────

  const startRAF = useCallback(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)

      const anchor = anchorRef.current
      const label  = labelRef.current

      if (!anchor || !label) {
        hideLabel()
        return
      }

      const engine = engineRef.current
      if (!engine) {
        hideLabel()
        return
      }

      const camera    = engine.getCamera()
      const container = engine.getContainerElement()
      if (!camera || !container) {
        hideLabel()
        return
      }

      // Project world → NDC (−1 to +1)
      projectedRef.current.copy(anchor).project(camera)

      const ndcX = projectedRef.current.x
      const ndcY = projectedRef.current.y
      const ndcZ = projectedRef.current.z

      // If the anchor is behind the camera (ndcZ > 1), hide the label
      if (ndcZ > 1) {
        hideLabel()
        return
      }

      const w = container.clientWidth
      const h = container.clientHeight

      // NDC → pixel
      const px =  (ndcX + 1) / 2 * w
      const py = (-ndcY + 1) / 2 * h

      // Guard against positions wildly outside the viewport (far-plane clip)
      if (px < -200 || px > w + 200 || py < -200 || py > h + 200) {
        hideLabel()
        return
      }

      // Apply position. The label is centered horizontally and sits above
      // the anchor via CSS transform: translate(-50%, -100%) on the inner div.
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

  // ── Start RAF once on mount, stop on unmount ──────────────
  useEffect(() => {
    startRAF()
    return () => {
      stopRAF()
    }
  }, [startRAF, stopRAF])

  // ── React to selection changes ────────────────────────────

  useEffect(() => {
    // Clear previous anchor immediately so the label hides during the async fetch
    anchorRef.current = null

    if (!primaryGlobalId) {
      // Selection cleared — label stays hidden (RAF loop will hide it next frame)
      if (nameRef.current) nameRef.current.textContent = ''
      if (typeRef.current) typeRef.current.textContent = ''
      if (guidRef.current) guidRef.current.textContent = ''
      return
    }

    // Update label text content immediately from the store (synchronous)
    const obj: IFCObject | undefined = getObjectByGlobalId(primaryGlobalId)
    if (obj) {
      const displayName = obj.name?.trim() || obj.type
      if (nameRef.current) nameRef.current.textContent = displayName
      if (typeRef.current) typeRef.current.textContent = obj.type
      if (guidRef.current) guidRef.current.textContent = obj.globalId
    } else {
      // Object not in store yet (race condition during load) — show GlobalId only
      if (nameRef.current) nameRef.current.textContent = primaryGlobalId
      if (typeRef.current) typeRef.current.textContent = ''
      if (guidRef.current) guidRef.current.textContent = primaryGlobalId
    }

    // Fetch the 3D anchor point asynchronously
    // The RAF loop will start showing the label as soon as anchorRef is set
    const engine = engineRef.current
    if (!engine) return

    let cancelled = false

    engine.getObjectWorldTop(primaryGlobalId).then(worldTop => {
      if (cancelled) return
      anchorRef.current = worldTop
    }).catch(() => {
      if (!cancelled) anchorRef.current = null
    })

    return () => {
      cancelled = true
    }
  }, [primaryGlobalId, getObjectByGlobalId, engineRef])

  // ── Render ────────────────────────────────────────────────
  //
  // The outer div is absolutely positioned and pointer-events:none so it
  // never intercepts mouse events. It starts hidden (opacity:0).
  //
  // The inner .sel-label div is the visible callout, centered horizontally
  // above the anchor point via transform: translate(-50%, calc(-100% - 10px)).
  // The 10px gap pushes it above the arrow tip.
  //
  // All position updates happen via direct DOM mutation on the outer div's
  // left/top style — NOT via React state. The inner content (text) is
  // mutated directly via the nameRef/typeRef/guidRef refs.

  return (
    <div
      ref={labelRef}
      style={{
        position:      'absolute',
        top:           0,
        left:          0,
        pointerEvents: 'none',
        opacity:       0,
        // GPU compositing hint — label moves constantly
        willChange:    'transform, opacity',
        // Smooth fade when appearing/disappearing
        transition:    'opacity 0.15s ease',
        // Prevent label from being clipped by the container
        overflow:      'visible',
        // Ensure it floats above all other viewer overlays (stats, legend)
        zIndex:        50,
      }}
    >
      {/*
        Inner callout wrapper.
        transform: translate(-50%, calc(-100% - 12px))
          -50%          → horizontal centering on the anchor point
          calc(-100%-12px) → sit fully above anchor + 12px gap for the arrow
      */}
      <div
        style={{
          transform:     'translate(-50%, calc(-100% - 12px))',
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
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
          }}
        >
          {/* Object name */}
          <span
            ref={nameRef}
            style={{
              fontSize:     13,
              fontWeight:   600,
              color:        '#E6EDF3',
              lineHeight:   1.3,
              wordBreak:    'break-word',
              fontFamily:   "'Segoe UI', system-ui, -apple-system, sans-serif",
            }}
          />

          {/* IFC type */}
          <span
            ref={typeRef}
            style={{
              fontSize:     10,
              fontWeight:   600,
              color:        '#2F6BFF',
              letterSpacing: '0.04em',
              fontFamily:   "'Segoe UI', system-ui, -apple-system, sans-serif",
            }}
          />

          {/* Divider */}
          <div
            style={{
              height:     1,
              background: 'rgba(48, 54, 61, 0.8)',
              margin:     '2px 0',
            }}
          />

          {/* GlobalId */}
          <span
            ref={guidRef}
            style={{
              fontSize:    9,
              color:       '#8B949E',
              fontFamily:  'ui-monospace, SFMono-Regular, monospace',
              letterSpacing: '0.02em',
              overflow:    'hidden',
              textOverflow: 'ellipsis',
              whiteSpace:  'nowrap',
            }}
          />
        </div>

        {/*
          Callout arrow — a CSS triangle pointing down.
          Positioned directly below the bubble.
        */}
        <div
          style={{
            width:       0,
            height:      0,
            borderLeft:  '7px solid transparent',
            borderRight: '7px solid transparent',
            borderTop:   '8px solid rgba(13, 17, 23, 0.92)',
            // Outer border color arrow (slightly larger, behind the fill arrow)
            filter:      'drop-shadow(0 2px 3px rgba(0,0,0,0.4))',
            position:    'relative',
          }}
        >
          {/* Inner arrow — renders the border color */}
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
      </div>
    </div>
  )
}