import { describe, expect, it } from 'vite-plus/test';
import { interactionPolicy, type InteractionState } from './interaction';

const idle: InteractionState = {
  desktop: true,
  systemInput: false,
  manipulating: false,
  desktopMenu: false,
  modal: false,
  start: false,
  pointerDown: false,
  menuOpen: false,
};
describe('input ownership policy', () => {
  it('only allows the focused modal client when a modal is present', () => {
    const policy = interactionPolicy({ ...idle, modal: true });
    expect(policy.html).toBe(false);
    expect(policy.client(true, false, false)).toBe(false);
    expect(policy.client(true, true, false)).toBe(true);
  });
  it.each(['systemInput', 'manipulating', 'desktopMenu', 'start'] as const)(
    'blocks clients and iframes during %s',
    (key) => {
      const policy = interactionPolicy({ ...idle, [key]: true });
      expect(policy.html).toBe(false);
      expect(policy.client(true, false, false)).toBe(false);
      expect(policy.pointer(true, false)).toBe(false);
    },
  );
});
