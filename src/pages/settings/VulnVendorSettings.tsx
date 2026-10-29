import React, { useMemo, useState } from 'react';
import { useSettings } from '../../context/SettingsContext';
import { useVulns } from '../../hooks/useVulns';
import { ChevronDown, Plus, Search, ShieldAlert, X } from 'lucide-react';

/**
 * Which vendors from the CISA KEV catalog appear on the Vulnerabilities page. Removing a vendor (its x)
 * moves it to the collapsed "Hidden vendors" list, where it can be restored.
 */
export const VulnVendorSettings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const vulns = useVulns();
  const [showHidden, setShowHidden] = useState(false);
  const [query, setQuery] = useState('');

  // Every vendor in the catalog with its number of entries, most entries first
  const vendors = useMemo(() => {
    const counts = new Map<string, number>();
    for (const k of vulns?.kev ?? []) counts.set(k.vendor, (counts.get(k.vendor) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [vulns]);
  const hidden = new Set(settings.hiddenVulnVendors);
  const q = query.trim().toLowerCase();
  const matches = (v: string) => !q || v.toLowerCase().includes(q);
  const visible = vendors.filter(([v]) => !hidden.has(v));
  const count = (v: string) => vendors.find(([name]) => name === v)?.[1];

  const hide = (vendor: string) => updateSettings({ hiddenVulnVendors: [...settings.hiddenVulnVendors, vendor] });
  const restore = (vendor: string) => updateSettings({ hiddenVulnVendors: settings.hiddenVulnVendors.filter((v) => v !== vendor) });

  return (
    <section className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
        <ShieldAlert className="w-5 h-5 text-rose-500" />
        <div>
          <h2 className="font-serif text-xl font-bold text-theme-text">Vulnerability Vendor Filter</h2>
          <p className="font-serif text-xs text-theme-text-muted">
            Vendors in the CISA Known Exploited Vulnerabilities catalog. Remove the ones you don't run to keep them off the Vulns page.
          </p>
        </div>
      </div>

      {vendors.length === 0 ? (
        <p className="text-xs font-serif text-theme-text-muted">The vendor list arrives with the server snapshot (Data Source above).</p>
      ) : (
        <>
          <label className="flex items-center gap-1.5 max-w-md bg-theme-card border border-theme-border rounded px-3 py-2 text-xs">
            <Search className="w-3.5 h-3.5 text-theme-text-muted" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a vendor…" className="flex-grow bg-transparent font-mono text-theme-text focus:outline-none" />
          </label>

          <div className="space-y-3">
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted">
              Shown vendors ({visible.length})
            </label>
            <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-theme-card border border-theme-border min-h-[50px] max-h-72 overflow-y-auto items-center">
              {visible.filter(([v]) => matches(v)).map(([v, n]) => (
                <span key={v} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/10 text-rose-600 dark:text-rose-300 border border-rose-500/30">
                  <span>{v}</span>
                  <span className="font-normal opacity-70">{n}</span>
                  <button type="button" onClick={() => hide(v)} className="hover:text-theme-text rounded p-0.5" title={`Hide ${v} on the Vulns page`} aria-label={`Hide ${v}`}>
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              {visible.length === 0 && <span className="text-xs font-mono text-theme-text-muted italic">Every vendor is hidden.</span>}
            </div>
          </div>

          <div className="rounded-lg border border-theme-border">
            <button
              type="button"
              onClick={() => setShowHidden(!showHidden)}
              aria-expanded={showHidden}
              className="w-full flex items-center justify-between px-3 py-2.5 text-xs font-mono uppercase tracking-wider text-theme-text-muted hover:text-theme-text"
            >
              <span>Hidden vendors ({settings.hiddenVulnVendors.length})</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${showHidden ? 'rotate-180' : ''}`} />
            </button>
            {showHidden && (
              <div className="px-3 pb-3 space-y-3">
                <div className="flex flex-wrap gap-2 items-center">
                  {settings.hiddenVulnVendors.filter(matches).map((v) => (
                    <span key={v} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono bg-theme-card text-theme-text-muted border border-theme-border">
                      <span className="line-through decoration-theme-text-muted/50">{v}</span>
                      {count(v) !== undefined && <span className="opacity-70">{count(v)}</span>}
                      <button type="button" onClick={() => restore(v)} className="hover:text-theme-accent rounded p-0.5" title={`Show ${v} again`} aria-label={`Show ${v} again`}>
                        <Plus className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  {settings.hiddenVulnVendors.length === 0 && <span className="text-xs font-mono text-theme-text-muted italic">No hidden vendors.</span>}
                </div>
                {settings.hiddenVulnVendors.length > 0 && (
                  <button type="button" onClick={() => updateSettings({ hiddenVulnVendors: [] })} className="text-xs font-mono text-theme-accent hover:underline">
                    Show all vendors again
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
};
