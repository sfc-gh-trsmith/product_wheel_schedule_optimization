import { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { MessageCircle, X, Send, Trash2, Loader2, Bot, User, ChevronDown, Wrench, Maximize2, Minimize2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useCortexAgent } from '../hooks/useCortexAgent';
import type { CortexMessage, ToolCall } from '../types/cortex';
import { useLocation } from 'react-router-dom';

const SUGGESTIONS = [
  'What is Line A1 running this week at Snowcore East?',
  'Show me fill rate by customer for premium wet food',
  'What cleaning steps are needed for a poultry to grain-free changeover?',
  'Which contracts are at risk of missing SLA this month?',
  'Note: Review Line B2 capacity with maintenance team',
];

const PAGE_LABELS: Record<string, string> = {
  '/overview': 'overview',
  '/explorer': 'explorer',
  '/results': 'results',
  '/studio': 'studio',
  '/contracts': 'contracts',
};

function ToolCallDisplay({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 rounded-lg bg-gray-100 dark:bg-slate-800/50 border border-gray-200 dark:border-slate-700/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-200 dark:hover:bg-slate-700/30 transition-colors"
      >
        <Wrench className="w-3 h-3 text-sf-blue" />
        <span className="text-gray-700 dark:text-slate-300 font-medium">{tool.tool_name}</span>
        <span className={clsx(
          'ml-auto px-1.5 py-0.5 rounded text-[10px] font-medium',
          tool.status === 'complete' ? 'bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400' :
          tool.status === 'error' ? 'bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400' :
          'bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400'
        )}>
          {tool.status || 'pending'}
        </span>
        <ChevronDown className={clsx('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="px-3 py-2 text-[10px] border-t border-gray-200 dark:border-slate-700/50">
          {tool.sql && (
            <div className="mb-2">
              <div className="text-gray-400 dark:text-slate-500 mb-1">SQL:</div>
              <pre className="bg-gray-50 dark:bg-slate-900/50 p-2 rounded overflow-x-auto text-gray-700 dark:text-slate-300">{tool.sql}</pre>
            </div>
          )}
          {tool.result && (
            <div>
              <div className="text-gray-400 dark:text-slate-500 mb-1">Result:</div>
              <pre className="bg-gray-50 dark:bg-slate-900/50 p-2 rounded overflow-x-auto text-gray-700 dark:text-slate-300 max-h-32">
                {typeof tool.result === 'string' ? tool.result : JSON.stringify(tool.result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message, reasoningStage }: { message: CortexMessage; reasoningStage?: string }) {
  const isUser = message.role === 'user';

  return (
    <div className={clsx('flex gap-2', isUser ? 'flex-row-reverse' : 'flex-row')}>
      <div className={clsx(
        'flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center',
        isUser ? 'bg-sf-blue/20' : 'bg-purple-500/20'
      )}>
        {isUser ? <User className="w-4 h-4 text-sf-blue" /> : <Bot className="w-4 h-4 text-purple-500" />}
      </div>
      <div className={clsx('flex-1 min-w-0', isUser ? 'text-right' : 'text-left')}>
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 max-w-[85%]">
            {message.toolCalls.map((tool, i) => (
              <ToolCallDisplay key={i} tool={tool} />
            ))}
          </div>
        )}
        <div className={clsx(
          'inline-block max-w-[85%] rounded-2xl px-3 py-2 text-sm',
          isUser
            ? 'bg-sf-blue text-white rounded-tr-sm'
            : 'bg-gray-100 dark:bg-slate-800 text-gray-900 dark:text-slate-100 rounded-tl-sm'
        )}>
          {message.isStreaming && !message.content && reasoningStage ? (
            <div className="flex items-center gap-2 text-gray-400 dark:text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span className="text-xs">{reasoningStage}</span>
            </div>
          ) : (
            <div className="whitespace-pre-wrap">{message.content || ''}</div>
          )}
        </div>
        {message.error && (
          <div className="mt-1 text-xs text-red-500">{message.error}</div>
        )}
      </div>
    </div>
  );
}

export default function CortexChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();

  const currentPage = PAGE_LABELS[location.pathname] || 'global';

  const { messages, isStreaming, reasoningStage, sendMessage, clearMessages } = useCortexAgent({
    endpoint: '/api/agent/run',
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, reasoningStage]);

  useEffect(() => {
    if (isOpen && textareaRef.current) textareaRef.current.focus();
  }, [isOpen]);

  const handleSubmit = () => {
    if (input.trim() && !isStreaming) {
      sendMessage(input.trim(), { page: currentPage });
      setInput('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={clsx(
          'fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center',
          'bg-sf-blue hover:bg-sf-navy transition-colors',
          isOpen && 'hidden'
        )}
      >
        <MessageCircle className="w-6 h-6 text-white" />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs font-bold text-white flex items-center justify-center">
            {messages.filter(m => m.role === 'assistant').length}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div
            onClick={() => !isFullScreen && setIsOpen(false)}
            className={clsx('fixed inset-0 z-50', isFullScreen ? 'bg-black/60' : 'bg-black/30')}
          />
          <div className={clsx(
            'fixed z-50 bg-white dark:bg-dark-surface shadow-2xl border border-gray-200 dark:border-dark-border flex flex-col overflow-hidden',
            isFullScreen ? 'inset-4 rounded-xl' : 'bottom-6 right-6 w-[420px] h-[600px] rounded-2xl'
          )}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-sf-blue" />
                <div>
                  <h3 className="font-semibold text-sm">Snowcore Manufacturing Copilot</h3>
                  <span className="text-[10px] text-gray-400 dark:text-dark-muted">Page: {currentPage}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={clearMessages} className="p-2 hover:bg-gray-200 dark:hover:bg-dark-border/50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => setIsFullScreen(!isFullScreen)} className="p-2 hover:bg-gray-200 dark:hover:bg-dark-border/50 rounded-lg transition-colors">
                  {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-dark-border/50 rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center">
                  <Bot className="w-8 h-8 text-sf-blue mb-4" />
                  <p className="text-sm text-gray-500 dark:text-dark-muted mb-2 font-medium">How can I help you?</p>
                  <p className="text-xs text-gray-400 dark:text-dark-muted mb-6 text-center max-w-[280px]">
                    Ask about schedules, demand, inventory, contracts, changeovers, or SOPs. You can also save notes and action items.
                  </p>
                  <div className="space-y-2 w-full">
                    {SUGGESTIONS.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(s, { page: currentPage })}
                        className="w-full text-left px-3 py-2 rounded-lg bg-gray-50 dark:bg-slate-800/50 hover:bg-gray-100 dark:hover:bg-slate-700/50 text-sm transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {messages.map(msg => (
                    <MessageBubble key={msg.id} message={msg} reasoningStage={msg.isStreaming ? reasoningStage : undefined} />
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            <div className="p-3 border-t border-gray-200 dark:border-dark-border">
              <div className="flex gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about schedules, SOPs, contracts..."
                  rows={1}
                  className="flex-1 resize-none bg-gray-50 dark:bg-dark-bg border border-gray-200 dark:border-dark-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sf-blue/50"
                  disabled={isStreaming}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!input.trim() || isStreaming}
                  className={clsx(
                    'px-4 rounded-xl transition-colors',
                    input.trim() && !isStreaming ? 'bg-sf-blue text-white hover:bg-sf-navy' : 'bg-gray-200 dark:bg-dark-border text-gray-400'
                  )}
                >
                  {isStreaming ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
