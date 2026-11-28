import type { FolderId, SandboxFile } from './filesystem';

export interface SaveTextRequest {
  name: string;
  content: string;
  folder?: FolderId;
}

export type SaveTextResult =
  | { status: 'saved'; file: SandboxFile; persisted: boolean }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

/** Hosts own the picker and complete it exactly once, including dismissal. */
export type SaveText = (request: SaveTextRequest) => Promise<SaveTextResult>;
