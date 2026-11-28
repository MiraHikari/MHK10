/**
 * One build/browser boundary for the optional desktop deployment address.
 * Existing paths remain valid configuration; content destinations currently
 * resolve as absolute paths at this deployment's origin.
 */
export function parseDesktopDeployment(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const address = value.trim();
  if (!address) return;
  try {
    const url = new URL(address);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username ||
      url.password ||
      url.href.includes('?') ||
      url.href.includes('#')
    )
      return;
    return url.href;
  } catch {
    return;
  }
}
