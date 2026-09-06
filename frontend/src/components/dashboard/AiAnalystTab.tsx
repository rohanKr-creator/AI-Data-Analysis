import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  User,
  Send,
  Sparkles,
  HelpCircle,
  Lightbulb,
  CornerDownLeft,
} from 'lucide-react';
import type { DatasetProfileResponse } from '../../types/api';
import type { AiChatMessage } from '../../types/dashboard';
import {
  askAiAnalyst,
  generateSuggestedQuestions,
  getNextMessageId,
} from '../../services/aiAnalystService';

interface AiAnalystTabProps {
  profile: DatasetProfileResponse;
}

export const AiAnalystTab: React.FC<AiAnalystTabProps> = ({ profile }) => {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome-msg',
      role: 'assistant',
      content: `Hello! I'm your AI Data Analyst assistant. I've indexed "${profile.filename}" (${profile.row_count.toLocaleString()} rows × ${profile.column_count} columns). You can ask me about data quality, distributions, statistical anomalies, or summary metrics!`,
      timestamp: 'Just now',
      insights: [
        `${profile.column_count} features detected and ready for query`,
        'Instant answers powered by deterministic statistical inspection',
      ],
      suggestedFollowUps: generateSuggestedQuestions(profile),
    },
  ]);

  const [inputQuery, setInputQuery] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  const handleSendMessage = async (queryToSend?: string) => {
    const query = (queryToSend || inputQuery).trim();
    if (!query || isThinking) return;

    const userMessage: AiChatMessage = {
      id: getNextMessageId(),
      role: 'user',
      content: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputQuery('');
    setIsThinking(true);

    try {
      const aiResponse = await askAiAnalyst(query, profile);
      setMessages((prev) => [...prev, aiResponse]);
    } catch {
      const errorResponse: AiChatMessage = {
        id: getNextMessageId(),
        role: 'assistant',
        content: 'I encountered an error processing your query against this dataset schema.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, errorResponse]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="tab-pane ai-analyst-tab">
      <div className="chat-container-card">
        {/* Chat Header */}
        <div className="chat-header">
          <div className="chat-header-info">
            <div className="ai-avatar-ring">
              <Bot size={20} className="ai-avatar-icon" />
            </div>
            <div>
              <h3 className="chat-title">
                AI Dataset Copilot <span className="ai-status-tag">Active</span>
              </h3>
              <p className="chat-subtitle">
                Contextual reasoning over {profile.filename} schema and statistical metrics
              </p>
            </div>
          </div>
        </div>

        {/* Message Log */}
        <div className="chat-messages-log">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`chat-message-row ${msg.role === 'user' ? 'message-user' : 'message-assistant'}`}
            >
              <div className="message-avatar">
                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>

              <div className="message-bubble">
                <div className="message-text">{msg.content}</div>

                {msg.insights && msg.insights.length > 0 && (
                  <div className="message-insights-box">
                    <div className="insights-header">
                      <Lightbulb size={13} />
                      <span>Key Takeaways</span>
                    </div>
                    <ul className="insights-list">
                      {msg.insights.map((insight, idx) => (
                        <li key={idx}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {msg.suggestedFollowUps && msg.suggestedFollowUps.length > 0 && (
                  <div className="suggested-followups">
                    <span className="followup-label">
                      <HelpCircle size={12} /> Suggested questions:
                    </span>
                    <div className="followup-chips">
                      {msg.suggestedFollowUps.map((q, idx) => (
                        <button
                          key={idx}
                          className="chip-btn"
                          onClick={() => handleSendMessage(q)}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="message-timestamp">{msg.timestamp}</div>
              </div>
            </div>
          ))}

          {isThinking && (
            <div className="chat-message-row message-assistant">
              <div className="message-avatar">
                <Bot size={16} />
              </div>
              <div className="message-bubble thinking-bubble">
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="thinking-text">Analyzing dataset structure...</span>
              </div>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Input Bar */}
        <div className="chat-input-area">
          <div className="chat-input-box">
            <input
              type="text"
              placeholder="Ask anything about this dataset (e.g. 'Summarize quality', 'What is average salary?')..."
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isThinking}
              className="chat-input"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isThinking || !inputQuery.trim()}
              className="chat-send-btn"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </div>
          <div className="chat-hint-bar">
            <span>
              <Sparkles size={11} /> AI responses are grounded directly in your uploaded dataset's profile & statistics.
            </span>
            <span className="kbd-hint">
              Press <kbd>Enter <CornerDownLeft size={10} /></kbd> to send
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
