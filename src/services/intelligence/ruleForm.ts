import { AlertRule, AlertRuleKind, ConditionGroup, NewsCondition, ThreatSeverity, VulnCondition } from '../../types';

export type ValueKind = 'list' | 'severity' | 'cvss' | 'epss' | 'days' | 'none';
export interface FieldDef { field: string; label: string; value: ValueKind; operator: string }

export const NEWS_FIELDS: FieldDef[] = [
  { field: 'keyword', label: 'Watchlist keyword', value: 'list', operator: 'matches any of' },
  { field: 'vendor', label: 'Vendor / product', value: 'list', operator: 'mentions any of' },
  { field: 'severity', label: 'Severity', value: 'severity', operator: 'is at least' },
  { field: 'category', label: 'Feed category', value: 'list', operator: 'is any of' },
  { field: 'source', label: 'Feed (id)', value: 'list', operator: 'is any of' },
  { field: 'tag', label: 'Tag', value: 'list', operator: 'is any of' },
  { field: 'hasCve', label: 'Mentions a CVE', value: 'none', operator: 'is true' },
  { field: 'cveMatchesVulnRule', label: 'CVE matches a vulnerability rule', value: 'none', operator: 'is true' },
];

export const VULN_FIELDS: FieldDef[] = [
  { field: 'vendor', label: 'Vendor / product', value: 'list', operator: 'mentions any of' },
  { field: 'cvss', label: 'CVSS', value: 'cvss', operator: 'is at least' },
  { field: 'epss', label: 'EPSS', value: 'epss', operator: 'is at least (%)' },
  { field: 'kev', label: 'In CISA KEV', value: 'none', operator: 'is true' },
  { field: 'activelyExploited', label: 'Actively exploited', value: 'none', operator: 'is true' },
  { field: 'publicExploit', label: 'Public exploit', value: 'none', operator: 'is true' },
  { field: 'ransomware', label: 'Ransomware use', value: 'none', operator: 'is true' },
  { field: 'remoteNoAuth', label: 'Remote, no authentication', value: 'none', operator: 'is true' },
  { field: 'newCve', label: 'Newly published', value: 'none', operator: 'is true' },
  { field: 'kevAddedWithinDays', label: 'Added to KEV within', value: 'days', operator: 'days' },
  { field: 'cwe', label: 'CWE', value: 'list', operator: 'is any of' },
  { field: 'cve', label: 'CVE id', value: 'list', operator: 'is any of' },
  { field: 'watched', label: 'On your watched CVEs', value: 'none', operator: 'is true' },
];

export const fieldsFor = (kind: AlertRuleKind) => (kind === 'news' ? NEWS_FIELDS : VULN_FIELDS);
export const fieldDef = (kind: AlertRuleKind, field: string): FieldDef =>
  fieldsFor(kind).find(f => f.field === field) ?? fieldsFor(kind)[0];

export const SEVERITIES: ThreatSeverity[] = ['info', 'low', 'medium', 'high', 'critical'];

/** Editable mirror of a condition: every value is the raw text of its input so half-typed input survives re-renders */
export interface FormCondition { key: string; field: string; text: string }
export interface FormGroup { key: string; op: 'all' | 'any'; items: (FormCondition | FormGroup)[] }

export const isFormGroup = (n: FormCondition | FormGroup): n is FormGroup => 'items' in n;

let counter = 0;
export const nextKey = () => `k${++counter}`;

export const parseList = (text: string): string[] => text.split(',').map(s => s.trim()).filter(Boolean);

export function defaultText(def: FieldDef): string {
  switch (def.value) {
    case 'severity': return 'high';
    case 'cvss': return '7';
    case 'epss': return '10';
    case 'days': return '7';
    default: return '';
  }
}

export function newCondition(kind: AlertRuleKind, field = fieldsFor(kind)[0].field): FormCondition {
  return { key: nextKey(), field, text: defaultText(fieldDef(kind, field)) };
}

const num = (text: string, lo: number, hi: number) => {
  const n = Number(text);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

type AnyCondition = NewsCondition | VulnCondition;

export function conditionFromForm(kind: AlertRuleKind, c: FormCondition): AnyCondition {
  const def = fieldDef(kind, c.field);
  switch (def.value) {
    case 'list': return { field: c.field, values: parseList(c.text) } as AnyCondition;
    case 'severity': return { field: 'severity', min: (SEVERITIES.includes(c.text as ThreatSeverity) ? c.text : 'high') as ThreatSeverity };
    case 'cvss': return { field: 'cvss', min: num(c.text, 0, 10) };
    case 'epss': return { field: 'epss', min: num(c.text, 0, 100) / 100 };
    case 'days': return { field: 'kevAddedWithinDays', days: Math.max(1, Math.round(num(c.text, 1, 3650))) };
    default: return { field: c.field } as AnyCondition;
  }
}

export function conditionToForm(c: AnyCondition): FormCondition {
  const key = nextKey();
  if ('values' in c) return { key, field: c.field, text: c.values.join(', ') };
  if (c.field === 'severity') return { key, field: c.field, text: c.min };
  if (c.field === 'cvss') return { key, field: c.field, text: String(c.min) };
  if (c.field === 'epss') return { key, field: c.field, text: String(Math.round(c.min * 1000) / 10) };
  if (c.field === 'kevAddedWithinDays') return { key, field: c.field, text: String(c.days) };
  return { key, field: c.field, text: '' };
}

export function groupToForm(g: ConditionGroup<AnyCondition>): FormGroup {
  return {
    key: nextKey(), op: g.op,
    items: g.items.map(i => ('items' in i ? groupToForm(i as ConditionGroup<AnyCondition>) : conditionToForm(i as AnyCondition))),
  };
}

export function groupFromForm(kind: AlertRuleKind, g: FormGroup): ConditionGroup<AnyCondition> {
  return { op: g.op, items: g.items.map(i => (isFormGroup(i) ? groupFromForm(kind, i) : conditionFromForm(kind, i))) };
}

/** True when this group or any nested group has no items; an empty group matches nothing, so it can't be saved */
export function hasEmptyGroup(g: { items: unknown[] }): boolean {
  return g.items.length === 0 || g.items.some(i => !!i && typeof i === 'object' && 'items' in i && hasEmptyGroup(i as { items: unknown[] }));
}

/** True when any condition in the tree has the given field */
export function containsField(g: { items: unknown[] }, field: string, test: (c: Record<string, unknown>) => boolean = () => true): boolean {
  return g.items.some(i => {
    const o = i as Record<string, unknown>;
    return 'items' in o ? containsField(o as { items: unknown[] }, field, test) : o.field === field && test(o);
  });
}

/** Human-readable one-liner for a condition, used for the read-only built-in view */
export function describeCondition(kind: AlertRuleKind, c: AnyCondition): string {
  const def = fieldDef(kind, c.field);
  const f = conditionToForm(c);
  switch (def.value) {
    case 'none': return `${def.label} ${def.operator}`;
    case 'epss': return `${def.label} ${def.operator} ${f.text}`;
    default: return `${def.label} ${def.operator} ${f.text || '(none)'}`;
  }
}

/** Why a condition can't be saved (no values, or a number that isn't one), or null when it is fine */
export function conditionIssue(kind: AlertRuleKind, c: FormCondition): string | null {
  switch (fieldDef(kind, c.field).value) {
    case 'list': return parseList(c.text).length === 0 ? 'Enter at least one value.' : null;
    case 'cvss':
    case 'epss':
    case 'days': return c.text.trim() === '' || !Number.isFinite(Number(c.text)) ? 'Enter a number.' : null;
    default: return null;
  }
}

/** True when any condition in the form tree has an issue */
export function hasInvalidCondition(kind: AlertRuleKind, g: FormGroup): boolean {
  return g.items.some(i => (isFormGroup(i) ? hasInvalidCondition(kind, i) : conditionIssue(kind, i) !== null));
}

/**
 * Applies an editor save onto the CURRENT rules: only the edited fields replace the live rule, so list toggles made
 * while the editor was open survive. Returns null when a previously saved rule was deleted meanwhile.
 */
export function applyRuleEdit(rules: AlertRule[], edited: AlertRule, isNew: boolean): AlertRule[] | null {
  const current = rules.find(r => r.id === edited.id);
  if (!current) return isNew ? [...rules, edited] : null;
  const merged: AlertRule = { ...current, name: edited.name, kind: edited.kind, notify: edited.notify, root: edited.root, updatedAt: edited.updatedAt };
  return rules.map(r => (r.id === edited.id ? merged : r));
}
