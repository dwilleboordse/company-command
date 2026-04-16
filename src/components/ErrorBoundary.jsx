import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false, error: null }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    console.error('App crash:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#f4f5f7', padding: 24, gap: 16
        }}>
          <div style={{
            background: '#fff', border: '1px solid #e4e7ec',
            borderRadius: 12, padding: 32, maxWidth: 480, width: '100%',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)'
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: '#0d1117' }}>
              Something went wrong
            </h2>
            <p style={{ fontSize: 13, color: '#5a6478', marginBottom: 16, lineHeight: 1.6 }}>
              The app hit an unexpected error. The message below will help fix it.
            </p>
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: 8, padding: '10px 14px',
              fontSize: 12, color: '#dc2626', fontFamily: 'monospace',
              wordBreak: 'break-all', marginBottom: 20
            }}>
              {this.state.error?.message || 'Unknown error'}
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#3b82f6', color: '#fff', border: 'none',
                borderRadius: 8, padding: '9px 18px', fontSize: 13,
                fontWeight: 500, cursor: 'pointer'
              }}>
              Reload App
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
