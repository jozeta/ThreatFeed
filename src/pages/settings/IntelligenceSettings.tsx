import React, { useMemo } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useFeeds } from '../../context/FeedContext';
import { KeywordListEditor } from './KeywordListEditor';
import { Database, Server, EyeOff } from 'lucide-react';

const sectionClass = 'bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6';
const heading = (icon: React.ReactNode, title: string, text: string) => (
  <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
    {icon}
    <div>
      <h2 className="font-serif text-xl font-bold text-theme-text">{title}</h2>
      <p className="font-serif text-xs text-theme-text-muted">{text}</p>
    </div>
  </div>
);
const toggleClass = (on: boolean) =>
  `press px-3 py-1.5 rounded border text-xs font-mono transition-colors ${on ? 'bg-theme-accent text-white border-theme-accent font-bold' : 'bg-theme-card border-theme-border text-theme-text-muted hover:text-theme-text'}`;

export const IntelligenceSettings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const { feeds, cveIntel } = useFeeds();
  const categories = useMemo(() => Array.from(new Set(feeds.map((f) => f.category))).filter(Boolean).sort(), [feeds]);

  const toggleCategory = (category: string) => {
    const hidden = settings.frontPageHiddenCategories;
    updateSettings({ frontPageHiddenCategories: hidden.includes(category) ? hidden.filter((c) => c !== category) : [...hidden, category] });
  };

  return (
    <>
      <section className={sectionClass}>
        {heading(<Database className="w-5 h-5 text-theme-accent" />, 'Data Source', 'Where articles come from.')}
        <div className="flex flex-wrap gap-2">
          <button className={toggleClass(settings.dataSource !== 'live')} onClick={() => updateSettings({ dataSource: 'snapshot' })}>
            Server snapshot + live (recommended)
          </button>
          <button className={toggleClass(settings.dataSource === 'live')} onClick={() => updateSettings({ dataSource: 'live' })}>
            Live only (through the CORS gateway)
          </button>
        </div>
        <p className="text-xs font-serif text-theme-text-muted">
          The published site carries a snapshot of every default feed, rebuilt every 30 minutes on GitHub, plus CISA KEV and EPSS data for
          the CVEs mentioned. With the snapshot, only feeds you added yourself are fetched live. {Object.keys(cveIntel).length > 0
            ? `Exploitation data is loaded for ${Object.keys(cveIntel).length} CVEs.`
            : 'No snapshot has been loaded yet (local development builds have none unless you run "npm run snapshot").'}
        </p>
      </section>

      <section id="stack-settings" className={sectionClass}>
        {heading(<Server className="w-5 h-5 text-sky-500" />, 'My Stack', 'Products and vendors you actually run. Matching stories get a "Your stack" badge, rank higher, and get their own briefing section.')}
        <KeywordListEditor
          label="Products in your stack"
          keywords={settings.stackKeywords}
          onChange={(stackKeywords) => updateSettings({ stackKeywords })}
          placeholder="e.g. FortiGate, Okta, Exchange, Kubernetes…"
          emptyText="No products yet."
          chipClassName="bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30"
        />
      </section>

      <section className={sectionClass}>
        {heading(<EyeOff className="w-5 h-5 text-theme-text-muted" />, 'Mute Rules', 'Cut the noise: muted terms hide articles everywhere (bookmarks excepted); hidden categories only leave the newspaper front page.')}
        <KeywordListEditor
          label="Muted keywords"
          keywords={settings.mutedKeywords}
          onChange={(mutedKeywords) => updateSettings({ mutedKeywords })}
          placeholder="e.g. deal, giveaway, sponsored…"
          emptyText="Nothing muted."
          chipClassName="bg-theme-surface text-theme-text-muted border-theme-border"
        />
        <div className="space-y-2">
          <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted">Categories on the front page</label>
          <div className="flex flex-wrap gap-2">
            {categories.map((category) => {
              const shown = !settings.frontPageHiddenCategories.includes(category);
              return (
                <button key={category} onClick={() => toggleCategory(category)} className={toggleClass(shown)} title={shown ? 'Click to hide from the front page' : 'Click to show on the front page'}>
                  {category}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
};
