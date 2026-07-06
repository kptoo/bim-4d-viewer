/**
 * ErrorBoundary — Top-level React error boundary.
 *
 * Catches unhandled rendering errors and displays a
 * recovery UI instead of crashing the whole application.
 *
 * Must be a class component — React does not support
 * error boundaries as function components.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react'

interface Props {
  children:  ReactNode
  /** Optional custom fallback — defaults to built-in error UI */
  fallback?: ReactNode
  /** Optional context label shown in the error display */
  context?:  string
}

interface State {
  hasError: boolean
  error:    Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // In Phase 5, this will send to an error tracking service
    console.error(
      `[ErrorBoundary] ${this.props.context ?? 'Unknown'}:`,
      error,
      info.componentStack
    )
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    if (this.props.fallback) {
      return this.props.fallback
    }

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
          <button style={styles.button} onClick={this.handleReset}>
            Try Again
          </button>
        </div>
      </div>
    )
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width:           '100%',
    height:          '100%',
    display:         'flex',
    alignItems:      'center',
    justifyContent:  'center',
    background:      '#0D1117',
    padding:         '20px',
  },
  card: {
    background:    '#161B22',
    border:        '1px solid #30363D',
    borderRadius:  '10px',
    padding:       '32px',
    maxWidth:      '400px',
    textAlign:     'center',
    display:       'flex',
    flexDirection: 'column',
    gap:           '12px',
  },
  icon:    { fontSize: '36px' },
  title:   { fontSize: '16px', fontWeight: 700, color: '#E6EDF3', margin: 0 },
  context: { fontSize: '12px', color: '#8B949E',  margin: 0 },
  message: { fontSize: '13px', color: '#E74C3C',  margin: 0, fontFamily: 'monospace' },
  button: {
    marginTop:     '8px',
    background:    '#21262D',
    border:        '1px solid #30363D',
    borderRadius:  '6px',
    color:         '#E6EDF3',
    padding:       '8px 20px',
    cursor:        'pointer',
    fontSize:      '13px',
  },
}