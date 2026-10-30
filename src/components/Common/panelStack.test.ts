import { describe, expect, it, vi } from 'vitest';
import { createPanelStack, handleEscapeKey, shortcutsBlocked } from './panelStack';

const key = (k: string, target: EventTarget | null = document.body) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
  Object.defineProperty(e, 'target', { value: target });
  return e;
};

describe('panel stack', () => {
  it('orders entries by open order and pops the newest first', () => {
    const stack = createPanelStack();
    const closed: string[] = [];
    stack.push(() => closed.push('a'));
    stack.push(() => closed.push('b'));
    stack.push(() => closed.push('c'));
    expect(stack.size()).toBe(3);
    expect(stack.escape()).toBe(true);
    expect(stack.escape()).toBe(true);
    expect(closed).toEqual(['c', 'b']);
    expect(stack.size()).toBe(1);
  });

  it('keeps a higher level above entries opened after it', () => {
    const stack = createPanelStack();
    const closed: string[] = [];
    const shortcuts = stack.push(() => closed.push('shortcuts'), 20);
    const cve = stack.push(() => closed.push('cve'), 2);
    stack.push(() => closed.push('vendor'), 1);
    expect(stack.position(shortcuts)).toBe(2);
    expect(stack.position(cve)).toBe(1);
    stack.escape();
    stack.escape();
    expect(closed).toEqual(['shortcuts', 'cve']);
  });

  it('removes an entry that closes on its own, and ignores a second removal', () => {
    const stack = createPanelStack();
    const close = vi.fn();
    const a = stack.push(close);
    const b = stack.push(() => {});
    stack.remove(b);
    stack.remove(b);
    expect(stack.position(b)).toBe(-1);
    expect(stack.position(a)).toBe(0);
    stack.escape();
    expect(close).toHaveBeenCalledOnce();
    expect(stack.escape()).toBe(false);
  });

  it('tells subscribers when the stack changes', () => {
    const stack = createPanelStack();
    const listener = vi.fn();
    const unsubscribe = stack.subscribe(listener);
    const a = stack.push(() => {});
    stack.remove(a);
    unsubscribe();
    stack.push(() => {});
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('Escape key', () => {
  it('closes only the top entry and stops the key there', () => {
    const stack = createPanelStack();
    const closed: string[] = [];
    stack.push(() => closed.push('under'));
    stack.push(() => closed.push('top'));
    const e = key('Escape');
    handleEscapeKey(e, stack);
    expect(closed).toEqual(['top']);
    expect(e.defaultPrevented).toBe(true);
  });

  it('leaves other keys, typing in a field and an empty stack alone', () => {
    const stack = createPanelStack();
    const close = vi.fn();
    const empty = key('Escape');
    handleEscapeKey(empty, stack);
    expect(empty.defaultPrevented).toBe(false);

    stack.push(close);
    handleEscapeKey(key('Enter'), stack);
    handleEscapeKey(key('Escape', document.createElement('input')), stack);
    expect(close).not.toHaveBeenCalled();
  });
});

describe('global shortcuts', () => {
  it('are held back while any panel or modal is open, so f and / do not reach the search behind it', () => {
    const stack = createPanelStack();
    expect(shortcutsBlocked(false, stack)).toBe(false);
    expect(shortcutsBlocked(true, stack)).toBe(true);
    const panel = stack.push(() => {});
    expect(shortcutsBlocked(false, stack)).toBe(true);
    stack.remove(panel);
    expect(shortcutsBlocked(false, stack)).toBe(false);
  });
});
