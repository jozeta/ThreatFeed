import React from 'react';
import { X, Keyboard } from 'lucide-react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'r', label: 'Refresh Feeds', desc: 'Fetch latest dispatches from all enabled feeds' },
    { key: 'f or /', label: 'Focus Search', desc: 'Instantly jump to search bar' },
    { key: 'j / k', label: 'Next / Prev Article', desc: 'Navigate articles in Reader mode' },
    { key: 'o', label: 'Open Article at Source', desc: 'Open original article in a new tab' },
    { key: 'm', label: 'Toggle Read Status', desc: 'Mark current article as read / unread' },
    { key: 'b', label: 'Toggle Bookmark', desc: 'Save or unsave article to Bookmarks' },
    { key: 'Esc', label: 'Close Modal / Reader', desc: 'Dismiss active view or modal' },
    { key: '?', label: 'Show Shortcuts', desc: 'Display this keyboard cheat sheet' },
  ];

  return (
    <div className="fixed inset-0 z-[80] overflow-y-auto modal-backdrop flex items-center justify-center p-4">
      <div className="modal-glass w-full max-w-md rounded-xl p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-theme-text-muted hover:text-theme-text"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-theme-border">
          <Keyboard className="w-5 h-5 text-theme-accent" />
          <h3 className="font-serif text-lg font-bold text-theme-text">Keyboard Shortcuts</h3>
        </div>

        <div className="space-y-3 font-mono text-xs">
          {shortcuts.map((sc) => (
            <div key={sc.key} className="flex items-center justify-between gap-4 py-1 border-b border-theme-border/40 last:border-b-0">
              <div>
                <span className="text-theme-text font-bold block">{sc.label}</span>
                <span className="text-[11px] text-theme-text-muted font-sans">{sc.desc}</span>
              </div>
              <kbd className="px-2 py-1 rounded bg-theme-card border border-theme-border text-theme-accent font-bold text-xs whitespace-nowrap shadow-sm">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="mt-6 pt-3 border-t border-theme-border text-center">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded font-mono text-xs uppercase bg-theme-accent text-white font-bold hover:bg-theme-accent-hover"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
