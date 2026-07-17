/**
 * ErrorBoundary — Reusable React error boundary for panel-level isolation.
 *
 * Catches unhandled rendering errors within a subtree and displays a
 * friendly recovery UI instead of crashing the entire application.
 *
 * Usage:
 *   <ErrorBoundary context="Gantt Panel">
 *     <GanttPanel />
 *   </ErrorBoundary>
 *
 * Must be a class component — React does not support error boundaries
 * as function components (as of React 18).
 *
 * Design decisions:
 * - One boundary per major panel so a single failure is contained.
 * - The `context` prop provides human-readable context in logs and UI.
 * - `fallback` prop allows callers to provide a custom fallback UI.
 * - The "Try Again" button resets the boundary's error state, which
 *   causes React to re-render the children from scratch. This is
 *   sufficient for transient errors (e.g. a failed DB fetch). For
 *   permanent errors (e.g. a broken IFC file) the user must reload.
 * - Technical error details are logged to the console for debugging
 *   but kept out of the UI to avoid overwhelming non-technical users.
 *
 * @module ErrorBoundary
 */

import { Component, type ReactNode, type ErrorInfo } from 'react'

// ── Props / State ──────────────────────────────────────────────────────────────

interface Props {
  children:  ReactNode
  /** Optional custom fallback — defaults to built-in error UI */
  fallback?: ReactNode
  /**
   * Human-readable context label shown in the fallback UI and console.
   * E.g. "3D Viewer", "Gantt Panel", "Activities Panel".
   */
  context?:  string
  /**
   * Called whenever an error is caught. Useful for forwarding to an
   * external error-tracking service (e.g. Sentry) in production.
   */
  onError?: (error: Error, info: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error:    Error | null
}

// ── Component ──────────────────────────────────────────────────────────────────

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  /**
   * React calls this static method when a descendant throws during render.
   * Updates state so the fallback UI is shown on the next render pass.
   */
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  /**
   * Called after `getDerivedStateFromError`. Receives the full component
   * stack trace in `info.componentStack` — useful for debugging.
   */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    const context = this.props.context ?? 'Unknown'

    console.error(
      `[ErrorBoundary:${context}] Caught error:`,
      error.message
    )
    console.error(
      `[ErrorBoundary:${context}] Component stack:`,
      info.componentStack
    )

    // Forward to caller-supplied error handler (e.g. Sentry integration)
    this.props.onError?.(error, info)
  }

  /**
   * Resets the error state so React re-renders the children.
   * Bound as an arrow function to avoid explicit `.bind(this)` in JSX.
   */
  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    // Custom fallback provided by the caller
    if (this.props.fallback) {
      return this.props.fallback
    }

    // Default built-in fallback UI
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.icon}>⚠️</div>
          <h3 style={styles.title}>Something went wrong</h3>
          {this.props.context && (
            <p style={styles.context}>{this.props.context}</p>
          )}
          <p style={styles.message}>
            {this.state.error?.message ?? 'An unexpected error occurred.'}
          </p>
          <div style={styles.actions}>
            <button style={styles.retryButton} onClick={this.handleReset}>
              ↺ Try Again
            </button>
            <button
              style={styles.reloadButton}
              onClick={() => window.location.reload()}
            >
              ⟳ Reload Page
            </button>
          </div>
          <p style={styles.hint}>
            Check the browser console for technical details.
          </p>
        </div>
      </div>
    )
  }
}

// ── Styles (inline — no CSS dependency required) ───────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  container: {
    width:           '100%',
    height:          '100%',
    minHeight:       120,
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    background:      '#0D1117',
    padding:         '16px',
  },
  card: {
    background:    '#161B22',
    border:        '1px solid #30363D',
    borderRadius:  '10px',
    padding:       '24px',
    maxWidth:      '360px',
    width:         '100%',
    textAlign:     'center',
    display:       'flex',
    flexDirection: 'column',
    gap:           '10px',
  },
  icon:    { fontSize: '28px', lineHeight: 1 },
  title:   { fontSize: '15px', fontWeight: 700, color: '#E6EDF3', margin: 0 },
  context: { fontSize: '12px', color: '#8B949E', margin: 0 },
  message: {
    fontSize:   '12px',
    color:      '#E74C3C',
    margin:     0,
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    wordBreak:  'break-word',
  },
  actions: {
    display:        'flex',
    gap:            '8px',
    justifyContent: 'center',
    marginTop:      '4px',
  },
  retryButton: {
    flex:         1,
    background:   '#21262D',
    border:       '1px solid #30363D',
    borderRadius: '6px',
    color:        '#E6EDF3',
    padding:      '7px 14px',
    cursor:       'pointer',
    fontSize:     '12px',
    fontFamily:   "'Segoe UI', system-ui, sans-serif",
  },
  reloadButton: {
    flex:         1,
    background:   '#1C2C3A',
    border:       '1px solid #2F6BFF44',
    borderRadius: '6px',
    color:        '#2F6BFF',
    padding:      '7px 14px',
    cursor:       'pointer',
    fontSize:     '12px',
    fontFamily:   "'Segoe UI', system-ui, sans-serif",
  },
  hint: {
    fontSize: '10px',
    color:    '#484F58',
    margin:   0,
  },
}