/**
 * AudioStreamer - Plays back PCM audio chunks from Gemini (24kHz, 16-bit, mono).
 * Optimized for minimal latency with immediate scheduling.
 */
export class AudioStreamer {
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    this.ctx = null;
    this.queue = [];
    this.isPlaying = false;
    this.nextStartTime = 0;
    this.gainNode = null;
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: this.sampleRate,
      latencyHint: 'interactive',
    });
    this.gainNode = this.ctx.createGain();
    this.gainNode.connect(this.ctx.destination);
  }

  /** Add a base64-encoded PCM chunk to the playback queue */
  addPCM(base64Data) {
    this.init();

    // Fast decode: base64 → ArrayBuffer → Float32
    const binaryStr = atob(base64Data);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768;
    }

    // Schedule immediately instead of queueing
    this._scheduleChunk(float32);
  }

  _scheduleChunk(samples) {
    const buffer = this.ctx.createBuffer(1, samples.length, this.sampleRate);
    buffer.getChannelData(0).set(samples);

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(this.gainNode);

    const now = this.ctx.currentTime;
    // Play immediately if no audio is scheduled, otherwise append seamlessly
    const startTime = Math.max(now, this.nextStartTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
  }

  /** Stop all playback immediately (used on barge-in / interrupt) */
  stop() {
    if (!this.ctx) return;
    this.queue = [];
    this.isPlaying = false;
    this.nextStartTime = 0;
    this.gainNode.disconnect();
    this.gainNode = this.ctx.createGain();
    this.gainNode.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
}
