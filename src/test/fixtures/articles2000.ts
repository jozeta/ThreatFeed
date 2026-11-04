import { Article } from '../../types';
import { article } from '../fixtures';

const DAY_MS = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 9, 1);

const VENDORS = ['Ivanti', 'Cisco', 'Fortinet', 'Microsoft', 'Citrix', 'VMware', 'Atlassian', 'Palo Alto', 'SonicWall', 'Oracle'];
const PRODUCTS = ['VPN', 'IOS XE', 'FortiOS', 'Exchange', 'NetScaler', 'vCenter', 'Confluence', 'PAN-OS', 'SMA', 'WebLogic'];
const VERBS = ['patches', 'warns of', 'confirms', 'discloses', 'fixes', 'investigates'];
const THINGS = ['zero-day', 'critical flaw', 'RCE bug', 'auth bypass', 'data breach', 'ransomware attack', 'supply chain compromise'];
const TAILS = ['exploited in the wild', 'under active attack', 'after researcher report', 'in emergency update', 'affecting thousands', ''];
const NON_LATIN = [
  'Ivanti製品の脆弱性に関する注意喚起',
  'Ivantiを狙うランサムウェア攻撃',
  'サーバー攻撃の急増',
  'Уязвимость в Cisco IOS XE',
  'Атака на Cisco IOS XE завершена',
  '微软修复了严重漏洞',
  'Ευπάθεια στο Fortinet FortiOS',
  'ثغرة خطيرة في منتجات Microsoft',
  'Sårbarhet i Ivanti utnyttjas aktivt',
  '速報',
];

/** Small deterministic PRNG (mulberry32), so the fixture is the same on every run. */
function prng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds `n` articles spread over 30 days with titles that share words, near-duplicates (punctuation,
 * one word changed, syndicated copies hours apart), non-Latin titles, repeated ids and URLs, and invalid dates.
 */
export function makeArticles(n: number, seed: number): Article[] {
  const rand = prng(seed);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];
  const out: Article[] = [];

  for (let i = 0; i < n; i++) {
    const time = START + Math.floor(rand() * 30 * DAY_MS);
    let title: string;
    let publishedAt = new Date(time).toISOString();
    let id = `a${i}`;
    let url = `https://example.com/${i}`;
    const roll = rand();

    if (out.length > 0 && roll < 0.2) {
      // Near-duplicate of an earlier article, a few hours either side
      const base = out[Math.floor(rand() * out.length)];
      const baseTime = new Date(base.publishedAt).getTime();
      const shift = (rand() - 0.5) * 4 * DAY_MS;
      publishedAt = isNaN(baseTime) ? base.publishedAt : new Date(baseTime + shift).toISOString();
      const variant = rand();
      if (variant < 0.4) title = `${base.title}!`;
      else if (variant < 0.7) title = base.title.replace(/\b\w+$/, pick(['today', 'now', 'again']));
      else title = base.title.toUpperCase();
    } else if (roll < 0.3) {
      title = pick(NON_LATIN);
    } else {
      title = [pick(VENDORS), pick(PRODUCTS), pick(VERBS), pick(THINGS), pick(TAILS)].filter(Boolean).join(' ');
    }

    if (rand() < 0.03) publishedAt = 'not a date';
    if (out.length > 0 && rand() < 0.03) url = out[Math.floor(rand() * out.length)].url;
    else if (rand() < 0.02) url = '';
    if (out.length > 0 && rand() < 0.02) id = out[Math.floor(rand() * out.length)].id;

    out.push(article(id, { title, publishedAt, url }));
  }
  return out;
}
