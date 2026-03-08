/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { FunctionCall, useSettings, useUI, useTools, useLogStore } from '@/lib/state';
import c from 'classnames';
import { DEFAULT_LIVE_API_MODEL, AVAILABLE_VOICES } from '@/lib/constants';
import { useLiveAPIContext } from '@/contexts/LiveAPIContext';
import { useState, useEffect } from 'react';
import ToolEditorModal from './ToolEditorModal';

const AVAILABLE_MODELS = [
  DEFAULT_LIVE_API_MODEL
];

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar } = useUI();
  const { systemPrompt, model, voice, setSystemPrompt, setModel, setVoice } =
    useSettings();
  const { tools, toggleTool, addTool, removeTool, updateTool } = useTools();
  const { connected } = useLiveAPIContext();
  const { conversationId, loadConversation, clearTurns } = useLogStore();

  const [editingTool, setEditingTool] = useState<FunctionCall | null>(null);
  const [conversations, setConversations] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/conversations')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setConversations(data);
        }
      })
      .catch(e => console.error("Failed to fetch conversations", e));
  }, [conversationId]); // Refresh when a new conversation is created

  const handleSaveTool = (updatedTool: FunctionCall) => {
    if (editingTool) {
      updateTool(editingTool.name, updatedTool);
    }
    setEditingTool(null);
  };

  const handleLoadConversation = (id: string) => {
    if (connected) return;
    loadConversation(id);
  };

  const handleNewConversation = () => {
    if (connected) return;
    clearTurns();
  };

  return (
    <>
      <aside className={c('sidebar', { open: isSidebarOpen })}>
        <div className="sidebar-header">
          <h3>Settings</h3>
          <button onClick={toggleSidebar} className="close-button">
            <span className="icon">close</span>
          </button>
        </div>
        <div className="sidebar-content">
          <div className="sidebar-section">
            <h4 className="sidebar-section-title">Conversations History</h4>
            <div className="flex flex-col gap-2 mb-4">
              <button 
                onClick={handleNewConversation}
                disabled={connected}
                className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 text-sm font-medium"
              >
                + New Conversation
              </button>
              <div className="max-h-40 overflow-y-auto flex flex-col gap-1 border border-gray-200 dark:border-gray-700 rounded p-1">
                {conversations.length === 0 ? (
                  <div className="text-xs text-gray-500 p-2 text-center">No history yet</div>
                ) : (
                  conversations.map(conv => (
                    <button
                      key={conv.id}
                      onClick={() => handleLoadConversation(conv.id)}
                      disabled={connected}
                      className={c(
                        "text-left px-2 py-1.5 text-sm rounded hover:bg-gray-100 dark:hover:bg-gray-800 truncate disabled:opacity-50",
                        { "bg-blue-50 dark:bg-blue-900/30 font-medium": conv.id === conversationId }
                      )}
                    >
                      {conv.title || 'Conversation'} - {new Date(conv.updatedAt).toLocaleDateString()}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="sidebar-section">
            <fieldset disabled={connected}>
              <label>
                System Prompt
                <textarea
                  value={systemPrompt}
                  onChange={e => setSystemPrompt(e.target.value)}
                  rows={10}
                  placeholder="Describe the role and personality of the AI..."
                />
              </label>
              <label>
                Model
                <select value={model} onChange={e => setModel(e.target.value)}>
                  {/* This is an experimental model name that should not be removed from the options. */}
                  {AVAILABLE_MODELS.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Voice
                <select value={voice} onChange={e => setVoice(e.target.value)}>
                  {AVAILABLE_VOICES.map(v => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          </div>
          <div className="sidebar-section">
            <h4 className="sidebar-section-title">Tools</h4>
            <div className="tools-list">
              {tools.map(tool => (
                <div key={tool.name} className="tool-item">
                  <label className="tool-checkbox-wrapper">
                    <input
                      type="checkbox"
                      id={`tool-checkbox-${tool.name}`}
                      checked={tool.isEnabled}
                      onChange={() => toggleTool(tool.name)}
                      disabled={connected}
                    />
                    <span className="checkbox-visual"></span>
                  </label>
                  <label
                    htmlFor={`tool-checkbox-${tool.name}`}
                    className="tool-name-text"
                  >
                    {tool.name}
                  </label>
                  <div className="tool-actions">
                    <button
                      onClick={() => setEditingTool(tool)}
                      disabled={connected}
                      aria-label={`Edit ${tool.name}`}
                    >
                      <span className="icon">edit</span>
                    </button>
                    <button
                      onClick={() => removeTool(tool.name)}
                      disabled={connected}
                      aria-label={`Delete ${tool.name}`}
                    >
                      <span className="icon">delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={addTool}
              className="add-tool-button"
              disabled={connected}
            >
              <span className="icon">add</span> Add function call
            </button>
          </div>
        </div>
      </aside>
      {editingTool && (
        <ToolEditorModal
          tool={editingTool}
          onClose={() => setEditingTool(null)}
          onSave={handleSaveTool}
        />
      )}
    </>
  );
}
