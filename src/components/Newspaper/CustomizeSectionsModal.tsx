import React, { useState } from 'react';
import { NewspaperSectionConfig } from '../../types';
import { useSettings, DEFAULT_NEWSPAPER_SECTIONS } from '../../context/SettingsContext';
import { X, ArrowUp, ArrowDown, Eye, EyeOff, RotateCcw, Check, SlidersHorizontal, Clock } from 'lucide-react';

interface CustomizeSectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CustomizeSectionsModal: React.FC<CustomizeSectionsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { settings, updateSetting } = useSettings();
  const [sections, setSections] = useState<NewspaperSectionConfig[]>(
    settings.newspaperSections && settings.newspaperSections.length > 0
      ? [...settings.newspaperSections].sort((a, b) => a.order - b.order)
      : [...DEFAULT_NEWSPAPER_SECTIONS].sort((a, b) => a.order - b.order)
  );

  if (!isOpen) return null;

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sections.length) return;

    const newSections = [...sections];
    const temp = newSections[index];
    newSections[index] = newSections[targetIndex];
    newSections[targetIndex] = temp;

    // Re-assign order numbers
    newSections.forEach((sec, idx) => {
      sec.order = idx;
    });

    setSections(newSections);
  };

  const handleToggle = (id: string) => {
    setSections(prev =>
      prev.map(sec => (sec.id === id ? { ...sec, enabled: !sec.enabled } : sec))
    );
  };

  const handleTitleChange = (id: string, newTitle: string) => {
    setSections(prev =>
      prev.map(sec => (sec.id === id ? { ...sec, title: newTitle } : sec))
    );
  };

  const handleReset = () => {
    const reset = [...DEFAULT_NEWSPAPER_SECTIONS].map((s, idx) => ({ ...s, order: idx }));
    setSections(reset);
    updateSetting('newspaperSections', reset);
  };

  const handleSave = () => {
    updateSetting('newspaperSections', sections);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fadeIn">
      <div
        className="modal-glass [--glass-base:var(--color-card)] rounded-xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden text-theme-text"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-theme-border flex items-center justify-between bg-theme-surface/70">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-theme-accent/15 text-theme-accent">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-theme-text">
                Customize Newspaper Edition Sections
              </h3>
              <p className="font-mono text-xs text-theme-text-muted">
                Reorder, enable, or rename editorial sections
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-theme-text-muted hover:text-theme-text hover:bg-theme-surface transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Enable / Disable Sections (Chronological Mode) */}
        <div className="p-4 bg-theme-surface border-b border-theme-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-theme-accent" />
            <div>
              <h4 className="font-serif text-sm font-bold text-theme-text">
                Section Grouping vs Chronological Mode
              </h4>
              <p className="font-serif text-xs text-theme-text-muted">
                When disabled, all articles are presented in strict chronological order instead of grouped by section.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => updateSetting('sectionsEnabled', !(settings.sectionsEnabled !== false))}
            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold transition-all flex-shrink-0 ${
              settings.sectionsEnabled !== false
                ? 'bg-theme-accent text-white shadow-sm'
                : 'bg-theme-card text-theme-text-muted border border-theme-border hover:text-theme-text'
            }`}
          >
            {settings.sectionsEnabled !== false ? 'Sections Enabled' : 'Sections Disabled (Chronological)'}
          </button>
        </div>

        {/* List of Sections */}
        <div className="p-6 overflow-y-auto space-y-3 flex-grow">
          {sections.map((section, idx) => (
            <div
              key={section.id}
              className={`p-3.5 rounded-lg border transition-all flex items-center gap-3 ${
                section.enabled
                  ? 'bg-theme-surface border-theme-border'
                  : 'bg-theme-surface/40 border-theme-border/50 opacity-60'
              }`}
            >
              {/* Order Controls */}
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => handleMove(idx, 'up')}
                  disabled={idx === 0}
                  className="p-1 rounded hover:bg-theme-card text-theme-text-muted hover:text-theme-text disabled:opacity-20 transition-colors"
                  title="Move section up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleMove(idx, 'down')}
                  disabled={idx === sections.length - 1}
                  className="p-1 rounded hover:bg-theme-card text-theme-text-muted hover:text-theme-text disabled:opacity-20 transition-colors"
                  title="Move section down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Order Number Badge */}
              <span className="w-6 h-6 rounded flex items-center justify-center font-mono text-xs font-bold bg-theme-accent-subtle text-theme-accent flex-shrink-0">
                {idx + 1}
              </span>

              {/* Section Title Input */}
              <div className="flex-grow min-w-0">
                <input
                  type="text"
                  value={section.title}
                  onChange={(e) => handleTitleChange(section.id, e.target.value)}
                  className="w-full bg-transparent font-medium text-sm text-theme-text border-b border-transparent hover:border-theme-border focus:border-theme-accent focus:outline-none transition-colors px-1 py-0.5"
                />
                <div className="flex items-center gap-2 mt-0.5 px-1 text-[11px] font-mono text-theme-text-muted">
                  {section.minSeverity ? (
                    <span className="text-rose-500 font-semibold">Min Severity: {section.minSeverity}</span>
                  ) : (
                    <span>Category: {section.category || 'General'}</span>
                  )}
                </div>
              </div>

              {/* Enable / Disable Toggle */}
              <button
                type="button"
                onClick={() => handleToggle(section.id)}
                className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                  section.enabled
                    ? 'text-theme-accent bg-theme-accent-subtle hover:bg-theme-accent/20'
                    : 'text-theme-text-muted bg-theme-card hover:text-theme-text'
                }`}
                title={section.enabled ? 'Section is visible (click to hide)' : 'Section is hidden (click to show)'}
              >
                {section.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-theme-border bg-theme-surface/70 flex items-center justify-between">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono text-theme-text-muted hover:text-rose-500 hover:bg-theme-surface transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-xs font-mono font-medium hover:bg-theme-surface text-theme-text-muted hover:text-theme-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-theme-accent text-white hover:opacity-90 shadow-sm transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Apply Changes</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
