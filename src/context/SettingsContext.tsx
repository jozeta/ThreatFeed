import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserSettings, NewspaperSectionConfig } from '../types';
import { getSettingsFromDB, saveSettingsToDB } from '../services/storage/indexeddb';
import { ALERT_GAP_OPTIONS, createBuiltInRules, migrateAlertRules } from '../services/intelligence/alertRules';
import { migrateTvInterval, parseTvAnimationSpeed, parseTvTileSize } from '../services/tv/tvSettings';
import { DEFAULT_WATCHLIST_KEYWORDS, WATCHLIST_DEFAULTS_VERSION, upgradeWatchlistKeywords } from '../services/intelligence/watchlist';

export const DEFAULT_BOOKMARK_FOLDERS: string[] = [
  'General',
  'Incident Response',
  'Vulnerabilities & CVEs',
  'Threat Actor Tracking'
];

export const DEFAULT_NEWSPAPER_SECTIONS: NewspaperSectionConfig[] = [
  {
    id: 'breaking-threats',
    title: 'Critical Threat Dispatches & Zero-Days',
    minSeverity: 'high',
    enabled: true,
    order: 0
  },
  {
    id: 'sec-news',
    title: 'Security News & Cybercrime',
    category: 'Security News',
    enabled: true,
    order: 1
  },
  {
    id: 'threat-intel',
    title: 'Threat Intelligence & APT Reports',
    category: 'Threat Intelligence',
    enabled: true,
    order: 2
  },
  {
    id: 'vulns',
    title: 'Vulnerabilities & Advisories',
    category: 'Vulnerabilities',
    enabled: true,
    order: 3
  },
  {
    id: 'red-team',
    title: 'Red Team & Offensive Research',
    category: 'Red Team / Offensive',
    enabled: true,
    order: 4
  },
  {
    id: 'blue-team',
    title: 'Blue Team & Defensive Engineering',
    category: 'Blue Team / Defensive',
    enabled: true,
    order: 5
  },
  {
    id: 'tech',
    title: 'Tech, Gadgets & Platform News',
    category: 'Tech & Gadgets',
    enabled: true,
    order: 6
  }
];

export const DEFAULT_SETTINGS: UserSettings = {
  theme: 'dark',
  layout: 'newspaper',
  fontFamily: 'serif',
  containerWidth: 'wide',
  spacing: 'comfortable',
  borderStyle: 'subtle',
  imageBehavior: 'normal',
  contentDensity: 'normal',
  accentColor: '#e11d48', // Editorial crimson
  fontSize: 'base',
  headlineScale: 'prominent',
  autoRefreshMinutes: 30,
  proxyMode: 'corsfix',
  hideReadArticles: false,
  reducedMotion: false,
  maxArticlesPerFeed: 25,
  maxArticleAgeDays: 30,
  autoRefreshFeedCooldownHours: 1,
  tvIntervalSeconds: 60,
  tvTileSize: 'medium',
  disabledCategories: [],
  tvTransition: 'reveal',
  tvAnimationSpeed: 'fast',
  watchlistKeywords: DEFAULT_WATCHLIST_KEYWORDS,
  watchlistDefaultsVersion: WATCHLIST_DEFAULTS_VERSION,
  dataSource: 'snapshot',
  watchlistNotifications: false,
  stackKeywords: [],
  mutedKeywords: [],
  frontPageHiddenCategories: [],
  savedSearches: [],
  hiddenVulnVendors: [],
  watchedCves: [],
  newspaperSections: DEFAULT_NEWSPAPER_SECTIONS,
  bookmarkFolders: DEFAULT_BOOKMARK_FOLDERS,
  clusteringEnabled: true,
  sectionsEnabled: true,
  alertRules: createBuiltInRules(false, new Date()),
  alertGapHours: 1,
};

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => void;
  updateSetting: <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => void;
  resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Load from IndexedDB on startup
  useEffect(() => {
    getSettingsFromDB().then((saved) => {
      if (saved) {
        // Migrate defaults for new fields: migrate degraded proxies to corsfix
        const rawProxy = (saved as any).proxyMode;
        const validProxy = (rawProxy === 'corsproxy' || rawProxy === 'allorigins') 
          ? 'corsfix' 
          : (rawProxy || 'corsfix');

        const migrated: UserSettings = {
          ...DEFAULT_SETTINGS,
          ...saved,
          fontFamily: saved.fontFamily || 'serif',
          containerWidth: saved.containerWidth || 'wide',
          proxyMode: validProxy,
          maxArticlesPerFeed: typeof saved.maxArticlesPerFeed === 'number' ? saved.maxArticlesPerFeed : 25,
          maxArticleAgeDays: typeof saved.maxArticleAgeDays === 'number' ? saved.maxArticleAgeDays : 30,
          autoRefreshFeedCooldownHours: typeof saved.autoRefreshFeedCooldownHours === 'number' ? saved.autoRefreshFeedCooldownHours : DEFAULT_SETTINGS.autoRefreshFeedCooldownHours,
          tvIntervalSeconds: migrateTvInterval(saved),
          tvTileSize: parseTvTileSize(saved.tvTileSize),
          tvAnimationSpeed: parseTvAnimationSpeed(saved.tvAnimationSpeed),
          disabledCategories: Array.isArray(saved.disabledCategories) ? saved.disabledCategories.filter((v: unknown) => typeof v === 'string') : [],
          tvTransition: saved.tvTransition === 'fade' || saved.tvTransition === 'slide' || saved.tvTransition === 'reveal' ? saved.tvTransition : DEFAULT_SETTINGS.tvTransition,
          watchlistKeywords: Array.isArray(saved.watchlistKeywords)
            ? upgradeWatchlistKeywords(saved.watchlistKeywords, saved.watchlistDefaultsVersion ?? 1)
            : DEFAULT_WATCHLIST_KEYWORDS,
          watchlistDefaultsVersion: WATCHLIST_DEFAULTS_VERSION,
          newspaperSections: Array.isArray(saved.newspaperSections) && saved.newspaperSections.length > 0 ? saved.newspaperSections : DEFAULT_NEWSPAPER_SECTIONS,
          bookmarkFolders: Array.isArray(saved.bookmarkFolders) && saved.bookmarkFolders.length > 0 ? saved.bookmarkFolders : DEFAULT_BOOKMARK_FOLDERS,
          clusteringEnabled: typeof saved.clusteringEnabled === 'boolean' ? saved.clusteringEnabled : true,
          sectionsEnabled: typeof saved.sectionsEnabled === 'boolean' ? saved.sectionsEnabled : true,
          hiddenVulnVendors: Array.isArray(saved.hiddenVulnVendors) ? saved.hiddenVulnVendors.filter((v: unknown) => typeof v === 'string') : [],
          watchedCves: Array.isArray(saved.watchedCves) ? saved.watchedCves.filter((v: unknown) => typeof v === 'string') : [],
          alertRules: migrateAlertRules(saved, new Date()),
          alertGapHours: (ALERT_GAP_OPTIONS as readonly number[]).includes(saved.alertGapHours as number) ? saved.alertGapHours : 1,
        };
        delete (migrated as unknown as Record<string, unknown>).tvIntervalMinutes;
        setSettings(migrated);
        saveSettingsToDB(migrated);
      }
    }).catch((err) => {
      console.warn('Could not load saved settings, using defaults:', err);
    }).finally(() => {
      setLoaded(true);
    });
  }, []);

  // Save to IndexedDB whenever settings change
  const updateSettings = (updates: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...updates };
      saveSettingsToDB(next);
      return next;
    });
  };

  const updateSetting = <K extends keyof UserSettings>(key: K, value: UserSettings[K]) => {
    updateSettings({ [key]: value });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettingsToDB(DEFAULT_SETTINGS);
  };

  // Apply Theme & CSS Variables & Classes
  useEffect(() => {
    if (!loaded) return;

    const root = document.documentElement;

    // 1. Theme (Dark vs Light vs System)
    const isDark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      root.style.setProperty('--color-bg', '#0b0d10');
      root.style.setProperty('--color-surface', '#11151a');
      root.style.setProperty('--color-card', '#151a21');
      root.style.setProperty('--color-border', settings.borderStyle === 'none' ? 'transparent' : settings.borderStyle === 'strong' ? '#3e4756' : '#222831');
      root.style.setProperty('--color-border-strong', '#525e70');
      root.style.setProperty('--color-text', '#f5f7fa');
      root.style.setProperty('--color-text-muted', '#9ba3af');
    } else {
      root.classList.add('light');
      root.classList.remove('dark');
      root.style.setProperty('--color-bg', '#f7f8fa');
      root.style.setProperty('--color-surface', '#ffffff');
      root.style.setProperty('--color-card', '#ffffff');
      root.style.setProperty('--color-border', settings.borderStyle === 'none' ? 'transparent' : settings.borderStyle === 'strong' ? '#94a3b8' : '#e2e8f0');
      root.style.setProperty('--color-border-strong', '#334155');
      root.style.setProperty('--color-text', '#0f172a');
      root.style.setProperty('--color-text-muted', '#64748b');
    }

    // 2. Font Family Mode (serif, sans/Arial, mono, system)
    root.classList.remove('font-mode-serif', 'font-mode-sans', 'font-mode-mono', 'font-mode-system');
    root.classList.add(`font-mode-${settings.fontFamily}`);

    // 3. Container Width Mode (compact, standard, wide, full)
    root.classList.remove('width-mode-compact', 'width-mode-standard', 'width-mode-wide', 'width-mode-full');
    root.classList.add(`width-mode-${settings.containerWidth}`);

    // 4. Spacing Mode (compact, comfortable, spacious)
    root.classList.remove('spacing-mode-compact', 'spacing-mode-comfortable', 'spacing-mode-spacious');
    root.classList.add(`spacing-mode-${settings.spacing}`);

    // 5. Border Style Mode (none, subtle, strong)
    root.classList.remove('border-mode-none', 'border-mode-subtle', 'border-mode-strong');
    root.classList.add(`border-mode-${settings.borderStyle}`);

    // 6. Accent Color
    root.style.setProperty('--color-accent', settings.accentColor);
    root.style.setProperty('--color-accent-hover', `${settings.accentColor}dd`);
    root.style.setProperty('--color-accent-subtle', `${settings.accentColor}1a`);

    // 7. Font size
    const fontSizeMap = {
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
    };
    root.style.setProperty('--body-font-size', fontSizeMap[settings.fontSize] || '16px');

    // 8. Reduced motion
    if (settings.reducedMotion) {
      root.classList.add('reduce-motion');
    } else {
      root.classList.remove('reduce-motion');
    }
  }, [settings, loaded]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, updateSetting, resetSettings }}>
      {/* Children (notably FeedProvider's startup refresh) must see saved settings, not defaults */}
      {loaded ? children : null}
    </SettingsContext.Provider>
  );
};

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
