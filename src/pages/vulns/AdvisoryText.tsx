import React from 'react';
import { safeHttpUrl } from '../../services/rss/sanitizer';

// Advisory descriptions are GitHub markdown written by whoever filed the advisory: untrusted. They are shown as
// plain text with their line breaks, never as HTML; only markdown links and bare URLs that are http(s) become links.

export type AdvisoryTextPart = { text: string } | { href: string; label: string };

const LINK_RE = /\[([^\]\n]{1,300})\]\(([^)\s]{1,2000})\)|https?:\/\/[^\s<>()[\]"'`]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?]+$/;

/** The text split into plain text and safe links; anything that isn't a safe link stays text, as written */
export function advisoryTextParts(text: string): AdvisoryTextPart[] {
  const parts: AdvisoryTextPart[] = [];
  const pushText = (t: string) => {
    if (!t) return;
    const last = parts[parts.length - 1];
    if (last && 'text' in last) last.text += t;
    else parts.push({ text: t });
  };
  let at = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const start = m.index ?? 0;
    pushText(text.slice(at, start));
    at = start + m[0].length;
    if (m[1] !== undefined) {
      const href = safeHttpUrl(m[2]);
      if (href) parts.push({ href, label: m[1] });
      else pushText(m[0]);
      continue;
    }
    // A bare URL: a full stop or comma after it ends the sentence, not the URL
    const url = m[0].replace(TRAILING_PUNCTUATION, '');
    const href = safeHttpUrl(url);
    if (href) parts.push({ href, label: url });
    else pushText(url);
    pushText(m[0].slice(url.length));
  }
  pushText(text.slice(at));
  return parts;
}

export const AdvisoryText: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <p className={`whitespace-pre-wrap break-words ${className}`}>
    {advisoryTextParts(text).map((p, i) => ('href' in p
      ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="text-theme-accent underline break-all">{p.label}</a>
      : <React.Fragment key={i}>{p.text}</React.Fragment>))}
  </p>
);
