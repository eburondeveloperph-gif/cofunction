import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GenAILiveClient } from '../../lib/genai-live-client';
import { LiveConnectConfig, Modality, LiveServerToolCall, GoogleGenAI } from '@google/genai';
import { AudioStreamer } from '../../lib/audio-streamer';
import { audioContext, pcmBase64ToWavBase64 } from '../../lib/utils';
import VolMeterWorklet from '../../lib/worklets/vol-meter';
import { useLogStore, useSettings } from '@/lib/state';

export type UseLiveApiResults = {
  clientJaKool: GenAILiveClient;
  clientPepe: GenAILiveClient;
  setConfig: (configJaKool: LiveConnectConfig, configPepe: LiveConnectConfig) => void;
  configJaKool: LiveConnectConfig;
  configPepe: LiveConnectConfig;

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
  const clientJaKool = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);
  const clientPepe = useMemo(() => new GenAILiveClient(apiKey, model), [apiKey, model]);

  const audioStreamerJaKoolRef = useRef<AudioStreamer | null>(null);
  const audioStreamerPepeRef = useRef<AudioStreamer | null>(null);

  const [volume, setVolume] = useState(0);
  const [connected, setConnected] = useState(false);
  const [configJaKool, setConfigJaKoolState] = useState<LiveConnectConfig>({});
  const [configPepe, setConfigPepeState] = useState<LiveConnectConfig>({});

  const setConfig = useCallback((jaKoolConfig: LiveConnectConfig, pepeConfig: LiveConnectConfig) => {
    setConfigJaKoolState(jaKoolConfig);
    setConfigPepeState(pepeConfig);
  }, []);

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerJaKoolRef.current) {
      audioContext({ id: 'audio-out-jakool' }).then((audioCtx: AudioContext) => {
        audioStreamerJaKoolRef.current = new AudioStreamer(audioCtx);
        audioStreamerJaKoolRef.current
          .addWorklet<any>('vumeter-out-jakool', VolMeterWorklet, (ev: any) => {
            setVolume(v => Math.max(v, ev.data.volume));
          })
          .catch(err => console.error('Error adding worklet jakool:', err));
      });
    }
    if (!audioStreamerPepeRef.current) {
      audioContext({ id: 'audio-out-pepe' }).then((audioCtx: AudioContext) => {
        audioStreamerPepeRef.current = new AudioStreamer(audioCtx);
        audioStreamerPepeRef.current
          .addWorklet<any>('vumeter-out-pepe', VolMeterWorklet, (ev: any) => {
            setVolume(v => Math.max(v, ev.data.volume));
          })
          .catch(err => console.error('Error adding worklet pepe:', err));
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

    const stopAudioStreamerJaKool = () => audioStreamerJaKoolRef.current?.stop();
    const stopAudioStreamerPepe = () => audioStreamerPepeRef.current?.stop();

    const onAudioJaKool = (data: ArrayBuffer) => audioStreamerJaKoolRef.current?.addPCM16(new Uint8Array(data));
    const onAudioPepe = (data: ArrayBuffer) => audioStreamerPepeRef.current?.addPCM16(new Uint8Array(data));

    clientJaKool.on('open', onOpen);
    clientJaKool.on('close', onClose);
    clientJaKool.on('interrupted', stopAudioStreamerJaKool);
    clientJaKool.on('audio', onAudioJaKool);

    clientPepe.on('open', onOpen);
    clientPepe.on('close', onClose);
    clientPepe.on('interrupted', stopAudioStreamerPepe);
    clientPepe.on('audio', onAudioPepe);

    const makeToolCallHandler = (clientObj: GenAILiveClient) => async (toolCall: LiveServerToolCall) => {
      const functionResponses: any[] = [];
      for (const fc of toolCall.functionCalls) {
        const triggerMessage = `Triggering function call: **${fc.name}**\n\`\`\`json\n${JSON.stringify(fc.args, null, 2)}\n\`\`\``;
        useLogStore.getState().addTurn({ role: 'system', text: triggerMessage, isFinal: true });

        if (fc.name === 'dispatch_to_specialists') {
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
                         speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: useSettings.getState().voicePepe || 'Charon' } } },
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
      }

      clientObj.sendToolResponse({ functionResponses: functionResponses });
    };

    const handlerJaKool = makeToolCallHandler(clientJaKool);
    const handlerPepe = makeToolCallHandler(clientPepe);
    clientJaKool.on('toolcall', handlerJaKool);
    clientPepe.on('toolcall', handlerPepe);

    return () => {
      clientJaKool.off('open', onOpen);
      clientJaKool.off('close', onClose);
      clientJaKool.off('interrupted', stopAudioStreamerJaKool);
      clientJaKool.off('audio', onAudioJaKool);
      clientJaKool.off('toolcall', handlerJaKool);

      clientPepe.off('open', onOpen);
      clientPepe.off('close', onClose);
      clientPepe.off('interrupted', stopAudioStreamerPepe);
      clientPepe.off('audio', onAudioPepe);
      clientPepe.off('toolcall', handlerPepe);
    };
  }, [clientJaKool, clientPepe, apiKey]);

  const connect = useCallback(async () => {
    if (!configJaKool || !configPepe) throw new Error('configs have not been set');
    clientJaKool.disconnect();
    clientPepe.disconnect();
    
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

    const injectContext = (config: LiveConnectConfig) => {
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
      return { ...config, systemInstruction: { parts: [{ text: fullContext }] } };
    };

    await Promise.all([
      clientJaKool.connect(injectContext(configJaKool)),
      clientPepe.connect(injectContext(configPepe))
    ]);
  }, [clientJaKool, clientPepe, configJaKool, configPepe]);

  const disconnect = useCallback(() => {
    clientJaKool.disconnect();
    clientPepe.disconnect();
    setConnected(false);
  }, [clientJaKool, clientPepe]);

  return { clientJaKool, clientPepe, configJaKool, configPepe, setConfig, connect, connected, disconnect, volume };
}
