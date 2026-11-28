import { describe, expect, it } from 'vite-plus/test';
import { parseBridgeMessage } from './browser-bridge';

describe('embedded message parsing', () => {
  it('rejects malformed and unknown messages before dispatch', () => {
    for (const value of [
      null,
      'start',
      { type: 'other' },
      { type: 'doom95:doom', value: NaN },
      { type: 'doom95:doom', value: 100 },
      { type: 'doom95:open', id: 'x', href: {} },
      { type: 'doom95:theme', theme: '__proto__' },
    ])
      expect(parseBridgeMessage(value)).toBeNull();
  });
  it('accepts existing theme messages and typed launch requests', () => {
    for (const theme of ['teal', 'phosphor', 'ribbon'])
      expect(parseBridgeMessage({ type: 'doom95:theme', theme })).toEqual({
        type: 'doom95:theme',
        theme,
      });
    expect(parseBridgeMessage({ type: 'doom95:theme', value: 'night' })).toEqual({
      type: 'doom95:theme',
      theme: 'night',
    });
    expect(
      parseBridgeMessage({ type: 'doom95:open', id: 'blog', href: '/blog/site-update/' }),
    ).toEqual({ type: 'doom95:open', id: 'blog', href: '/blog/site-update/' });
  });
});
