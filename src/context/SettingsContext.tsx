import React, { createContext, useContext, useEffect, useState } from 'react';
import { UserSettings } from '../types';
import { getSettingsFromDB, saveSettingsToDB } from '../services/storage/indexeddb';

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
  proxyMode: 'allorigins',
  hideReadArticles: false,
  reducedMotion: false,
};

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (updates: Partial<UserSettings>) => void;
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
        // Migrate defaults for new fields
        const migrated: UserSettings = {
          ...DEFAULT_SETTINGS,
          ...saved,
          fontFamily: saved.fontFamily || 'serif',
          containerWidth: saved.containerWidth || 'wide',
          proxyMode: (saved as any).proxyMode === 'corsproxy' ? 'allorigins' : (saved.proxyMode || 'allorigins'),
        };
        setSettings(migrated);
        saveSettingsToDB(migrated);
      }
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
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
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
