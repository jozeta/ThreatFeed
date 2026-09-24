import React, { useRef } from 'react';
import { useSettings } from '../context/SettingsContext';
import { useFeeds } from '../context/FeedContext';
import { exportAllThreatFeedData, importThreatFeedData } from '../services/storage/indexeddb';
import {
  Settings as SettingsIcon,
  Sun,
  Moon,
  Monitor,
  Palette,
  Database,
  Printer,
  Download,
  Upload,
  RotateCcw,
  Sliders,
  Check,
  Type,
  Maximize2,
  Shield,
  Eye
} from 'lucide-react';
import { ArticleSpacing, BorderStyle, ContainerWidth, FontFamily, ImageBehavior, LayoutMode, ProxyMode, ThemeMode } from '../types';

const ACCENT_PRESETS = [
  { name: 'Crimson', color: '#e11d48' },
  { name: 'Amber', color: '#f59e0b' },
  { name: 'Emerald', color: '#10b981' },
  { name: 'Cyber Cyan', color: '#06b6d4' },
  { name: 'Electric Blue', color: '#3b82f6' },
  { name: 'Violet', color: '#8b5cf6' },
  { name: 'Rose Gold', color: '#f43f5e' },
];

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, resetSettings } = useSettings();
  const { feeds, articles } = useFeeds();

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Full backup JSON export
  const handleExportJSON = async () => {
    const backup = await exportAllThreatFeedData();
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backup, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `threatfeed-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  // Full backup JSON restore
  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        await importThreatFeedData(parsed);
        alert('ThreatFeed backup successfully restored! Refreshing page...');
        window.location.reload();
      } catch (err: any) {
        alert(`Failed to import backup: ${err.message || 'Invalid format'}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="main-content-container mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-theme-border">
        <div>
          <h1 className="font-serif text-3xl font-extrabold text-theme-text flex items-center gap-2.5">
            <SettingsIcon className="w-6 h-6 text-theme-accent" />
            <span>Preferences & Newspaper Customization</span>
          </h1>
          <p className="font-serif text-sm text-theme-text-muted mt-1">
            Configure typography fonts (Arial vs Serif), layout widths, asymmetric editorial weights, and feed proxies.
          </p>
        </div>

        <button
          onClick={resetSettings}
          className="self-start sm:self-auto px-3 py-1.5 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-theme-text font-mono text-xs flex items-center gap-1.5 transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Appearance</span>
        </button>
      </div>

      {/* LIVE PREVIEW COMPONENT */}
      <div className="p-6 rounded-xl bg-theme-surface border border-theme-border shadow-sm">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-theme-border">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-theme-accent" />
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-theme-text">
              Live Newspaper Design Preview
            </span>
          </div>
          <span className="font-mono text-[11px] text-theme-text-muted">
            Updates in real-time
          </span>
        </div>

        <div className="p-4 rounded-lg bg-theme-card border border-theme-border/60">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="font-mono text-[10px] font-bold text-theme-accent uppercase flex items-center gap-1">
              <Shield className="w-3 h-3" />
              CYBER DISPATCH · CISA TELEMETRY
            </span>
            <span className="font-mono text-[11px] text-theme-text-muted">Just now</span>
          </div>
          <h3 className="font-serif text-xl sm:text-2xl font-bold text-theme-text mb-2 leading-tight">
            Attackers Target Zero-Day In Multi-Cloud Edge Appliances
          </h3>
          <p className="font-serif text-sm text-theme-text-muted leading-relaxed line-clamp-2">
            Security researchers discover ongoing automated exploitation campaigns weaponizing chained authentication bypass primitives across enterprise gateways.
          </p>
          <div className="mt-3 pt-2 border-t border-theme-border/50 flex items-center gap-2 font-mono text-[10px] text-theme-text-muted">
            <span className="px-1.5 py-0.5 rounded bg-theme-surface border border-theme-border uppercase">#Zero-Day</span>
            <span className="px-1.5 py-0.5 rounded bg-theme-surface border border-theme-border uppercase">#CVE-2026-9041</span>
            <span className="ml-auto text-theme-accent font-semibold">Active Font: {settings.fontFamily.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* SECTION 1: TYPOGRAPHY & FONTS */}
      <section className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
          <Type className="w-5 h-5 text-theme-accent" />
          <h2 className="font-serif text-xl font-bold text-theme-text">Typography & Font Family</h2>
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
            Editorial Font Style (Headlines & Body)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                id: 'sans' as FontFamily,
                label: 'Arial / Modern Clean Sans',
                fontPreview: 'font-sans font-bold',
                desc: 'Clean, crisp modern broadsheet newspaper (Arial / Helvetica)',
              },
              {
                id: 'serif' as FontFamily,
                label: 'Classic Editorial Serif',
                fontPreview: 'font-serif font-bold',
                desc: 'Traditional broadsheet newspaper (Newsreader / Georgia)',
              },
              {
                id: 'mono' as FontFamily,
                label: 'Technical Monospace',
                fontPreview: 'font-mono font-bold',
                desc: 'Cyber intelligence terminal style (JetBrains Mono / Code)',
              },
              {
                id: 'system' as FontFamily,
                label: 'System UI',
                fontPreview: 'font-sans font-medium',
                desc: 'Native operating system default interface font',
              },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => updateSettings({ fontFamily: f.id })}
                className={`p-3.5 rounded-lg border text-left transition-all ${
                  settings.fontFamily === f.id
                    ? 'border-theme-accent bg-theme-accent-subtle text-theme-text font-bold shadow-sm'
                    : 'border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text'
                }`}
              >
                <div className={`text-base text-theme-text mb-1 ${f.fontPreview}`}>
                  {f.label}
                </div>
                <div className="text-[11px] font-sans opacity-70 leading-relaxed">
                  {f.desc}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Headline Typography Scale */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
              Headline Typography Scale
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'normal', label: 'Normal' },
                { id: 'prominent', label: 'Prominent' },
                { id: 'dramatic', label: 'Dramatic' },
              ].map((scale) => (
                <button
                  key={scale.id}
                  onClick={() => updateSettings({ headlineScale: scale.id as any })}
                  className={`py-2 px-2 text-center rounded border font-mono text-xs uppercase transition-colors ${
                    settings.headlineScale === scale.id
                      ? 'border-theme-accent bg-theme-accent-subtle text-theme-accent font-bold'
                      : 'border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text'
                  }`}
                >
                  {scale.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
              Base Body Font Size
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(['sm', 'base', 'lg', 'xl'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => updateSettings({ fontSize: size })}
                  className={`py-2 px-1 text-center rounded border font-mono text-xs uppercase transition-colors ${
                    settings.fontSize === size
                      ? 'border-theme-accent bg-theme-accent-subtle text-theme-accent font-bold'
                      : 'border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: NEWSPAPER WIDTH & ASYMMETRIC SIZING */}
      <section className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
          <Maximize2 className="w-5 h-5 text-theme-accent" />
          <h2 className="font-serif text-xl font-bold text-theme-text">Newspaper Page Width & Dimensions</h2>
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
            Reading Width (Applies to Newspaper, List & Thumbnail Views)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { id: 'compact' as ContainerWidth, label: 'Compact Column', desc: '1024px · Narrow focused reading' },
              { id: 'standard' as ContainerWidth, label: 'Standard Balanced', desc: '1216px · Modern editorial width' },
              { id: 'wide' as ContainerWidth, label: 'Wide Broadsheet', desc: '1472px · Traditional sprawling paper' },
              { id: 'full' as ContainerWidth, label: 'Ultrawide Full', desc: '98% · Wall-to-wall widescreen' },
            ].map((w) => (
              <button
                key={w.id}
                onClick={() => updateSettings({ containerWidth: w.id })}
                className={`p-3 rounded-lg border text-left transition-all ${
                  settings.containerWidth === w.id
                    ? 'border-theme-accent bg-theme-accent-subtle text-theme-text font-bold shadow-sm'
                    : 'border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text'
                }`}
              >
                <div className="font-mono text-xs font-bold uppercase">{w.label}</div>
                <div className="text-[11px] font-sans opacity-70 mt-0.5">{w.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Spacing & Borders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
              Article Spacing & Padding
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['compact', 'comfortable', 'spacious'] as ArticleSpacing[]).map((spacing) => (
                <button
                  key={spacing}
                  onClick={() => updateSettings({ spacing })}
                  className={`py-2 px-2 text-center rounded border font-mono text-xs uppercase transition-colors ${
                    settings.spacing === spacing
                      ? 'border-theme-accent bg-theme-accent-subtle text-theme-accent font-bold'
                      : 'border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text'
                  }`}
                >
                  {spacing}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
              Border Style & Column Rules
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'none' as BorderStyle, label: 'None' },
                { id: 'subtle' as BorderStyle, label: 'Subtle (1px)' },
                { id: 'strong' as BorderStyle, label: 'Strong Ink (2px)' },
              ].map((b) => (
                <button
                  key={b.id}
                  onClick={() => updateSettings({ borderStyle: b.id })}
                  className={`py-2 px-1 text-center rounded border font-mono text-xs uppercase transition-colors ${
                    settings.borderStyle === b.id
                      ? 'border-theme-accent bg-theme-accent-subtle text-theme-accent font-bold'
                      : 'border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text'
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Image Behavior & Density */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
              Image Sizing & Presentation
            </label>
            <select
              value={settings.imageBehavior}
              onChange={(e) => updateSettings({ imageBehavior: e.target.value as ImageBehavior })}
              className="w-full bg-theme-card border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
            >
              <option value="large">Large Panoramic Imagery</option>
              <option value="normal">Normal (Standard Aspect Ratios)</option>
              <option value="compact">Compact Thumbnails</option>
              <option value="hidden">Hide All Images (Text-Only Broadsheet)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
              Default View Layout
            </label>
            <select
              value={settings.layout}
              onChange={(e) => updateSettings({ layout: e.target.value as LayoutMode })}
              className="w-full bg-theme-card border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
            >
              <option value="newspaper">Newspaper (Asymmetric Editorial Hierarchy)</option>
              <option value="list-thumbnails">List + Thumbnails (Modern Feed)</option>
              <option value="list">Compact List (Fast Traditional Scanner)</option>
            </select>
          </div>
        </div>
      </section>

      {/* SECTION 3: THEME & COLOR ACCENTS */}
      <section className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
          <Palette className="w-5 h-5 text-theme-accent" />
          <h2 className="font-serif text-xl font-bold text-theme-text">Color Scheme & Accents</h2>
        </div>

        {/* Theme mode */}
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
            Base Theme
          </label>
          <div className="grid grid-cols-3 gap-3 max-w-md">
            {[
              { id: 'dark' as ThemeMode, label: 'Dark Mode', icon: <Moon className="w-4 h-4" /> },
              { id: 'light' as ThemeMode, label: 'Light Mode', icon: <Sun className="w-4 h-4" /> },
              { id: 'system' as ThemeMode, label: 'System', icon: <Monitor className="w-4 h-4" /> },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => updateSettings({ theme: item.id })}
                className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg border text-xs font-mono transition-all ${
                  settings.theme === item.id
                    ? 'border-theme-accent bg-theme-accent-subtle text-theme-accent font-bold shadow-sm'
                    : 'border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text'
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Accent Color Picker */}
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
            Link Highlight & Accent Color
          </label>
          <div className="flex flex-wrap items-center gap-2.5">
            {ACCENT_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => updateSettings({ accentColor: p.color })}
                title={p.name}
                className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 relative border-2"
                style={{
                  backgroundColor: p.color,
                  borderColor: settings.accentColor.toLowerCase() === p.color.toLowerCase() ? '#ffffff' : 'transparent',
                }}
              >
                {settings.accentColor.toLowerCase() === p.color.toLowerCase() && (
                  <Check className="w-4 h-4 text-white stroke-[3]" />
                )}
              </button>
            ))}

            {/* Custom Hex Color Picker */}
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-theme-border">
              <input
                type="color"
                value={settings.accentColor}
                onChange={(e) => updateSettings({ accentColor: e.target.value })}
                className="w-8 h-8 rounded cursor-pointer border border-theme-border bg-transparent"
                title="Custom color"
              />
              <span className="font-mono text-xs text-theme-text-muted uppercase">
                {settings.accentColor}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: INGESTION & GATEWAY */}
      <section className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
          <Sliders className="w-5 h-5 text-theme-accent" />
          <h2 className="font-serif text-xl font-bold text-theme-text">Network & RSS Ingestion</h2>
        </div>

        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-1">
            Browser Fetch & CORS Handling Mode
          </label>
          <p className="text-xs font-serif text-theme-text-muted mb-3">
            Since ThreatFeed has no backend server, cross-origin feeds require a CORS gateway for direct browser reading.
          </p>

          <div className="space-y-2">
            {[
              {
                id: 'allorigins' as ProxyMode,
                name: 'AllOrigins Gateway (api.allorigins.win)',
                desc: 'Open-source CORS gateway. Recommended for complete cross-origin feed access without running any backend.',
              },
              {
                id: 'direct' as ProxyMode,
                name: 'Direct Browser Fetch (Strict Origin)',
                desc: 'Direct browser fetch without proxies. Only feeds configured with CORS headers (Access-Control-Allow-Origin: *) will load.',
              },
              {
                id: 'custom' as ProxyMode,
                name: 'Custom User Proxy',
                desc: 'Route requests through your own reverse proxy or CORS server.',
              },
            ].map((opt) => (
              <label
                key={opt.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  settings.proxyMode === opt.id
                    ? 'border-theme-accent bg-theme-accent-subtle/50'
                    : 'border-theme-border bg-theme-card'
                }`}
              >
                <input
                  type="radio"
                  name="proxyMode"
                  checked={settings.proxyMode === opt.id}
                  onChange={() => updateSettings({ proxyMode: opt.id })}
                  className="mt-0.5 text-theme-accent"
                />
                <div>
                  <span className="font-mono text-xs font-bold text-theme-text block">
                    {opt.name}
                  </span>
                  <span className="text-[11px] font-sans text-theme-text-muted block mt-0.5">
                    {opt.desc}
                  </span>
                </div>
              </label>
            ))}
          </div>

          {settings.proxyMode === 'custom' && (
            <div className="mt-3">
              <label className="block text-xs font-mono uppercase text-theme-text-muted mb-1">
                Custom Proxy Prefix URL (use %s for target URL or append at end)
              </label>
              <input
                type="text"
                value={settings.customProxyUrl || ''}
                onChange={(e) => updateSettings({ customProxyUrl: e.target.value })}
                placeholder="https://my-proxy.internal/?url="
                className="w-full bg-theme-card border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
              />
            </div>
          )}
        </div>

        {/* Auto Refresh Interval */}
        <div>
          <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-2">
            Automatic Feed Refresh Interval
          </label>
          <select
            value={settings.autoRefreshMinutes}
            onChange={(e) => updateSettings({ autoRefreshMinutes: Number(e.target.value) as any })}
            className="w-full sm:w-64 bg-theme-card border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
          >
            <option value={0}>Manual Only (No Auto-Refresh)</option>
            <option value={15}>Every 15 Minutes</option>
            <option value={30}>Every 30 Minutes (Default)</option>
            <option value={60}>Every 1 Hour</option>
            <option value={180}>Every 3 Hours</option>
          </select>
        </div>
      </section>

      {/* SECTION 5: DATA, BACKUP & PRINT */}
      <section className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
          <Database className="w-5 h-5 text-theme-accent" />
          <h2 className="font-serif text-xl font-bold text-theme-text">Data, Backups & Print</h2>
        </div>

        <div className="text-xs font-mono text-theme-text-muted space-y-1">
          <p>Local IndexedDB cache: <strong className="text-theme-text">{articles.length} articles stored</strong></p>
          <p>Subscribed sources: <strong className="text-theme-text">{feeds.length} feeds configured</strong></p>
        </div>

        <div className="flex flex-wrap gap-3 font-mono text-xs">
          <button
            onClick={handleExportJSON}
            className="px-4 py-2.5 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-theme-text transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Export Full Backup (JSON)</span>
          </button>

          <label className="px-4 py-2.5 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-theme-text transition-colors flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>Restore Backup (JSON)</span>
            <input type="file" ref={fileInputRef} accept=".json" onChange={handleImportJSON} className="hidden" />
          </label>

          <button
            onClick={handlePrint}
            className="px-4 py-2.5 rounded bg-theme-card border border-theme-border hover:border-theme-accent text-theme-text transition-colors flex items-center gap-2"
          >
            <Printer className="w-4 h-4" />
            <span>Print Newspaper Edition</span>
          </button>
        </div>
      </section>
    </div>
  );
};
