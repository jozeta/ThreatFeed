import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Article, MsrcData, VulnData } from '../types';
import { useFeeds } from '../context/FeedContext';
import { useSettings } from '../context/SettingsContext';
import { useMsrc, useVulns } from '../hooks/useVulns';
import { goToPage, parseHash, setHashParams } from '../hooks/useHashRoute';
import { canonicalVendor, fetchWikiSummary, vendorSummary, VendorSummary, WikiSummary } from '../services/intelligence/vendor';
import { severityFromScore } from '../services/intelligence/vulns';
import { formatRelativeTime } from '../utils/date';
import { SectionTitle } from '../pages/incidents/shared';
import { StackedBars } from '../pages/vulns/StackedBars';
import { CveButton, EpssValue, SEVERITY_FILL, SeverityPill, StatCards } from '../pages/vulns/shared';
import { CvePanelHost } from '../pages/vulns/CvePanelHost';
import { X, ExternalLink, Skull, Layers, EyeOff, Building2 } from 'lucide-react';

const NEWS_SHOWN = 10;
const NEW_CVES_SHOWN = 10;

// Pages that already open a CVE panel from ?cve=; elsewhere the vendor panel brings its own
const PAGES_WITH_CVE_PANEL = new Set(['vulnerabilities', 'trends', 'actors', 'feed']);

const toggleClass = (on: boolean) =>
  `flex items-center gap-1 px-2 py-1 rounded border text-xs font-mono font-bold transition-colors ${on ? 'bg-theme-accent/15 border-theme-accent/40 text-theme-accent' : 'border-theme-border text-theme-text-muted hover:text-theme-text'}`;

/** KEV entries per CVSS band as horizontal bars, in the severity colours used across the Vulnerabilities page */
const BandChart: React.FC<{ bands: VendorSummary['cvssBands'] }> = ({ bands }) => {
  const rows = bands.filter((b) => b.count > 0);
  const max = Math.max(1, ...rows.map((b) => b.count));
  const width = 420;
  const rowHeight = 20;
  const labelWidth = 130;
  const barSpace = width - labelWidth - 40;
  if (!rows.length) return <p className="text-xs font-serif italic text-theme-text-muted">No KEV entries to score.</p>;
  return (
    <svg viewBox={`0 0 ${width} ${rows.length * rowHeight}`} className="w-full max-w-lg" role="img" aria-label="Known exploited vulnerabilities by CVSS score">
      {rows.map((b, i) => {
        const y = i * rowHeight;
        const w = Math.max(2, (b.count / max) * barSpace);
        return (
          <g key={b.id}>
            <title>{`${b.label}: ${b.count}`}</title>
            <text x={labelWidth - 6} y={y + rowHeight / 2} textAnchor="end" dominantBaseline="central" className="fill-theme-text font-mono" fontSize={11}>{b.label}</text>
            <rect x={labelWidth} y={y + 4} width={w} height={rowHeight - 8} rx={2} className={SEVERITY_FILL[b.id]} />
            <text x={labelWidth + w + 4} y={y + rowHeight / 2} dominantBaseline="central" className="fill-theme-text-muted font-mono" fontSize={11}>{b.count}</text>
          </g>
        );
      })}
    </svg>
  );
};

const ArticleList: React.FC<{ articles: Article[]; onOpen: (a: Article) => void }> = ({ articles, onOpen }) => (
  <ul className="space-y-2">
    {articles.map((a) => (
      <li key={a.id}>
        <button onClick={() => onOpen(a)} className="text-left font-serif text-sm font-bold text-theme-text hover:text-theme-accent">{a.title}</button>
        <p className="text-[11px] font-mono text-theme-text-muted">{a.sourceName} · {formatRelativeTime(a.publishedAt)}</p>
      </li>
    ))}
  </ul>
);

/** The Wikipedia lead, as plain text; nothing at all when there is no fitting article */
const WikiIntro: React.FC<{ vendor: string }> = ({ vendor }) => {
  const [wiki, setWiki] = useState<WikiSummary | null>(null);
  useEffect(() => {
    let cancelled = false;
    setWiki(null);
    fetchWikiSummary(vendor).then((w) => { if (!cancelled) setWiki(w); });
    return () => { cancelled = true; };
  }, [vendor]);
  if (!wiki) return null;
  return (
    <div className="flex gap-4">
      {wiki.thumbnail && <img src={wiki.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-16 h-16 object-contain rounded bg-white/80 p-1 shrink-0" />}
      <div className="min-w-0">
        {wiki.description && <p className="text-[11px] font-mono uppercase tracking-wider text-theme-text-muted">{wiki.description}</p>}
        <p className="text-sm font-serif text-theme-text leading-relaxed line-clamp-6">{wiki.extract}</p>
        <a href={wiki.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs font-mono text-theme-accent hover:underline">
          Wikipedia <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

interface VendorPanelProps {
  summary: VendorSummary;
  inStack: boolean;
  hidden: boolean;
  onToggleStack: () => void;
  onToggleHidden?: () => void; // only for vendors the KEV catalog lists by name
  onOpenCve: (cve: string) => void;
  onOpenProduct: (vendor: string, product: string) => void;
  onOpenArticle: (a: Article) => void;
  onClose: () => void;
  loading: boolean;
}

/** One vendor at a glance: what Wikipedia says, its KEV history, new CVEs, news and advisories. */
export const VendorPanel: React.FC<VendorPanelProps> = ({ summary: s, inStack, hidden, onToggleStack, onToggleHidden, onOpenCve, onOpenProduct, onOpenArticle, onClose, loading }) => {
  return (
    <div className="fixed inset-0 z-[55] flex justify-end modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label={s.name}>
      <div className="w-full max-w-xl h-full overflow-y-auto modal-glass [--glass-base:var(--color-bg)] !border-y-0 !border-r-0 p-6 space-y-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-mono font-bold uppercase tracking-widest text-theme-text-muted flex items-center gap-1"><Building2 className="w-3 h-3" /> Vendor</p>
            <h2 className="font-serif text-2xl font-extrabold text-theme-text break-words">{s.name}</h2>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button onClick={onToggleStack} aria-pressed={inStack} className={toggleClass(inStack)} title="My stack: boosts matching news and powers the stack filters and alerts">
                <Layers className="w-3.5 h-3.5" /> {inStack ? 'In my stack' : 'Add to my stack'}
              </button>
              {onToggleHidden && (
                <button onClick={onToggleHidden} aria-pressed={hidden} className={toggleClass(hidden)} title="Leave this vendor out of the KEV views on the Vulnerabilities page">
                  <EyeOff className="w-3.5 h-3.5" /> {hidden ? 'Hidden on Vulns page' : 'Hide on Vulns page'}
                </button>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-theme-text-muted hover:text-theme-text shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <WikiIntro vendor={s.name} />

        {loading ? <p className="text-xs font-mono text-theme-text-muted animate-pulse">Loading vulnerability data…</p> : (
          <>
            <StatCards columns="sm:grid-cols-3" stats={[
              { label: 'In KEV', value: s.kevTotal, note: s.kevTotal ? 'known exploited (CISA)' : 'none known exploited' },
              { label: 'Added, 30 days', value: s.kevLast30, note: `${s.kevLast90} in 90 days` },
              { label: 'Ransomware', value: s.ransomwareLinked, note: s.kevTotal ? `${Math.round((s.ransomwareLinked / s.kevTotal) * 100)}% of KEV` : '' },
              { label: 'CVSS', value: s.avgCvss?.toFixed(1) ?? '—', note: s.maxCvss !== undefined ? `average · max ${s.maxCvss.toFixed(1)}` : 'no scores' },
              { label: 'New CVEs', value: s.newCves.length, note: 'CVSS ≥ 7, last 14 days' },
              { label: 'Public exploits', value: s.exploitsPublic, note: 'Metasploit, Nuclei, PoCs' },
            ]} />

            {s.patchTuesday && (
              <div>
                <SectionTitle>Patch Tuesday · {s.patchTuesday.title}</SectionTitle>
                <StatCards columns="sm:grid-cols-4" stats={[
                  { label: 'CVEs', value: s.patchTuesday.total, note: `released ${s.patchTuesday.released}` },
                  { label: 'Critical', value: s.patchTuesday.critical },
                  { label: 'Zero-days', value: s.patchTuesday.exploited, note: `${s.patchTuesday.disclosed} publicly disclosed` },
                  { label: 'RCE', value: s.patchTuesday.rce, note: 'remote code execution' },
                ]} />
                <button onClick={() => goToPage('vulnerabilities', 'patch')} className="mt-2 text-xs font-mono text-theme-accent hover:underline">Open the Patch Tuesday tab →</button>
              </div>
            )}

            {s.kevTotal > 0 && (
              <>
                <div>
                  <SectionTitle>Added to KEV per month (last 12 months)</SectionTitle>
                  <StackedBars
                    ariaLabel={`${s.name} vulnerabilities added to KEV per month`}
                    unit="added"
                    buckets={s.kevPerMonth.map((m) => ({
                      label: m.month,
                      short: m.month.slice(2),
                      segments: [
                        { name: 'ransomware-linked', value: m.ransomware, className: 'fill-rose-600' },
                        { name: 'other', value: m.total - m.ransomware, className: 'fill-rose-400/50' },
                      ],
                    }))}
                  />
                </div>
                <div>
                  <SectionTitle>KEV by CVSS score</SectionTitle>
                  <BandChart bands={s.cvssBands} />
                </div>
                <div>
                  <SectionTitle>Most exploited products</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    {s.topProducts.map((p) => (
                      <button
                        key={`${p.vendor} ${p.product}`}
                        onClick={() => onOpenProduct(p.vendor, p.product)}
                        title={`Show ${p.vendor} ${p.product} in the KEV list`}
                        className="px-2 py-1 rounded border border-theme-border bg-theme-surface text-xs font-mono text-theme-text hover:border-theme-accent hover:text-theme-accent"
                      >
                        {/* Products matched through NVD under another catalog vendor (e.g. Android's kernel for Linux) say whose */}
                        {p.vendor.toLowerCase() === s.name.toLowerCase() ? p.product : `${p.vendor} ${p.product}`} <span className="text-theme-text-muted">{p.count}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <SectionTitle>Recently added to KEV</SectionTitle>
                  <ul className="divide-y divide-theme-border/60 text-xs">
                    {s.recentKev.map((k) => (
                      <li key={k.cve} className="py-2 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2 font-mono">
                          <CveButton cve={k.cve} onOpen={onOpenCve} />
                          <SeverityPill severity={k.cvss === undefined ? undefined : severityFromScore(k.cvss)} score={k.cvss} />
                          <span className="text-theme-text-muted">EPSS <EpssValue epss={k.epss} /></span>
                          {k.ransomware && <Skull className="w-3 h-3 text-rose-500" aria-label="Used by ransomware" />}
                          <span className="ml-auto text-theme-text-muted">{k.dateAdded}</span>
                        </div>
                        <p className="font-serif text-theme-text">{k.name}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            <div>
              <SectionTitle>New CVEs, last 14 days ({s.newCves.length})</SectionTitle>
              {s.newCves.length ? (
                <ul className="divide-y divide-theme-border/60 text-xs">
                  {s.newCves.slice(0, NEW_CVES_SHOWN).map((c) => (
                    <li key={c.id} className="py-2 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 font-mono">
                        <CveButton cve={c.id} onOpen={onOpenCve} />
                        <SeverityPill severity={c.severity} score={c.score} />
                        <span className="ml-auto text-theme-text-muted">{c.published.slice(0, 10)}</span>
                      </div>
                      {c.description ? <p className="font-serif text-theme-text line-clamp-2">{c.description}</p> : c.products && <p className="font-mono text-theme-text-muted">{c.products.join(', ')}</p>}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs font-serif italic text-theme-text-muted">No critical or high CVEs for {s.name} in the last two weeks.</p>}
              {s.newCves.length > NEW_CVES_SHOWN && <p className="mt-1 text-[11px] font-mono text-theme-text-muted">…and {s.newCves.length - NEW_CVES_SHOWN} more</p>}
            </div>
          </>
        )}

        <div>
          <SectionTitle>Latest news ({s.newsMentions.length})</SectionTitle>
          {s.newsMentions.length
            ? <ArticleList articles={s.newsMentions.slice(0, NEWS_SHOWN)} onOpen={onOpenArticle} />
            : <p className="text-xs font-serif italic text-theme-text-muted">No articles in your feeds mention {s.name}.</p>}
        </div>

        {s.advisoryFeedArticles.length > 0 && (
          <div>
            <SectionTitle>Advisories &amp; vendor feeds ({s.advisoryFeedArticles.length})</SectionTitle>
            <ArticleList articles={s.advisoryFeedArticles.slice(0, NEWS_SHOWN)} onOpen={onOpenArticle} />
          </div>
        )}

        <p className="text-[10px] font-mono text-theme-text-muted">
          KEV entries match the catalog's vendor name or NVD's affected products; news matches the name as a whole word.
        </p>
      </div>
    </div>
  );
};

/** Patch Tuesday data loads only for Microsoft */
const WithMsrc: React.FC<{ children: (msrc: MsrcData | null) => React.ReactNode }> = ({ children }) => <>{children(useMsrc())}</>;

interface HostProps {
  vendor: string;
  cve: string; // a CVE opened on top of the panel
  page: string;
  covered: boolean; // the reader is open on top: Escape belongs to it
  onOpenArticle: (a: Article) => void;
}

/** Mounted once by the app for ?vendor=…; closing removes the parameter (and any CVE opened from the panel) */
const VendorPanelHost: React.FC<HostProps> = (props) => {
  const vulns = useVulns();
  return canonicalVendor(props.vendor) === 'Microsoft'
    ? <WithMsrc>{(msrc) => <VendorView {...props} vulns={vulns} msrc={msrc} />}</WithMsrc>
    : <VendorView {...props} vulns={vulns} />;
};

const VendorView: React.FC<HostProps & { vulns: VulnData | null; msrc?: MsrcData | null }> = ({ vendor, cve, vulns, msrc, page, covered, onOpenArticle }) => {
  const { articles } = useFeeds();
  const { settings, updateSettings } = useSettings();
  const summary = useMemo(() => vendorSummary(vendor, vulns, articles, msrc), [vendor, vulns, articles, msrc]);

  const close = () => setHashParams({ vendor: '', cve: '' });
  const coveredRef = useRef(covered);
  coveredRef.current = covered;
  // Capture phase: this runs before a CVE panel on top closes itself, so it can tell it was there. When the
  // vendor panel is topmost (it sits above actor, malware and group panels) the key stops here, so a page
  // panel underneath stays open for the next Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || coveredRef.current || parseHash(window.location.hash).params.get('cve')) return;
      e.stopPropagation();
      setHashParams({ vendor: '' });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const stack = settings.stackKeywords;
  const inStack = stack.some((k) => k.toLowerCase() === summary.name.toLowerCase());
  const hiddenName = summary.kevVendor;
  const hidden = Boolean(hiddenName && settings.hiddenVulnVendors.includes(hiddenName));
  const read = (a: Article) => { close(); onOpenArticle(a); };

  return (
    <>
      <VendorPanel
        summary={summary}
        loading={!vulns}
        inStack={inStack}
        hidden={hidden}
        onToggleStack={() => updateSettings({ stackKeywords: inStack ? stack.filter((k) => k.toLowerCase() !== summary.name.toLowerCase()) : [...stack, summary.name] })}
        onToggleHidden={hiddenName ? () => updateSettings({
          hiddenVulnVendors: hidden ? settings.hiddenVulnVendors.filter((v) => v !== hiddenName) : [...settings.hiddenVulnVendors, hiddenName],
        }) : undefined}
        onOpenCve={(id) => setHashParams({ cve: id }, true)}
        onOpenProduct={(v, p) => goToPage('vulnerabilities', 'kev', new URLSearchParams({ kevVendor: v, product: `${v} ${p}`, days: '0' }))}
        onOpenArticle={read}
        onClose={close}
      />
      {cve && !PAGES_WITH_CVE_PANEL.has(page) && (
        <CvePanelHost cve={cve} articles={articles} onOpenArticle={read} onClose={() => setHashParams({ cve: '' })} />
      )}
    </>
  );
};

export default VendorPanelHost;
