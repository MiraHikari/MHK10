import { STORAGE_KEYS } from '../../../data/storage-keys';
/** Optional online text service. Configuration and lifetime stay independent of browser APIs. */
export interface AiConfig {
  endpoint: string;
  model: string;
  enabled: boolean;
  transport: 'compatible' | 'relay';
  rememberKey: boolean;
}
export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface AiRequest {
  config: Readonly<AiConfig>;
  apiKey: string;
  messages: readonly AiMessage[];
  signal: AbortSignal;
  /** Cumulative plain text; partial output is never interpreted as a command. */
  onText?: (text: string) => void;
}
export interface AiTransport {
  request(request: AiRequest): Promise<string>;
  cancel(): void;
  dispose(): void;
}
export const AI_CONFIG_KEY = STORAGE_KEYS.ai;
interface AiStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export const DEFAULT_AI_CONFIG: AiConfig = {
  endpoint: '',
  model: '',
  enabled: false,
  transport: 'compatible',
  rememberKey: false,
};
export class AiReplyError extends Error {
  constructor(
    readonly code:
      | 'offline'
      | 'cancelled'
      | 'authentication'
      | 'rate-limit'
      | 'connection'
      | 'response',
    message: string,
  ) {
    super(message);
    this.name = 'AiReplyError';
  }
}
export function validateEndpoint(value: string): string {
  const url = new URL(value.trim());
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.hash ||
    url.search
  )
    throw new Error('Use HTTPS or localhost without credentials, query parameters or fragments.');
  return url.href;
}
export function validateAiConfig(value: AiConfig): AiConfig {
  const endpoint = value.endpoint.trim() ? validateEndpoint(value.endpoint) : '';
  const model = value.model.trim();
  if (model && !/^[a-zA-Z0-9][a-zA-Z0-9._:/@-]{0,199}$/.test(model))
    throw new Error('Use a model ID containing letters, numbers and standard separators.');
  if (value.enabled && !endpoint) throw new Error('Enter a service address.');
  if (value.enabled && value.transport === 'compatible' && !model)
    throw new Error('Enter a model ID.');
  return {
    endpoint,
    model,
    enabled: value.enabled,
    transport: value.transport,
    rememberKey: value.rememberKey,
  };
}
function storedConnection(storage?: Pick<AiStorage, 'getItem'>): {
  config: AiConfig;
  apiKey: string;
} {
  try {
    const value: unknown = JSON.parse(storage?.getItem(AI_CONFIG_KEY) ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return { config: { ...DEFAULT_AI_CONFIG }, apiKey: '' };
    const saved = value as Record<string, unknown>;
    if (typeof saved.endpoint !== 'string' || typeof saved.model !== 'string')
      return { config: { ...DEFAULT_AI_CONFIG }, apiKey: '' };
    if (
      saved.transport !== undefined &&
      saved.transport !== 'compatible' &&
      saved.transport !== 'relay'
    )
      return { config: { ...DEFAULT_AI_CONFIG }, apiKey: '' };
    const config = validateAiConfig({
      endpoint: saved.endpoint,
      model: saved.model,
      enabled: saved.enabled === true,
      // Earlier versions stored a complete relay URL rather than an API base URL.
      transport: saved.transport === 'compatible' ? 'compatible' : 'relay',
      rememberKey: saved.rememberKey === true,
    });
    const apiKey =
      config.rememberKey && typeof saved.apiKey === 'string' ? validateApiKey(saved.apiKey) : '';
    return { config, apiKey };
  } catch {
    return { config: { ...DEFAULT_AI_CONFIG }, apiKey: '' };
  }
}
export function readAiConfig(storage?: Pick<AiStorage, 'getItem'>): AiConfig {
  return storedConnection(storage).config;
}
function validateApiKey(value: string): string {
  const key = value.trim();
  if (
    key.length > 512 ||
    Array.from(key).some(
      (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) > 126,
    )
  )
    throw new Error('The API key contains unsupported characters.');
  return key;
}
function hideKey(text: string, key: string, partial = false): string {
  if (!key) return text;
  let safe = text.replaceAll(key, '[redacted]');
  if (partial) {
    for (let length = Math.min(key.length - 1, safe.length); length > 0; length--) {
      if (safe.endsWith(key.slice(0, length))) {
        safe = safe.slice(0, -length);
        break;
      }
    }
  }
  return safe;
}
const unavailableTransport: AiTransport = {
  request: async () => {
    throw new AiReplyError('connection', 'The online service is unavailable.');
  },
  cancel: () => {},
  dispose: () => {},
};
/** A runtime owns its credentials, transport and subscriptions. Config snapshots never expose keys. */
export function createAiConnection(
  storage?: AiStorage,
  transport: AiTransport = unavailableTransport,
) {
  let { config, apiKey } = storedConnection(storage);
  let disposed = false,
    revision = 0;
  const listeners = new Set<() => void>();
  return {
    getConfig: (): AiConfig => ({ ...config }),
    hasApiKey: (): boolean => !!apiKey,
    saveConfig(value: AiConfig, replacementKey?: string): boolean {
      if (disposed) return false;
      const next = validateAiConfig(value);
      const key =
        replacementKey === undefined
          ? next.endpoint === config.endpoint
            ? apiKey
            : ''
          : validateApiKey(replacementKey);
      if (key && (next.endpoint.includes(key) || next.model.includes(key)))
        throw new Error('Keep the API key in its own field.');
      transport.cancel();
      revision++;
      config = next;
      apiKey = key;
      listeners.forEach((listener) => listener());
      try {
        if (!storage) return false;
        storage.setItem(
          AI_CONFIG_KEY,
          JSON.stringify({
            ...config,
            enabled: config.enabled && (!apiKey || config.rememberKey),
            ...(config.rememberKey && apiKey ? { apiKey } : {}),
          }),
        );
        return true;
      } catch {
        return false;
      }
    },
    onChange(listener: () => void) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async reply(
      messages: AiMessage[],
      signal: AbortSignal,
      onText?: (text: string) => void,
    ): Promise<string> {
      if (disposed || !config.enabled) throw new AiReplyError('offline', 'Connection is offline.');
      const generation = revision,
        key = apiKey;
      const active = () => !disposed && generation === revision && !signal.aborted;
      if (!active()) throw new AiReplyError('cancelled', 'Request cancelled.');
      const result = await transport.request({
        config: { ...config },
        apiKey: key,
        signal,
        messages: messages
          .slice(-20)
          .map((message) => ({ role: message.role, content: message.content.slice(0, 12000) })),
        onText: (text) => {
          if (active()) onText?.(hideKey(text.slice(0, 6000), key, true));
        },
      });
      if (!active()) throw new AiReplyError('cancelled', 'Request cancelled.');
      return hideKey(result, key).trim().slice(0, 6000);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      revision++;
      apiKey = '';
      transport.dispose();
      listeners.clear();
    },
  };
}
export type AiConnection = ReturnType<typeof createAiConnection>;
