import { useState, useEffect } from 'react';
import { LiveAPIProvider } from './contexts/LiveAPIContext.jsx';
import VideoFeed from './components/VideoFeed.jsx';
import ControlPanel from './components/ControlPanel.jsx';
import CaptureRoom from './components/CaptureRoom.jsx';
import './App.css';

const ENV_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

export default function App() {
  const [apiKey, setApiKey] = useState(ENV_API_KEY);
  const [started, setStarted] = useState(!!ENV_API_KEY);
  const [page, setPage] = useState('main'); // 'main' or 'capture'

  // Check URL hash for routing
  useEffect(() => {
    const checkHash = () => {
      setPage(window.location.hash === '#capture' ? 'capture' : 'main');
    };
    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  // Capture page — no API key needed
  if (page === 'capture') {
    return <CaptureRoom />;
  }

  if (!started) {
    return (
      <div className="api-key-screen">
        <h1>Indoor Sense Navigator</h1>
        <p style={{ color: '#999', textAlign: 'center', maxWidth: 400 }}>
          Accessible indoor navigation for visually impaired users.
          Enter your Gemini API key to begin.
        </p>
        <input
          type="password"
          placeholder="Gemini API Key"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && apiKey.trim() && setStarted(true)}
        />
        <button
          onClick={() => apiKey.trim() && setStarted(true)}
          disabled={!apiKey.trim()}
        >
          Launch Navigator
        </button>
        <a
          href="#capture"
          style={{ marginTop: 16, color: '#00d4aa', fontSize: 14 }}
        >
          Capture Room Images →
        </a>
      </div>
    );
  }

  return (
    <LiveAPIProvider apiKey={apiKey}>
      <div className="app-container">
        <VideoFeed />
        <ControlPanel />
      </div>
    </LiveAPIProvider>
  );
}
