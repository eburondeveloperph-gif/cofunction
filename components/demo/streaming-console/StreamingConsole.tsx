/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { useEffect, useRef, useState } from 'react';
import PopUp from '../popup/PopUp';
import WelcomeScreen from '../welcome-screen/WelcomeScreen';
import { LiveConnectConfig, Modality } from '@google/genai';

import { useLiveAPIContext } from '../../../contexts/LiveAPIContext';
import {
  useSettings,
  useLogStore,
  useTools,
  systemPrompts,
  toolsets,
} from '@/lib/state';

const formatTimestamp = (date: Date) => {
  const pad = (num: number, size = 2) => num.toString().padStart(size, '0');
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const milliseconds = pad(date.getMilliseconds(), 3);
  return `${hours}:${minutes}:${seconds}.${milliseconds}`;
};

const renderContent = (text: string) => {
  const parts = text.split(/(`{3}json\n[\s\S]*?\n`{3})/g);

  return parts.map((part, index) => {
    if (part.startsWith('```json')) {
      const jsonContent = part.replace(/^`{3}json\n|`{3}$/g, '');
      return (
        <pre key={index}>
          <code>{jsonContent}</code>
        </pre>
      );
    }

    const audioParts = part.split(/(<audio controls src=".*?"><\/audio>)/g);
    return audioParts.map((audioPart, audioIndex) => {
      if (audioPart.startsWith('<audio controls src="') && audioPart.endsWith('"></audio>')) {
        const src = audioPart.match(/src="(.*?)"/)?.[1];
        return <audio key={`audio-${index}-${audioIndex}`} controls src={src} style={{ display: 'block', margin: '10px 0' }}></audio>;
      }

      const imageParts = audioPart.split(/(!\[.*?\]\(.*?\))/g);
      return imageParts.map((imagePart, imageIndex) => {
        if (imagePart.startsWith('![') && imagePart.endsWith(')')) {
          const alt = imagePart.match(/!\[(.*?)\]/)?.[1];
          const src = imagePart.match(/\((.*?)\)/)?.[1];
          return <img key={`img-${index}-${audioIndex}-${imageIndex}`} src={src} alt={alt} style={{ maxWidth: '100%', borderRadius: '8px', margin: '10px 0' }} />;
        }

        const boldParts = imagePart.split(/(\*\*.*?\*\*)/g);
        return boldParts.map((boldPart, boldIndex) => {
          if (boldPart.startsWith('**') && boldPart.endsWith('**')) {
            return <strong key={`bold-${index}-${audioIndex}-${imageIndex}-${boldIndex}`}>{boldPart.slice(2, -2)}</strong>;
          }
          return <span key={`text-${index}-${audioIndex}-${imageIndex}-${boldIndex}`}>{boldPart}</span>;
        });
      });
    });
  });
};

export default function StreamingConsole() {
  const { clientJaKool, clientPepe, setConfig } = useLiveAPIContext();
  const { systemPrompt, voiceToytoy, voiceFifi, setVoiceToytoy, setVoiceFifi } = useSettings();
  const { tools } = useTools();
  const turns = useLogStore(state => state.turns);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showPopUp, setShowPopUp] = useState(true);

  const handleClosePopUp = () => setShowPopUp(false);

  // Set the configuration for the Live API
  useEffect(() => {
    const enabledTools = tools.filter(tool => tool.isEnabled);

    const jaKoolToolNames = toolsets['ja-kool'].map(t => t.name);
    const pepeToolNames = toolsets['pepe'].map(t => t.name);

    const toolsJaKool = enabledTools
      .filter(t => jaKoolToolNames.includes(t.name))
      .map(tool => ({
        functionDeclarations: [
          {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        ],
      }));

    const toolsPepe = enabledTools
      .filter(t => pepeToolNames.includes(t.name))
      .map(tool => ({
        functionDeclarations: [
          {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        ],
      }));

    const supportedLiveVoices = ['Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr', 'Orus'];
    const liveVoiceJaKool = supportedLiveVoices.includes(voiceToytoy) ? voiceToytoy : 'Orus';
    const liveVoicePepe = supportedLiveVoices.includes(voiceFifi) ? voiceFifi : 'Charon';

    const configJaKool: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: liveVoiceJaKool } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: {
        parts: [{ text: systemPrompts['ja-kool'] + "\n\nAdditional Global System Prompt:\n" + systemPrompt }],
      },
      tools: toolsJaKool,
    };

    const configPepe: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: liveVoicePepe } } },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: {
        parts: [{ text: systemPrompts['pepe'] + "\n\nAdditional Global System Prompt:\n" + systemPrompt }],
      },
      tools: toolsPepe,
    };

    setConfig(configJaKool, configPepe);
  }, [setConfig, systemPrompt, tools, voiceToytoy, voiceFifi]);

  useEffect(() => {
    const setupAgentListeners = (targetClient: any, agentRole: string) => {
      const { addTurn, updateLastTurn } = useLogStore.getState();

      const handleInputTranscription = (text: string, isFinal: boolean) => {
        const last = useLogStore.getState().turns.at(-1);
        if (last && last.role === 'user' && !last.isFinal) {
          updateLastTurn({ text: last.text + text, isFinal });
        } else {
          addTurn({ role: 'user', text, isFinal });
        }
      };

      const handleOutputTranscription = (text: string, isFinal: boolean) => {
        const last = useLogStore.getState().turns.at(-1);
        if (last && last.role === agentRole && !last.isFinal) {
          updateLastTurn({ text: last.text + text, isFinal });
        } else {
          addTurn({ role: agentRole as any, text, isFinal });
        }
      };

      const handleContent = (serverContent: any) => {
        const text = serverContent.modelTurn?.parts?.map((p: any) => p.text).filter(Boolean).join(' ') ?? '';
        const groundingChunks = serverContent.groundingMetadata?.groundingChunks;
        if (!text && !groundingChunks) return;
        const last = useLogStore.getState().turns.at(-1);
        if (last?.role === agentRole && !last.isFinal) {
          const updatedTurn: any = { text: last.text + text };
          if (groundingChunks) updatedTurn.groundingChunks = [...(last.groundingChunks || []), ...groundingChunks];
          updateLastTurn(updatedTurn);
        } else {
          addTurn({ role: agentRole as any, text, isFinal: false, groundingChunks: groundingChunks as any[] });
        }
      };

      const handleTurnComplete = () => {
        const last = useLogStore.getState().turns.at(-1);
        if (last && !last.isFinal && last.role === agentRole) updateLastTurn({ isFinal: true });
      };

      targetClient.on('inputTranscription', handleInputTranscription);
      targetClient.on('outputTranscription', handleOutputTranscription);
      targetClient.on('content', handleContent);
      targetClient.on('turncomplete', handleTurnComplete);

      return () => {
        targetClient.off('inputTranscription', handleInputTranscription);
        targetClient.off('outputTranscription', handleOutputTranscription);
        targetClient.off('content', handleContent);
        targetClient.off('turncomplete', handleTurnComplete);
      };
    };

    const cleanupJaKool = setupAgentListeners(clientJaKool, 'agent');
    const cleanupPepe = setupAgentListeners(clientPepe, 'agent');

    return () => {
      cleanupJaKool();
      cleanupPepe();
    };
  }, [clientJaKool, clientPepe]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns]);

  return (
    <div className="transcription-container">
      {showPopUp && <PopUp onClose={handleClosePopUp} />}
      {turns.length === 0 ? (
        <WelcomeScreen />
      ) : (
        <div className="transcription-view" ref={scrollRef}>
          {turns.map((t, i) => (
            <div key={i} className={`transcription-entry ${t.role} ${!t.isFinal ? 'interim' : ''}`}>
              <p className="description">Meet Toytoy and Fifi, your AI tag-team. Toytoy is the strategist, and Fifi is the executioner.</p>
              <div className="transcription-header">
                <div className="transcription-source">
                  {t.role === 'user' ? 'You' : t.role === 'agent' ? 'Agent' : 'System'}
                </div>
                <div className="transcription-timestamp">{formatTimestamp(t.timestamp)}</div>
              </div>
              <div className="transcription-text-content">{renderContent(t.text)}</div>
              {t.groundingChunks && t.groundingChunks.length > 0 && (
                <div className="grounding-chunks">
                  <strong>Sources:</strong>
                  <ul>
                    {t.groundingChunks.filter(chunk => chunk.web).map((chunk, index) => (
                      <li key={index}>
                        <a href={chunk.web!.uri} target="_blank" rel="noopener noreferrer">
                          {chunk.web!.title || chunk.web!.uri}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}