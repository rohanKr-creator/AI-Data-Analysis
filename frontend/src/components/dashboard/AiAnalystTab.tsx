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
  TrendingUp,
  BarChart2,
  ShieldCheck,
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

const getSuggestionIcon = (query: string) => {
  const q = query.toLowerCase();
  if (q.includes('quality') || q.includes('missing') || q.includes('clean') || q.includes('anomal')) {
    return <ShieldCheck size={13} className="chip-icon icon-emerald" />;
  }
  if (q.includes('trend') || q.includes('growth') || q.includes('distribution') || q.includes('spread')) {
    return <TrendingUp size={13} className="chip-icon icon-indigo" />;
  }
  if (q.includes('bar') || q.includes('chart') || q.includes('correlat') || q.includes('compare')) {
    return <BarChart2 size={13} className="chip-icon icon-blue" />;
  }
  return <Sparkles size={13} className="chip-icon icon-purple" />;
};

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
      const answerContent =
        res.answer ||
        res.explanation ||
        (typeof res.result !== 'undefined' && res.result !== null
          ? `Analysis result: ${JSON.stringify(res.result)}`
          : 'Analysis complete, but no answer text was returned.');

      const opUsed = res.operation_used || res.operation;
      const colUsed = res.column_used || res.column;
      const groupByUsed = res.group_by;

      // If the backend indicates it cannot answer via deterministic single aggregation,
      // fallback to rich client-side heuristics (executive summary, data quality audit, etc.)
      const isUnanswerable =
        res.can_answer === false ||
        (!opUsed && !colUsed) ||
        (answerContent && answerContent.includes("I can't answer that with the available operations"));

      if (isUnanswerable) {
        try {
          const fallbackResponse = await askAiAnalyst(query, profile);
          setMessages((prev) => [...prev, fallbackResponse]);
          onQuestionAsked?.();
          return;
        } catch {
          // Fall through to display backend message
        }
      }

      const aiResponse: AiChatMessage = {
        id: getNextMessageId(),
        role: 'assistant',
        content: answerContent,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        insights: [
          opUsed && colUsed ? `Executed operation: ${opUsed} on column "${colUsed}"` : null,
          groupByUsed ? `Segmented by: ${groupByUsed}` : null,
          res.row_count != null ? `Calculated across ${res.row_count.toLocaleString()} rows` : null,
        ].filter(Boolean) as string[],
        suggestedFollowUps: generateSuggestedQuestions(profile),
      };
      setMessages((prev) => [...prev, aiResponse]);
      onQuestionAsked?.();
    } catch (err) {
      const errMsg =
        (err instanceof Error ? err.message : typeof err === 'string' ? err : '') ||
        'Failed to process question.';
      const lowerErr = errMsg.toLowerCase();
      const isRateLimit =
        lowerErr.includes('limit reached') ||
        lowerErr.includes('429') ||
        lowerErr.includes('too many requests') ||
        lowerErr.includes('upgrade to pro');

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
              <Bot size={18} className="ai-avatar-icon" />
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
          {messages.map((msg) => {
            const contentText =
              typeof msg?.content === 'string'
                ? msg.content
                : msg?.content
                  ? String(msg.content)
                  : '';
            const isUpgradePrompt =
              contentText.toLowerCase().includes('upgrade to pro') && !!onOpenUpgrade;

            return (
              <div
                key={msg.id}
                className={`chat-message-row ${
                  msg.role === 'user' ? 'message-user' : 'message-assistant'
                }`}
              >
                <div className="message-avatar">
                  {msg.role === 'user' ? <User size={15} /> : <Bot size={15} />}
                </div>

                <div className="message-bubble">
                  <div className="message-text">{contentText}</div>

                  {Array.isArray(msg.insights) && msg.insights.length > 0 && (
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

                  {isUpgradePrompt && (
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

                  {Array.isArray(msg.suggestedFollowUps) && msg.suggestedFollowUps.length > 0 && (
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
                            type="button"
                          >
                            {getSuggestionIcon(q)}
                            <span>{q}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="message-meta-footer">
                    <span className="message-timestamp">{msg.timestamp}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {isThinking && (
            <div className="chat-message-row message-assistant message-thinking-row">
              <div className="message-avatar">
                <Bot size={15} />
              </div>
              <div className="message-bubble thinking-bubble">
                <div className="typing-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="thinking-text">Analyzing dataset structure & computing statistics...</span>
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
              type="button"
              onClick={() => handleSendMessage()}
              disabled={isThinking || !inputQuery.trim()}
              className="chat-send-btn"
              aria-label="Send message"
              title={inputQuery.trim() ? 'Send message (Enter)' : 'Type a question first'}
            >
              <Send size={15} />
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
