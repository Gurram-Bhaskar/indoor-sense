/**
 * GeminiLiveClient - WebSocket client for the Gemini 2.0 Multimodal Live API.
 * Handles connection, setup, realtime audio/video streaming, and text injection.
 */

const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const SYSTEM_INSTRUCTION = `Your name is Nav. You are a specialized assistive navigation assistant for a visually impaired user indoors. When the user says "Nav" or "Hey Nav", respond immediately — they are calling you by name. Introduce yourself as Nav when you first speak.

PROACTIVE VISION: You receive a continuous live camera feed. You MUST proactively narrate what you see WITHOUT waiting to be asked. Every few seconds, describe the scene in one or two short sentences — mention obstacles, people, doors, stairs, signs, walls, furniture, or any hazard. Say things like "Chair ahead on your left", "Door straight ahead, handle on the right", "Person walking toward you", "Step down in about two meters". If the scene is clear, say "Path looks clear ahead."

PRIORITY ORDER:
1. Immediate hazards (moving objects, drop-offs, wet floors) — warn instantly
2. Navigation obstacles (furniture, walls, doors)
3. Useful landmarks (signs, counters, windows)
4. Context from NAVIGATION UPDATE / ROOM POSITION UPDATE messages

Keep responses short (1-2 sentences max). Be warm but direct — the user depends on you for safety. Reference what they can feel, hear, or touch when possible.`;

export class GeminiLiveClient {
  constructor({ apiKey, onAudio, onText, onUserSpeech, onInterrupted, onClose, onError }) {
    this.apiKey = apiKey;
    this.onAudio = onAudio || (() => {});
    this.onText = onText || (() => {});
    this.onUserSpeech = onUserSpeech || (() => {});
    this.onInterrupted = onInterrupted || (() => {});
    this.onClose = onClose || (() => {});
    this.onError = onError || (() => {});
    this.ws = null;
    this.connected = false;
    this.setupComplete = false;
    this._setupResolve = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = `${WS_BASE}?key=${this.apiKey}`;
      console.log('[Gemini] Connecting to:', WS_BASE);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[Gemini] WebSocket opened, sending setup...');
        this.connected = true;
        this._setupResolve = resolve;
        this._sendSetup();
      };

      this.ws.onmessage = (event) => {
        this._handleMessage(event);
      };

      this.ws.onerror = (err) => {
        console.error('[Gemini] WebSocket error:', err);
        this.onError(err);
        reject(err);
      };

      this.ws.onclose = (event) => {
        console.warn('[Gemini] WebSocket closed. Code:', event.code, 'Reason:', event.reason);
        this.connected = false;
        this.setupComplete = false;
        this.onClose(event);
        // If we never got setupComplete, reject the connect promise
        if (this._setupResolve) {
          this._setupResolve = null;
          reject(new Error(`WebSocket closed before setup. Code: ${event.code} Reason: ${event.reason}`));
        }
      };
    });
  }

  _sendSetup() {
    const setup = {
      setup: {
        model: 'models/gemini-2.5-flash-native-audio-latest',
        generationConfig: {
          responseModalities: ['AUDIO'],
          inputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Aoede',
              },
            },
          },
        },
        systemInstruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }],
        },
        realtimeInputConfig: {
          activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
        },
      },
    };
    console.log('[Gemini] Sending setup for model:', setup.setup.model);
    this.ws.send(JSON.stringify(setup));
  }

  _handleMessage(event) {
    // Handle Blob data (some browsers send binary)
    if (event.data instanceof Blob) {
      event.data.text().then((text) => {
        this._processMessage(text);
      });
      return;
    }
    if (typeof event.data === 'string') {
      this._processMessage(event.data);
    }
  }

  _processMessage(text) {
    const msg = JSON.parse(text);
    console.log('[Gemini] Received message:', JSON.stringify(msg).slice(0, 500));

    // Setup complete acknowledgement - check multiple possible formats
    if (msg.setupComplete || msg.setup_complete) {
      console.log('[Gemini] Setup complete! Ready to stream.');
      this.setupComplete = true;
      if (this._setupResolve) {
        this._setupResolve();
        this._setupResolve = null;
      }
      return;
    }

    // Error from server
    if (msg.error) {
      console.error('[Gemini] Server error:', msg.error);
      this.onError(msg.error);
      return;
    }

    // Server content - model audio/text response
    if (msg.serverContent) {
      const sc = msg.serverContent;

      // Real-time transcription of what the USER said
      if (sc.inputTranscription?.text) {
        this.onUserSpeech(sc.inputTranscription.text);
      }

      if (sc.interrupted) {
        this.onInterrupted();
        return;
      }
      if (sc.modelTurn && sc.modelTurn.parts) {
        for (const part of sc.modelTurn.parts) {
          if (part.inlineData) {
            this.onAudio(part.inlineData.data, part.inlineData.mimeType);
          }
          if (part.text) {
            this.onText(part.text);
          }
        }
      }
    }
  }

  /** Send a video frame as base64 JPEG */
  sendVideoFrame(base64Jpeg) {
    if (!this.ws || !this.setupComplete) return;
    this.ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'image/jpeg',
          data: base64Jpeg,
        }],
      },
    }));
  }

  /** Send audio chunk as base64 PCM 16kHz */
  sendAudio(base64Pcm) {
    if (!this.ws || !this.setupComplete) return;
    this.ws.send(JSON.stringify({
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm;rate=16000',
          data: base64Pcm,
        }],
      },
    }));
  }

  /** Inject text context (e.g., navigation updates from ArUco) */
  sendTextContext(text) {
    if (!this.ws || !this.setupComplete) return;
    this.ws.send(JSON.stringify({
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text }],
        }],
        turnComplete: true,
      },
    }));
  }

  /** Send a frame + text together so Gemini describes the CURRENT scene, not a stale buffered one */
  sendFrameWithContext(base64Jpeg, text) {
    if (!this.ws || !this.setupComplete) return;
    this.ws.send(JSON.stringify({
      clientContent: {
        turns: [{
          role: 'user',
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: base64Jpeg } },
            { text },
          ],
        }],
        turnComplete: true,
      },
    }));
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
      this.setupComplete = false;
    }
  }
}
