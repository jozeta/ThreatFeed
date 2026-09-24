/**
 * Generates beautiful, subtle cybersecurity-themed gradients and editorial
 * placeholders when articles do not have embedded images.
 */

const PALETTES = [
  { from: '#1a102f', to: '#0f172a', accent: '#a855f7', label: 'CYBER INTELLIGENCE' },
  { from: '#1f1317', to: '#0f172a', accent: '#f43f5e', label: 'THREAT ALERT' },
  { from: '#0e241e', to: '#091512', accent: '#10b981', label: 'RESEARCH & CODE' },
  { from: '#1c1917', to: '#0c0a09', accent: '#f59e0b', label: 'VULNERABILITY BRIEF' },
  { from: '#0c1a2e', to: '#070f1a', accent: '#06b6d4', label: 'NETWORK DEFENSE' },
  { from: '#20122e', to: '#0f0a17', accent: '#d946ef', label: 'INCIDENT REPORT' }
];

export function getEditorialPlaceholder(sourceName: string, category: string): {
  bgGradient: string;
  accent: string;
  label: string;
} {
  // Deterministic index from string
  let hash = 0;
  const str = `${sourceName}-${category}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTES.length;
  const p = PALETTES[index];

  return {
    bgGradient: `linear-gradient(135deg, ${p.from} 0%, ${p.to} 100%)`,
    accent: p.accent,
    label: category.toUpperCase() || p.label
  };
}
