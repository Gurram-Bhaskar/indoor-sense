/**
 * GeminiLiveClient - WebSocket client for the Gemini 2.0 Multimodal Live API.
 * Handles connection, setup, realtime audio/video streaming, and text injection.
 */

const WS_BASE = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const SYSTEM_INSTRUCTION = `Your name is Nav. You are a fast, concise assistive navigation assistant for a visually impaired user indoors. When the user says "Nav" or "Hey Nav", respond immediately.

VISION UPDATES: You receive live camera frames every 2 seconds. For each frame, give ONE short statement — 5 to 8 words max. Examples:
- "Chair on your left, path clear right."
- "Door straight ahead, handle on right."
- "Person approaching from the front."
- "Step down in two meters."
- "Path looks clear ahead."

PRIORITY (highest first):
1. Moving hazards — warn INSTANTLY
2. Obstacles blocking the path
3. Useful landmarks (doors, signs, counters)

RULES:
- Never say more than 8 words unless the user asks a question
- No filler words like "I can see..." or "It appears..."
- Speak the most important thing only
- When user asks a question, answer in 1 sentence`;

export class GeminiLiveClient {
  constructor({ apiKey, onAudio, onText, onUserSpeech, onTurnComplete, onInterrupted, onClose, onError }) {
    this.apiKey = apiKey;
    this.onAudio = onAudio || (() => {});
    this.onText = onText || (() => {});
    this.onUserSpeech = onUserSpeech || (() => {});
    this.onTurnComplete = onTurnComplete || (() => {});
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
      // Gemini signals its turn is fully done — safe to send the next prompt
      if (sc.turnComplete) {
        this.onTurnComplete();
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
