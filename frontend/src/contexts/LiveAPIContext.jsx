import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { GeminiLiveClient } from '../lib/gemini-live-client.js';
import { AudioStreamer } from '../lib/audio-streamer.js';

const LiveAPIContext = createContext(null);

export function LiveAPIProvider({ apiKey, children }) {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [navInfo, setNavInfo] = useState(null);

  const clientRef = useRef(null);
  const audioStreamerRef = useRef(null);
  const audioContextRef = useRef(null);
  const audioWorkletRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const videoIntervalRef = useRef(null);
  const surroundingsIntervalRef = useRef(null);
  const emergencyFiredRef = useRef(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const backendWsRef = useRef(null);

  const getAudioStreamer = useCallback(() => {
    if (!audioStreamerRef.current) {
      audioStreamerRef.current = new AudioStreamer(24000);
    }
    return audioStreamerRef.current;
  }, []);

  // Connect to Gemini Live API
  const connect = useCallback(async () => {
    if (clientRef.current?.connected) return;

    setError(null);
    setConnecting(true);
    console.log('[LiveAPI] Starting connection...');

    // Step 1: Request camera + mic permissions FIRST (single prompt on mobile)
    let mediaStream;
    try {
      console.log('[LiveAPI] Requesting camera + mic...');
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'environment' },
      });
      console.log('[LiveAPI] Got media stream:', mediaStream.getTracks().map(t => t.kind + ':' + t.label));
      mediaStreamRef.current = mediaStream;
    } catch (err) {
      console.error('[LiveAPI] Media access denied:', err);
      setError('Camera/mic access denied: ' + (err.message || err));
      setConnecting(false);
      return;
    }

    // Step 2: Connect Gemini WebSocket
    const streamer = getAudioStreamer();

    const client = new GeminiLiveClient({
      apiKey,
      onAudio: (base64Data) => {
        streamer.addPCM(base64Data);
      },
      onText: (text) => {
        setTranscript((prev) => [...prev.slice(-20), { role: 'ai', text }]);
      },
      onUserSpeech: (text) => {
        // Detect emergency keywords from Gemini's real-time transcription of the user
        const lower = text.toLowerCase();
        const EMERGENCY_KEYWORDS = ['emergency', 'help me', 'call for help', 'sos', 'call help', 'i need help'];
        if (!emergencyFiredRef.current && EMERGENCY_KEYWORDS.some((kw) => lower.includes(kw))) {
          emergencyFiredRef.current = true;
          console.warn('[LiveAPI] Emergency keyword detected in speech:', text);
          const msg = new SpeechSynthesisUtterance('Emergency detected. Calling your emergency contact now.');
          msg.rate = 1.2;
          window.speechSynthesis.speak(msg);
          setTimeout(() => { window.location.href = 'tel:9900315539'; }, 2000);
        }
      },
      onInterrupted: () => {
        streamer.stop();
      },
      onClose: () => {
        setConnected(false);
      },
      onError: (err) => {
        console.error('Gemini WS error:', err);
        setError(String(err.message || err));
      },
    });

    clientRef.current = client;

    try {
      await client.connect();
      console.log('[LiveAPI] Connected and setup complete');
      setConnected(true);
      setConnecting(false);
      streamer.resume();

      // Step 3: Start audio capture from the already-acquired stream
      _startAudioCapture(client, mediaStream);

      // Step 4: Start video capture from the already-acquired stream
      _startVideoCapture(client, mediaStream);

      // Step 5: Connect to backend for ArUco navigation
      _connectBackend(client);

      // Step 6: Periodic surroundings prompt — forces Nav to describe what it sees
      _startSurroundingsTimer(client);
    } catch (err) {
      console.error('[LiveAPI] Connection failed:', err);
      setError(String(err.message || err));
      setConnected(false);
      setConnecting(false);
      // Stop the media stream since we failed
      mediaStream.getTracks().forEach((t) => t.stop());
    }
  }, [apiKey, getAudioStreamer]);

  // Mic audio capture — use ScriptProcessorNode for max compatibility
  const _startAudioCapture = (client, stream) => {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
        latencyHint: 'interactive',
      });
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);

      // 1024 buffer = ~64ms latency (down from 128ms)
      const processor = audioCtx.createScriptProcessor(1024, 1, 1);
      audioWorkletRef.current = processor;

      processor.onaudioprocess = (e) => {
        const float32 = e.inputBuffer.getChannelData(0);
        const int16 = new Int16Array(float32.length);
        for (let i = 0; i < float32.length; i++) {
          const s = Math.max(-1, Math.min(1, float32[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        const bytes = new Uint8Array(int16.buffer);
        const base64 = _arrayBufferToBase64(bytes);
        client.sendAudio(base64);
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);
      console.log('[LiveAPI] Audio capture started (1024 buffer, interactive)');
    } catch (err) {
      console.warn('[LiveAPI] Audio capture failed:', err);
    }
  };

  // Video capture — send 4 frames per second as low-res JPEG
  const _startVideoCapture = (client, stream) => {
    try {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      const canvas = canvasRef.current || document.createElement('canvas');
      canvasRef.current = canvas;
      canvas.width = 320;
      canvas.height = 240;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      // Separate higher-res canvas for ArUco detection
      const arucoCanvas = document.createElement('canvas');
      arucoCanvas.width = 640;
      arucoCanvas.height = 480;
      const arucoCtx = arucoCanvas.getContext('2d');

      let frameCount = 0;
      videoIntervalRef.current = setInterval(() => {
        if (videoRef.current && videoRef.current.readyState >= 2) {
          // Low-res frame for Gemini (fast upload, ~6fps)
          ctx.drawImage(videoRef.current, 0, 0, 320, 240);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.4);
          const base64 = dataUrl.split(',')[1];
          client.sendVideoFrame(base64);

          // Send ArUco frame every 4th frame (~1.5fps) to save bandwidth
          frameCount++;
          if (frameCount % 4 === 0 && backendWsRef.current?.readyState === WebSocket.OPEN) {
            arucoCtx.drawImage(videoRef.current, 0, 0, 640, 480);
            const arucoDataUrl = arucoCanvas.toDataURL('image/jpeg', 0.8);
            const arucoBase64 = arucoDataUrl.split(',')[1];
            backendWsRef.current.send(JSON.stringify({ frame: arucoBase64 }));
          }
        }
      }, 167);
      console.log('[LiveAPI] Video capture started (6 fps Gemini, 1.5 fps ArUco)');
    } catch (err) {
      console.warn('[LiveAPI] Video capture failed:', err);
    }
  };

  // Local TTS — instant speech without network round-trip
  const _speakLocal = (text) => {
    const synth = window.speechSynthesis;
    synth.cancel(); // interrupt any current speech
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.1;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    // Pick a good English voice if available
    const voices = synth.getVoices();
    const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google'));
    if (preferred) utter.voice = preferred;
    synth.speak(utter);
  };

  // Connect to Python backend WebSocket for ArUco navigation updates
  const _connectBackend = (geminiClient) => {
    try {
      // Connect through Vite proxy to avoid mixed content (wss:// via same origin)
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const backendUrl = `${proto}://${window.location.host}/ws/vision`;
      console.log('[LiveAPI] Connecting to backend:', backendUrl);
      const ws = new WebSocket(backendUrl);
      backendWsRef.current = ws;

      ws.onopen = () => console.log('[LiveAPI] Backend WebSocket connected');

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);

        // ArUco navigation — instant local TTS + rich Gemini context
        if (data.navigation) {
          setNavInfo(data.navigation);
          const nav = data.navigation;

          // Speak detailed step instruction locally (instant)
          if (nav.next_waypoint) {
            _speakLocal(nav.step_instruction || nav.instruction);
          } else {
            _speakLocal(nav.instruction);
          }

          // Inject rich environment data into Gemini for smart follow-up answers
          const env = nav.environment || {};
          const landmarks = (env.landmarks || []).join('; ');
          const hazards = (env.hazards || []).join('; ');
          const steps = (nav.remaining_steps || [])
            .map(s => `${s.from} → ${s.to}: ${s.instruction}`)
            .join(' | ');

          geminiClient.sendTextContext(
            `NAVIGATION UPDATE:\n` +
            `Current location: ${nav.current_location} — ${env.description || ''}.\n` +
            `Floor: ${env.floor || 'unknown'}. Size: ${env.dimensions || 'unknown'}.\n` +
            `Landmarks nearby: ${landmarks || 'none'}.\n` +
            `Known hazards: ${hazards || 'none'}.\n` +
            `Next waypoint: ${nav.next_waypoint || 'ARRIVED'}.\n` +
            `Walking instruction: ${nav.step_instruction || nav.instruction}.\n` +
            `Full route remaining (${nav.steps_remaining || 0} steps): ${steps || 'none'}.\n` +
            `Guide the user. Warn about hazards. Reference landmarks they can feel or hear.`
          );
        }

        // Obstacle warnings — instant local TTS
        if (data.obstacles && data.obstacles.length > 0) {
          const warning = `Warning: ${data.obstacles.join(' and ')} detected nearby.`;
          _speakLocal(warning);
        }

        // Room position match — guide user to exit
        if (data.room_position) {
          const pos = data.room_position;
          setNavInfo({
            current_location: pos.label,
            next_waypoint: "Exit",
            instruction: pos.exit_instruction,
            step_instruction: pos.exit_instruction,
            environment: { description: pos.description },
          });

          _speakLocal(pos.exit_instruction);

          geminiClient.sendTextContext(
            `ROOM POSITION UPDATE:\n` +
            `The user is inside a room at position: "${pos.label}" — ${pos.description}.\n` +
            `Exit guidance: ${pos.exit_instruction}\n` +
            `Exit direction: ${pos.exit_direction}.\n` +
            `Help the user navigate to the door. Describe what they should feel or hear as they walk.`
          );
        }
      };

      ws.onerror = () => console.warn('[LiveAPI] Backend WS not available - ArUco nav disabled');
    } catch (err) {
      console.warn('[LiveAPI] Backend connection skipped:', err);
    }
  };

  // Periodically ask Nav to describe surroundings (forces proactive narration)
  const _startSurroundingsTimer = (client) => {
    surroundingsIntervalRef.current = setInterval(() => {
      // Capture the current frame from the live canvas and send it WITH the prompt
      // so Gemini describes what it sees RIGHT NOW, not a stale buffered frame
      const canvas = canvasRef.current;
      if (!canvas || !videoRef.current || videoRef.current.readyState < 2) return;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
      client.sendFrameWithContext(base64, 'Describe what you see right now in 1-2 short sentences. Mention any obstacles, hazards, or landmarks.');
    }, 2000);
    console.log('[LiveAPI] Surroundings timer started (every 2s, with fresh frame)');
  };

  // Emergency keyword detection — listens for "emergency", "help", "SOS" and auto-dials
  // Disconnect everything
  const disconnect = useCallback(() => {
    emergencyFiredRef.current = false;
    if (surroundingsIntervalRef.current) {
      clearInterval(surroundingsIntervalRef.current);
      surroundingsIntervalRef.current = null;
    }
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    if (audioWorkletRef.current) {
      audioWorkletRef.current.disconnect();
      audioWorkletRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (backendWsRef.current) {
      backendWsRef.current.close();
      backendWsRef.current = null;
    }
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    audioStreamerRef.current?.stop();
    setConnected(false);
  }, []);

  const sendTextContext = useCallback((text) => {
    clientRef.current?.sendTextContext(text);
  }, []);

  // Pause Gemini (for WebRTC fallback)
  const pause = useCallback(() => {
    if (videoIntervalRef.current) {
      clearInterval(videoIntervalRef.current);
      videoIntervalRef.current = null;
    }
    audioStreamerRef.current?.stop();
  }, []);

  useEffect(() => {
    return () => disconnect();
  }, [disconnect]);

  const value = {
    connected,
    connecting,
    error,
    transcript,
    navInfo,
    connect,
    disconnect,
    pause,
    sendTextContext,
    videoRef,
    canvasRef,
  };

  return (
    <LiveAPIContext.Provider value={value}>
      {children}
    </LiveAPIContext.Provider>
  );
}

export function useLiveAPI() {
  const ctx = useContext(LiveAPIContext);
  if (!ctx) throw new Error('useLiveAPI must be used within LiveAPIProvider');
  return ctx;
}

/** Helper: ArrayBuffer to base64 */
function _arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
