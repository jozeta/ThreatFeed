import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DeepLinkNotice } from './DeepLinkNotice';

const render = (src: string) => {
  const html = renderToStaticMarkup(createElement(DeepLinkNotice, { notice: { kind: 'story', src }, onDismiss: () => {} }));
  return new DOMParser().parseFromString(html, 'text/html').querySelector('a');
};

describe('DeepLinkNotice', () => {
  it('names the host the original-article link goes to', () => {
    const link = render('https://evil.example/login?x=1');
    expect(link?.getAttribute('href')).toBe('https://evil.example/login?x=1');
    expect(link?.textContent).toBe('Open the original article on evil.example');
  });

  it('offers no link for a URL that is not http(s)', () => {
    expect(render('javascript:alert(1)')).toBeNull();
    expect(render('')).toBeNull();
  });
});
