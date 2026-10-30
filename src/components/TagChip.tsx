import React from 'react';
import { openPanel } from '../hooks/useHashRoute';
import { cleanTag } from '../services/intelligence/tags';

/**
 * Opens a tag's panel (?tag=…) on top of any open ones, with a history entry so Back closes it. A CVE id among
 * an article's tags opens the CVE's own panel, which says more about it than a list could.
 */
export function openTag(tag: string) {
  const t = cleanTag(tag);
  if (/^cve-\d{4}-\d{4,}$/i.test(t)) openPanel('cve', t.toUpperCase());
  else openPanel('tag', t);
}

/**
 * A tag that opens the list of everything it stands for. It keeps the look its place gives it (`className`),
 * plus a small lift on hover (.tag-chip in index.css). Inside a card or row that is itself clickable, the chip
 * acts alone.
 */
export const TagChip: React.FC<{ tag: string; className?: string; title?: string; children?: React.ReactNode }> = ({ tag, className = '', title, children }) => (
  <button
    type="button"
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      openTag(tag);
    }}
    // A card's own key handling (Enter opens the article) must not see the chip's Enter
    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
    title={title ?? (/^[#+]?cve-\d/i.test(tag.trim()) ? `Open ${cleanTag(tag)}` : `Everything tagged ${cleanTag(tag)}`)}
    className={`tag-chip ${className}`}
  >
    {children ?? tag}
  </button>
);
