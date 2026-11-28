import { describe, expect, it } from 'vite-plus/test';
import { shouldOfferDesktop, type DesktopOfferContext } from './desktop-offer-model';

const base: DesktopOfferContext = {
  enabled: true,
  hasChoice: false,
  answered: false,
  pathname: '/',
  viewportWidth: 1440,
  conserveData: false,
};

describe('desktop offer', () => {
  it('offers the desktop on a desktop-class entry with no saved choice', () => {
    expect(shouldOfferDesktop(base)).toBe(true);
  });

  it('offers it on any desktop-class viewport, fine pointer or not', () => {
    expect(shouldOfferDesktop({ ...base, viewportWidth: 1024 })).toBe(true);
    expect(shouldOfferDesktop({ ...base, viewportWidth: 2560 })).toBe(true);
  });

  it('never offers it on a deep link, where reading context wins', () => {
    expect(shouldOfferDesktop({ ...base, pathname: '/blog/colophon/' })).toBe(false);
    expect(shouldOfferDesktop({ ...base, pathname: '/projects/' })).toBe(false);
  });

  it('stays quiet on narrow windows and metered connections', () => {
    expect(shouldOfferDesktop({ ...base, viewportWidth: 900 })).toBe(false);
    expect(shouldOfferDesktop({ ...base, conserveData: true })).toBe(false);
  });

  it('respects a saved presentation and a session answer', () => {
    expect(shouldOfferDesktop({ ...base, hasChoice: true })).toBe(false);
    expect(shouldOfferDesktop({ ...base, answered: true })).toBe(false);
  });

  it('never offers a desktop that is not configured', () => {
    expect(shouldOfferDesktop({ ...base, enabled: false })).toBe(false);
  });
});
