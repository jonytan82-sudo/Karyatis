import { Component } from 'react';
import { setToken } from './api.js';

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="login">
        <div className="login-panel">
          <div className="login-name">Karyatis</div>
          <p className="login-sub">Something went wrong loading the log.</p>
          <div className="alert">{String(this.state.error.message || this.state.error)}</div>
          <p className="hint">This usually means the Google Script needs a new deployment version to match the website.</p>
          <div className="actions left">
            <button className="btn primary" onClick={() => window.location.reload()}>Reload</button>
            <button className="btn" onClick={() => { setToken(null); window.location.reload(); }}>Log out</button>
          </div>
        </div>
      </div>
    );
  }
}
