import React from 'react';
import { AlertRuleKind } from '../../types';
import {
  FormCondition, FormGroup, SEVERITIES, conditionIssue, defaultText, fieldDef, fieldsFor, isFormGroup, newCondition, nextKey,
} from '../../services/intelligence/ruleForm';

const inputClass = 'bg-theme-bg border border-theme-border rounded px-2 py-1 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent';
const smallButton = 'px-2 py-1 rounded border border-theme-border bg-theme-card text-xs font-mono text-theme-text-muted hover:text-theme-text transition-colors';

interface ConditionRowProps {
  kind: AlertRuleKind;
  condition: FormCondition;
  onChange: (c: FormCondition) => void;
  onRemove: () => void;
}

const ConditionRow: React.FC<ConditionRowProps> = ({ kind, condition, onChange, onRemove }) => {
  const def = fieldDef(kind, condition.field);
  const set = (text: string) => onChange({ ...condition, text });
  const issue = conditionIssue(kind, condition);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Field"
        className={inputClass}
        value={condition.field}
        onChange={e => onChange({ ...condition, field: e.target.value, text: defaultText(fieldDef(kind, e.target.value)) })}
      >
        {fieldsFor(kind).map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
      </select>
      <span className="text-xs font-mono text-theme-text-muted">{def.operator}</span>
      {def.value === 'list' && (
        <input aria-label="Values" className={`${inputClass} flex-1 min-w-[10rem]`} value={condition.text} onChange={e => set(e.target.value)} placeholder="comma, separated, values" />
      )}
      {def.value === 'severity' && (
        <select aria-label="Severity" className={inputClass} value={condition.text} onChange={e => set(e.target.value)}>
          {SEVERITIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      )}
      {def.value === 'cvss' && (
        <input aria-label="Minimum CVSS" type="number" min={0} max={10} step={0.1} className={`${inputClass} w-20`} value={condition.text} onChange={e => set(e.target.value)} />
      )}
      {def.value === 'epss' && (
        <input aria-label="Minimum EPSS percent" type="number" min={0} max={100} step={1} className={`${inputClass} w-20`} value={condition.text} onChange={e => set(e.target.value)} />
      )}
      {def.value === 'days' && (
        <input aria-label="Days" type="number" min={1} step={1} className={`${inputClass} w-20`} value={condition.text} onChange={e => set(e.target.value)} />
      )}
      <button type="button" aria-label="Remove condition" className={smallButton} onClick={onRemove}>✕</button>
      {issue && <span className="basis-full text-xs font-serif text-rose-500">{issue}</span>}
    </div>
  );
};

interface ConditionGroupBuilderProps {
  kind: AlertRuleKind;
  group: FormGroup;
  onChange: (g: FormGroup) => void;
  onRemove?: () => void; // nested groups only
  nested?: boolean;
}

/** Match all/any selector plus condition rows; groups nest one level deep */
export const ConditionGroupBuilder: React.FC<ConditionGroupBuilderProps> = ({ kind, group, onChange, onRemove, nested }) => {
  const setItem = (index: number, item: FormCondition | FormGroup) =>
    onChange({ ...group, items: group.items.map((existing, i) => (i === index ? item : existing)) });
  const removeItem = (index: number) => onChange({ ...group, items: group.items.filter((_, i) => i !== index) });

  return (
    <div className={nested ? 'space-y-2 border-l-2 border-theme-border pl-3 py-1' : 'space-y-2'}>
      <div className="flex items-center gap-2 text-xs font-mono text-theme-text-muted">
        <span>Match</span>
        <select aria-label="Match mode" className={inputClass} value={group.op} onChange={e => onChange({ ...group, op: e.target.value as 'all' | 'any' })}>
          <option value="all">all</option>
          <option value="any">any</option>
        </select>
        <span>of the following</span>
        {onRemove && <button type="button" aria-label="Remove group" className={`${smallButton} ml-auto`} onClick={onRemove}>✕</button>}
      </div>
      {group.items.length === 0 && <p className="text-xs font-serif text-rose-500">This group is empty. Add a condition.</p>}
      {group.items.map((item, i) => isFormGroup(item)
        ? <ConditionGroupBuilder key={item.key} kind={kind} group={item} nested onChange={g => setItem(i, g)} onRemove={() => removeItem(i)} />
        : <ConditionRow key={item.key} kind={kind} condition={item} onChange={c => setItem(i, c)} onRemove={() => removeItem(i)} />)}
      <div className="flex gap-2">
        <button type="button" className={smallButton} onClick={() => onChange({ ...group, items: [...group.items, newCondition(kind)] })}>+ condition</button>
        {!nested && (
          <button type="button" className={smallButton} onClick={() => onChange({ ...group, items: [...group.items, { key: nextKey(), op: 'any', items: [newCondition(kind)] }] })}>+ group</button>
        )}
      </div>
    </div>
  );
};
