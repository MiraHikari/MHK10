import { expect, test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite-plus';
import type { mountHybridUi } from '../../src/lib/ui/browser/hybrid-ui';
import { chooseMenu, clickPixel } from './helpers';

declare global {
  interface Window {
    HybridToolbarTest: { mountHybridUi: typeof mountHybridUi };
    hybridToolbarFixture: {
      mount(): () => void;
      dispose(): void;
      oldDispose(): void;
    };
  }
}

async function mountToolbarFixture(page: Page): Promise<void> {
  await page.goto('/apps/notepad/');
  await expect(page.locator('[data-app-status]')).toContainText('characters');
  const entry = fileURLToPath(new URL('../../src/lib/ui/browser/hybrid-ui.ts', import.meta.url));
  const built = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      emptyOutDir: false,
      minify: false,
      lib: { entry, formats: ['iife'], name: 'HybridToolbarTest' },
    },
  });
  const result = Array.isArray(built) ? built[0] : built;
  if (!('output' in result)) throw new Error('Expected an in-memory hybrid controls bundle.');
  const script = result.output.find((item) => item.type === 'chunk');
  if (!script) throw new Error('Missing hybrid controls test script.');
  await page.addScriptTag({ content: script.code });
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.id = 'toolbar-control-fixture';
    fixture.style.cssText =
      'position:fixed;z-index:10000;top:30px;left:4px;right:4px;background:var(--face)';
    fixture.innerHTML = `
      <style>
        #toolbar-control-fixture .fixture-hidden { display: none; }
        @media (max-width: 480px) {
          #toolbar-control-fixture .fixture-responsive { display: none; }
        }
      </style>
      <button>Before toolbar</button>
      <div data-hybrid-toolbar class="hybrid-toolbar" role="toolbar" aria-label="Fixture tools">
        <button tabindex="2">First tool</button>
        <fieldset disabled><button>Disabled tool</button></fieldset>
        <span hidden><button>Hidden tool</button></span>
        <span aria-disabled="true"><button>Unavailable tool</button></span>
        <span inert><button>Inert tool</button></span>
        <span style="visibility:hidden"><button>Invisible tool</button></span>
        <span class="fixture-hidden"><button>Middle tool</button></span>
        <a href="#toolbar-link" tabindex="-1">Linked tool</a>
        <button class="fixture-responsive">Wide tool</button>
        <button>Last tool</button>
        <input aria-label="Toolbar text" value="Keep this text" />
        <label>Toolbar choice<select><option>Alpha</option><option>Beta</option></select></label>
      </div>
      <button>After toolbar</button>
      <nav data-hybrid-menubar class="hybrid-menubar" aria-label="Fixture menu">
        <details><summary>Long menu</summary><div>
          ${Array.from({ length: 16 }, (_, index) => `<button>Command ${index + 1}</button>`).join('')}
        </div></details>
      </nav>
      <output aria-label="Activated tool"></output>`;
    fixture.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest('button, a');
      if (control) fixture.querySelector('output')!.textContent = control.textContent;
    });
    document.body.append(fixture);
    const mount = () => window.HybridToolbarTest.mountHybridUi(fixture);
    const dispose = mount();
    window.hybridToolbarFixture = { mount, dispose, oldDispose: dispose };
  });
}

test('opted-in toolbars move one Tab stop without activating commands or taking field keys', async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 640 });
  await mountToolbarFixture(page);
  const fixture = page.locator('#toolbar-control-fixture');
  const toolbar = fixture.getByRole('toolbar');
  const first = toolbar.getByRole('button', { name: 'First tool', exact: true });
  const last = toolbar.getByRole('button', { name: 'Last tool', exact: true });
  const link = toolbar.getByRole('link', { name: 'Linked tool', exact: true });
  const output = fixture.getByRole('status', { name: 'Activated tool' });
  await fixture.getByRole('button', { name: 'Before toolbar', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(first).toBeFocused();
  await first.press('ArrowRight');
  await expect(link).toBeFocused();
  await link.press('ArrowRight');
  await expect(last).toBeFocused();
  await last.press('ArrowRight');
  await expect(first).toBeFocused();
  await first.press('End');
  await expect(last).toBeFocused();
  await last.press('Home');
  await expect(first).toBeFocused();
  await expect(output).toBeEmpty();
  await expect(
    toolbar.locator('button:not([role="combobox"])[tabindex="0"], a[tabindex="0"]'),
  ).toHaveCount(1);
  await last.click();
  await expect(last).toHaveAttribute('tabindex', '0');
  await expect(first).toHaveAttribute('tabindex', '-1');
  await last.evaluate((button: HTMLButtonElement) => {
    button.disabled = true;
  });
  await expect(first).toHaveAttribute('tabindex', '0');
  await toolbar
    .locator('.fixture-hidden')
    .evaluate((element) => element.classList.remove('fixture-hidden'));
  await first.focus();
  await first.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: 'Middle tool', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 700, height: 640 });
  await link.focus();
  await link.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: 'Wide tool', exact: true })).toBeFocused();
  const input = toolbar.getByRole('textbox', { name: 'Toolbar text' });
  await input.focus();
  await input.press('Home');
  await expect(input).toBeFocused();
  expect(await input.evaluate((element: HTMLInputElement) => element.selectionStart)).toBe(0);
  const combo = toolbar.getByRole('combobox', { name: 'Toolbar choice' });
  await combo.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await combo.press('Escape');
  await expect(combo).toBeFocused();
  await link.press('Enter');
  await expect(output).toHaveText('Linked tool');
  await expect(page).toHaveURL(/#toolbar-link$/);
});

test('toolbar disposal restores authored attributes and stale disposers leave remounts usable', async ({
  page,
}) => {
  await mountToolbarFixture(page);
  const fixture = page.locator('#toolbar-control-fixture');
  const toolbar = fixture.getByRole('toolbar');
  const first = toolbar.getByRole('button', { name: 'First tool', exact: true });
  const last = toolbar.getByRole('button', { name: 'Last tool', exact: true });
  const link = toolbar.getByRole('link', { name: 'Linked tool', exact: true });
  await page.evaluate(() => window.hybridToolbarFixture.dispose());
  await expect(first).toHaveAttribute('tabindex', '2');
  await expect(link).toHaveAttribute('tabindex', '-1');
  await expect(last).not.toHaveAttribute('tabindex');
  await first.press('End');
  await expect(first).toBeFocused();
  await page.evaluate(() => {
    window.hybridToolbarFixture.dispose = window.hybridToolbarFixture.mount();
    window.hybridToolbarFixture.oldDispose();
  });
  await first.press('End');
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute('tabindex', '0');
  await toolbar.evaluate((element) => element.removeAttribute('data-hybrid-toolbar'));
  await expect(first).toHaveAttribute('tabindex', '2');
  await expect(last).not.toHaveAttribute('tabindex');
  await toolbar.evaluate((element) => element.setAttribute('data-hybrid-toolbar', ''));
  await expect(last).toHaveAttribute('tabindex', '0');
  await last.press('Home');
  await expect(first).toBeFocused();
  await first.evaluate((button) => {
    const earlier = document.createElement('div');
    earlier.setAttribute('data-hybrid-toolbar', '');
    earlier.setAttribute('aria-label', 'Moved tools');
    button.closest('[data-hybrid-toolbar]')!.before(earlier);
    earlier.append(button);
  });
  const moved = fixture.locator('[aria-label="Moved tools"] button');
  await expect(moved).toHaveAttribute('tabindex', '0');
  await fixture.locator('summary').press('ArrowDown');
  const menu = fixture.locator('details > div');
  await expect(menu).toHaveCSS('--hybrid-menu-max-height', /px$/);
  await page.evaluate(() => window.hybridToolbarFixture.dispose());
  await expect(moved).toHaveAttribute('tabindex', '2');
  await expect(last).not.toHaveAttribute('tabindex');
  expect(
    await menu.evaluate((element) => element.style.getPropertyValue('--hybrid-menu-max-height')),
  ).toBe('');
});

test('long menus keep their last command reachable in a minimum embedded viewport', async ({
  page,
}, info) => {
  await mountToolbarFixture(page);
  await page.setViewportSize({ width: 274, height: 155 });
  const fixture = page.locator('#toolbar-control-fixture');
  await fixture.evaluate((element) => {
    element.querySelector('[data-hybrid-toolbar]')!.remove();
    element.querySelectorAll(':scope > button').forEach((button) => button.remove());
  });
  const summary = fixture.locator('summary');
  await summary.press('ArrowUp');
  const last = fixture.getByRole('button', { name: 'Command 16', exact: true });
  await expect(last).toBeFocused();
  const geometry = await last.evaluate((button) => {
    const menu = button.parentElement!;
    const bounds = menu.getBoundingClientRect();
    const row = button.getBoundingClientRect();
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      rowTop: row.top,
      rowBottom: row.bottom,
      rowHeight: row.height,
      scrollHeight: menu.scrollHeight,
      clientHeight: menu.clientHeight,
      viewportHeight: innerHeight,
    };
  });
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.viewportHeight - 1);
  expect(geometry.rowHeight).toBeGreaterThanOrEqual(18);
  expect(geometry.scrollHeight).toBeGreaterThan(geometry.clientHeight);
  expect(geometry.rowTop).toBeGreaterThanOrEqual(geometry.top);
  expect(geometry.rowBottom).toBeLessThanOrEqual(geometry.bottom);
  await info.attach('Scrollable menu at 274 by 155', {
    body: await page.screenshot({ path: info.outputPath('hybrid-menu-minimum.png') }),
    contentType: 'image/png',
  });
  await last.press('Enter');
  await expect(fixture.getByRole('status', { name: 'Activated tool' })).toHaveText('Command 16');
});

/** A DOM-only form fixture exercises the actual host enhancer without changing app state. */
async function addControlFixture(page: Page) {
  await page.evaluate(() => {
    const host = document.querySelector('#app-host');
    if (!host) throw new Error('Application host is unavailable');
    const fixture = document.createElement('section');
    fixture.id = 'hybrid-control-fixture';
    fixture.className = 'hybrid-panel';
    fixture.setAttribute('aria-label', 'Control fixture');
    fixture.style.cssText = 'max-width:360px;margin:8px;padding:8px';
    const form = document.createElement('form');
    const label = document.createElement('label');
    label.textContent = 'Save in';
    const select = document.createElement('select');
    select.name = 'fixture-folder';
    select.id = 'fixture-select';
    for (const [value, caption] of [
      ['a', 'Alpha'],
      ['b', 'Beta'],
      ['c', 'Gamma'],
      ['d', 'Unavailable'],
    ]) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = caption;
      option.disabled = value === 'd';
      select.append(option);
    }
    label.append(select);
    const output = document.createElement('output');
    output.setAttribute('aria-label', 'Selection');
    output.style.display = 'block';
    let changes = 0;
    const report = () => {
      output.textContent = `${select.value} / ${changes}`;
    };
    select.addEventListener('change', () => {
      changes++;
      report();
    });
    form.addEventListener('reset', () => queueMicrotask(report));
    const toolbar = document.createElement('div');
    toolbar.className = 'hybrid-toolbar';
    const addButton = (caption: string, action: () => void) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = caption;
      button.addEventListener('click', action);
      toolbar.append(button);
      return button;
    };
    let pending: 'reorder' | 'remove' | null = null;
    addButton('Reorder on open', () => {
      pending = 'reorder';
    });
    const reset = document.createElement('button');
    reset.type = 'reset';
    reset.textContent = 'Reset';
    toolbar.append(reset);
    const visibility = addButton('Hide selector', () => {
      select.hidden = !select.hidden;
      visibility.textContent = select.hidden ? 'Show selector' : 'Hide selector';
    });
    addButton('Remove on open', () => {
      pending = 'remove';
    });
    form.addEventListener('click', (event) => {
      if (
        !pending ||
        !(event.target instanceof Element) ||
        !event.target.closest('[role="combobox"]')
      )
        return;
      const action = pending;
      pending = null;
      queueMicrotask(() => {
        if (action === 'remove') form.remove();
        else {
          const choices = Array.from(select.options);
          select.replaceChildren(choices[0], choices[2], choices[1], choices[3]);
        }
      });
    });
    form.append(label, output, toolbar);
    const remount = document.createElement('button');
    remount.type = 'button';
    remount.textContent = 'Remount selector';
    remount.addEventListener('click', () => {
      if (!form.isConnected) fixture.prepend(form);
    });
    fixture.append(form, remount);
    report();
    host.prepend(fixture);
  });
}

test('hybrid comboboxes retain labels, refreshed options, reset state and cleanup across DOM remounts', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/apps/notepad/');
  await expect(page.locator('[data-app-status]')).toContainText('characters');
  await addControlFixture(page);
  const fixture = page.getByRole('region', { name: 'Control fixture' });
  const combo = fixture.locator('button[role="combobox"]');
  const select = fixture.locator('select');
  const output = fixture.getByRole('status', { name: 'Selection' });
  await expect(combo).toHaveCount(1);
  await expect(combo).toHaveAccessibleName('Save in');
  await expect(combo).toHaveText('Alpha');
  await fixture.getByRole('button', { name: 'Reorder on open', exact: true }).click();
  await combo.click();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(combo).toHaveAttribute('aria-expanded', 'false');
  await combo.click();
  await expect(page.getByRole('option')).toHaveText(['Alpha', 'Gamma', 'Beta', 'Unavailable']);
  await expect(page.getByRole('option', { name: 'Unavailable' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await page.getByRole('option', { name: 'Beta', exact: true }).click();
  await expect(select).toHaveValue('b');
  await expect(output).toHaveText('b / 1');
  await expect(combo).toBeFocused();
  await combo.press('End');
  await combo.press('Enter');
  await expect(select).toHaveValue('b');
  await fixture.getByRole('button', { name: 'Reset', exact: true }).click();
  await expect(select).toHaveValue('a');
  await expect(combo).toHaveText('Alpha');
  await fixture.getByRole('button', { name: 'Hide selector', exact: true }).click();
  await expect(combo).toBeHidden();
  await fixture.getByRole('button', { name: 'Show selector', exact: true }).click();
  await expect(combo).toBeVisible();
  const changesBefore = Number((await output.textContent())?.split('/')[1]);
  await fixture.getByRole('button', { name: 'Remove on open', exact: true }).click();
  await combo.click();
  await expect(combo).toHaveCount(0);
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await fixture.getByRole('button', { name: 'Remount selector', exact: true }).click();
  await expect(combo).toHaveCount(1);
  await expect(combo).toHaveAccessibleName('Save in');
  await combo.click();
  await page.getByRole('option', { name: 'Gamma', exact: true }).click();
  await expect(select).toHaveValue('c');
  await expect(output).toHaveText(`c / ${changesBefore + 1}`);
  await combo.click();
  await fixture.screenshot({ path: info.outputPath('remounted-controls.png') });
  await combo.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(combo).toBeFocused();
  expect(errors).toEqual([]);
});

test('hybrid controls clear invalid state, skip disabled tree items and dismiss detached popups on scroll', async ({
  page,
}) => {
  await page.goto('/apps/notepad/');
  await expect(page.locator('[data-app-status]')).toContainText('characters');
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.id = 'keyboard-control-fixture';
    fixture.innerHTML = `<form><label>Required choice<select required><option value="">Choose</option><option value="b">Beta</option></select></label><button type="submit">Validate</button></form><div data-hybrid-tree role="tree"><button role="treeitem">First</button><button role="treeitem" disabled>Disabled</button><button role="treeitem">Last</button></div><div style="height:250px"></div>`;
    fixture.style.cssText = 'height:130px;overflow:auto';
    fixture.querySelector('form')!.addEventListener('submit', (event) => event.preventDefault());
    document.querySelector('#app-host')!.prepend(fixture);
  });
  const fixture = page.locator('#keyboard-control-fixture');
  const combo = fixture.getByRole('combobox', { name: 'Required choice', exact: true });
  await expect(combo).toHaveCount(1);
  await fixture.getByRole('button', { name: 'Validate' }).click();
  await expect(combo).toHaveAttribute('aria-invalid', 'true');
  await combo.click();
  await page.getByRole('option', { name: 'Beta', exact: true }).click();
  await expect(combo).not.toHaveAttribute('aria-invalid', 'true');
  await fixture.getByRole('treeitem', { name: 'First', exact: true }).press('ArrowDown');
  await expect(fixture.getByRole('treeitem', { name: 'Last', exact: true })).toBeFocused();
  await combo.click();
  await expect(combo).toHaveAttribute('aria-expanded', 'true');
  await fixture.hover();
  await page.mouse.wheel(0, 100);
  await expect(combo).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('hybrid keyboard navigation skips unavailable ancestors and leaves controls outside its root alone', async ({
  page,
}) => {
  await page.goto('/apps/notepad/');
  await expect(page.locator('[data-app-status]')).toContainText('characters');
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.id = 'navigation-control-fixture';
    fixture.innerHTML = `
      <div data-hybrid-tabs role="tablist" aria-label="Fixture tabs">
        <button role="tab">First tab</button>
        <fieldset disabled><button role="tab">Disabled tab</button></fieldset>
        <span hidden><button role="tab">Hidden tab</button></span>
        <span aria-hidden="true"><button role="tab">Decorative tab</button></span>
        <span aria-disabled="true"><button role="tab">Unavailable tab</button></span>
        <span inert><button role="tab">Inert tab</button></span>
        <button role="tab">Last tab</button>
      </div>
      <div data-hybrid-tree role="tree" aria-label="Fixture tree">
        <button role="treeitem">First row</button>
        <fieldset disabled><button role="treeitem">Disabled row</button></fieldset>
        <span aria-disabled="true"><button role="treeitem">Unavailable row</button></span>
        <span aria-hidden="true"><button role="treeitem">Decorative row</button></span>
        <button role="treeitem">Last row</button>
      </div>
      <nav data-hybrid-menubar class="hybrid-menubar" aria-label="Fixture menu">
        <details><summary>Fixture menu</summary><div>
          <button>First command</button>
          <fieldset disabled><button>Disabled command</button></fieldset>
          <span hidden><button>Hidden command</button></span>
          <span aria-hidden="true"><button>Decorative command</button></span>
          <span aria-disabled="true"><a href="#unavailable">Unavailable command</a></span>
          <button>Last command</button>
        </div></details>
        <details hidden><summary>Hidden menu</summary><div><button>Hidden entry</button></div></details>
        <details aria-disabled="true"><summary>Unavailable menu</summary><div><button>Unavailable entry</button></div></details>
        <details><summary aria-disabled="true">Unavailable entry point</summary><div><button>Unavailable entry command</button></div></details>
        <details><summary hidden>Hidden entry point</summary><div><button>Hidden entry command</button></div></details>
        <details><summary aria-hidden="true">Decorative entry point</summary><div><button>Decorative entry command</button></div></details>
        <details><summary inert>Inert entry point</summary><div><button>Inert entry command</button></div></details>
        <details><summary>Last menu</summary><div><button>Final entry</button></div></details>
      </nav>
      <output aria-label="Activated control"></output>`;
    fixture.style.cssText = 'padding:8px;max-width:360px';
    fixture.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;
      const control = event.target.closest('button, a');
      if (control) fixture.querySelector('output')!.textContent = control.textContent;
    });
    document.querySelector('#app-host')!.prepend(fixture);
    const outside = document.createElement('section');
    outside.id = 'outside-control-fixture';
    outside.innerHTML = `<div data-hybrid-tree role="tree" aria-label="Outside tree"><button role="treeitem">Outside first</button><button role="treeitem">Outside last</button></div>`;
    document.body.prepend(outside);
  });
  const fixture = page.locator('#navigation-control-fixture');
  const output = fixture.getByRole('status', { name: 'Activated control' });
  await fixture.getByRole('tab', { name: 'First tab', exact: true }).press('ArrowRight');
  await expect(fixture.getByRole('tab', { name: 'Last tab', exact: true })).toBeFocused();
  await expect(output).toHaveText('Last tab');
  await fixture.getByRole('tab', { name: 'Last tab', exact: true }).press('Home');
  await expect(fixture.getByRole('tab', { name: 'First tab', exact: true })).toBeFocused();
  await fixture.getByRole('treeitem', { name: 'First row', exact: true }).press('ArrowDown');
  await expect(fixture.getByRole('treeitem', { name: 'Last row', exact: true })).toBeFocused();
  await expect(output).toHaveText('Last row');
  const summary = fixture.locator('summary').filter({ hasText: /^Fixture menu$/ });
  await summary.press('ArrowDown');
  await expect(fixture.getByRole('button', { name: 'First command', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(fixture.getByRole('button', { name: 'Last command', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(fixture.locator('summary').filter({ hasText: /^Last menu$/ })).toBeFocused();
  await expect(fixture.locator('details[open]')).toHaveCount(1);
  await page.keyboard.press('ArrowLeft');
  await expect(summary).toBeFocused();
  await page.keyboard.press('Escape');
  await summary.click();
  await fixture
    .getByRole('link', { name: 'Unavailable command', exact: true })
    .click({ force: true });
  await expect(page).toHaveURL('/apps/notepad/');
  await expect(output).toHaveText('Last row');
  const outside = page.locator('#outside-control-fixture');
  await outside.getByRole('treeitem', { name: 'Outside first', exact: true }).press('ArrowDown');
  await expect(outside.getByRole('treeitem', { name: 'Outside first', exact: true })).toBeFocused();
});

test('hybrid comboboxes dismiss and recover when a containing group becomes unavailable', async ({
  page,
}) => {
  await page.goto('/apps/notepad/');
  await expect(page.locator('[data-app-status]')).toContainText('characters');
  await page.evaluate(() => {
    const fixture = document.createElement('section');
    fixture.id = 'ancestor-control-fixture';
    fixture.innerHTML = `<fieldset><label>Group choice<select><option value="a">Alpha</option><option value="b">Beta</option></select></label></fieldset><output aria-label="Group selection">a / 0</output>`;
    const group = fixture.querySelector('fieldset')!;
    const attributes = ['disabled', 'hidden', 'aria-disabled', 'aria-hidden', 'inert'];
    let pending: string | undefined;
    let changes = 0;
    fixture.querySelector('select')!.addEventListener('change', (event) => {
      changes++;
      fixture.querySelector('output')!.textContent =
        `${(event.target as HTMLSelectElement).value} / ${changes}`;
    });
    for (const attribute of attributes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `Apply ${attribute} on open`;
      button.addEventListener('click', () => {
        pending = attribute;
      });
      fixture.append(button);
    }
    const restore = document.createElement('button');
    restore.type = 'button';
    restore.textContent = 'Restore group';
    restore.addEventListener('click', () => {
      for (const attribute of attributes) group.removeAttribute(attribute);
    });
    fixture.append(restore);
    fixture.addEventListener('click', (event) => {
      if (
        !pending ||
        !(event.target instanceof Element) ||
        !event.target.closest('[role="combobox"]')
      )
        return;
      const attribute = pending;
      pending = undefined;
      queueMicrotask(() =>
        group.setAttribute(attribute, attribute.startsWith('aria-') ? 'true' : ''),
      );
    });
    document.querySelector('#app-host')!.prepend(fixture);
  });
  const fixture = page.locator('#ancestor-control-fixture');
  const combo = fixture.locator('button[role="combobox"]');
  let changes = 0;
  for (const attribute of ['disabled', 'hidden', 'aria-disabled', 'aria-hidden', 'inert']) {
    await fixture.getByRole('button', { name: `Apply ${attribute} on open`, exact: true }).click();
    await combo.click();
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(combo).toHaveAttribute('aria-expanded', 'false');
    if (attribute === 'disabled' || attribute === 'aria-disabled')
      await expect(combo).toBeDisabled();
    else if (attribute === 'hidden') await expect(combo).toBeHidden();
    else {
      await expect(combo).toBeVisible();
      await combo.click({ force: true });
      if (attribute === 'aria-hidden') await combo.press('Enter');
      await expect(combo).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('listbox')).toHaveCount(0);
    }
    await fixture.getByRole('button', { name: 'Restore group', exact: true }).click();
    await expect(combo).toBeVisible();
    await expect(combo).toBeEnabled();
    await combo.press('Home');
    await combo.press('ArrowDown');
    await combo.press('Enter');
    await expect(fixture.getByRole('status', { name: 'Group selection' })).toHaveText(
      `b / ${++changes}`,
    );
    await expect(combo).toBeFocused();
  }
});

test('hybrid selections keep the Canvas selection palette separate from window titles', async ({
  page,
}, info) => {
  await page.goto('/apps/display/');
  const canvas = page.locator('canvas');
  await expect.poll(async () => canvas.getAttribute('width')).toBe('358');
  await clickPixel(canvas, 180, 150);
  await clickPixel(canvas, 314, 224);
  await expect(page.locator('#app-host')).toHaveCSS('--app-title', '#000080');
  await expect(page.locator('#app-host')).toHaveCSS('--accent', '#0000ff');
  await page.goto('/apps/notepad/');
  await expect(page.locator('[data-app-status]')).toContainText('characters');
  await addControlFixture(page);
  await page.evaluate(() => {
    const tree = document.createElement('div');
    tree.className = 'hybrid-tree';
    tree.innerHTML = '<button role="treeitem" aria-selected="true">Selected file</button>';
    document.getElementById('hybrid-control-fixture')!.append(tree);
  });
  const selected = page.getByRole('treeitem', { name: 'Selected file' });
  await expect(selected).toHaveCSS('background-color', 'rgb(0, 0, 255)');
  await expect(selected).toHaveCSS('color', 'rgb(255, 255, 255)');
  const file = page.locator('[data-app-menu] summary').filter({ hasText: /^File$/ });
  await file.press('ArrowDown');
  const command = page
    .locator('[data-app-menu]')
    .getByRole('menuitem', { name: 'New', exact: true });
  await expect(command).toHaveCSS('background-color', 'rgb(0, 0, 255)');
  await expect(command).toHaveCSS('color', 'rgb(255, 255, 255)');
  await command.press('Escape');
  await page.getByRole('combobox', { name: 'Save in', exact: true }).click();
  const option = page.getByRole('option', { name: 'Alpha', exact: true });
  await expect(option).toHaveCSS('background-color', 'rgb(0, 0, 255)');
  await expect(option).toHaveCSS('color', 'rgb(255, 255, 255)');
  await page.screenshot({ path: info.outputPath('blue-ribbon-hybrid-selection.png') });
});

test('Notepad menus and Save As use keyboard focus and the shared visible combobox', async ({
  page,
}, info) => {
  await page.goto('/apps/notepad/');
  await expect(page.locator('[data-app-status]')).toContainText('characters');
  const file = page.locator('[data-app-menu] summary').filter({ hasText: /^File$/ });
  await file.press('ArrowUp');
  const exit = page.locator('[data-app-menu]').getByRole('menuitem', { name: 'Exit', exact: true });
  await expect(exit).toBeFocused();
  await exit.press('Escape');
  await expect(file).toBeFocused();
  await file.press('ArrowDown');
  const first = page.locator('[data-app-menu]').getByRole('menuitem', { name: 'New', exact: true });
  await expect(first).toBeFocused();
  await first.press('Escape');
  await chooseMenu(page, 'File', 'Save As...');
  const picker = page.getByRole('dialog', { name: 'Save As', exact: true });
  const combo = picker.getByRole('combobox', { name: 'Save in', exact: true });
  await expect(combo).toBeVisible();
  await combo.click();
  await expect(picker.getByRole('listbox')).toBeVisible();
  await picker.getByRole('option', { name: 'Notes', exact: true }).click();
  await expect(combo).toHaveText('Notes');
  await expect(combo).toBeFocused();
  await expect(picker.getByRole('listbox')).toHaveCount(0);
  await picker.getByLabel('File name', { exact: true }).fill('hybrid-controls.txt');
  await picker.screenshot({ path: info.outputPath('save-as-controls.png') });
  await picker.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(picker).not.toBeVisible();
  await expect(page).toHaveTitle('hybrid-controls.txt - Notepad · MHK10');
  const folder = await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('doom95.files.v1') ?? '{}') as {
      files?: { name: string; folder: string }[];
    };
    return saved.files?.find((file) => file.name === 'hybrid-controls.txt')?.folder;
  });
  expect(folder).toBe('notes');
});
