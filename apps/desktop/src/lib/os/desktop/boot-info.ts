// Browser-reported boot information. Pure formatting; no network, storage or entropy requests.
export interface BootInput {
  userAgent?: unknown;
  userAgentData?: unknown;
  platform?: unknown;
  language?: unknown;
  hardwareConcurrency?: unknown;
  innerWidth?: unknown;
  innerHeight?: unknown;
  devicePixelRatio?: unknown;
}
export interface BootInfo {
  browser: string;
  platform: string;
  language: string;
  processors: string;
  viewport: string;
  userAgent: string;
}

/** DOS output is single-line ASCII; control characters cannot affect the layout. */
export function bootAscii(value: unknown, limit = 200): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, Math.max(0, Math.floor(limit)));
}

function browserFromUa(ua: string): string {
  const signatures: [RegExp, string][] = [
    [/Edg(?:A|iOS)?\/([\d.]+)/, 'Microsoft Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/CriOS\/([\d.]+)/, 'Chrome iOS'],
    [/FxiOS\/([\d.]+)/, 'Firefox iOS'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari\//, 'Safari'],
  ];
  for (const [pattern, name] of signatures) {
    const version = pattern.exec(ua)?.[1];
    if (version) return `${name} ${version} (UA)`;
  }
  return 'Not identified; see UA below';
}

export function createBootInfo(input: BootInput): BootInfo {
  const ua = bootAscii(input.userAgent, 500);
  const hints =
    input.userAgentData && typeof input.userAgentData === 'object'
      ? (input.userAgentData as { brands?: unknown; platform?: unknown })
      : undefined;
  let browser = browserFromUa(ua);
  if (Array.isArray(hints?.brands)) {
    const brands = hints.brands.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return [];
      const { brand, version } = entry as { brand?: unknown; version?: unknown };
      const name = bootAscii(brand, 44),
        release = bootAscii(version, 20);
      return name && !/not[^a-z]*a[^a-z]*brand/i.test(name) ? [{ name, release }] : [];
    });
    const preferred =
      brands.find((entry) => /edge|opera|chrome/i.test(entry.name)) ??
      brands.find((entry) => !/^chromium$/i.test(entry.name)) ??
      brands[0];
    if (preferred)
      browser = `${preferred.name}${preferred.release ? ' ' + preferred.release : ''} (UA-CH)`;
  }
  const platformHint = bootAscii(hints?.platform, 40),
    platform = bootAscii(input.platform, 40);
  const cores = input.hardwareConcurrency;
  const validDimension = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  const dpr =
    typeof input.devicePixelRatio === 'number' &&
    Number.isFinite(input.devicePixelRatio) &&
    input.devicePixelRatio > 0
      ? String(input.devicePixelRatio)
      : 'unavailable';
  return {
    browser: ua || browser.includes('(UA-CH)') ? browser : 'Not reported',
    platform: platformHint
      ? `${platformHint} (UA-CH)`
      : platform
        ? `${platform} (navigator)`
        : 'Not reported',
    language: bootAscii(input.language, 40) || 'Not reported',
    processors:
      typeof cores === 'number' && Number.isSafeInteger(cores) && cores > 0
        ? `${cores} logical (reported)`
        : 'Not reported',
    viewport:
      validDimension(input.innerWidth) && validDimension(input.innerHeight)
        ? `${input.innerWidth} x ${input.innerHeight} CSS px / DPR ${dpr}`
        : `Not reported / DPR ${dpr}`,
    userAgent: ua || 'Not reported',
  };
}

/** At most eight DOS rows fit above the POST result area on the 640x360 screen. */
export function bootInfoLines(info: BootInfo, columns = 75): string[] {
  const width = Number.isFinite(columns) ? Math.max(8, Math.min(75, Math.floor(columns))) : 75;
  const fit = (value: string) =>
    value.length <= width ? value : value.slice(0, width - 3) + '...';
  const rows = [
    `Browser: ${info.browser}`,
    `Platform: ${info.platform}`,
    `Language: ${info.language}`,
    `Logical CPUs: ${info.processors}`,
    `Viewport: ${info.viewport}`,
  ].map((value) => fit(bootAscii(value)));
  const ua = 'UA: ' + bootAscii(info.userAgent, 500);
  for (let offset = 0; offset < ua.length && rows.length < 8; offset += width) {
    const last = rows.length === 7;
    rows.push(
      last && ua.length - offset > width
        ? ua.slice(offset, offset + width - 3) + '...'
        : ua.slice(offset, offset + width),
    );
  }
  return rows;
}

const POST_STAGES = ['DISPLAY BRIDGE', 'INPUT ROUTING', 'LOCAL VOLUME', 'STORY CHECKPOINT'];
const POST_STEP = 0.31;

export function bootSequence(elapsed: number) {
  const seconds = Math.max(0, Number.isFinite(elapsed) ? elapsed : 0);
  const checks = Math.min(POST_STAGES.length, Math.floor(seconds / POST_STEP));
  return {
    checks,
    stage: POST_STAGES[checks],
    complete: seconds >= POST_STAGES.length * POST_STEP + 0.18,
  };
}
