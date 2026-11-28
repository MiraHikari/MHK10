import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createBrowserRuntime } from './browser-runtime';
import { createBrowserAssetStore } from '../files/browser-asset-store';
import { createBrowserAiTransport } from '../ai/browser-ai-transport';
import { createAiConnection } from '../ai/ai-connection';
import { createRuntimeState } from '../story/runtime-state';

vi.mock('../files/browser-asset-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../files/browser-asset-store')>();
  return { ...actual, createBrowserAssetStore: vi.fn(actual.createBrowserAssetStore) };
});
vi.mock('../ai/browser-ai-transport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/browser-ai-transport')>();
  return { ...actual, createBrowserAiTransport: vi.fn(actual.createBrowserAiTransport) };
});
vi.mock('../ai/ai-connection', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../ai/ai-connection')>();
  return { ...actual, createAiConnection: vi.fn(actual.createAiConnection) };
});
vi.mock('../story/runtime-state', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../story/runtime-state')>();
  return { ...actual, createRuntimeState: vi.fn(actual.createRuntimeState) };
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('window', {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('browser runtime construction', () => {
  it('releases acquired assets and transport when connection construction fails', async () => {
    const assets = createBrowserAssetStore();
    const releaseAssets = vi.spyOn(assets, 'dispose');
    const transport = createBrowserAiTransport();
    const releaseTransport = vi.spyOn(transport, 'dispose');
    vi.mocked(createBrowserAssetStore).mockReturnValueOnce(assets);
    vi.mocked(createBrowserAiTransport).mockReturnValueOnce(transport);
    vi.mocked(createAiConnection).mockImplementationOnce(() => {
      throw new Error('connection initialization failed');
    });
    expect(() => createBrowserRuntime()).toThrow('connection initialization failed');
    expect(releaseAssets).toHaveBeenCalledOnce();
    expect(releaseTransport).toHaveBeenCalledOnce();
    await expect(assets.put('late', new Blob(['late']))).resolves.toEqual({
      ok: false,
      error: 'The asset store is closed.',
    });
  });

  it('releases the connection when a later runtime module fails', () => {
    const assets = createBrowserAssetStore();
    const releaseAssets = vi.spyOn(assets, 'dispose');
    const transport = createBrowserAiTransport();
    const releaseTransport = vi.spyOn(transport, 'dispose');
    const ai = createAiConnection(undefined, transport);
    const releaseConnection = vi.spyOn(ai, 'dispose');
    vi.mocked(createBrowserAssetStore).mockReturnValueOnce(assets);
    vi.mocked(createBrowserAiTransport).mockReturnValueOnce(transport);
    vi.mocked(createAiConnection).mockReturnValueOnce(ai);
    vi.mocked(createRuntimeState).mockImplementationOnce(() => {
      throw new Error('meter initialization failed');
    });
    expect(() => createBrowserRuntime()).toThrow('meter initialization failed');
    expect(releaseConnection).toHaveBeenCalledOnce();
    expect(releaseTransport).toHaveBeenCalledOnce();
    expect(releaseAssets).toHaveBeenCalledOnce();
  });

  it('releases every acquired service once even if one disposer throws', () => {
    const assets = createBrowserAssetStore();
    const releaseAssets = vi.spyOn(assets, 'dispose');
    vi.mocked(createBrowserAssetStore).mockReturnValueOnce(assets);
    const transport = createBrowserAiTransport();
    const releaseTransport = vi.spyOn(transport, 'dispose');
    const ai = createAiConnection(undefined, transport);
    const releaseConnection = vi.spyOn(ai, 'dispose').mockImplementation(() => {
      transport.dispose();
      throw new Error('connection disposal failed');
    });
    vi.mocked(createBrowserAiTransport).mockReturnValueOnce(transport);
    vi.mocked(createAiConnection).mockReturnValueOnce(ai);
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const runtime = createBrowserRuntime();
    expect(() => runtime.dispose()).not.toThrow();
    runtime.dispose();
    expect(releaseConnection).toHaveBeenCalledOnce();
    expect(releaseTransport).toHaveBeenCalledOnce();
    expect(releaseAssets).toHaveBeenCalledOnce();
    expect(error).toHaveBeenCalledOnce();
  });
});
