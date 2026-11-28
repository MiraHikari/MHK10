import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { chromium, firefox, webkit } from '@playwright/test';
import { FUSION_DESKTOP_ORIGIN, FUSION_GENERAL_ORIGIN } from './verify-config.mjs';

// Run against completed static builds. This script never starts or rebuilds a server.
const root = resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    'base-url': { type: 'string', default: FUSION_GENERAL_ORIGIN },
    'desktop-url': { type: 'string' },
    browser: { type: 'string', default: 'chromium' },
    'browser-arg': { type: 'string' },
    output: { type: 'string' },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
if (values.help) {
  console.log(
    'Usage: node scripts/fusion-performance.mjs [--base-url http://127.0.0.1:4421] [--desktop-url http://127.0.0.1:4422] [--browser chromium|firefox|webkit] [--output path.json]',
  );
  process.exit(0);
}
const browserName = values['browser-arg'] ?? values.browser;
const browsers = { chromium, firefox, webkit };
if (!Object.hasOwn(browsers, browserName)) throw new Error('Choose chromium, firefox or webkit.');
const baseUrl = new URL(values['base-url']);
if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password)
  throw new Error('Use a public HTTP(S) base URL without credentials.');
if (baseUrl.search || baseUrl.hash || !['', '/'].includes(baseUrl.pathname))
  throw new Error('Use the general site origin; the first-visit sample starts at /.');
const configuredDesktopUrl = values['desktop-url']
  ? new URL(values['desktop-url'])
  : baseUrl.origin === FUSION_GENERAL_ORIGIN
    ? new URL(FUSION_DESKTOP_ORIGIN)
    : null;
if (
  configuredDesktopUrl &&
  (!['http:', 'https:'].includes(configuredDesktopUrl.protocol) ||
    configuredDesktopUrl.username ||
    configuredDesktopUrl.password)
)
  throw new Error('Use a public HTTP(S) desktop URL without credentials.');
const output = resolve(root, values.output ?? 'apps/desktop/artifacts/qa/fusion-performance.json');
const ENTRY_TIMEOUT_MS = 20000;
const IDLE_WINDOW_MS = 2000;
const profiles = [
  { name: 'normal', cpuSlowdown: 1, network: null },
  {
    name: 'slow4g-cpu4x',
    cpuSlowdown: 4,
    network: {
      offline: false,
      latency: 150,
      downloadThroughput: 200000,
      uploadThroughput: 93750,
      connectionType: 'cellular4g',
    },
  },
];

/** Read-only sensors, installed before each document starts executing site code. */
function installObservers() {
  const state = {
    timeOrigin: performance.timeOrigin,
    domContentLoadedMs: null,
    paints: [],
    lcpCandidates: [],
    layoutShifts: [],
    clsMaximumSession: 0,
    clsUnexpectedShiftSum: 0,
    supportedEntryTypes: PerformanceObserver.supportedEntryTypes ?? [],
    intents: [],
    signals: [],
    modes: [],
    screenBusy: [],
  };
  let sessionStart = null,
    sessionEnd = 0,
    sessionValue = 0;
  const recordEntries = (entries) => {
    for (const entry of entries) {
      if (entry.entryType === 'paint') state.paints.push({ name: entry.name, ms: entry.startTime });
      if (entry.entryType === 'largest-contentful-paint') {
        state.lcpCandidates.push({
          ms: entry.startTime,
          renderMs: entry.renderTime,
          loadMs: entry.loadTime,
          size: entry.size,
          element: entry.element?.tagName ?? null,
          id: entry.element?.id ?? null,
          url: entry.url || null,
        });
      }
      if (entry.entryType !== 'layout-shift') continue;
      state.layoutShifts.push({
        ms: entry.startTime,
        value: entry.value,
        hadRecentInput: entry.hadRecentInput,
      });
      if (entry.hadRecentInput) continue;
      state.clsUnexpectedShiftSum += entry.value;
      if (
        sessionStart !== null &&
        entry.startTime - sessionEnd < 1000 &&
        entry.startTime - sessionStart < 5000
      ) {
        sessionValue += entry.value;
      } else {
        sessionStart = entry.startTime;
        sessionValue = entry.value;
      }
      sessionEnd = entry.startTime;
      state.clsMaximumSession = Math.max(state.clsMaximumSession, sessionValue);
    }
  };
  const observers = [];
  for (const type of ['paint', 'largest-contentful-paint', 'layout-shift']) {
    if (!state.supportedEntryTypes.includes(type)) continue;
    const observer = new PerformanceObserver((list) => recordEntries(list.getEntries()));
    observer.observe({ type, buffered: true });
    observers.push(observer);
  }
  document.addEventListener(
    'DOMContentLoaded',
    () => {
      state.domContentLoadedMs = performance.now();
    },
    { once: true },
  );
  const epoch = () => performance.timeOrigin + performance.now();
  if (window === window.top) {
    document.addEventListener(
      'pointerdown',
      (event) => {
        const button = event.target instanceof Element ? event.target.closest('button') : null;
        if (!button) return;
        if (button.hasAttribute('data-mode-toggle')) {
          state.intents.push({
            source: 'mode-toggle',
            target: button.getAttribute('data-mode') === 'win95' ? 'classic' : 'win95',
            epochMs: epoch(),
          });
        } else if (button.closest('.about-entry__offer') && button.textContent.includes('进入桌面'))
          state.intents.push({ source: 'recommendation', target: 'win95', epochMs: epoch() });
      },
      true,
    );
    window.addEventListener('message', (event) => {
      const frame = document.querySelector('[data-desk-embed] iframe');
      if (!frame || event.source !== frame.contentWindow) return;
      if (event.origin !== new URL(frame.src, location.href).origin) return;
      const payload = event.data;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
      if (!['startup', 'ready', 'failed'].includes(payload.type)) return;
      // Observe the actual desktop window; never send a fusion message or record its payload.
      state.signals.push({ type: payload.type, epochMs: epoch() });
    });
  }
  let lastMode, lastBusy;
  const mutationObserver = new MutationObserver(() => {
    const mode = document.documentElement?.getAttribute('data-display-mode');
    if (window === window.top && mode && mode !== lastMode) {
      lastMode = mode;
      state.modes.push({ mode, epochMs: epoch() });
    }
    const busy = document.getElementById('screen')?.getAttribute('aria-busy');
    if (busy === undefined || busy === null || busy === lastBusy) return;
    lastBusy = busy;
    state.screenBusy.push({ value: busy, epochMs: epoch() });
    // The cold surface-ready mark is complete; avoid an observer callback on every idle frame.
    if (window !== window.top && busy === 'false') mutationObserver.disconnect();
  });
  mutationObserver.observe(document, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['data-display-mode', 'aria-busy'],
  });
  window.__fusionPerformance = {
    snapshot() {
      for (const observer of observers) recordEntries(observer.takeRecords());
      const navigation = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource').map((entry) => ({
        url: entry.name,
        initiator: entry.initiatorType,
        durationMs: entry.duration,
        transferBytes: entry.transferSize,
        encodedBodyBytes: entry.encodedBodySize,
      }));
      return {
        ...state,
        url: location.href,
        snapshotEpochMs: epoch(),
        documentElements: document.getElementsByTagName('*').length,
        iframeElements: document.getElementsByTagName('iframe').length,
        navigation: navigation
          ? {
              domContentLoadedMs: navigation.domContentLoadedEventEnd,
              loadMs: navigation.loadEventEnd,
              ttfbMs: navigation.responseStart,
              transferBytes: navigation.transferSize,
              encodedBodyBytes: navigation.encodedBodySize,
            }
          : null,
        fcpMs: state.paints.find((entry) => entry.name === 'first-contentful-paint')?.ms ?? null,
        latestLcpCandidateMs: state.lcpCandidates.at(-1)?.ms ?? null,
        clsMaximumSession: state.supportedEntryTypes.includes('layout-shift')
          ? state.clsMaximumSession
          : null,
        resources,
      };
    },
  };
}

/** Bound browser instrumentation I/O; closing the context releases a late operation. */
function bounded(operation, milliseconds = 5000) {
  let timer;
  const expired = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Browser instrumentation timed out.')), milliseconds);
  });
  return Promise.race([operation, expired]).finally(() => clearTimeout(timer));
}

/** Two seconds without input; CPU data belongs to the top Chromium renderer target only. */
async function observeIdle(page, metricsSession) {
  let metricError = null;
  const readMetrics = async () => {
    if (!metricsSession) return null;
    return bounded(metricsSession.send('Performance.getMetrics')).then(
      ({ metrics }) => Object.fromEntries(metrics.map(({ name, value }) => [name, value])),
      (error) => {
        metricError = error.message;
        return null;
      },
    );
  };
  const before = await readMetrics();
  const started = performance.now();
  await page.waitForTimeout(IDLE_WINDOW_MS);
  const wallMs = performance.now() - started;
  const after = await readMetrics();
  const memory = metricsSession
    ? await bounded(metricsSession.send('Memory.getDOMCounters')).catch(() => null)
    : null;
  const taskCpuMs =
    before?.TaskDuration !== undefined && after?.TaskDuration !== undefined
      ? (after.TaskDuration - before.TaskDuration) * 1000
      : null;
  return {
    wallMs,
    mainThreadCpuMs: taskCpuMs,
    mainThreadCpuFraction: taskCpuMs === null ? null : taskCpuMs / wallMs,
    unavailableReason:
      taskCpuMs !== null
        ? null
        : (metricError ?? 'CDP threadTicks TaskDuration is unavailable in this browser/target.'),
    metricTimeDomain: metricsSession ? 'threadTicks' : null,
    scope:
      'Top Chromium renderer target; separate iframe processes and GPU threads are not measured.',
    memory,
    before,
    after,
  };
}

async function runSample(browser, profile) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: 'no-preference',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  });
  const page = await context.newPage();
  const requests = new Map();
  const metadata = new Set();
  const errors = [];
  const sample = { profile, status: 'running', stages: {}, errors, notes: [] };
  let phase = 'general-first-visit';
  let desktopOrigin = configuredDesktopUrl?.origin ?? null;
  let deadline = Date.now() + ENTRY_TIMEOUT_MS;
  const timeout = () => Math.max(1, deadline - Date.now());
  const snapshot = (frame = page) =>
    bounded(frame.evaluate(() => window.__fusionPerformance.snapshot()));
  const track = (operation) => {
    metadata.add(operation);
    void operation.finally(() => metadata.delete(operation));
  };
  context.on('request', (request) => {
    requests.set(request, {
      url: request.url(),
      origin: new URL(request.url()).origin,
      type: request.resourceType(),
      method: request.method(),
      phase,
      epochMs: Date.now(),
      status: null,
      declaredContentLengthBytes: null,
      contentEncoding: null,
      contentType: null,
      htmlFallbackSuspected: false,
      encodedBodyBytes: null,
      responseHeadersBytes: null,
      byteSource: null,
      complete: false,
      failed: null,
    });
  });
  context.on('response', (response) => {
    const row = requests.get(response.request());
    row.status = response.status();
    const started = response.request().timing().startTime;
    if (started > 0) row.epochMs = started;
    track(
      Promise.all([
        response.headerValue('content-length'),
        response.headerValue('content-encoding'),
        response.headerValue('content-type'),
      ]).then(
        ([length, encoding, contentType]) => {
          const bytes = length === null ? null : Number(length);
          row.declaredContentLengthBytes =
            bytes !== null && Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
          row.contentEncoding = encoding;
          row.contentType = contentType;
          row.htmlFallbackSuspected =
            contentType?.split(';', 1)[0].trim().toLowerCase() === 'text/html' &&
            ['image', 'font', 'script', 'stylesheet'].includes(row.type);
        },
        () => {},
      ),
    );
  });
  context.on('requestfinished', (request) => {
    const row = requests.get(request);
    row.complete = true;
    const started = request.timing().startTime;
    if (started > 0) row.epochMs = started;
    track(
      request.sizes().then(
        (sizes) => {
          row.encodedBodyBytes = sizes.responseBodySize;
          row.responseHeadersBytes = sizes.responseHeadersSize;
          row.byteSource = 'playwright-request-sizes';
        },
        () => {
          row.byteSource = 'content-length-only; declared payload, transfer not verified';
        },
      ),
    );
  });
  context.on('requestfailed', (request) => {
    const row = requests.get(request);
    row.failed = request.failure()?.errorText ?? 'Request failed';
  });
  page.on('pageerror', (error) => errors.push(error.message));
  let metricsSession = null;
  let desktopFrame = null;
  let beforeAccept = null;
  try {
    await context.addInitScript(installObservers);
    if (browserName === 'chromium') {
      const session = await context.newCDPSession(page);
      await bounded(session.send('Network.enable'));
      if (profile.network)
        await bounded(session.send('Network.emulateNetworkConditions', profile.network));
      await bounded(session.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown }));
      sample.throttleScope =
        'Chromium top target; CPU throttling of separate iframe processes is not verified.';
      await bounded(session.send('Performance.enable', { timeDomain: 'threadTicks' })).then(
        () => {
          metricsSession = session;
        },
        (error) => sample.notes.push(`CDP CPU metrics unavailable: ${error.message}`),
      );
    } else
      sample.notes.push('CDP throttling, CPU and DOM counters are unavailable in this browser.');

    deadline = Date.now() + ENTRY_TIMEOUT_MS;
    await page.goto(baseUrl.href, { waitUntil: 'domcontentloaded', timeout: timeout() });
    await page.locator('#boot-loader').waitFor({ state: 'hidden', timeout: timeout() });
    const offer = page.locator('.about-entry__offer');
    await offer.waitFor({ state: 'visible', timeout: timeout() });
    const generalIdle = await observeIdle(page, metricsSession);
    beforeAccept = await snapshot();
    sample.stages.generalFirstVisit = {
      performance: beforeAccept,
      idle: generalIdle,
      desktopIframeCount: await page.locator('[data-desk-embed] iframe').count(),
    };

    phase = 'desktop-cold-entry';
    deadline = Date.now() + ENTRY_TIMEOUT_MS;
    await offer
      .getByRole('button', { name: '进入桌面', exact: true })
      .click({ timeout: timeout() });
    const iframe = page.locator('[data-desk-embed] iframe');
    await iframe.waitFor({ state: 'attached', timeout: timeout() });
    desktopOrigin = new URL(await iframe.getAttribute('src'), baseUrl).origin;
    desktopFrame = await (await iframe.elementHandle()).contentFrame();
    if (!desktopFrame) throw new Error('The desktop iframe has no document.');
    await desktopFrame.locator('#screen').waitFor({ state: 'visible', timeout: timeout() });
    await desktopFrame.waitForFunction(
      () => document.getElementById('screen')?.getAttribute('aria-busy') === 'false',
      undefined,
      { timeout: timeout() },
    );
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute('data-display-mode') === 'win95' &&
        document.querySelector('[data-desk-embed]')?.getAttribute('data-visible') === 'true' &&
        window.__fusionPerformance.snapshot().signals.some((signal) => signal.type === 'ready'),
      undefined,
      { timeout: timeout() },
    );
    const readyObservedEpoch = Date.now();
    const hostCold = await snapshot();
    const desktopCold = await snapshot(desktopFrame);
    const intent = hostCold.intents.find((event) => event.source === 'recommendation');
    sample.acceptedAtEpochMs = intent?.epochMs ?? null;
    const startup = hostCold.signals.find((event) => event.type === 'startup');
    const ready = hostCold.signals.find((event) => event.type === 'ready');
    const surfaceReady = desktopCold.screenBusy.find((event) => event.value === 'false');
    sample.stages.desktopColdEntry = {
      clickToStartupMs: intent && startup ? startup.epochMs - intent.epochMs : null,
      clickToProtocolReadyMs: intent && ready ? ready.epochMs - intent.epochMs : null,
      clickToSurfaceReadyMs: intent && surfaceReady ? surfaceReady.epochMs - intent.epochMs : null,
      publicUiReadyObservedMs: intent ? readyObservedEpoch - intent.epochMs : null,
      startupSignalObserved: Boolean(startup),
      protocolReadySignalObserved: Boolean(ready),
      performance: desktopCold,
      idle: await observeIdle(page, metricsSession),
    };

    phase = 'general-warm-return';
    deadline = Date.now() + ENTRY_TIMEOUT_MS;
    await page.locator('[data-mode-toggle]').click({ timeout: timeout() });
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute('data-display-mode') === 'classic' &&
        document.querySelector('[data-classic-root]')?.inert === false &&
        document.querySelector('[data-desk-embed]')?.getAttribute('data-visible') === 'false',
      undefined,
      { timeout: timeout() },
    );
    await desktopFrame.waitForFunction(
      () => document.documentElement.hasAttribute('data-presentation-suspended'),
      undefined,
      { timeout: timeout() },
    );
    const hostReturn = await snapshot();
    const returnIntent = hostReturn.intents.findLast((event) => event.target === 'classic');
    const returned = hostReturn.modes.findLast((event) => event.mode === 'classic');
    sample.stages.generalWarmReturn = {
      clickToVisibleModeMs:
        returnIntent && returned ? returned.epochMs - returnIntent.epochMs : null,
      reusedGeneralDocument: hostReturn.timeOrigin === beforeAccept.timeOrigin,
      idle: await observeIdle(page, metricsSession),
      performance: await snapshot(),
    };

    phase = 'desktop-warm-reentry';
    deadline = Date.now() + ENTRY_TIMEOUT_MS;
    await page.locator('[data-mode-toggle]').click({ timeout: timeout() });
    await page.waitForFunction(
      () =>
        document.documentElement.getAttribute('data-display-mode') === 'win95' &&
        document.querySelector('[data-desk-embed]')?.inert === false,
      undefined,
      { timeout: timeout() },
    );
    await desktopFrame.waitForFunction(
      () =>
        !document.documentElement.hasAttribute('data-presentation-suspended') &&
        document.getElementById('screen')?.getAttribute('aria-busy') === 'false',
      undefined,
      { timeout: timeout() },
    );
    const hostWarm = await snapshot();
    const desktopWarm = await snapshot(desktopFrame);
    const warmIntent = hostWarm.intents.findLast((event) => event.target === 'win95');
    const warmMode = hostWarm.modes.findLast((event) => event.mode === 'win95');
    sample.stages.desktopWarmReentry = {
      clickToVisibleModeMs: warmIntent && warmMode ? warmMode.epochMs - warmIntent.epochMs : null,
      reusedDesktopDocument: desktopWarm.timeOrigin === desktopCold.timeOrigin,
      newStartupSignalObserved: hostWarm.signals.some(
        (event) => event.type === 'startup' && warmIntent && event.epochMs >= warmIntent.epochMs,
      ),
      idle: await observeIdle(page, metricsSession),
      performance: desktopWarm,
    };
    sample.status = errors.length ? 'completed-with-page-errors' : 'passed';
  } catch (error) {
    sample.status = 'failed';
    sample.failedPhase = phase;
    sample.failure = error.message;
    sample.finalPublicState = await bounded(
      page.evaluate(() => ({
        mode: document.documentElement.getAttribute('data-display-mode'),
        target: document.documentElement.getAttribute('data-display-target'),
        failureElementPresent: Boolean(document.querySelector('.fusion-failure')),
        desktopIframeCount: document.querySelectorAll('[data-desk-embed] iframe').length,
      })),
    ).catch(() => null);
    const failedTimeline = await snapshot().catch(() => null);
    sample.acceptedAtEpochMs ??=
      failedTimeline?.intents.find((event) => event.source === 'recommendation')?.epochMs ?? null;
    // A timed-out entry leaves by the existing public cancellation button or Escape key.
    if (phase === 'desktop-cold-entry' || phase === 'desktop-warm-reentry') {
      const cancel = page.locator('.presentation-handoff__cancel');
      if (await cancel.isVisible().catch(() => false))
        await cancel.click({ timeout: 2000 }).catch(() => {});
      else await page.keyboard.press('Escape').catch(() => {});
      sample.timeoutCancellationAttempted = true;
    }
  } finally {
    await bounded(Promise.allSettled([...metadata]), 1000).catch(() => {});
    const rows = [...requests.values()];
    const beforeEpoch = sample.acceptedAtEpochMs ?? beforeAccept?.snapshotEpochMs ?? null;
    const preacceptDesktop =
      desktopOrigin && beforeEpoch !== null
        ? rows.filter((row) => row.origin === desktopOrigin && row.epochMs <= beforeEpoch)
        : null;
    sample.desktopOrigin = desktopOrigin;
    sample.beforeAcceptDesktopRequestCount = preacceptDesktop?.length ?? null;
    sample.beforeAcceptDesktopRequests = preacceptDesktop?.map((row) => row.url) ?? null;
    sample.beforeAcceptNoDesktopRequests = preacceptDesktop ? preacceptDesktop.length === 0 : null;
    sample.network = {
      phases: Object.fromEntries(
        [
          'general-first-visit',
          'desktop-cold-entry',
          'general-warm-return',
          'desktop-warm-reentry',
        ].map((name) => {
          const phaseRows = rows.filter((row) => row.phase === name);
          const scripts = phaseRows.filter((row) => row.type === 'script');
          return [
            name,
            {
              requests: phaseRows.length,
              desktopRequests: phaseRows.filter((row) => row.origin === desktopOrigin).length,
              completeRequests: phaseRows.filter((row) => row.complete).length,
              failedRequests: phaseRows.filter((row) => row.failed).length,
              htmlFallbackAssetResponses: phaseRows.filter((row) => row.htmlFallbackSuspected)
                .length,
              encodedBodyBytesKnown: phaseRows.reduce(
                (sum, row) => sum + (row.encodedBodyBytes ?? 0),
                0,
              ),
              encodedBodySizeKnownRequests: phaseRows.filter((row) => row.encodedBodyBytes !== null)
                .length,
              declaredContentLengthFallbackBytes: phaseRows.reduce(
                (sum, row) =>
                  sum + (row.encodedBodyBytes === null ? (row.declaredContentLengthBytes ?? 0) : 0),
                0,
              ),
              scriptRequests: scripts.length,
              scriptEncodedBodyBytesKnown: scripts.reduce(
                (sum, row) => sum + (row.encodedBodyBytes ?? 0),
                0,
              ),
              scriptDeclaredContentLengthFallbackBytes: scripts.reduce(
                (sum, row) =>
                  sum + (row.encodedBodyBytes === null ? (row.declaredContentLengthBytes ?? 0) : 0),
                0,
              ),
            },
          ];
        }),
      ),
      requests: rows,
    };
    const htmlAssets = rows.filter((row) => row.htmlFallbackSuspected);
    sample.htmlFallbackAssetResponses = htmlAssets.length;
    if (htmlAssets.length)
      sample.notes.push(
        `The server returned HTML for ${htmlAssets.length} image/font/script/stylesheet requests; those body-size totals include fallback/error documents, not production asset payloads.`,
      );
    if (!desktopOrigin)
      sample.notes.push(
        'Desktop origin was not discovered; preaccept request count is unavailable.',
      );
    if (
      sample.beforeAcceptNoDesktopRequests === false ||
      sample.stages.generalFirstVisit?.desktopIframeCount > 0
    ) {
      sample.status = 'failed';
      sample.failedPhase = 'general-before-accept';
      sample.failure = 'The desktop loaded or requested resources before explicit acceptance.';
      sample.notes.push(
        'The desktop origin received requests before the recommendation was accepted.',
      );
    }
    await context.close();
  }
  return sample;
}

const report = {
  version: 1,
  collectedAt: new Date().toISOString(),
  baseUrl: baseUrl.href,
  configuredDesktopOrigin: configuredDesktopUrl?.origin ?? null,
  browser: browserName,
  browserVersion: null,
  executablePath: browsers[browserName].executablePath(),
  parameters: {
    viewport: { width: 1280, height: 900 },
    headless: true,
    freshContextPerSample: true,
    cache:
      'Enabled; isolated new context for cold entry, same context/document for warm transitions.',
    motion: 'no-preference; no stored user preference',
    entryDeadlineMs: ENTRY_TIMEOUT_MS,
    idleWindowMs: IDLE_WINDOW_MS,
    samplesPerProfile: 1,
  },
  methodology: [
    'Local headless laboratory samples of completed static builds; not field Core Web Vitals, a percentile, INP or a Lighthouse score.',
    'LCP values are observed candidates before input, not a claim about the full user visit. General and desktop documents have separate time origins.',
    'CLS is the largest unexpected-shift session window: less than 1 second between shifts, at most 5 seconds per window; hadRecentInput shifts excluded.',
    'Click durations start at real pointerdown. Startup/ready come from the actual desktop iframe; canvas aria-busy=false independently establishes surface readiness.',
    'Playwright request.sizes measures encoded response bodies without Resource Timing TAO restrictions. HTTP Content-Length fallback is reported separately and may include cached payloads.',
    'Body-size sums are per logical request and can include cached bodies; consult Resource Timing transferBytes before equating them to total wire traffic.',
    'Resource Timing zero transfer values may mean cache reuse or cross-origin TAO restrictions; they are not proof that a resource was free.',
    'Idle CPU uses CDP threadTicks TaskDuration on the top Chromium renderer target. Separate iframe processes, workers and GPU threads are outside this measurement.',
    'Slow4G is an explicit laboratory profile (150ms, 1.6Mbit/s down, 0.75Mbit/s up, 4x CPU); no claim that it matches every physical 4G connection.',
    'Performance observers and automation add measurement overhead. Public UI actions change only this isolated context; the script never seeds storage or reads private message/document contents.',
  ],
  references: [
    'https://web.dev/articles/cls',
    'https://playwright.dev/docs/api/class-request#request-sizes',
    'https://chromedevtools.github.io/devtools-protocol/tot/Network/#method-emulateNetworkConditions',
    'https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#method-setCPUThrottlingRate',
  ],
  samples: [],
};
if (!existsSync(report.executablePath)) {
  report.samples.push({
    status: 'browser-unavailable',
    reason: 'The matching Playwright browser executable is not installed.',
  });
} else {
  const browser = await browsers[browserName]
    .launch({ headless: true, timeout: ENTRY_TIMEOUT_MS })
    .catch((error) => {
      report.samples.push({ status: 'browser-unavailable', reason: error.message });
      return null;
    });
  if (browser) {
    report.browserVersion = browser.version();
    try {
      for (const profile of browserName === 'chromium' ? profiles : profiles.slice(0, 1))
        report.samples.push(await runSample(browser, profile));
      if (browserName !== 'chromium')
        report.samples.push({
          profile: profiles[1],
          status: 'not-supported',
          reason: 'Playwright Firefox/WebKit do not expose Chromium CDP network/CPU emulation.',
        });
    } finally {
      await browser.close();
    }
  }
}
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
for (const sample of report.samples) {
  const general = sample.stages?.generalFirstVisit?.performance;
  const desktop = sample.stages?.desktopColdEntry;
  const warm = sample.stages?.desktopWarmReentry;
  console.log(
    `${browserName}/${sample.profile?.name ?? 'launch'}: ${sample.status}; FCP=${general?.fcpMs ?? 'n/a'}ms; startup=${desktop?.clickToStartupMs ?? 'n/a'}ms; ready=${desktop?.clickToProtocolReadyMs ?? 'n/a'}ms; warm=${warm?.clickToVisibleModeMs ?? 'n/a'}ms; desktop-before-accept=${sample.beforeAcceptDesktopRequestCount ?? 'n/a'}`,
  );
}
console.log(`Report: ${output}`);
if (
  report.samples.some((sample) =>
    ['failed', 'browser-unavailable', 'completed-with-page-errors'].includes(sample.status),
  )
)
  process.exitCode = 1;
