import { describe, expect, it } from 'vite-plus/test';
import { beian } from '@/data/profile';
import { BEIAN_LINKS } from './beian-link';

describe('beian links', () => {
  it('derives both registration links from the authored profile', () => {
    expect(BEIAN_LINKS.icp).toEqual({
      label: beian.icp,
      href: 'https://beian.miit.gov.cn/',
    });
    expect(BEIAN_LINKS.police.label).toBe(beian.police);
    expect(BEIAN_LINKS.police.href).toBe(
      `http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=${beian.police.replace(/\D/g, '')}`,
    );
  });

  it('passes only the digits of the police record number', () => {
    expect(BEIAN_LINKS.police.href).toMatch(/recordcode=\d+$/);
  });
});
