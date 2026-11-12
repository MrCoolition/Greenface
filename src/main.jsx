import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  render() { return this.state.error ? <main className="crash-screen"><img src="/greenface.gif" width="160" alt="Your Greenface friend"/><h1>Let's try that again.</h1><p>Your adventure is saved on this device.</p><button className="button primary" onClick={() => location.reload()}>Back to my adventure</button></main> : this.props.children; }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
