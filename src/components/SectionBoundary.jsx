import { Component } from 'react'

// Keeps an error inside one page or section: it shows a small notice there, and the menu and
// every other page keep working (the root ErrorBoundary would replace the whole app).
export default class SectionBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error(`${this.props.name || 'Section'} crashed:`, error, info)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card" style={{ padding: 16, margin: this.props.page ? 24 : '0 0 24px', fontSize: 12 }}>
        <strong>{this.props.name || 'This section'} couldn&apos;t load.</strong>
        <span style={{ color: 'var(--text-muted)' }}> The rest of the Command Center still works. Error: {this.state.error?.message || 'unknown'}</span>
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      </div>
    )
  }
}
