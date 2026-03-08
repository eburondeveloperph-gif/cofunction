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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient } from '../../lib/genai-live-client';
import { LiveConnectConfig, Modality, LiveServerToolCall, GoogleGenAI } from '@google/genai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext, pcmBase64ToWavBase64 } from '../../lib/utils';
import VolMeterWorket from '../../lib/worklets/vol-meter';
import { useLogStore, useSettings } from '@/lib/state';

export type UseLiveApiResults = {
  client: GenAILiveClient;
  setConfig: (config: LiveConnectConfig) => void;
  config: LiveConnectConfig;

  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;

  volume: number;
};

export function useLiveApi({
  apiKey,
}: {
  apiKey: string;
}): UseLiveApiResults {
  const { model } = useSettings();
  const client = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);

  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<LiveConnectConfig>({});

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            // Successfully added worklet
          })
          .catch(err => {
            console.error('Error adding worklet:', err);
          });
      });
    }
  }, [audioStreamerRef]);

  useEffect(() => {
    const onOpen = () => {
      setConnected(true);
    };

    const onClose = () => {
      setConnected(false);
    };

    const stopAudioStreamer = () => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.stop();
      }
    };

    const onAudio = (data: ArrayBuffer) => {
      if (audioStreamerRef.current) {
        audioStreamerRef.current.addPCM16(new Uint8Array(data));
      }
    };

    // Bind event listeners
    client.on('open', onOpen);
    client.on('close', onClose);
    client.on('interrupted', stopAudioStreamer);
    client.on('audio', onAudio);

    const onToolCall = async (toolCall: LiveServerToolCall) => {
      const functionResponses: any[] = [];

      for (const fc of toolCall.functionCalls) {
        // Log the function call trigger
        const triggerMessage = `Triggering function call: **${
          fc.name
        }**\n\`\`\`json\n${JSON.stringify(fc.args, null, 2)}\n\`\`\``;
        useLogStore.getState().addTurn({
          role: 'system',
          text: triggerMessage,
          isFinal: true,
        });

        if (fc.name === 'dispatch_to_specialists') {
          try {
            const tasks = fc.args.tasks as any[];
            const sharedContext = fc.args.sharedContext as string | undefined;
            const ai = new GoogleGenAI({ apiKey });

            // Fire and forget: execute tasks in the background
            (async () => {
              for (const task of tasks) {
                const fullPrompt = sharedContext 
                  ? `[Global Context: ${sharedContext}]\n\n${task.detailedPrompt}`
                  : task.detailedPrompt;

                useLogStore.getState().addTurn({
                  role: 'system',
                  text: `Executing task: **${task.detectedTaskType}** using model category **${task.targetModelCategory}**\nPrompt: ${fullPrompt}`,
                  isFinal: true,
                });

                let resultText = '';
                try {
                  const category = (task.targetModelCategory || '').toLowerCase();
                  let modelName = 'gemini-3.1-pro-preview';
                  let isImage = false;
                  let isVideo = false;

                  if (category.includes('image generation') || category.includes('image creation')) {
                     modelName = 'gemini-2.5-flash-image';
                     isImage = true;
                  } else if (category.includes('video')) {
                     modelName = 'veo-3.1-fast-generate-preview';
                     isVideo = true;
                  } else if (category.includes('audio') || category.includes('voice')) {
                     modelName = 'gemini-2.5-flash-preview-tts';
                  } else if (category.includes('code') || category.includes('script') || category.includes('email')) {
                     modelName = 'gemini-3.1-pro-preview';
                  }

                  if (isImage) {
                     const response = await ai.models.generateContent({
                       model: modelName,
                       contents: fullPrompt,
                       config: {
                         // Optional: Add aspect ratio or other image configs if needed
                       }
                     });
                     let imageUrl = '';
                     for (const part of response.candidates?.[0]?.content?.parts || []) {
                       if (part.inlineData) {
                         imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                         break;
                       }
                     }
                     resultText = imageUrl ? `![Generated Image](${imageUrl})` : 'Failed to generate image.';
                  } else if (isVideo) {
                     // For video, we need a paid API key, so we'll just mock it unless the user has one.
                     // To keep it simple, we'll just acknowledge it.
                     resultText = `Started video generation for prompt: ${fullPrompt}. (Note: Video generation requires a paid API key and takes several minutes, so it is mocked here.)`;
                  } else if (modelName === 'gemini-2.5-flash-preview-tts') {
                     const response = await ai.models.generateContent({
                       model: modelName,
                       contents: fullPrompt,
                       config: {
                         responseModalities: ['AUDIO'],
                         speechConfig: {
                           voiceConfig: {
                             prebuiltVoiceConfig: { voiceName: useSettings.getState().voice },
                           },
                         },
                       },
                     });
                     let audioUrl = '';
                     for (const part of response.candidates?.[0]?.content?.parts || []) {
                       if (part.inlineData) {
                         const wavBase64 = pcmBase64ToWavBase64(part.inlineData.data, 24000);
                         audioUrl = `data:audio/wav;base64,${wavBase64}`;
                         break;
                       }
                     }
                     resultText = audioUrl ? `Generated Audio:\n<audio controls src="${audioUrl}"></audio>` : 'Failed to generate audio.';
                  } else {
                     const response = await ai.models.generateContent({
                       model: modelName,
                       contents: fullPrompt,
                     });
                     resultText = response.text || 'No output generated.';
                  }
                } catch (err: any) {
                  resultText = `Error executing task: ${err.message}`;
                }

                useLogStore.getState().addTurn({
                  role: 'system',
                  text: `Task Result for **${task.detectedTaskType}**:\n${resultText}`,
                  isFinal: true,
                });
              }
            })();

            // Return immediately to unblock the voice agent
            functionResponses.push({
              id: fc.id,
              name: fc.name,
              response: { result: 'Tasks have been dispatched and are executing in the background. You can continue the conversation while they process.' },
            });
          } catch (err: any) {
            functionResponses.push({
              id: fc.id,
              name: fc.name,
              response: { error: err.message },
            });
          }
        } else {
          // Prepare the response for other tools
          let resultText = `Successfully executed ${fc.name}`;
          let details: any = { status: 'completed' };

          if (fc.name === 'search_memory') {
            try {
              const res = await fetch(`/api/memory/search?q=${encodeURIComponent(fc.args.query)}`);
              const data = await res.json();
              resultText = `Found ${data.length} past messages matching "${fc.args.query}".`;
              details = { results: data };
            } catch (e: any) {
              resultText = `Error searching memory: ${e.message}`;
              details = { error: e.message };
            }
          } else if (fc.name === 'execute_local_cli') {
            try {
              const res = await fetch('/api/cli', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: fc.args.command }),
              });
              const data = await res.json();
              if (res.ok) {
                resultText = `Command executed successfully.\nStdout: ${data.stdout || 'none'}\nStderr: ${data.stderr || 'none'}`;
                details = { stdout: data.stdout, stderr: data.stderr };
              } else {
                resultText = `Command failed: ${data.error}`;
                details = { error: data.error, stderr: data.stderr };
              }
            } catch (e: any) {
              resultText = `Error executing CLI command: ${e.message}`;
              details = { error: e.message };
            }
          } else if (fc.name === 'create_music_lyra') {
            resultText = `Started music generation via Lyra for prompt: "${fc.args.prompt}". (Note: Lyra requires a specialized backend endpoint or API key, so this is mocked here.)`;
            details = { status: 'generating', prompt: fc.args.prompt };
          } else if (fc.name === 'generate_code') {
            resultText = `Started code generation for prompt: "${fc.args.prompt}".`;
            details = { status: 'generating', prompt: fc.args.prompt };
          } else if (fc.name === 'find_route') {
            resultText = `Found route to ${fc.args.destination} via ${fc.args.modeOfTransport || 'driving'}. Estimated time: 25 mins.`;
            details = { eta: '25 mins', distance: '12 km' };
          } else if (fc.name === 'find_nearby_places') {
            resultText = `Found 3 ${fc.args.placeType}s nearby.`;
            details = { places: ['Place A', 'Place B', 'Place C'] };
          } else if (fc.name === 'get_traffic_info') {
            resultText = `Traffic at ${fc.args.location} is currently moderate.`;
            details = { trafficLevel: 'moderate' };
          } else if (fc.name === 'create_calendar_event') {
            resultText = `Created calendar event: "${fc.args.summary}" from ${fc.args.startTime} to ${fc.args.endTime}.`;
            details = { eventId: 'evt_12345' };
          } else if (fc.name === 'send_email') {
            resultText = `Sent email to ${fc.args.recipient} with subject "${fc.args.subject}".`;
            details = { emailId: 'msg_98765' };
          } else if (fc.name === 'set_reminder') {
            resultText = `Set reminder for "${fc.args.task}" at ${fc.args.time}.`;
            details = { reminderId: 'rem_54321' };
          } else if (fc.name === 'start_return') {
            resultText = `Started return process for order ${fc.args.orderId} (Item: ${fc.args.itemName}).`;
            details = { returnId: 'ret_112233' };
          } else if (fc.name === 'get_order_status') {
            resultText = `Order ${fc.args.orderId || 'unknown'} is currently in transit.`;
            details = { status: 'in_transit', expectedDelivery: 'Tomorrow' };
          } else if (fc.name === 'speak_to_representative') {
            resultText = `Escalating to human representative. Reason: ${fc.args.reason}`;
            details = { queuePosition: 3, estimatedWait: '5 mins' };
          }

          const responsePayload = {
            result: resultText,
            details: details,
            timestamp: new Date().toISOString()
          };
          
          functionResponses.push({
            id: fc.id,
            name: fc.name,
            response: responsePayload,
          });
          
          useLogStore.getState().addTurn({
            role: 'system',
            text: `Task Result for **${fc.name}**:\n${resultText}`,
            isFinal: true,
          });
        }
      }

      // Log the function call response
      if (functionResponses.length > 0) {
        const responseMessage = `Function call response:\n\`\`\`json\n${JSON.stringify(
          functionResponses,
          null,
          2,
        )}\n\`\`\``;
        useLogStore.getState().addTurn({
          role: 'system',
          text: responseMessage,
          isFinal: true,
        });
      }

      client.sendToolResponse({ functionResponses: functionResponses });
    };

    client.on('toolcall', onToolCall);

    return () => {
      // Clean up event listeners
      client.off('open', onOpen);
      client.off('close', onClose);
      client.off('interrupted', stopAudioStreamer);
      client.off('audio', onAudio);
      client.off('toolcall', onToolCall);
    };
  }, [client]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error('config has not been set');
    }
    client.disconnect();
    
    const store = useLogStore.getState();
    let currentConversationId = store.conversationId;
    
    if (!currentConversationId) {
      try {
        const res = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'New Conversation' }),
        });
        if (res.ok) {
          const data = await res.json();
          store.setConversationId(data.id);
          currentConversationId = data.id;
        }
      } catch (e) {
        console.error('Failed to create conversation', e);
      }
    }

    let modifiedConfig = { ...config };
    
    // Inject conversation history if available
    if (currentConversationId) {
      try {
        const res = await fetch(`/api/conversations/${currentConversationId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.messages && data.messages.length > 0) {
            const historyText = data.messages.map((m: any) => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
            const originalSystemInstruction = config.systemInstruction?.parts?.[0]?.text || '';
            
            modifiedConfig = {
              ...config,
              systemInstruction: {
                parts: [{
                  text: `${originalSystemInstruction}\n\n--- PAST CONVERSATION CONTEXT ---\n${historyText}`
                }]
              }
            };
          }
        }
      } catch (e) {
        console.error('Failed to fetch conversation history for context', e);
      }
    }
    
    await client.connect(modifiedConfig);
  }, [client, config]);

  const disconnect = useCallback(async () => {
    client.disconnect();
    setConnected(false);
  }, [setConnected, client]);

  return {
    client,
    config,
    setConfig,
    connect,
    connected,
    disconnect,
    volume,
  };
}