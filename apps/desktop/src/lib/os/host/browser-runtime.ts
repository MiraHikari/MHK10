import { STORAGE_KEYS } from '../../../data/storage-keys';
import { createFileSystem } from '../files/filesystem';
import { createDocuments } from '../files/documents';
import { createStory } from '../story/story';
import { createAiConnection } from '../ai/ai-connection';
import { createBrowserAiTransport } from '../ai/browser-ai-transport';
import { createRuntimeState } from '../story/runtime-state';
import { createBrowserAssetStore } from '../files/browser-asset-store';
import { publicLibrary, publicAssetPath } from '../../../data/public-files';
import { APP_CATALOG } from '../../../data/app-catalog';
import { createFileAssociationStore } from '../files/file-associations';
import { createLifetime } from '../../ui/browser/lifetime';
import { createDocumentBackup } from '../files/document-backup';

export function browserStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/** Browser composition root. Domain constructors never acquire global resources themselves. */
export function createBrowserRuntime(mode: 'story' | 'legacy' = 'story') {
  const lifetime = createLifetime();
  try {
    const storage = browserStorage();
    const associations = createFileAssociationStore(
      storage,
      APP_CATALOG.filter((app) => app.files?.length).map((app) => app.id),
    );
    const story = createStory(storage);
    const assets = createBrowserAssetStore();
    lifetime.defer(assets.dispose);
    const files = createFileSystem(storage ?? null, {
      releaseAssets: (ids) => {
        void Promise.allSettled(ids.map((id) => assets.remove(id)));
      },
      library: publicLibrary,
      desktopShortcuts: APP_CATALOG.filter((app) => app.desktop?.length).map((app) => ({
        appId: app.id,
        name: app.name,
      })),
    });
    const documents = createDocuments(files);
    const assetReads = new AbortController();
    lifetime.defer(() => assetReads.abort());
    const readPublicAsset = async (assetId: string): Promise<Blob | undefined> => {
      const path = publicAssetPath(assetId);
      if (!path || lifetime.disposed) return;
      try {
        const response = await fetch(path, {
          signal: assetReads.signal,
          credentials: 'same-origin',
        });
        return response.ok ? await response.blob() : undefined;
      } catch {
        return undefined;
      }
    };
    const documentBackup = createDocumentBackup(files, assets, readPublicAsset);
    lifetime.defer(documentBackup.dispose);
    const readFileAsset = async (id: string): Promise<Blob | undefined> => {
      if (lifetime.disposed) return;
      const file = files.get(id);
      if (!file || file.deleted || !file.assetId) return;
      return (await assets.get(file.assetId)) ?? readPublicAsset(file.assetId);
    };
    const transport = createBrowserAiTransport();
    // Ownership transfers only after the connection has successfully initialized.
    let releaseConnection = transport.dispose;
    lifetime.defer(() => releaseConnection());
    const ai = createAiConnection(storage, transport);
    releaseConnection = ai.dispose;
    let initialMeter = 5;
    try {
      initialMeter = Number(storage?.getItem(STORAGE_KEYS.doom) ?? 5);
    } catch {
      /* Session defaults remain usable. */
    }
    const risk = createRuntimeState(story, mode, initialMeter);
    lifetime.defer(risk.dispose);
    return {
      files,
      associations,
      assets,
      readFileAsset,
      documents,
      documentBackup,
      story,
      ai,
      risk,
      dispose: lifetime.dispose,
    };
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
export type BrowserRuntime = ReturnType<typeof createBrowserRuntime>;
