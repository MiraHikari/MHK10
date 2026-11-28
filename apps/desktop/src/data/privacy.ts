import { STORAGE_KEYS } from './storage-keys';
import { READER_STORAGE_KEY, SHARED_SERVICE_KEYS } from '@mhk/site-core/storage/keys';
export interface LocalRecord {
  readonly key: string;
  readonly store: 'localStorage' | 'indexedDB';
  readonly purpose: string;
}

/** Keys written by this site. The inventory test checks them against the source. */
export const LOCAL_RECORDS: readonly LocalRecord[] = [
  {
    key: STORAGE_KEYS.theme,
    store: 'localStorage',
    purpose: 'The selected color scheme name.',
  },
  {
    key: STORAGE_KEYS.wallpaper,
    store: 'localStorage',
    purpose: 'The wallpaper number.',
  },
  {
    key: STORAGE_KEYS.pixelWallpaper,
    store: 'localStorage',
    purpose: 'A pixel wallpaper you drew and saved.',
  },
  {
    key: STORAGE_KEYS.desktop,
    store: 'localStorage',
    purpose:
      'Desktop settings: resolution, volume, sound scheme, reduced motion, pointer, clock, screen saver, startup, window animation, assistant, risk display, pixel-image preference, icons, Quick Launch, and recent commands and programs.',
  },
  {
    key: STORAGE_KEYS.desktopIcons,
    store: 'localStorage',
    purpose: 'Desktop icon positions.',
  },
  {
    key: STORAGE_KEYS.pixelScale,
    store: 'localStorage',
    purpose: 'Whether the picture is scaled by whole pixels.',
  },
  {
    key: STORAGE_KEYS.crt,
    store: 'localStorage',
    purpose: 'Whether scanlines are shown.',
  },
  {
    key: STORAGE_KEYS.doom,
    store: 'localStorage',
    purpose: 'The current story meter value.',
  },
  {
    key: STORAGE_KEYS.story,
    store: 'localStorage',
    purpose: 'The story checkpoint.',
  },
  {
    key: STORAGE_KEYS.files,
    store: 'localStorage',
    purpose: 'Folders, text, and shortcuts you created on this computer.',
  },
  {
    key: STORAGE_KEYS.diary,
    store: 'localStorage',
    purpose: 'The old diary key. When read, it is moved into the file records.',
  },
  {
    key: STORAGE_KEYS.associations,
    store: 'localStorage',
    purpose: 'File open-with choices.',
  },
  {
    key: READER_STORAGE_KEY,
    store: 'localStorage',
    purpose: 'Reading position, layout, bookmarks, highlights, and notes.',
  },
  {
    key: STORAGE_KEYS.ai,
    store: 'localStorage',
    purpose:
      'A chat service address and model you entered. An API key is stored here only if you choose to remember it. The service is off by default, and the key is not remembered by default.',
  },
  {
    key: STORAGE_KEYS.assets,
    store: 'indexedDB',
    purpose: 'Binary contents of files you saved on this computer.',
  },
  {
    key: SHARED_SERVICE_KEYS.giscusSession,
    store: 'localStorage',
    purpose:
      'A Giscus session token written after you sign in with GitHub to comment. It is absent until you do that.',
  },
  {
    key: SHARED_SERVICE_KEYS.kounterFlags,
    store: 'localStorage',
    purpose: 'Timestamps of counted visits, used to deduplicate visits within one day.',
  },
];
