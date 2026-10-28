import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface KeywordListEditorProps {
  label: string;
  keywords: string[];
  onChange: (keywords: string[]) => void;
  placeholder: string;
  emptyText: string;
  chipClassName: string;
}

/** Chip list + add form, shared by the "My Stack" and "Mute" keyword settings. */
export const KeywordListEditor: React.FC<KeywordListEditorProps> = ({ label, keywords, onChange, placeholder, emptyText, chipClassName }) => {
  const [draft, setDraft] = useState('');

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const value = draft.trim();
    if (value && !keywords.some((k) => k.toLowerCase() === value.toLowerCase())) onChange([...keywords, value]);
    setDraft('');
  };

  return (
    <div className="space-y-2">
      <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted">
        {label} ({keywords.length})
      </label>
      <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-theme-card border border-theme-border min-h-[46px] items-center">
        {keywords.map((kw) => (
          <span key={kw} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold border ${chipClassName}`}>
            <span>{kw}</span>
            <button type="button" onClick={() => onChange(keywords.filter((k) => k !== kw))} className="hover:text-rose-500 rounded p-0.5" title={`Remove ${kw}`}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {keywords.length === 0 && <span className="text-xs font-mono text-theme-text-muted italic">{emptyText}</span>}
      </div>
      <form onSubmit={add} className="flex gap-2 max-w-md">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="flex-grow bg-theme-card border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
        />
        <button type="submit" disabled={!draft.trim()} className="px-3 py-2 rounded bg-theme-accent text-white font-mono text-xs font-bold disabled:opacity-50 flex items-center gap-1 hover:opacity-90 transition-opacity">
          <Plus className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
      </form>
    </div>
  );
};
