import type { Article, LeakSiteVictim } from '../../types';

// Deep links into the published app. `site` always ends with '/'.
const enc = encodeURIComponent;

export function storyLink(site: string, article: Pick<Article, 'id' | 'url'>): string {
  const src = article.url ? `&src=${enc(article.url)}` : '';
  return `${site}#/latest?article=${enc(article.id)}${src}`;
}

export function cveLink(site: string, cve: string): string {
  return `${site}#/vulns?cve=${cve}`;
}

export function patchLink(site: string, monthId: string): string {
  return `${site}#/vulns/patch?month=${enc(monthId)}`;
}

export function victimLink(site: string, v: Pick<LeakSiteVictim, 'id' | 'group'>): string {
  return `${site}#/ransomware?victim=${enc(v.id)}&group=${enc(v.group.toLowerCase())}`;
}
