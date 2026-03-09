import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient } from '../../lib/genai-live-client';
import { LiveConnectConfig, Modality, LiveServerToolCall, GoogleGenAI } from '@google/genai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext, pcmBase64ToWavBase64, arrayBufferToBase64 } from '../../lib/utils';
import VolMeterWorklet from '../../lib/worklets/vol-meter';
import { useLogStore, useSettings } from '@/lib/state';

export type UseLiveApiResults = {
  clientToytoy: GenAILiveClient;
  clientFifi: GenAILiveClient;
  setConfig: (configToytoy: LiveConnectConfig, configFifi: LiveConnectConfig) => void;
  configToytoy: LiveConnectConfig;
  configFifi: LiveConnectConfig;

  connect: () => Promise<void>;
  disconnect: () => void;
  connected: boolean;

  volume: number;
};

type UseLiveAPIProps = {
  apiKey: string;
};

export function useLiveAPI({
  apiKey,
}: UseLiveAPIProps): UseLiveApiResults {
  const { model } = useSettings();
  const clientToytoy = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);
  const clientFifi = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);

  const audioStreamerToytoyRef = useRef<AudioStreamer | null>(null);
  const audioStreamerFifiRef = useRef<AudioStreamer | null>(null);

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [configToytoy, setConfigToytoyState] = useState<LiveConnectConfig>({});
  const [configFifi, setConfigFifiState] = useState<LiveConnectConfig>({});

  const toytoyRoutingEnabledRef = useRef(false);
  const fifiRoutingEnabledRef = useRef(false);

  const setConfig = useCallback((toytoyConfig: LiveConnectConfig, fifiConfig: LiveConnectConfig) => {
    setConfigToytoyState(toytoyConfig);
    setConfigFifiState(fifiConfig);
  }, []);

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerToytoyRef.current) {
      audioContext({ id: 'audio-out-toytoy' }).then((audioCtx: AudioContext) => {
        audioStreamerToytoyRef.current = new AudioStreamer(audioCtx);
        audioStreamerToytoyRef.current
          .addWorklet<any>('vumeter-out-toytoy', VolMeterWorklet, (ev: any) => {
            setVolume(v => Math.max(v, ev.data.volume));
          })
          .catch(err => console.error('Error adding worklet Toytoy:', err));
      });
    }
    if (!audioStreamerFifiRef.current) {
      audioContext({ id: 'audio-out-fifi' }).then((audioCtx: AudioContext) => {
        audioStreamerFifiRef.current = new AudioStreamer(audioCtx);
        audioStreamerFifiRef.current
          .addWorklet<any>('vumeter-out-fifi', VolMeterWorklet, (ev: any) => {
            setVolume(v => Math.max(v, ev.data.volume));
          })
          .catch(err => console.error('Error adding worklet Fifi:', err));
      });
    }
  }, []);

  useEffect(() => {
    let connectedCount = 0;
    const onOpen = () => {
      connectedCount++;
      if (connectedCount > 0) Object.assign(window, { __anyConnected: true }); // safety
      setConnected(true);
    };

    const onClose = () => {
      connectedCount--;
      if (connectedCount <= 0) {
        setConnected(false);
        connectedCount = 0;
      }
    };

    const stopAudioStreamerToytoy = () => audioStreamerToytoyRef.current?.stop();
    const stopAudioStreamerFifi = () => audioStreamerFifiRef.current?.stop();

    const onAudioToytoy = (data: ArrayBuffer) => {
      audioStreamerToytoyRef.current?.addPCM16(new Uint8Array(data));
      if (toytoyRoutingEnabledRef.current && clientFifi.connected) {
        const base64Audio = arrayBufferToBase64(data);
        clientFifi.sendRealtimeInput([{ mimeType: 'audio/pcm;rate=24000', data: base64Audio }]);
      }
    };
    const onAudioFifi = (data: ArrayBuffer) => {
      audioStreamerFifiRef.current?.addPCM16(new Uint8Array(data));
      if (fifiRoutingEnabledRef.current && clientToytoy.connected) {
        const base64Audio = arrayBufferToBase64(data);
        clientToytoy.sendRealtimeInput([{ mimeType: 'audio/pcm;rate=24000', data: base64Audio }]);
      }
    };

    const onTurnCompleteToytoy = () => { toytoyRoutingEnabledRef.current = false; };
    const onTurnCompleteFifi = () => { fifiRoutingEnabledRef.current = false; };

    clientToytoy.on('open', onOpen);
    clientToytoy.on('close', onClose);
    clientToytoy.on('interrupted', stopAudioStreamerToytoy);
    clientToytoy.on('audio', onAudioToytoy);
    clientToytoy.on('turncomplete', onTurnCompleteToytoy);

    clientFifi.on('open', onOpen);
    clientFifi.on('close', onClose);
    clientFifi.on('interrupted', stopAudioStreamerFifi);
    clientFifi.on('audio', onAudioFifi);
    clientFifi.on('turncomplete', onTurnCompleteFifi);

    const makeToolCallHandler = (clientObj: GenAILiveClient) => async (toolCall: LiveServerToolCall) => {
      const functionResponses: any[] = [];
      for (const fc of toolCall.functionCalls) {
        const triggerMessage = `Triggering function call: **${fc.name}**\n\`\`\`json\n${JSON.stringify(fc.args, null, 2)}\n\`\`\``;
        useLogStore.getState().addTurn({ role: 'system', text: triggerMessage, isFinal: true });

        if (fc.name === 'route_audio_to_partner') {
          if (clientObj === clientToytoy) {
            toytoyRoutingEnabledRef.current = true;
          } else {
            fifiRoutingEnabledRef.current = true;
          }
          functionResponses.push({ id: fc.id, name: fc.name, response: { result: 'Audio routing to partner enabled for this turn.' } });
          useLogStore.getState().addTurn({ role: 'system', text: `Audio routing enabled for ${clientObj === clientToytoy ? 'Toytoy' : 'Fifi'}`, isFinal: true });
        } else if (fc.name === 'dispatch_to_specialists') {
          try {
            const tasks = fc.args.tasks as any[];
            const sharedContext = fc.args.sharedContext as string | undefined;
            const ai = new GoogleGenAI({ apiKey });

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

                  if (category.includes('image')) {
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
                     const response = await ai.models.generateContent({ model: modelName, contents: fullPrompt });
                     let imageUrl = '';
                     for (const part of response.candidates?.[0]?.content?.parts || []) {
                       if (part.inlineData) {
                         imageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                         break;
                       }
                     }
                     resultText = imageUrl ? `![Generated Image](${imageUrl})` : 'Failed to generate image.';
                  } else if (isVideo) {
                     resultText = `Started video generation for prompt: ${fullPrompt}. (Note: Mocked logic)`;
                  } else if (modelName === 'gemini-2.5-flash-preview-tts') {
                     const response = await ai.models.generateContent({
                       model: modelName,
                       contents: fullPrompt,
                       config: {
                         responseModalities: ['AUDIO'],
                         speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: useSettings.getState().voiceFifi || 'Aoede' } } },
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
                     const response = await ai.models.generateContent({ model: modelName, contents: fullPrompt });
                     resultText = response.text || 'No output generated.';
                  }
                } catch (err: any) {
                  resultText = `Error executing task: ${err.message}`;
                }

                useLogStore.getState().addTurn({ role: 'system', text: `Task Result for **${task.detectedTaskType}**:\n${resultText}`, isFinal: true });
              }
            })();

            functionResponses.push({ id: fc.id, name: fc.name, response: { result: 'Dispatched tasks.' } });
          } catch (err: any) {
             functionResponses.push({ id: fc.id, name: fc.name, response: { error: err.message } });
          }
        } else {
          let resultText = `Successfully executed ${fc.name}`;
          let details: any = { status: 'completed' };

          if (fc.name === 'search_memory') {
            try {
              const res = await fetch(`/api/memory/search?q=${encodeURIComponent(fc.args.query as string)}`);
              const data = await res.json();
              resultText = `Found ${data.length} past messages matching "${fc.args.query}".`;
              details = { results: data };
            } catch (e: any) {
              resultText = `Error: ${e.message}`; details = { error: e.message };
            }
          } else if (fc.name === 'save_user_fact') {
            try {
              const res = await fetch('/api/memory/facts', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fact: fc.args.fact, category: fc.args.category }),
              });
              const data = await res.json();
              resultText = `Saved fact: "${data.fact}"`; details = { savedFact: data };
            } catch (e: any) {
              resultText = `Error: ${e.message}`; details = { error: e.message };
            }
          } else if (fc.name === 'get_user_facts') {
            try {
              const res = await fetch('/api/memory/facts');
              const data = await res.json();
              resultText = `Retrieved ${data.length} facts about the user.`; details = { facts: data };
            } catch (e: any) {
              resultText = `Error: ${e.message}`; details = { error: e.message };
            }
          } else if (fc.name === 'execute_local_cli') {
            try {
              const res = await fetch('/api/cli', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: fc.args.command }),
              });
              const data = await res.json();
              if (res.ok) {
                resultText = `Command executed successfully.\nStdout: ${data.stdout || 'none'}\nStderr: ${data.stderr || 'none'}`;
                details = { stdout: data.stdout, stderr: data.stderr };
              } else {
                resultText = `Command failed: ${data.error}`; details = { error: data.error, stderr: data.stderr };
              }
            } catch (e: any) {
              resultText = `Error: ${e.message}`; details = { error: e.message };
            }
          } else if (fc.name === 'create_music_lyra') {
            resultText = `Started music generation via Lyra for prompt: "${fc.args.prompt}".`; details = { status: 'generating' };
          } else if (fc.name === 'generate_code') {
            resultText = `Started code generation for prompt: "${fc.args.prompt}".`; details = { status: 'generating' };
          }
          
          const responsePayload = { result: resultText, details, timestamp: new Date().toISOString() };
          functionResponses.push({ id: fc.id, name: fc.name, response: responsePayload });
          useLogStore.getState().addTurn({ role: 'system', text: `Task Result for **${fc.name}**:\n${resultText}`, isFinal: true });
        }
      }

      if (functionResponses.length > 0) {
        useLogStore.getState().addTurn({
          role: 'system',
          text: `Function call response:\n\`\`\`json\n${JSON.stringify(functionResponses, null, 2)}\n\`\`\``,
          isFinal: true,
        });
        clientObj.sendToolResponse({ functionResponses: functionResponses });
      }
    };

    const handlerToytoy = makeToolCallHandler(clientToytoy);
    const handlerFifi = makeToolCallHandler(clientFifi);
    clientToytoy.on('toolcall', handlerToytoy);
    clientFifi.on('toolcall', handlerFifi);

    return () => {
      clientToytoy.off('open', onOpen);
      clientToytoy.off('close', onClose);
      clientToytoy.off('interrupted', stopAudioStreamerToytoy);
      clientToytoy.off('audio', onAudioToytoy);
      clientToytoy.off('turncomplete', onTurnCompleteToytoy);
      clientToytoy.off('toolcall', handlerToytoy);

      clientFifi.off('open', onOpen);
      clientFifi.off('close', onClose);
      clientFifi.off('interrupted', stopAudioStreamerFifi);
      clientFifi.off('audio', onAudioFifi);
      clientFifi.off('turncomplete', onTurnCompleteFifi);
      clientFifi.off('toolcall', handlerFifi);
    };
  }, [clientToytoy, clientFifi, apiKey]);

  const connect = useCallback(async () => {
    if (!configToytoy || !configFifi) throw new Error('configs have not been set');
    clientToytoy.disconnect();
    clientFifi.disconnect();
    
    const store = useLogStore.getState();
    let currentConversationId = store.conversationId;
    
    if (!currentConversationId) {
      try {
        const res = await fetch('/api/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'New Conversation' }) });
        if (res.ok) {
          const data = await res.json();
          store.setConversationId(data.id);
          currentConversationId = data.id;
        }
      } catch (e) {
        console.error('Failed to create conversation', e);
      }
    }

    let historyText = '';
    let memoryText = '';
    if (currentConversationId) {
      try {
        const [res, summaryRes] = await Promise.all([
          fetch(`/api/conversations/${currentConversationId}`),
          fetch(`/api/memory/summary`)
        ]);
        if (res.ok) {
          const data = await res.json();
          if (data.messages?.length > 0) {
            historyText = data.messages.map((m: any) => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
          }
        }
        if (summaryRes.ok) {
          const summaryData = await summaryRes.json();
          if (summaryData.facts?.length > 0) {
            memoryText += "KNOWN FACTS ABOUT USER:\n" + summaryData.facts.map((f: any) => `- [${f.category}] ${f.fact}`).join('\n') + "\n\n";
          }
        }
      } catch (e) {
        console.error('Failed to fetch context', e);
      }
    }

    const injectContext = (config: LiveConnectConfig, voiceName: string) => {
      const si = config.systemInstruction;
      let hostText = '';
      if (typeof si === 'string') {
        hostText = si;
      } else if (si && typeof si === 'object' && 'parts' in si && Array.isArray((si as any).parts)) {
        hostText = (si as any).parts[0]?.text || '';
      }
      
      let fullContext = hostText;
      if (memoryText) fullContext += `\n\n--- LONG TERM MEMORY ---\n${memoryText}`;
      if (historyText) fullContext += `\n\n--- CURRENT CONVERSATION HISTORY ---\n${historyText}`;
      
      return { 
        ...config, 
        systemInstruction: { parts: [{ text: fullContext }] },
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } }
      };
    };

    const voiceToytoy = useSettings.getState().voiceToytoy || 'Orus';
    const voiceFifi = useSettings.getState().voiceFifi || 'Aoede';

    await Promise.all([
      clientToytoy.connect(injectContext(configToytoy, voiceToytoy)),
      clientFifi.connect(injectContext(configFifi, voiceFifi))
    ]);
    setConnected(true);
  }, [clientToytoy, clientFifi, configToytoy, configFifi]);

  const disconnect = useCallback(() => {
    clientToytoy.disconnect();
    clientFifi.disconnect();
    setConnected(false);
  }, [clientToytoy, clientFifi]);

  return { clientToytoy, clientFifi, configToytoy, configFifi, setConfig, connect, connected, disconnect, volume };
}
