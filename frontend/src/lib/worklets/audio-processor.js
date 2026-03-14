/**
 * AudioWorklet processor for capturing microphone PCM 16-bit at 16kHz.
 * Buffers samples and posts them as Int16Array to the main thread.
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = [];
    this.bufferSize = 2048; // send chunks of 2048 samples
  }

  process(inputs) {
    const input = inputs[0];
    if (input.length === 0) return true;

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      // Convert float32 [-1, 1] to int16
      const s = Math.max(-1, Math.min(1, channelData[i]));
      this.buffer.push(s < 0 ? s * 0x8000 : s * 0x7fff);
    }

    if (this.buffer.length >= this.bufferSize) {
      const chunk = new Int16Array(this.buffer.splice(0, this.bufferSize));
      this.port.postMessage(chunk.buffer, [chunk.buffer]);
    }

    return true;
  }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
