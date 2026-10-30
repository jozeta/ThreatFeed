import React, { useCallback, useMemo, useState } from 'react';
import { Bell } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { useFeeds } from '../../context/FeedContext';
import { useVulns } from '../../hooks/useVulns';
import { AlertRule, BuiltInRule } from '../../types';
import {
  ALERT_GAP_OPTIONS, buildVulnItems, builtInTerms, duplicateRule, matchedVulnCves, matchesNews, matchesVuln, resolveRoot,
} from '../../services/intelligence/alertRules';
import { applyRuleEdit, containsField } from '../../services/intelligence/ruleForm';
import { notificationsSupported, requestNotificationPermission } from '../../services/notifications';
import { RuleEditor } from './RuleEditor';

const sectionClass = 'bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6';
const toggleClass = (on: boolean) =>
  `press px-3 py-1.5 rounded border text-xs font-mono transition-colors ${on ? 'bg-theme-accent text-white border-theme-accent font-bold' : 'bg-theme-card border-theme-border text-theme-text-muted hover:text-theme-text'}`;
const smallButton = 'px-2 py-1 rounded border border-theme-border bg-theme-card text-xs font-mono text-theme-text-muted hover:text-theme-text transition-colors';

// Where each built-in rule's list is edited; scrolls to that settings section
const SOURCE_LABEL: Record<BuiltInRule, { text: string; anchor?: string }> = {
  'watchlist': { text: 'your watchlist', anchor: 'watchlist-settings' },
  'stack-news': { text: 'your stack', anchor: 'stack-settings' },
  'stack-vulns': { text: 'your stack', anchor: 'stack-settings' },
  'watched-cves': { text: 'your watched CVEs' },
};

export const AlertRulesSettings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { feeds, articles, cveIntel } = useFeeds();
  const vulns = useVulns();
  const [editing, setEditing] = useState<{ rule: AlertRule; isNew: boolean; kindLocked?: boolean } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [permissionNote, setPermissionNote] = useState('');

  const rules = settings.alertRules;
  const lists = useMemo(
    () => ({ watchlistKeywords: settings.watchlistKeywords, stackKeywords: settings.stackKeywords, watchedCves: settings.watchedCves }),
    [settings.watchlistKeywords, settings.stackKeywords, settings.watchedCves],
  );
  const vulnItems = useMemo(() => (vulns ? Array.from(buildVulnItems(vulns, cveIntel).values()) : null), [vulns, cveIntel]);
  const categories = useMemo(() => new Map(feeds.map(f => [f.id, f.category])), [feeds]);
  // For previewing "CVE matches a vulnerability rule": CVEs the enabled Vulns rules match right now
  const vulnRuleCves = useMemo(
    () => matchedVulnCves(rules, lists, vulnItems ?? [], new Date()),
    [rules, lists, vulnItems],
  );

  /** Current matches for a rule; built-ins are read through their live lists */
  const countMatches = useCallback((rule: AlertRule): number => {
    const root = resolveRoot(rule, lists);
    const ctx = { now: new Date(), feedCategory: (id: string) => categories.get(id), vulnRuleMatches: (cve: string) => vulnRuleCves.has(cve) };
    if (rule.kind === 'news') return articles.filter(a => matchesNews(root as never, a, ctx)).length;
    return (vulnItems ?? []).filter(v => matchesVuln(root as never, v, ctx)).length;
  }, [lists, categories, articles, vulnItems, vulnRuleCves]);

  const setRules = (next: AlertRule[]) => updateSettings({ alertRules: next });
  // Toggles from the list leave updatedAt alone; only saving from the editor stamps it
  const patchRule = (id: string, patch: Partial<AlertRule>) => setRules(rules.map(r => (r.id === id ? { ...r, ...patch } : r)));

  const requestNotify = async (): Promise<boolean> => {
    const permission = await requestNotificationPermission();
    if (permission === 'granted') {
      setPermissionNote('');
      return true;
    }
    setPermissionNote(permission === 'denied'
      ? 'Notifications are blocked for this site. Allow them in your browser\'s site settings, then try again.'
      : 'Notification permission was not granted.');
    return false;
  };

  const toggleNotify = async (rule: AlertRule) => {
    if (rule.notify) patchRule(rule.id, { notify: false });
    else if (await requestNotify()) patchRule(rule.id, { notify: true });
  };

  const newRule = (): AlertRule => {
    const stamp = new Date().toISOString();
    return {
      id: crypto.randomUUID(), name: '', kind: 'news', enabled: true, notify: false,
      root: { op: 'all', items: [] }, createdAt: stamp, updatedAt: stamp,
    };
  };

  const duplicate = (rule: AlertRule) => {
    // Opens unsaved: Cancel leaves nothing behind
    const copy = duplicateRule(rule, lists, new Date(), crypto.randomUUID());
    setEditing({ rule: copy, isNew: true, kindLocked: true });
  };

  const save = (rule: AlertRule) => {
    const next = applyRuleEdit(rules, rule, !!editing?.isNew);
    if (next) setRules(next);
    setEditing(null);
  };

  const remove = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
    setConfirmId(null);
  };

  return (
    <section id="alert-rules-settings" className={sectionClass}>
      <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
        <Bell className="w-5 h-5 text-amber-500" />
        <div>
          <h2 className="font-serif text-xl font-bold text-theme-text">Alert Rules</h2>
          <p className="font-serif text-xs text-theme-text-muted">Rules decide what appears in My Feed and what triggers a desktop notification.</p>
        </div>
      </div>

      <div className="space-y-2">
        {rules.map(rule => {
          const isEditing = editing?.rule.id === rule.id;
          const eventDriven = containsField(resolveRoot(rule, lists), 'watched');
          const source = rule.builtIn ? SOURCE_LABEL[rule.builtIn] : undefined;
          const terms = rule.builtIn ? builtInTerms(rule, lists).length : 0;
          return (
            <div key={rule.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-theme-border bg-theme-card">
                <div className="flex-1 min-w-[10rem]">
                  <div className="font-serif font-bold text-sm text-theme-text">
                    {rule.name || 'Untitled'} <span className="text-xs font-mono font-normal text-theme-text-muted">{rule.kind === 'news' ? 'news' : 'vulns'}{rule.builtIn ? ' · built-in' : ''}</span>
                  </div>
                  {source && (
                    <div className="text-xs font-serif text-theme-text-muted">
                      Uses {source.text}: {terms} {rule.builtIn === 'watched-cves' ? 'CVEs' : 'keywords'}
                      {source.anchor && (
                        <> · <a href={`#${source.anchor}`} className="text-theme-accent hover:underline" onClick={e => { e.preventDefault(); document.getElementById(source.anchor!)?.scrollIntoView({ behavior: 'smooth' }); }}>edit</a></>
                      )}
                    </div>
                  )}
                  <div className="text-xs font-mono text-theme-text-muted">
                    {eventDriven ? 'On change' : rule.kind === 'vulns' && !vulnItems ? 'Loading…' : `${countMatches(rule)} matches`}
                  </div>
                </div>
                <button className={toggleClass(rule.enabled)} onClick={() => patchRule(rule.id, { enabled: !rule.enabled })} aria-pressed={rule.enabled}>
                  {rule.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  className={toggleClass(rule.notify)}
                  onClick={() => toggleNotify(rule)}
                  disabled={!notificationsSupported()}
                  aria-pressed={rule.notify}
                  title={rule.notify ? 'Desktop notifications on' : 'Desktop notifications off'}
                >
                  🔔
                </button>
                <button className={smallButton} onClick={() => setEditing(isEditing ? null : { rule, isNew: false })}>{rule.builtIn ? 'View' : 'Edit'}</button>
                {rule.builtIn ? (
                  <button className={smallButton} onClick={() => duplicate(rule)}>Duplicate as custom rule</button>
                ) : confirmId === rule.id ? (
                  <button className={`${smallButton} !text-rose-500 !border-rose-500/50`} onClick={() => remove(rule.id)} onBlur={() => setConfirmId(null)} autoFocus>Confirm delete</button>
                ) : (
                  <button className={smallButton} onClick={() => setConfirmId(rule.id)}>Delete</button>
                )}
              </div>
              {isEditing && editing && (
                <RuleEditor
                  key={rule.id}
                  rule={editing.rule}
                  isNew={false}
                  lists={lists}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                  preview={countMatches}
                  previewLoading={!vulnItems}
                  onDuplicate={duplicate}
                  requestNotify={requestNotify}
                />
              )}
            </div>
          );
        })}
      </div>

      {editing?.isNew ? (
        <RuleEditor
          key={editing.rule.id}
          rule={editing.rule}
          isNew
          kindLocked={editing.kindLocked}
          lists={lists}
          onSave={save}
          onCancel={() => setEditing(null)}
          preview={countMatches}
          previewLoading={!vulnItems}
          onDuplicate={duplicate}
          requestNotify={requestNotify}
        />
      ) : (
        <button className={toggleClass(false)} onClick={() => setEditing({ rule: newRule(), isNew: true })}>+ New rule</button>
      )}

      <div className="space-y-2">
        <label className="flex flex-wrap items-center gap-2 text-xs font-mono text-theme-text-muted">
          At most one notification every
          <select
            aria-label="Notification gap in hours"
            className="bg-theme-bg border border-theme-border rounded px-2 py-1 text-theme-text"
            value={settings.alertGapHours}
            onChange={e => updateSettings({ alertGapHours: Number(e.target.value) })}
          >
            {ALERT_GAP_OPTIONS.map(h => <option key={h} value={h}>{h}</option>)}
          </select>
          hour(s)
        </label>
        <p className="text-xs font-serif text-theme-text-muted">
          {notificationsSupported()
            ? 'One combined notification per check. ThreatFeed must be open in a tab.'
            : 'This browser does not support notifications.'}
        </p>
        {permissionNote && <p className="text-xs font-serif text-rose-500">{permissionNote}</p>}
      </div>
    </section>
  );
};

