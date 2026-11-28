import { expect, test } from '@playwright/test';
import { FUSION_DESKTOP_ORIGIN } from '../../scripts/verify-config.mjs';

test.use({ video: 'on' });

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test.describe(reducedMotion, () => {
    test.use({ reducedMotion });

    test('a cold recommendation leaves classic usable until the desktop arrives', async ({
      page,
    }, info) => {
      let release: () => void = () => {};
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      await page.route(`${FUSION_DESKTOP_ORIGIN}/**`, async (route) => {
        if (route.request().resourceType() === 'document') await pending;
        await route.continue();
      });

      try {
        await page.goto('/');
        await expect(page.locator('#boot-loader')).toBeHidden();
        const offer = page.getByRole('complementary', { name: 'MHK10 桌面推荐' });
        const enter = offer.getByRole('button', { name: '进入桌面' });
        const embed = page.locator('[data-desk-embed]');
        const prism = page.locator('[data-entry-prism]');
        const waiting = page.locator('.presentation-handoff');
        const cancel = waiting.getByRole('button', { name: '取消', exact: true });

        await enter.click({ trial: true });
        await enter.focus();
        await page.keyboard.press('Enter');
        await expect(embed).toHaveAttribute('data-phase', 'connecting');
        if (reducedMotion === 'no-preference') {
          await expect(prism).toBeAttached();
          await expect(prism.locator('.presentation-prism__pixels')).toHaveCSS(
            'animation-name',
            'presentation-prism-pixels',
          );
          const edge = await offer.boundingBox();
          const ornament = await prism.boundingBox();
          expect(Math.abs((ornament?.x ?? -100) - (edge?.x ?? 0))).toBeLessThanOrEqual(3);
          expect(Math.abs((ornament?.y ?? -100) - (edge?.y ?? 0))).toBeLessThanOrEqual(3);
        } else {
          await expect(prism).toHaveCount(0);
        }
        await expect(waiting).toBeVisible();
        const dock = await waiting.boundingBox();
        const recommendation = await offer.boundingBox();
        if (!dock || !recommendation) throw new Error('The entry layout did not render');
        expect(dock.x + dock.width).toBeLessThan(recommendation.x);
        await expect(cancel).toBeFocused();
        await expect(embed).toHaveJSProperty('inert', true);
        await expect(embed.locator('iframe')).not.toBeFocused();
        await expect(page.locator('[data-classic-root]')).toHaveJSProperty('inert', false);
        await expect(offer).toBeVisible();
        await page.screenshot({ path: info.outputPath(`${reducedMotion}-connection.png`) });

        if (reducedMotion === 'reduce') {
          await page.keyboard.press('Escape');
          await expect(waiting).toBeHidden();
          await expect(enter).toBeFocused();
          await expect(embed).toHaveAttribute('data-phase', 'idle');
          await page.keyboard.press('Enter');
          await expect(waiting).toBeVisible();
          await expect(prism).toHaveCount(0);
        }

        release();
        if (reducedMotion === 'no-preference') {
          await expect(embed).toHaveAttribute('data-phase', 'startup');
          await expect(embed.locator('iframe')).not.toBeFocused();
          await expect(waiting).toBeHidden();
        }
        await expect(embed).toHaveAttribute('data-phase', 'ready');
        await expect(embed).toHaveAttribute('data-visible', 'true');
        await expect(embed.locator('iframe')).toBeFocused();
        await expect(waiting).toBeHidden();
        await expect(prism).toHaveCount(0);
        await page.screenshot({ path: info.outputPath(`${reducedMotion}-desktop-ready.png`) });
      } finally {
        release();
      }
    });
  });
}
