import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  User,
  Send,
  Sparkles,
  HelpCircle,
  Lightbulb,
  CornerDownLeft,
  Zap,
} from 'lucide-react';
import type { DatasetProfileResponse } from '../../types/api';
import type { AiChatMessage } from '../../types/dashboard';
import {
  askAiAnalyst,
  generateSuggestedQuestions,
  getNextMessageId,
} from '../../services/aiAnalystService';
import { askDatasetQuestion } from '../../services/api';

interface AiAnalystTabProps {
  profile: DatasetProfileResponse;
  onQuestionAsked?: () => void;
  onOpenUpgrade?: () => void;
}

export const AiAnalystTab: React.FC<AiAnalystTabProps> = ({
  profile,
  onQuestionAsked,
  onOpenUpgrade,
}) => {
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
      // 1. Invoke backend AI Analyst endpoint (which checks & enforces tier quota)
      const res = await askDatasetQuestion(profile.dataset_id, query);
      const aiResponse: AiChatMessage = {
        id: getNextMessageId(),
        role: 'assistant',
        content: res.explanation,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        insights: [
          res.operation && res.column ? `Executed operation: ${res.operation} on column "${res.column}"` : null,
          res.group_by ? `Segmented by: ${res.group_by}` : null,
        ].filter(Boolean) as string[],
        suggestedFollowUps: generateSuggestedQuestions(profile),
      };
      setMessages((prev) => [...prev, aiResponse]);
      onQuestionAsked?.();
    } catch (err) {
      const errMsg = (err as Error).message || 'Failed to process question.';
      const isRateLimit = errMsg.includes('limit reached') || errMsg.includes('429');

      if (isRateLimit) {
        // Enforce 429 Too Many Requests in UI with direct Upgrade CTA
        const rateLimitResponse: AiChatMessage = {
          id: getNextMessageId(),
          role: 'assistant',
          content: errMsg,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          insights: [
            'Daily question allowance for the Free tier is exhausted.',
            'Upgrade to Pro for unlimited daily AI queries.',
          ],
        };
        setMessages((prev) => [...prev, rateLimitResponse]);
      } else {
        // Fall back to client-side heuristics if network/AI service unavailable
        try {
          const fallbackResponse = await askAiAnalyst(query, profile);
          setMessages((prev) => [...prev, fallbackResponse]);
        } catch {
          const errorResponse: AiChatMessage = {
            id: getNextMessageId(),
            role: 'assistant',
            content: `Error: ${errMsg}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          };
          setMessages((prev) => [...prev, errorResponse]);
        }
      }
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

                {msg.content.includes('Upgrade to Pro') && onOpenUpgrade && (
                  <div className="chat-upgrade-banner">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm btn-with-icon chat-upgrade-btn"
                      onClick={onOpenUpgrade}
                    >
                      <Zap size={14} />
                      <span>Upgrade to Pro for Unlimited Access</span>
                    </button>
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
