import { useState, useRef, useEffect } from 'react';

const POSITIONS = [
  {
    id: "near_door",
    label: "Near the door",
    description: "Standing near the room entrance door",
    exit_instruction: "The door is right behind you. Turn around and step forward to exit.",
    exit_direction: "behind",
  },
  {
    id: "center",
    label: "Center of room",
    description: "Standing in the middle of the room",
    exit_instruction: "Walk straight ahead about 3 meters toward the door. The door handle is on the right side.",
    exit_direction: "ahead",
  },
  {
    id: "near_window",
    label: "Near the window",
    description: "Standing by the window, opposite wall from the door",
    exit_instruction: "Turn around 180 degrees, away from the window. Walk straight about 4 meters to reach the door.",
    exit_direction: "behind",
  },
  {
    id: "near_desk",
    label: "Near the desk",
    description: "Standing by the desk area",
    exit_instruction: "Turn left and walk about 2 meters. The door will be on your right.",
    exit_direction: "left",
  },
  {
    id: "far_corner",
    label: "Far corner",
    description: "Standing in the far corner of the room",
    exit_instruction: "Walk diagonally toward the light from the corridor. The door is about 4 meters ahead and to your left.",
    exit_direction: "ahead-left",
  },
  {
    id: "near_bed",
    label: "Near the bed/couch",
    description: "Standing near the bed or seating area",
    exit_instruction: "Step away from the bed. Turn right and walk 3 meters to reach the door.",
    exit_direction: "right",
  },
];

export default function CaptureRoom() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [captured, setCaptured] = useState({});
  const [status, setStatus] = useState('Starting camera...');
  const [editing, setEditing] = useState(null);
  const [editValues, setEditValues] = useState({});

  useEffect(() => {
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setStatus('Camera ready. Walk to each position and tap to capture.');
      } catch (err) {
        setStatus('Camera access denied: ' + err.message);
      }
    })();
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, []);

  const capturePosition = async (pos) => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || video.readyState < 2) {
      setStatus('Camera not ready yet');
      return;
    }

    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 640, 480);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const base64 = dataUrl.split(',')[1];

    // Use edited values if available
    const values = editValues[pos.id] || pos;

    setStatus(`Uploading ${pos.label}...`);

    try {
      const res = await fetch('/capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position_id: pos.id,
          label: values.label,
          description: values.description,
          exit_instruction: values.exit_instruction,
          exit_direction: values.exit_direction,
          frame: base64,
        }),
      });
      const data = await res.json();
      setCaptured(prev => ({ ...prev, [pos.id]: true }));
      setStatus(`Saved ${pos.label}! (${data.total} total positions)`);
    } catch (err) {
      setStatus(`Upload failed: ${err.message}`);
    }
  };

  const startEdit = (pos) => {
    setEditing(pos.id);
    if (!editValues[pos.id]) {
      setEditValues(prev => ({ ...prev, [pos.id]: { ...pos } }));
    }
  };

  const updateField = (posId, field, value) => {
    setEditValues(prev => ({
      ...prev,
      [posId]: { ...prev[posId], [field]: value },
    }));
  };

  const capturedCount = Object.keys(captured).length;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#1a1a2e',
      color: '#fff',
      padding: 16,
      fontFamily: 'system-ui, sans-serif',
    }}>
      <h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Room Capture</h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, opacity: 0.7 }}>{status}</p>

      {/* Camera preview */}
      <div style={{ position: 'relative', marginBottom: 12, borderRadius: 8, overflow: 'hidden' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ width: '100%', display: 'block', borderRadius: 8 }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(0,0,0,0.6)', padding: '4px 10px',
          borderRadius: 12, fontSize: 13,
        }}>
          {capturedCount}/6 captured
        </div>
      </div>

      {/* Position buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {POSITIONS.map(pos => {
          const isCaptured = captured[pos.id];
          const isEditing = editing === pos.id;
          const values = editValues[pos.id] || pos;

          return (
            <div key={pos.id} style={{
              background: isCaptured ? '#16213e' : '#0f3460',
              border: isCaptured ? '2px solid #00d4aa' : '2px solid transparent',
              borderRadius: 10,
              padding: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {isCaptured ? '✓ ' : ''}{pos.label}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>{values.description}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="speak-btn"
                    onClick={() => startEdit(pos)}
                    style={{
                      padding: '8px 12px', borderRadius: 6,
                      border: 'none', background: '#333', color: '#fff',
                      fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="speak-btn"
                    onClick={() => capturePosition(pos)}
                    style={{
                      padding: '8px 16px', borderRadius: 6,
                      border: 'none', fontWeight: 600, fontSize: 14,
                      cursor: 'pointer',
                      background: isCaptured ? '#00d4aa' : '#e94560',
                      color: isCaptured ? '#000' : '#fff',
                    }}
                  >
                    {isCaptured ? 'Retake' : 'Capture'}
                  </button>
                </div>
              </div>

              {/* Edit fields */}
              {isEditing && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    placeholder="Label"
                    value={values.label}
                    onChange={e => updateField(pos.id, 'label', e.target.value)}
                    style={inputStyle}
                  />
                  <input
                    placeholder="Description"
                    value={values.description}
                    onChange={e => updateField(pos.id, 'description', e.target.value)}
                    style={inputStyle}
                  />
                  <textarea
                    placeholder="Exit instruction (what the user should do)"
                    value={values.exit_instruction}
                    onChange={e => updateField(pos.id, 'exit_instruction', e.target.value)}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                  <select
                    value={values.exit_direction}
                    onChange={e => updateField(pos.id, 'exit_direction', e.target.value)}
                    style={inputStyle}
                  >
                    <option value="ahead">Ahead</option>
                    <option value="behind">Behind</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="ahead-left">Ahead-Left</option>
                    <option value="ahead-right">Ahead-Right</option>
                  </select>
                  <button
                    className="speak-btn"
                    onClick={() => setEditing(null)}
                    style={{
                      padding: '6px 12px', borderRadius: 6, border: 'none',
                      background: '#444', color: '#fff', fontSize: 13, cursor: 'pointer',
                    }}
                  >
                    Done Editing
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Back to navigator link */}
      <div style={{ marginTop: 16, textAlign: 'center' }}>
        <a
          href="/"
          style={{ color: '#00d4aa', fontSize: 14 }}
        >
          ← Back to Navigator
        </a>
      </div>
    </div>
  );
}

const inputStyle = {
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #444',
  background: '#1a1a2e',
  color: '#fff',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};
