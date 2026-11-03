import { describe, expect, it } from 'vitest';
import { wordTokens } from './titleTokens';

describe('wordTokens', () => {
  it('keeps English words whole', () => {
    expect(wordTokens('ransomware')).toEqual(['ransomware']);
  });

  it('keeps the prolonged sound mark inside the katakana run', () => {
    expect(wordTokens('サーバー')).toEqual(['サー', 'ーバ', 'バー']);
  });

  it('emits bigrams per CJK run and leaves Latin parts whole', () => {
    expect(wordTokens('Ivanti製品')).toEqual(['Ivanti', '製品']);
  });

  it('keeps a lone CJK character as a token', () => {
    expect(wordTokens('猫')).toEqual(['猫']);
  });
});
