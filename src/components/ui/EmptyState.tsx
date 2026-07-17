/**
 * EmptyState — Consistent empty-data placeholder used across all panels.
 *
 * Displays an icon, a title, and an optional hint with an optional CTA.
 *
 * @param icon    - Emoji or short string shown as the visual anchor
 * @param title   - Primary empty-state message
 * @param hint    - Optional secondary explanation / call-to-action text
 * @param action  - Optional primary button props
 */

import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'

interface EmptyStateAction {
  label:   string
  onClick: MouseEventHandler<HTMLButtonElement>
}

interface EmptyStateProps {
  icon?:    string
  title:    string
  hint?:    ReactNode
  action?:  EmptyStateAction
  compact?: boolean
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
  compact = false,
}: EmptyStateProps) {
  return (
    <div style={compact ? compactContainerStyle : containerStyle}>
      {icon && <div style={compact ? compactIconStyle : iconStyle}>{icon}</div>}
      <p style={compact ? compactTitleStyle : titleStyle}>{title}</p>
      {hint && <p style={hintStyle}>{hint}</p>}
      {action && (
        <button style={actionStyle} onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const containerStyle: CSSProperties = {
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  textAlign:      'center',
  padding:        '32px 20px',
  width:          '100%',
  height:         '100%',
  minHeight:      120,
  gap:            8,
}

const compactContainerStyle: CSSProperties = {
  ...containerStyle,
  padding:    '16px',
  minHeight:  80,
  gap:        6,
}

const iconStyle: CSSProperties = {
  fontSize:   '32px',
  lineHeight: 1,
  marginBottom: 4,
}

const compactIconStyle: CSSProperties = {
  ...iconStyle,
  fontSize: '24px',
}

const titleStyle: CSSProperties = {
  fontSize:   13,
  fontWeight: 600,
  color:      '#8B949E',
  margin:     0,
  fontFamily: "'Segoe UI', system-ui, sans-serif",
}

const compactTitleStyle: CSSProperties = {
  ...titleStyle,
  fontSize: 12,
}

const hintStyle: CSSProperties = {
  fontSize:   11,
  color:      '#484F58',
  margin:     0,
  lineHeight: 1.5,
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  maxWidth:   240,
}

const actionStyle: CSSProperties = {
  marginTop:    8,
  background:   '#21262D',
  border:       '1px solid #30363D',
  borderRadius: '6px',
  color:        '#E6EDF3',
  padding:      '6px 14px',
  cursor:       'pointer',
  fontSize:     '12px',
  fontFamily:   "'Segoe UI', system-ui, sans-serif",
}