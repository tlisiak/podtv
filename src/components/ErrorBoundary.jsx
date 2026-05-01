import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('PodVision crashed:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-shell" role="alert">
          <div className="error-card">
            <div className="error-title">Signal interrupted</div>
            <div className="error-msg">{String(this.state.error?.message || this.state.error)}</div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                this.setState({ error: null });
                if (typeof window !== 'undefined') window.location.reload();
              }}
            >
              Reboot
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
