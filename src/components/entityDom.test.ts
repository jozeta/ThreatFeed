import { afterEach, describe, expect, it } from 'vitest';
import { buildEntityMatcher } from '../services/intelligence/entityLinks';
import { entityFromEvent, linkifyHtmlTextNodes } from './entityDom';

const matcher = buildEntityMatcher({
  vendors: ['Fortinet'],
  groups: [{ key: 'akira', name: 'Akira', aliases: [] }],
  actors: [],
  malware: [],
});

const container = (html: string) => {
  const el = document.createElement('div');
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
};
const spans = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>('[data-entity-kind]')].map(s => `${s.textContent}→${s.dataset.entityKind}:${s.dataset.entityId}`);

afterEach(() => document.body.replaceChildren());

describe('linkifyHtmlTextNodes', () => {
  it('wraps names in text nodes with link spans, keeping the text and markup around them', () => {
    const el = container('<p>Fortinet fixed <b>CVE-2026-21643</b>; the <i>Akira</i> ransomware gang exploited it.</p>');
    expect(linkifyHtmlTextNodes(el, matcher)).toBe(3);
    expect(spans(el)).toEqual(['Fortinet→vendor:Fortinet', 'CVE-2026-21643→cve:CVE-2026-21643', 'Akira→group:akira']);
    expect(el.textContent).toBe('Fortinet fixed CVE-2026-21643; the Akira ransomware gang exploited it.');
    const span = el.querySelector<HTMLElement>('[data-entity-kind]')!;
    expect(span.tagName).toBe('SPAN');
    expect(span.className).toBe('entity-link');
    expect(span.getAttribute('role')).toBe('link');
    expect(span.tabIndex).toBe(0);
    expect(el.querySelector('b')!.children[0].tagName).toBe('SPAN');
  });

  it('judges threat words against the whole container, not each text node', () => {
    const el = container('<p><i>Akira</i> claimed it.</p><p>A ransomware attack, says the note.</p>');
    linkifyHtmlTextNodes(el, matcher);
    expect(spans(el)).toEqual(['Akira→group:akira']);
  });

  it('leaves links, code, preformatted text and earlier links alone', () => {
    const el = container('<a href="https://x">Fortinet</a> <code>Fortinet</code> <pre>Fortinet</pre> <button>Fortinet</button> Fortinet');
    expect(linkifyHtmlTextNodes(el, matcher)).toBe(1);
    expect(linkifyHtmlTextNodes(el, matcher)).toBe(0); // a second pass (the entity list arrived) finds nothing new
    expect(spans(el)).toEqual(['Fortinet→vendor:Fortinet']);
    expect(el.querySelector('a')!.children).toHaveLength(0);
  });

  it('never parses text as markup', () => {
    const el = container('');
    el.appendChild(document.createTextNode('<img src=x onerror=alert(1)> Fortinet'));
    linkifyHtmlTextNodes(el, matcher);
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toBe('<img src=x onerror=alert(1)> Fortinet');
  });
});

describe('entityFromEvent', () => {
  it('finds the entity a click or Enter lands on, and nothing for other keys or plain text', () => {
    const el = container('<p>Fortinet <em>and more</em></p>');
    linkifyHtmlTextNodes(el, matcher);
    const span = el.querySelector('[data-entity-kind]')!;
    const click = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(click, 'target', { value: span });
    expect(entityFromEvent(click)).toEqual({ kind: 'vendor', id: 'Fortinet' });
    const enter = new KeyboardEvent('keydown', { key: 'Enter' });
    Object.defineProperty(enter, 'target', { value: span });
    expect(entityFromEvent(enter)).toEqual({ kind: 'vendor', id: 'Fortinet' });
    const tab = new KeyboardEvent('keydown', { key: 'Tab' });
    Object.defineProperty(tab, 'target', { value: span });
    expect(entityFromEvent(tab)).toBeNull();
    const plain = new MouseEvent('click');
    Object.defineProperty(plain, 'target', { value: el.querySelector('em') });
    expect(entityFromEvent(plain)).toBeNull();
  });
});
