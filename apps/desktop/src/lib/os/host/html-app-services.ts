import { createNativeFileClient } from '../files/native-file-bridge';
import { createLifetime } from '../../ui/browser/lifetime';
import type { NativeFileServices } from './app-contracts';

/** The HTML composition owns the file channel; application clients receive its Interface. */
export function createHtmlAppServices() {
  const nativeFiles = createNativeFileClient();
  return { nativeFiles, dispose: nativeFiles.dispose };
}

export function mountHtmlApp(mount: (nativeFiles: NativeFileServices) => () => void): () => void {
  const lifetime = createLifetime();
  try {
    const services = createHtmlAppServices();
    lifetime.defer(services.dispose);
    lifetime.defer(mount(services.nativeFiles));
    lifetime.listen(window, 'pagehide', (event) => {
      if (!event.persisted) lifetime.dispose();
    });
    return lifetime.dispose;
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}
