import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { article } from '../../test/fixtures';

const feeds = vi.hoisted(() => ({
  feeds: [], toggleBookmark: vi.fn(), toggleRead: vi.fn(), markViewed: vi.fn(), addCustomTagToArticle: vi.fn(), setBookmarkFolder: vi.fn(), setBookmarkNotes: vi.fn(),
}));
vi.mock('../../context/FeedContext', () => ({ useFeeds: () => feeds }));
vi.mock('../../context/SettingsContext', () => ({ useSettings: () => ({ settings: { watchlistKeywords: [], stackKeywords: [], bookmarkFolders: [] }, updateSettings() {} }) }));

import { ReaderModal } from './ReaderModal';
import { panelStack, READER_LEVEL } from '../Common/panelStack';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('reader shortcuts', () => {
  let root: Root;
  const onNext = vi.fn();
  const press = (key: string) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key })); });

  beforeEach(async () => {
    vi.clearAllMocks();
    const el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => root.render(React.createElement(ReaderModal, { article: article('a'), onClose() {}, onNext, hasNext: true })));
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.replaceChildren();
  });

  it('act on the article when the reader is on top', () => {
    press('b');
    press('j');
    expect(feeds.toggleBookmark).toHaveBeenCalledWith('a');
    expect(onNext).toHaveBeenCalled();
  });

  it('do nothing while a panel opened from the article sits over the reader', () => {
    let panel!: ReturnType<typeof panelStack.push>;
    act(() => { panel = panelStack.push(() => {}, READER_LEVEL + 1); });
    press('b');
    press('j');
    press('m');
    expect(feeds.toggleBookmark).not.toHaveBeenCalled();
    expect(feeds.toggleRead).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
    act(() => panelStack.remove(panel));
    press('b');
    expect(feeds.toggleBookmark).toHaveBeenCalledWith('a');
  });
});
