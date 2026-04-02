import { useState, useCallback, useRef } from 'react';
import type { CortexMessage, ToolCall } from '../types/cortex';

interface UseCortexAgentOptions {
  endpoint?: string;
}

interface UseCortexAgentReturn {
  messages: CortexMessage[];
  isStreaming: boolean;
  error: string | null;
  reasoningStage: string;
  sendMessage: (content: string, context?: { page?: string }) => Promise<void>;
  clearMessages: () => void;
  stopStreaming: () => void;
}

export function useCortexAgent(options: UseCortexAgentOptions = {}): UseCortexAgentReturn {
  const { endpoint = '/api/agent/run' } = options;

  const [messages, setMessages] = useState<CortexMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasoningStage, setReasoningStage] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const sendMessage = useCallback(async (content: string, context?: { page?: string }) => {
    if (!content.trim() || isStreaming) return;

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    const userMessage: CortexMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    };

    const assistantId = generateId();
    const assistantMessage: CortexMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
      toolCalls: [],
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setIsStreaming(true);
    setError(null);
    setReasoningStage('Thinking...');

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content.trim(), page_context: context?.page }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      const toolCalls: ToolCall[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim() || line.startsWith('event:')) continue;

          if (line.startsWith('data:')) {
            const data = line.slice(5).trim();
            if (data === '[DONE]') continue;

            try {
              const event = JSON.parse(data);

              switch (event.type) {
                case 'text_delta':
                  fullContent += event.text || '';
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantId ? { ...m, content: fullContent } : m
                    )
                  );
                  setReasoningStage('');
                  break;

                case 'thinking':
                  setReasoningStage(event.text || 'Thinking...');
                  break;

                case 'tool_start':
                  setReasoningStage(`Using ${event.tool_name || 'tool'}...`);
                  toolCalls.push({
                    tool_name: event.tool_name,
                    tool_use_id: event.tool_use_id,
                    type: event.tool_type || 'unknown',
                    input: event.input,
                    status: 'pending',
                  });
                  setMessages(prev =>
                    prev.map(m =>
                      m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m
                    )
                  );
                  break;

                case 'tool_end': {
                  const idx = toolCalls.findIndex(t => t.tool_use_id === event.tool_use_id);
                  if (idx >= 0) {
                    toolCalls[idx] = {
                      ...toolCalls[idx],
                      result: event.result,
                      status: event.status || 'complete',
                      sql: event.sql,
                    };
                    setMessages(prev =>
                      prev.map(m =>
                        m.id === assistantId ? { ...m, toolCalls: [...toolCalls] } : m
                      )
                    );
                  }
                  setReasoningStage('Processing results...');
                  break;
                }

                case 'error':
                  throw new Error(event.message || 'Agent error');

                case 'done':
                  break;
              }
            } catch (e) {
              if (e instanceof SyntaxError) continue;
              throw e;
            }
          }
        }
      }

      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId ? { ...m, isStreaming: false } : m
        )
      );
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return;
      }
      const errorMsg = e instanceof Error ? e.message : 'Unknown error';
      setError(errorMsg);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, isStreaming: false, error: errorMsg, content: m.content || 'Sorry, an error occurred.' }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
      setReasoningStage('');
    }
  }, [endpoint, isStreaming]);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
    setReasoningStage('');
  }, []);

  return {
    messages,
    isStreaming,
    error,
    reasoningStage,
    sendMessage,
    clearMessages,
    stopStreaming,
  };
}
