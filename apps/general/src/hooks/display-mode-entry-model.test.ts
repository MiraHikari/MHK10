import { describe, expect, it } from 'vite-plus/test';
import { needsDesktopEntryNotice, type DisplayModeEntryContext } from './display-mode-entry-model';

const base: DisplayModeEntryContext = {
  enabled: true,
  target: 'win95',
  acknowledged: false,
  viewportWidth: 390,
  coarsePointer: true,
};

describe('desktop entry notice', () => {
  it('asks a coarse-pointer phone before its first desktop entry', () => {
    expect(needsDesktopEntryNotice(base)).toBe(true);
  });

  it('asks a narrow viewport even when the pointer reports fine', () => {
    expect(needsDesktopEntryNotice({ ...base, coarsePointer: false, viewportWidth: 820 })).toBe(
      true,
    );
  });

  it('does not interrupt a desktop-width precise-pointer entry', () => {
    expect(
      needsDesktopEntryNotice({
        ...base,
        coarsePointer: false,
        viewportWidth: 1440,
      }),
    ).toBe(false);
  });

  it('honours a session acknowledgement', () => {
    expect(needsDesktopEntryNotice({ ...base, acknowledged: true })).toBe(false);
  });

  it('never asks when leaving the desktop or when fusion is disabled', () => {
    expect(needsDesktopEntryNotice({ ...base, target: 'classic' })).toBe(false);
    expect(needsDesktopEntryNotice({ ...base, enabled: false })).toBe(false);
  });
});
