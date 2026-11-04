import React, { useState } from 'react';
import { Package, Plus, X } from 'lucide-react';
import { useSettings } from '../../context/SettingsContext';
import { parsePackageInput } from './npmPackagesForm';

/** The npm packages whose advisories and malware reports are matched on the Vulnerabilities page: `name` for any version, `name@1.2.3` for one version. */
export const NpmPackagesSettings: React.FC = () => {
  const { settings, updateSettings } = useSettings();
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState<string[]>([]);
  const packages = settings.npmPackages;

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const result = parsePackageInput(draft, packages);
    if (result.added.length) updateSettings({ npmPackages: [...packages, ...result.added] });
    setInvalid(result.invalid);
    // Keep the rejected entries in the box so they can be corrected
    setDraft(result.invalid.join(' '));
  };

  return (
    <section className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6">
      <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
        <Package className="w-5 h-5 text-rose-500" />
        <div>
          <h2 className="font-serif text-xl font-bold text-theme-text">My npm packages</h2>
          <p className="font-serif text-xs text-theme-text-muted">
            Packages you depend on. Add a name for any version, or name@1.2.3 to match advisories for that exact version.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted">Watched packages ({packages.length})</label>
        <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-theme-card border border-theme-border min-h-[46px] items-center">
          {packages.map((p) => (
            <span key={p} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold border bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30">
              <span>{p}</span>
              <button type="button" onClick={() => updateSettings({ npmPackages: packages.filter((x) => x !== p) })} className="hover:text-theme-text rounded p-0.5" title={`Remove ${p}`} aria-label={`Remove ${p}`}>
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {packages.length === 0 && <span className="text-xs font-mono text-theme-text-muted italic">No packages watched yet.</span>}
        </div>
        <form onSubmit={add} className="flex gap-2 max-w-md">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="lodash@4.17.15, @types/node"
            aria-label="npm packages to watch"
            aria-invalid={invalid.length > 0}
            className="flex-grow bg-theme-card border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
          />
          <button type="submit" disabled={!draft.trim()} className="px-3 py-2 rounded bg-theme-accent text-white font-mono text-xs font-bold disabled:opacity-50 flex items-center gap-1 hover:opacity-90 transition-opacity">
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </form>
        {invalid.length > 0 && (
          <p role="alert" className="text-xs font-mono text-rose-600 dark:text-rose-300">
            Not added: {invalid.join(', ')}. Use a lowercase npm name, optionally followed by @ and an exact version such as 4.17.15.
          </p>
        )}
      </div>

      <label className="flex items-start gap-2 text-xs font-serif text-theme-text cursor-pointer">
        <input
          type="checkbox"
          checked={settings.npmOsvLookup}
          onChange={(e) => updateSettings({ npmOsvLookup: e.target.checked })}
          className="mt-0.5"
        />
        <span>Also check full history with OSV.dev — sends your package names and versions to Google's OSV service.</span>
      </label>
    </section>
  );
};
