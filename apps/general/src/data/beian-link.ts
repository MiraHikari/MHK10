import { beian } from '@/data/profile';

/**
 * Registration links derived from the authored profile. The desktop footer and
 * the mobile navigation drawer render the same identifiers, and neither may
 * repeat the filing numbers or construct the police URL on its own.
 */
export const BEIAN_LINKS = Object.freeze({
  icp: Object.freeze({ label: beian.icp, href: 'https://beian.miit.gov.cn/' }),
  police: Object.freeze({
    label: beian.police,
    href: `http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=${beian.police.replace(/\D/g, '')}`,
  }),
});
