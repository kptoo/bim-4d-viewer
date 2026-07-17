/**
 * LoadingSpinner — Consistent loading indicator used across all panels.
 *
 * @param size    - Diameter in pixels (default 24)
 * @param message - Optional text shown below the spinner
 * @param inline  - When true, renders as a small inline spinner with no padding
 */

import type { CSSProperties } from 'react'

interface LoadingSpinnerProps {
  size?:    number
  message?: string
  inline?:  boolean
}

export function LoadingSpinner({
  size    = 24,
  message,
  inline  = false,
}: LoadingSpinnerProps) {
  if (inline) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={spinnerStyle(size)} />
        {message && (
          <span style={{ fontSize: 12, color: '#8B949E' }}>{message}</span>
        )}
      </span>
    )
  }

  return (
    <div style={containerStyle}>
      <div style={spinnerStyle(size)} />
      {message && <span style={messageStyle}>{message}</span>}
    </div>
  )
}

// ── Style helpers ──────────────────────────────────────────────────────────────

function spinnerStyle(size: number): CSSProperties {
  return {
    width:         size,
    height:        size,
    borderRadius:  '50%',
    border:        `${Math.max(2, Math.round(size / 8))}px solid #30363D`,
    borderTopColor: '#2F6BFF',
    animation:     'spin 0.7s linear infinite',
    flexShrink:    0,
  }
}

const containerStyle: CSSProperties = {
  display:        'flex',
  flexDirection:  'column',
  alignItems:     'center',
  justifyContent: 'center',
  gap:            10,
  padding:        '24px',
  width:          '100%',
  height:         '100%',
  minHeight:      80,
}

const messageStyle: CSSProperties = {
  fontSize:   12,
  color:      '#8B949E',
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  textAlign:  'center',
}