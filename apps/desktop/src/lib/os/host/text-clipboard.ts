// Shared text clipboard. File ids stay in the file service; this only carries strings.
export interface TextClipboard {
  read(): Promise<string | null>;
  write(text: string): Promise<boolean>;
}

interface BrowserClipboard {
  readText?: () => Promise<string>;
  writeText?: (text: string) => Promise<void>;
}

function systemClipboard(): BrowserClipboard | undefined {
  const host = globalThis.navigator as { clipboard?: BrowserClipboard } | undefined;
  return host?.clipboard;
}

/**
 * Try the browser clipboard, then keep one in-memory string. A missing API or a
 * rejected read/write still leaves that string for Notepad and Calculator.
 * A copy that could not reach the system clipboard stays authoritative until
 * a later system write succeeds. write() resolves true once memory is stored.
 */
export function createTextClipboard(): TextClipboard {
  let memory: string | null = null;
  let revision = 0;
  let preferMemory = false;
  return {
    async read() {
      if (preferMemory) return memory;
      const requested = ++revision;
      const clipboard = systemClipboard();
      if (typeof clipboard?.readText === 'function') {
        try {
          const value = await clipboard.readText();
          if (requested === revision) memory = value;
          return value;
        } catch {
          return memory;
        }
      }
      return memory;
    },
    async write(text: string) {
      const written = ++revision;
      memory = text;
      preferMemory = true;
      const clipboard = systemClipboard();
      if (typeof clipboard?.writeText === 'function') {
        try {
          await clipboard.writeText(text);
          if (written === revision) preferMemory = false;
        } catch {
          // The in-memory copy is the fallback when the browser denies access.
        }
      }
      return true;
    },
  };
}

export const textClipboard = createTextClipboard();
