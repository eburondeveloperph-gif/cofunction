/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/**
 * Copyright 2024 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

type GetAudioContextOptions = AudioContextOptions & {
  id?: string;
};

const map: Map<string, AudioContext> = new Map();

export const audioContext: (
  options?: GetAudioContextOptions
) => Promise<AudioContext> = (() => {
  const didInteract = new Promise(res => {
    window.addEventListener('pointerdown', res, { once: true });
    window.addEventListener('keydown', res, { once: true });
  });

  return async (options?: GetAudioContextOptions) => {
    try {
      const a = new Audio();
      a.src =
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
      await a.play();
      if (options?.id && map.has(options.id)) {
        const ctx = map.get(options.id);
        if (ctx) {
          return ctx;
        }
      }
      const ctx = new AudioContext(options);
      if (options?.id) {
        map.set(options.id, ctx);
      }
      return ctx;
    } catch (e) {
      await didInteract;
      if (options?.id && map.has(options.id)) {
        const ctx = map.get(options.id);
        if (ctx) {
          return ctx;
        }
      }
      const ctx = new AudioContext(options);
      if (options?.id) {
        map.set(options.id, ctx);
      }
      return ctx;
    }
  };
})();

export function base64ToArrayBuffer(base64: string) {
  var binaryString = atob(base64);
  var bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

export function pcmBase64ToWavBase64(base64: string, sampleRate: number = 24000): string {
  const pcmBuffer = base64ToArrayBuffer(base64);
  const pcmData = new Uint8Array(pcmBuffer);
  
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  
  // "RIFF" chunk descriptor
  view.setUint32(0, 0x52494646, false); // 'RIFF'
  view.setUint32(4, 36 + pcmData.length, true); // Chunk size
  view.setUint32(8, 0x57415645, false); // 'WAVE'
  
  // "fmt " sub-chunk
  view.setUint32(12, 0x666d7420, false); // 'fmt '
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true); // NumChannels (1)
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BitsPerSample/8)
  view.setUint16(32, 2, true); // BlockAlign (NumChannels * BitsPerSample/8)
  view.setUint16(34, 16, true); // BitsPerSample (16)
  
  // "data" sub-chunk
  view.setUint32(36, 0x64617461, false); // 'data'
  view.setUint32(40, pcmData.length, true); // Subchunk2Size
  
  const wavBuffer = new Uint8Array(44 + pcmData.length);
  wavBuffer.set(new Uint8Array(wavHeader), 0);
  wavBuffer.set(pcmData, 44);
  
  let binary = '';
  const len = wavBuffer.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(wavBuffer[i]);
  }
  return btoa(binary);
}
