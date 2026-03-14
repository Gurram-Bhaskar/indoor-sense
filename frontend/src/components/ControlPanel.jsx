import { useLiveAPI } from '../contexts/LiveAPIContext.jsx';

export default function ControlPanel() {
  const { connected, connecting, error, connect, disconnect, navInfo, transcript } = useLiveAPI();

  const handleToggle = async () => {
    if (connected) {
      disconnect();
    } else {
      await connect();
    }
  };

  const handleCallAssistant = () => {
    // Dial the human assistant directly on mobile
    window.location.href = 'tel:9900315539';
  };

  return (
    <>
      {/* Status overlay */}
      <div className="overlay">
        <div className="status-bar">
          <div className={`status-dot ${connected ? 'connected' : connecting ? 'connecting' : ''}`} />
          <span>
            {connecting ? 'Connecting...' : connected ? 'AI Navigator Active' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div style={{
          position: 'absolute',
          top: 60,
          left: 16,
          right: 16,
          background: '#ff4444',
          color: '#fff',
          padding: '12px 16px',
          borderRadius: 8,
          fontSize: 14,
          zIndex: 100,
          wordBreak: 'break-word',
        }}>
          Error: {error}
        </div>
      )}

      {/* Navigation info card */}
      {navInfo && (
        <div className="nav-info">
          <div className="location">{navInfo.current_location}</div>
          <div className="next-step">
            {navInfo.next_waypoint
              ? `Next: ${navInfo.next_waypoint} — ${navInfo.instruction}`
              : navInfo.instruction}
          </div>
        </div>
      )}

      {/* Transcript */}
      {transcript.length > 0 && (
        <div className="transcript">
          {transcript.map((t, i) => (
            <div key={i}>
              <strong>{t.role === 'ai' ? 'Nav' : 'You'}:</strong> {t.text}
            </div>
          ))}
        </div>
      )}

      {/* WebRTC Call overlay — removed, using direct phone call instead */}

      {/* Control buttons */}
      <div className="controls">
        <button
          className={`speak-btn btn btn-primary ${connected ? 'active' : ''}`}
          onClick={handleToggle}
          disabled={connecting}
        >
          {connecting ? 'Connecting...' : connected ? 'Stop' : 'Start Navigation'}
        </button>
        <button
          className="speak-btn btn btn-danger"
          onClick={handleCallAssistant}
        >
          Call Assistant
        </button>
      </div>
    </>
  );
}
