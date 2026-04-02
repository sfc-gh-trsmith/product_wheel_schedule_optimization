import { useState } from 'react';
import { MessageSquarePlus, X, CheckCircle2, Clock, StickyNote } from 'lucide-react';
import { clsx } from 'clsx';
import { useSnowflakeQuery } from '../hooks/useSnowflakeQuery';
import type { UserNote } from '../types/cortex';

interface NotesPanelProps {
  page: string;
  entityType?: string;
  entityId?: string;
  compact?: boolean;
}

export default function NotesPanel({ page, entityType, entityId, compact }: NotesPanelProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteType, setNoteType] = useState('comment');
  const [saving, setSaving] = useState(false);

  const queryKey = entityType && entityId
    ? ['notes', page, entityType, entityId]
    : ['notes', page];

  const url = entityType && entityId
    ? `/api/notes?page=${page}&entity_type=${entityType}&entity_id=${entityId}`
    : `/api/notes?page=${page}`;

  const { data: notes, refetch } = useSnowflakeQuery<UserNote[]>(queryKey, url);

  const handleSave = async () => {
    if (!noteText.trim()) return;
    setSaving(true);
    try {
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_context: page,
          entity_type: entityType || 'page',
          entity_id: entityId || page,
          note_text: noteText.trim(),
          note_type: noteType,
        }),
      });
      setNoteText('');
      setShowAdd(false);
      refetch();
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = async (noteId: number) => {
    await fetch(`/api/notes/${noteId}/resolve`, { method: 'PATCH' });
    refetch();
  };

  if (compact) {
    return (
      <div className="space-y-1">
        {notes?.slice(0, 3).map(n => (
          <div key={n.note_id} className="flex items-center gap-2 text-xs text-gray-500 dark:text-dark-muted">
            <StickyNote className="w-3 h-3" />
            <span className="truncate flex-1">{n.note_text}</span>
            <span className="text-[10px] text-gray-400">{new Date(n.created_at).toLocaleDateString()}</span>
          </div>
        ))}
        {(notes?.length || 0) > 3 && (
          <span className="text-[10px] text-sf-blue">+{(notes!.length - 3)} more</span>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-surface">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-dark-border">
        <div className="flex items-center gap-2">
          <StickyNote className="w-4 h-4 text-sf-blue" />
          <span className="text-sm font-semibold">Notes & Comments</span>
          {notes?.length ? <span className="text-xs text-gray-400">({notes.length})</span> : null}
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="text-sf-blue hover:text-sf-navy transition-colors">
          {showAdd ? <X className="w-4 h-4" /> : <MessageSquarePlus className="w-4 h-4" />}
        </button>
      </div>

      {showAdd && (
        <div className="p-3 border-b border-gray-200 dark:border-dark-border space-y-2">
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note or action item..."
            rows={2}
            className="w-full text-sm border border-gray-200 dark:border-dark-border rounded-lg p-2 bg-gray-50 dark:bg-dark-bg focus:outline-none focus:ring-2 focus:ring-sf-blue/50"
          />
          <div className="flex items-center gap-2">
            <select
              value={noteType}
              onChange={e => setNoteType(e.target.value)}
              className="text-xs border border-gray-200 dark:border-dark-border rounded px-2 py-1 bg-white dark:bg-dark-bg"
            >
              <option value="comment">Comment</option>
              <option value="action_item">Action Item</option>
              <option value="concern">Concern</option>
              <option value="question">Question</option>
            </select>
            <button
              onClick={handleSave}
              disabled={!noteText.trim() || saving}
              className="ml-auto text-xs font-medium text-white bg-sf-blue px-3 py-1 rounded hover:bg-sf-navy disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border/50">
        {!notes?.length ? (
          <div className="p-4 text-center text-xs text-gray-400 dark:text-dark-muted">No notes yet</div>
        ) : notes.map(n => (
          <div key={n.note_id} className={clsx('px-4 py-2.5 text-sm', n.is_resolved && 'opacity-50')}>
            <div className="flex items-start gap-2">
              <span className={clsx(
                'mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                n.note_type === 'action_item' ? 'bg-amber-100 dark:bg-amber-900/20 text-amber-600' :
                n.note_type === 'concern' ? 'bg-red-100 dark:bg-red-900/20 text-red-600' :
                n.note_type === 'question' ? 'bg-purple-100 dark:bg-purple-900/20 text-purple-600' :
                'bg-gray-100 dark:bg-dark-bg text-gray-500'
              )}>
                {n.note_type}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-700 dark:text-dark-text">{n.note_text}</p>
                <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
                  <Clock className="w-3 h-3" />
                  {new Date(n.created_at).toLocaleString()}
                  {n.created_by && <span>by {n.created_by}</span>}
                </div>
              </div>
              {!n.is_resolved && (
                <button onClick={() => handleResolve(n.note_id)} className="text-green-500 hover:text-green-600">
                  <CheckCircle2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ActivityFeed() {
  const { data: notes } = useSnowflakeQuery<UserNote[]>(['notes-feed'], '/api/notes?limit=10');

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 dark:text-dark-muted uppercase tracking-wider">Activity</h3>
      {!notes?.length ? (
        <p className="text-xs text-gray-400 dark:text-dark-muted">No recent notes</p>
      ) : (
        <div className="space-y-2">
          {notes.map(n => (
            <div key={n.note_id} className="text-xs space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className={clsx(
                  'w-2 h-2 rounded-full',
                  n.note_type === 'action_item' ? 'bg-amber-400' :
                  n.note_type === 'concern' ? 'bg-red-400' :
                  'bg-sf-blue'
                )} />
                <span className="font-medium text-gray-600 dark:text-dark-muted capitalize">{n.page_context}</span>
              </div>
              <p className="text-gray-500 dark:text-dark-muted truncate pl-3.5">{n.note_text}</p>
              <p className="text-[10px] text-gray-400 pl-3.5">{new Date(n.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
