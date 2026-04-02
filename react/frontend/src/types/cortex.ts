export interface CortexMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  toolCalls?: ToolCall[];
  error?: string;
}

export interface ToolCall {
  tool_name: string;
  tool_use_id: string;
  type: string;
  input?: any;
  result?: any;
  status?: 'pending' | 'complete' | 'error';
  sql?: string;
}

export interface AgentState {
  messages: CortexMessage[];
  isStreaming: boolean;
  error: string | null;
  reasoningStage: string;
}

export interface UserNote {
  note_id: number;
  created_at: string;
  created_by: string;
  page_context: string;
  entity_type: string;
  entity_id: string;
  note_text: string;
  note_type: string;
  is_resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
}
