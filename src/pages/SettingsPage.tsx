import React, { useRef, useState } from 'react';
import { useSettings, DEFAULT_NEWSPAPER_SECTIONS } from '../context/SettingsContext';
import { useFeeds } from '../context/FeedContext';
import { WATCHLIST_PRESETS } from '../services/intelligence/watchlist';
import { AlertRulesSettings } from './settings/AlertRulesSettings';
import { IntelligenceSettings } from './settings/IntelligenceSettings';
import { VulnVendorSettings } from './settings/VulnVendorSettings';
import { SyncSettings } from './settings/SyncSettings';
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
  Eye,
  EyeOff,
  Target,
  Layers,
  Folder,
  Plus,
  X,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Clock
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
  const [newKeyword, setNewKeyword] = useState('');
  const [newFolder, setNewFolder] = useState('');

  const handleAddKeyword = (e?: React.FormEvent) => {
    e?.preventDefault();
    const val = newKeyword.trim();
    if (!val) return;
    if (!settings.watchlistKeywords.includes(val)) {
      updateSettings({ watchlistKeywords: [...settings.watchlistKeywords, val] });
    }
    setNewKeyword('');
  };

  const handleRemoveKeyword = (kw: string) => {
    updateSettings({
      watchlistKeywords: settings.watchlistKeywords.filter((k) => k !== kw),
    });
  };

  const handleAddPresetKeywords = (keywords: string[]) => {
    const combined = Array.from(new Set([...settings.watchlistKeywords, ...keywords]));
    updateSettings({ watchlistKeywords: combined });
  };

  const handleMoveSection = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const currentSections = [...(settings.newspaperSections || [])].sort((a, b) => a.order - b.order);
    if (targetIdx < 0 || targetIdx >= currentSections.length) return;
    const temp = currentSections[idx];
    currentSections[idx] = currentSections[targetIdx];
    currentSections[targetIdx] = temp;
    currentSections.forEach((s, i) => {
      s.order = i;
    });
    updateSettings({ newspaperSections: currentSections });
  };

  const handleToggleSection = (id: string) => {
    const updated = (settings.newspaperSections || []).map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    updateSettings({ newspaperSections: updated });
  };

  const handleAddFolder = (e?: React.FormEvent) => {
    e?.preventDefault();
    const val = newFolder.trim();
    if (!val) return;
    if (!settings.bookmarkFolders.includes(val)) {
      updateSettings({ bookmarkFolders: [...settings.bookmarkFolders, val] });
    }
    setNewFolder('');
  };

  const handleRemoveFolder = (folderName: string) => {
    if (folderName.toLowerCase() === 'general') return;
    updateSettings({
      bookmarkFolders: settings.bookmarkFolders.filter((f) => f !== folderName),
    });
  };

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
                id: 'corsfix' as ProxyMode,
                name: 'CORSFix High-Speed Gateway (proxy.corsfix.com) — Recommended',
                desc: 'Fast, reliable browser CORS gateway with automatic failover to direct fetch. Average latency ~250-400ms.',
              },
              {
                id: 'rss2json' as ProxyMode,
                name: 'RSS2JSON Feed API (api.rss2json.com)',
                desc: 'Structured JSON converter with fast response times for RSS & Atom feeds.',
              },
              {
                id: 'allorigins' as ProxyMode,
                name: 'AllOrigins Gateway (api.allorigins.win)',
                desc: 'Public open-source gateway. May experience intermittent Cloudflare 520 timeouts or latency.',
              },
              {
                id: 'direct' as ProxyMode,
                name: 'Direct Browser Fetch (Strict Origin)',
                desc: 'Direct fetch without any proxy. Only feeds with CORS headers (Access-Control-Allow-Origin: *) will load.',
              },
              {
                id: 'custom' as ProxyMode,
                name: 'Custom User Proxy',
                desc: 'Route requests through your own reverse proxy or Cloudflare Worker.',
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

        {/* Auto Refresh Interval & Cooldown */}
        <div className="space-y-4">
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

          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-1">
              Per-Feed Auto-Refresh Cooldown
            </label>
            <p className="text-xs font-serif text-theme-text-muted mb-2">
              Auto-refresh skips a feed that was fetched successfully within this window, to go easy on the CORS gateways. Manual refresh always fetches every feed.
            </p>
            <select
              value={settings.autoRefreshFeedCooldownHours ?? 4}
              onChange={(e) => updateSettings({ autoRefreshFeedCooldownHours: Number(e.target.value) })}
              className="w-full sm:w-64 bg-theme-card border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
            >
              <option value={1}>1h (Default)</option>
              <option value={2}>2h</option>
              <option value={4}>4h</option>
              <option value={6}>6h</option>
              <option value={12}>12h</option>
              <option value={24}>24h</option>
              <option value={0}>Disabled (Always fetch)</option>
            </select>
          </div>
        </div>

        {/* Ingestion Constraints: Max Items & Max Age */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-theme-border">
          {/* Max Articles to Fetch */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-1">
              Max Articles to Fetch per Feed
            </label>
            <p className="text-xs font-serif text-theme-text-muted mb-2.5">
              Limit the maximum number of latest dispatches ingested per source on each update. Default: 25 items.
            </p>
            <div className="grid grid-cols-5 gap-1.5">
              {[
                { val: 10, label: '10' },
                { val: 25, label: '25', sub: 'Default' },
                { val: 50, label: '50' },
                { val: 100, label: '100' },
                { val: 0, label: 'All' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => updateSettings({ maxArticlesPerFeed: opt.val })}
                  className={`py-2 px-1 text-center rounded border font-mono text-xs transition-colors flex flex-col items-center justify-center ${
                    (settings.maxArticlesPerFeed ?? 25) === opt.val
                      ? 'border-theme-accent bg-theme-accent-subtle text-theme-accent font-bold shadow-sm'
                      : 'border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text'
                  }`}
                >
                  <span className="font-bold">{opt.label}</span>
                  {opt.sub && <span className="text-[9px] uppercase tracking-tighter opacity-80">{opt.sub}</span>}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono text-theme-text-muted mt-2 block">
              Currently: <strong className="text-theme-text">{(settings.maxArticlesPerFeed ?? 25) === 0 ? 'All available items (No limit)' : `Latest ${settings.maxArticlesPerFeed ?? 25} items`}</strong>
            </span>
          </div>

          {/* Max Article Age to Ingest */}
          <div>
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted mb-1">
              Maximum Article Age to Fetch
            </label>
            <p className="text-xs font-serif text-theme-text-muted mb-2.5">
              Ignore dispatches older than this cutoff. Default: not older than 30 days. Saved bookmarks are always preserved.
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {[
                { val: 7, label: '7d' },
                { val: 14, label: '14d' },
                { val: 30, label: '30d', sub: 'Default' },
                { val: 60, label: '60d' },
                { val: 90, label: '90d' },
                { val: 0, label: 'All' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  onClick={() => updateSettings({ maxArticleAgeDays: opt.val })}
                  className={`py-2 px-1 text-center rounded border font-mono text-xs transition-colors flex flex-col items-center justify-center ${
                    (settings.maxArticleAgeDays ?? 30) === opt.val
                      ? 'border-theme-accent bg-theme-accent-subtle text-theme-accent font-bold shadow-sm'
                      : 'border-theme-border bg-theme-card text-theme-text-muted hover:text-theme-text'
                  }`}
                >
                  <span className="font-bold">{opt.label}</span>
                  {opt.sub && <span className="text-[9px] uppercase tracking-tighter opacity-80">{opt.sub}</span>}
                </button>
              ))}
            </div>
            <span className="text-[11px] font-mono text-theme-text-muted mt-2 block">
              Currently: <strong className="text-theme-text">{(settings.maxArticleAgeDays ?? 30) === 0 ? 'All time (No age cutoff)' : `Not older than ${settings.maxArticleAgeDays ?? 30} days`}</strong>
            </span>
          </div>
        </div>
      </section>

      {/* SECTION 5: THREAT WATCHLIST & KEYWORD ALERTS */}
      <section id="watchlist-settings" className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
          <Target className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="font-serif text-xl font-bold text-theme-text">Target Watchlist & Keyword Alerts</h2>
            <p className="font-serif text-xs text-theme-text-muted">
              Configure organizational assets, high-value vendors, or threat actors to receive visual badges and filterable alerts across all feeds.
            </p>
          </div>
        </div>

        {/* Existing Keywords List */}
        <div className="space-y-3">
          <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted">
            Active Watchlist Keywords ({settings.watchlistKeywords.length})
          </label>
          <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-theme-card border border-theme-border min-h-[50px] items-center">
            {settings.watchlistKeywords.map((kw) => (
              <span
                key={kw}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-500/15 text-amber-600 dark:text-amber-300 border border-amber-500/30"
              >
                <span>{kw}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveKeyword(kw)}
                  className="hover:text-rose-500 rounded p-0.5"
                  title={`Remove ${kw} from watchlist`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {settings.watchlistKeywords.length === 0 && (
              <span className="text-xs font-mono text-theme-text-muted italic">
                No watchlist keywords active. Add terms below or click a preset stack.
              </span>
            )}
          </div>
        </div>

        {/* Add New Keyword Form */}
        <form onSubmit={handleAddKeyword} className="flex gap-2 max-w-md">
          <input
            type="text"
            value={newKeyword}
            onChange={(e) => setNewKeyword(e.target.value)}
            placeholder="Add asset, vendor, or actor (e.g. Fortinet, LockBit, Okta)..."
            className="flex-grow bg-theme-card border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
          />
          <button
            type="submit"
            disabled={!newKeyword.trim()}
            className="px-3 py-2 rounded bg-theme-accent text-white font-mono text-xs font-bold disabled:opacity-50 flex items-center gap-1 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
        </form>

        {/* Preset Keyword Stacks */}
        <div className="pt-2 space-y-2">
          <span className="text-xs font-mono uppercase tracking-wider text-theme-text-muted block">
            Add Recommended Intelligence Stacks:
          </span>
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            {WATCHLIST_PRESETS.map((preset) => {
              const active = new Set(settings.watchlistKeywords.map((k) => k.toLowerCase()));
              const missing = preset.keywords.filter((k) => !active.has(k.toLowerCase()));
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={missing.length === 0}
                  onClick={() => handleAddPresetKeywords(missing)}
                  title={preset.keywords.join(', ')}
                  className="px-2.5 py-1 rounded bg-theme-card hover:bg-theme-surface border border-theme-border text-theme-text transition-colors disabled:opacity-50 disabled:cursor-default"
                >
                  {missing.length === 0 ? '✓' : '+'} {preset.label} ({preset.keywords.length})
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <AlertRulesSettings />
      <IntelligenceSettings />
      <VulnVendorSettings />

      {/* SECTION 6: EDITORIAL SECTIONS & MULTI-SOURCE CLUSTERING */}
      <section className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
          <SlidersHorizontal className="w-5 h-5 text-theme-accent" />
          <div>
            <h2 className="font-serif text-xl font-bold text-theme-text">Editorial Newspaper Sections & Story Clustering</h2>
            <p className="font-serif text-xs text-theme-text-muted">
              Configure the order of sections displayed on the newspaper edition and deduplicate reporting across multiple feeds.
            </p>
          </div>
        </div>

        {/* Clustering Toggle */}
        <div className="p-4 rounded-lg bg-theme-card border border-theme-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-theme-surface text-theme-accent">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-sm font-bold text-theme-text">Multi-Source Story Clustering</h3>
              <p className="font-serif text-xs text-theme-text-muted">
                Group duplicate coverage of the same breach, CVE, or incident across different publications under a single lead card with an expandable sources drawer.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => updateSettings({ clusteringEnabled: !settings.clusteringEnabled })}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all ${
              settings.clusteringEnabled
                ? 'bg-theme-accent text-white shadow-sm'
                : 'bg-theme-surface text-theme-text-muted border border-theme-border hover:text-theme-text'
            }`}
          >
            {settings.clusteringEnabled ? 'Clustering Active' : 'Clustering Disabled'}
          </button>
        </div>

        {/* Section Grouping vs Chronological Mode Toggle */}
        <div className="p-4 rounded-lg bg-theme-card border border-theme-border flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded bg-theme-surface text-theme-accent">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-serif text-sm font-bold text-theme-text">Editorial Section Grouping</h3>
              <p className="font-serif text-xs text-theme-text-muted">
                Group articles by categorized editorial blocks (e.g. Critical Threats, Security News, Threat Intel). When disabled, all articles are presented in strict chronological order (newest first).
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => updateSettings({ sectionsEnabled: !(settings.sectionsEnabled !== false) })}
            className={`px-4 py-2 rounded-lg font-mono text-xs font-bold transition-all ${
              settings.sectionsEnabled !== false
                ? 'bg-theme-accent text-white shadow-sm'
                : 'bg-theme-surface text-theme-text-muted border border-theme-border hover:text-theme-text'
            }`}
          >
            {settings.sectionsEnabled !== false ? 'Sections Enabled' : 'Sections Disabled (Chronological)'}
          </button>
        </div>

        {/* Newspaper Sections Order & Visibility */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted">
              Newspaper Section Ordering & Visibility
            </label>
            <button
              type="button"
              onClick={() => updateSettings({ newspaperSections: [...DEFAULT_NEWSPAPER_SECTIONS] })}
              className="text-xs font-mono text-theme-accent hover:underline"
            >
              Reset to Default Order
            </button>
          </div>

          <div className="space-y-2">
            {[...(settings.newspaperSections || [])]
              .sort((a, b) => a.order - b.order)
              .map((sec, idx, arr) => (
                <div
                  key={sec.id}
                  className={`p-3 rounded-lg border transition-all flex items-center gap-3 ${
                    sec.enabled
                      ? 'bg-theme-card border-theme-border'
                      : 'bg-theme-card/40 border-theme-border/50 opacity-60'
                  }`}
                >
                  {/* Up / Down Controls */}
                  <div className="flex flex-col gap-0.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => handleMoveSection(idx, 'up')}
                      disabled={idx === 0}
                      className="p-1 rounded hover:bg-theme-surface text-theme-text-muted hover:text-theme-text disabled:opacity-20 transition-colors"
                      title="Move section up"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveSection(idx, 'down')}
                      disabled={idx === arr.length - 1}
                      className="p-1 rounded hover:bg-theme-surface text-theme-text-muted hover:text-theme-text disabled:opacity-20 transition-colors"
                      title="Move section down"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Section Rank */}
                  <span className="w-6 h-6 rounded flex items-center justify-center font-mono text-xs font-bold bg-theme-surface text-theme-accent flex-shrink-0 border border-theme-border">
                    {idx + 1}
                  </span>

                  {/* Section Title */}
                  <div className="flex-grow min-w-0">
                    <span className="font-serif text-sm font-bold text-theme-text block truncate">
                      {sec.title}
                    </span>
                    <span className="font-mono text-[11px] text-theme-text-muted block">
                      {sec.minSeverity ? `Rule: Min Severity ${sec.minSeverity.toUpperCase()}` : `Rule: Category ${sec.category || 'General'}`}
                    </span>
                  </div>

                  {/* Visibility Toggle */}
                  <button
                    type="button"
                    onClick={() => handleToggleSection(sec.id)}
                    className={`p-2 rounded-lg transition-colors flex-shrink-0 ${
                      sec.enabled
                        ? 'text-theme-accent bg-theme-accent/10 hover:bg-theme-accent/20'
                        : 'text-theme-text-muted bg-theme-surface hover:text-theme-text'
                    }`}
                    title={sec.enabled ? 'Section is enabled' : 'Section is hidden'}
                  >
                    {sec.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  </button>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* SECTION 7: RESEARCH & BOOKMARK FOLDERS */}
      <section className="bg-theme-surface p-6 rounded-xl border border-theme-border space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-theme-border">
          <Folder className="w-5 h-5 text-theme-accent" />
          <div>
            <h2 className="font-serif text-xl font-bold text-theme-text">Research & Bookmark Folders</h2>
            <p className="font-serif text-xs text-theme-text-muted">
              Organize bookmarked security advisories, vulnerability disclosures, and incident notes into analyst folders.
            </p>
          </div>
        </div>

        {/* Existing Folders List */}
        <div className="space-y-3">
          <label className="block text-xs font-mono uppercase tracking-wider text-theme-text-muted">
            Configured Folders ({settings.bookmarkFolders.length})
          </label>
          <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-theme-card border border-theme-border items-center">
            {settings.bookmarkFolders.map((folder) => (
              <span
                key={folder}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono font-medium bg-theme-surface text-theme-text border border-theme-border"
              >
                <Folder className="w-3.5 h-3.5 text-theme-accent" />
                <span>{folder}</span>
                {folder.toLowerCase() !== 'general' && (
                  <button
                    type="button"
                    onClick={() => handleRemoveFolder(folder)}
                    className="hover:text-rose-500 rounded p-0.5 ml-1"
                    title={`Delete folder "${folder}"`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        {/* Add Folder Form */}
        <form onSubmit={handleAddFolder} className="flex gap-2 max-w-md">
          <input
            type="text"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            placeholder="New folder name (e.g. Critical Infrastructure, Ransomware)..."
            className="flex-grow bg-theme-card border border-theme-border rounded px-3 py-2 text-xs font-mono text-theme-text focus:outline-none focus:border-theme-accent"
          />
          <button
            type="submit"
            disabled={!newFolder.trim()}
            className="px-3 py-2 rounded bg-theme-accent text-white font-mono text-xs font-bold disabled:opacity-50 flex items-center gap-1 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create Folder</span>
          </button>
        </form>
      </section>

      <SyncSettings />

      {/* SECTION 8: DATA, BACKUP & PRINT */}
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
