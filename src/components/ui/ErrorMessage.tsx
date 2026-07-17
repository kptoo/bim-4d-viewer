/**
 * ErrorMessage — Consistent error display used across all panels.
 *
 * Shows a user-facing error with optional retry action.
 * Logs technical details to the console but keeps the UI clean.
 *
 * @param message   - User-facing error description
 * @param context   - Internal label for logging (not shown to the user)
 * @param onRetry   - Optional retry callback (shows "Try Again" button)
 * @param compact   - Minimal inline variant with no padding
 */

import type { CSSProperties, MouseEventHandler } from 'react'

interface ErrorMessageProps {
  message:  string
  context?: string
  onRetry?: MouseEventHandler<HTMLButtonElement>
  compact?: boolean
}

export function ErrorMessage({
  message,
  context,
  onRetry,
  compact = false,
}: ErrorMessageProps) {
  return (
    <div style={compact ? compactContainerStyle : containerStyle}>
      <span style={iconStyle}>⚠️</span>
      <p style={messageStyle}>{message}</p>
      {onRetry && (
        <button style={retryStyle} onClick={onRetry}>
          ↺ Try Again
        </button>
      )}
      {context && (
        <p style={contextStyle}>Context: {context}</p>
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
  padding:        '20px',
  gap:            8,
  width:          '100%',
}

const compactContainerStyle: CSSProperties = {
  display:        'flex',
  flexDirection:  'row',
  alignItems:     'center',
  gap:            6,
  padding:        '8px 10px',
  background:     'rgba(231, 76, 60, 0.1)',
  border:         '1px solid rgba(231, 76, 60, 0.25)',
  borderRadius:   6,
  width:          '100%',
}

const iconStyle: CSSProperties = {
  fontSize: 16,
}

const messageStyle: CSSProperties = {
  fontSize:   12,
  color:      '#E74C3C',
  margin:     0,
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  lineHeight: 1.4,
}

const retryStyle: CSSProperties = {
  background:   '#21262D',
  border:       '1px solid #30363D',
  borderRadius: '5px',
  color:        '#E6EDF3',
  padding:      '5px 12px',
  cursor:       'pointer',
  fontSize:     '11px',
  fontFamily:   "'Segoe UI', system-ui, sans-serif",
}

const contextStyle: CSSProperties = {
  fontSize:   10,
  color:      '#484F58',
  margin:     0,
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
}