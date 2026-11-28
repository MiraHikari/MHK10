import { expect, it } from 'vite-plus/test';
import { dialStage } from './dialup-model';

it('reports handshake phases from elapsed connection time and resets on cancellation', () => {
  expect(dialStage(null)).toBe('idle');
  expect(dialStage(0)).toBe('dialing');
  expect(dialStage(2)).toBe('carrier');
  expect(dialStage(4)).toBe('negotiating');
  expect(dialStage(6)).toBe('connected');
  expect(dialStage(90)).toBe('connected');
  expect(dialStage(null)).toBe('idle');
});
