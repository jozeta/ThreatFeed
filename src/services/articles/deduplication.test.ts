import { describe, expect, it } from 'vitest';
import { deduplicateArticles } from './deduplication';
import { article } from '../../test/fixtures';

const when = '2026-10-20T00:00:00Z';
const a = (id: string, title: string) => article(id, { title, publishedAt: when });
const ids = (list: ReturnType<typeof deduplicateArticles>) => list.map(x => x.id);

describe('deduplicateArticles', () => {
  it('drops a syndicated English duplicate', () => {
    const out = deduplicateArticles([
      a('1', 'Ivanti VPN zero-day exploited in the wild'),
      a('2', 'Ivanti VPN zero-day exploited in the wild!'),
    ]);
    expect(ids(out)).toEqual(['1']);
  });

  it('keeps different Japanese stories that only share a Latin word', () => {
    const out = deduplicateArticles([
      a('1', 'Ivanti製品の脆弱性に関する注意喚起'),
      a('2', 'Ivantiを狙うランサムウェア攻撃'),
    ]);
    expect(ids(out)).toEqual(['1', '2']);
  });

  it('keeps different Russian stories that only share a Latin phrase', () => {
    const out = deduplicateArticles([
      a('1', 'Уязвимость в Cisco IOS XE'),
      a('2', 'Атака на Cisco IOS XE завершена'),
    ]);
    expect(ids(out)).toEqual(['1', '2']);
  });

  it('still drops an identical non-Latin title', () => {
    const out = deduplicateArticles([
      a('1', 'Ivanti製品の脆弱性に関する注意喚起'),
      a('2', 'Ivanti製品の脆弱性に関する注意喚起'),
    ]);
    expect(ids(out)).toEqual(['1']);
  });

  it('keeps accented Swedish words whole', () => {
    const out = deduplicateArticles([
      a('1', 'Sårbarhet i Ivanti utnyttjas aktivt'),
      a('2', 'Sårbarhet i Ivanti utnyttjas aktivt.'),
      a('3', 'Srbarhet i Ivanti utnyttjas aktivt'),
    ]);
    expect(ids(out)).toEqual(['1', '3']);
  });

  it('does not fuzzy-compare titles with fewer than two tokens', () => {
    const out = deduplicateArticles([a('1', '速報'), a('2', 'ニュース'), a('3', '!!!'), a('4', '???')]);
    expect(ids(out)).toEqual(['1', '2', '3', '4']);
  });

  it('still dedupes by id and url', () => {
    const out = deduplicateArticles([
      article('1', { title: '速報', publishedAt: when, url: 'https://x/1' }),
      article('1', { title: 'other', publishedAt: when, url: 'https://x/2' }),
      article('2', { title: 'another', publishedAt: when, url: 'https://x/1' }),
    ]);
    expect(ids(out)).toEqual(['1']);
  });
});
