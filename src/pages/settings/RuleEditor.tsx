import React, { useMemo, useState } from 'react';
import { AlertRule, AlertRuleKind, UserSettings } from '../../types';
import { resolveRoot } from '../../services/intelligence/alertRules';
import {
  FormGroup, containsField, describeCondition, groupFromForm, groupToForm, hasEmptyGroup, nextKey, newCondition,
} from '../../services/intelligence/ruleForm';
import { ConditionGroupBuilder } from './ConditionBuilder';

type RuleLists = Pick<UserSettings, 'watchlistKeywords' | 'stackKeywords' | 'watchedCves'>;

interface RuleEditorProps {
  rule: AlertRule;
  isNew: boolean;
  lists: RuleLists;
  onSave: (rule: AlertRule) => void;
  onCancel: () => void;
  preview: (rule: AlertRule) => number;
  previewLoading?: boolean; // vulnerability data not loaded yet
  onDuplicate: (rule: AlertRule) => void;
  /** Resolves true when the browser allows notifications; used before turning 🔔 on */
  requestNotify: () => Promise<boolean>;
}

const emptyForm = (kind: AlertRuleKind): FormGroup => ({ key: nextKey(), op: 'all', items: [newCondition(kind)] });
const buttonClass = 'px-3 py-1.5 rounded border text-xs font-mono transition-colors bg-theme-card border-theme-border text-theme-text-muted hover:text-theme-text';
const primaryClass = 'px-3 py-1.5 rounded border text-xs font-mono font-bold bg-theme-accent text-white border-theme-accent disabled:opacity-50 disabled:cursor-default';

const BuiltInView: React.FC<{ rule: AlertRule; lists: RuleLists; onCancel: () => void; onDuplicate: (r: AlertRule) => void }> = ({ rule, lists, onCancel, onDuplicate }) => {
  const root = resolveRoot(rule, lists);
  return (
    <div className="space-y-3 p-4 rounded-lg border border-theme-border bg-theme-card">
      <h3 className="font-serif font-bold text-theme-text">{rule.name} <span className="text-xs font-mono text-theme-text-muted">(built-in, read-only)</span></h3>
      <p className="text-xs font-mono text-theme-text-muted">Match {root.op} of:</p>
      <ul className="list-disc pl-5 text-xs font-serif text-theme-text space-y-1">
        {(root.items as unknown[]).map((c, i) => (
          <li key={i}>{describeCondition(rule.kind, c as Parameters<typeof describeCondition>[1])}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button type="button" className={buttonClass} onClick={() => onDuplicate(rule)}>Duplicate as custom rule</button>
        <button type="button" className={buttonClass} onClick={onCancel}>Close</button>
      </div>
    </div>
  );
};

export const RuleEditor: React.FC<RuleEditorProps> = ({ rule, isNew, lists, onSave, onCancel, preview, previewLoading, onDuplicate, requestNotify }) => {
  const [name, setName] = useState(rule.name);
  const [kind, setKind] = useState<AlertRuleKind>(rule.kind);
  const [notify, setNotify] = useState(rule.notify);
  const [form, setForm] = useState<FormGroup>(() => (rule.root.items.length ? groupToForm(rule.root) : emptyForm(rule.kind)));

  const draft = useMemo<AlertRule>(
    () => ({ ...rule, name: name.trim(), kind, notify, root: groupFromForm(kind, form) as AlertRule['root'] }),
    [rule, name, kind, notify, form],
  );
  const eventDriven = containsField(draft.root, 'watched');
  const lowCvss = containsField(draft.root, 'cvss', c => (c.min as number) < 7);
  const invalid = hasEmptyGroup(draft.root);
  const count = useMemo(() => (eventDriven || invalid || previewLoading ? 0 : preview(draft)), [draft, eventDriven, invalid, previewLoading, preview]);

  if (rule.builtIn) return <BuiltInView rule={rule} lists={lists} onCancel={onCancel} onDuplicate={onDuplicate} />;

  const changeKind = (next: AlertRuleKind) => {
    if (next === kind) return;
    setKind(next);
    setForm(emptyForm(next));
  };
  const toggleNotify = async () => {
    if (notify) setNotify(false);
    else if (await requestNotify()) setNotify(true);
  };

  return (
    <div className="space-y-4 p-4 rounded-lg border border-theme-border bg-theme-card">
      <div className="flex flex-wrap items-center gap-3">
        <input
          aria-label="Rule name"
          className="flex-1 min-w-[12rem] bg-theme-bg border border-theme-border rounded px-2 py-1.5 text-sm font-serif text-theme-text focus:outline-none focus:border-theme-accent"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Rule name"
        />
        <div className="flex gap-1" role="group" aria-label="Rule kind">
          {(['news', 'vulns'] as const).map(k => (
            <button
              key={k}
              type="button"
              disabled={!isNew}
              onClick={() => changeKind(k)}
              className={`px-3 py-1.5 rounded border text-xs font-mono ${kind === k ? 'bg-theme-accent text-white border-theme-accent font-bold' : 'bg-theme-card border-theme-border text-theme-text-muted'} disabled:cursor-default ${!isNew && kind !== k ? 'opacity-40' : ''}`}
            >
              {k === 'news' ? 'News' : 'Vulns'}
            </button>
          ))}
        </div>
        <button type="button" onClick={toggleNotify} aria-pressed={notify} title={notify ? 'Desktop notifications on' : 'Desktop notifications off'} className={`${buttonClass} ${notify ? '!bg-theme-accent !text-white !border-theme-accent' : ''}`}>
          🔔 {notify ? 'On' : 'Off'}
        </button>
      </div>

      <ConditionGroupBuilder kind={kind} group={form} onChange={setForm} />

      {lowCvss && (
        <p className="text-xs font-serif text-amber-600 dark:text-amber-400">
          New CVEs below CVSS 7 are only matched when they are in KEV or mentioned in an article.
        </p>
      )}
      <p className="text-xs font-serif text-theme-text-muted">
        {eventDriven
          ? 'Matches on changes to your watched CVEs'
          : kind === 'vulns' && previewLoading
            ? 'Loading vulnerability data…'
            : invalid ? 'Fix empty groups to see a preview.' : `Matches ${count} current items`}
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          className={primaryClass}
          disabled={invalid || name.trim() === ''}
          onClick={() => onSave({ ...draft, updatedAt: new Date().toISOString() })}
        >
          Save
        </button>
        <button type="button" className={buttonClass} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
};
