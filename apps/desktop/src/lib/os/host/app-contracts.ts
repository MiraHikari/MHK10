import type { FrameEffects } from '../../gfx/fx';
import type { Renderer } from '../../gfx/context';
import type { InputController, InputScope } from '../../ui/canvas/input';
import type { WidgetScope } from '../../ui/canvas/widgets';
import type { DoomState } from '../story/doom';
import type { FileSystem } from '../files/filesystem';
import type { Documents } from '../files/documents';
import type { SaveTextRequest, SaveTextResult } from '../files/save-request';
import type { SandboxFile } from '../files/filesystem';
import type { Story } from '../story/story';
import type { AudioService, SoundName } from '../audio/pcspeaker';
import type { RuntimeSnapshot } from '../story/runtime-state';
import type { AiConnection } from '../ai/ai-connection';
import type { AppMenus, AppMenuSelection } from '../../ui/canvas/menu-types';
import type { DesktopCapabilities } from '../desktop/desktop-settings';
import type { FileSurfaceCapabilities } from '../files/file-transfer';
import type { TextClipboard } from './text-clipboard';
import type { FileAudio } from '../audio/file-audio';

export type {
  MenuCommand,
  MenuEntry,
  AppMenus,
  AppMenuSelection,
} from '../../ui/canvas/menu-types';
export interface AppView {
  readonly win: { readonly id: string; readonly menu: { readonly open: number } };
  readonly client: Readonly<{ x: number; y: number; w: number; h: number }>;
  readonly menuSel: AppMenuSelection | null;
  readonly focused: boolean;
  readonly pointerIn: boolean;
}
export interface AppFrameRequest extends AppView {
  readonly t: number;
  readonly dt: number;
}
export interface AppFrame extends AppFrameRequest {
  readonly draw: Renderer;
  readonly input: InputScope;
  readonly widgets: WidgetScope;
  readonly effects: FrameEffects;
}
/** The session owns its input and widget scope; the host owns the surface. */
export interface AppSessionSurface {
  readonly draw: Renderer;
  readonly input: InputController;
  readonly effects: FrameEffects;
  readonly owner: string;
}
export type OpenResult =
  | { accepted: true }
  | { accepted: false; reason: 'unknown-app' | 'unavailable' | 'blocked' };
/** A live window as seen by the Task Manager, independent of the window manager internals. */
export interface ProcessDescriptor {
  id: string;
  appId: string;
  title: string;
  focused: boolean;
  minimized: boolean;
}
export interface NativeTextFile {
  kind: 'text';
  id: string;
  title: string;
  text: string;
  revision: number;
  readonly: boolean;
}
export interface NativeAssetFile {
  kind: 'image' | 'audio';
  id: string;
  title: string;
  blob: Blob;
  mime: string;
  revision: number;
  readonly: boolean;
}
export type NativeFile = NativeTextFile | NativeAssetFile;
export type NativeFileResult =
  | { status: 'read'; file: NativeFile }
  | { status: 'saved'; file: NativeTextFile; persisted: boolean }
  | { status: 'opened' }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };
export interface NativeFileServices {
  read(fileId: string): Promise<NativeFileResult> | NativeFileResult;
  write(
    fileId: string,
    content: string,
    revision: number,
  ): Promise<NativeFileResult> | NativeFileResult;
  saveAs(name: string, content: string, folder?: string): Promise<NativeFileResult>;
  open(fileId: string, application?: string): Promise<NativeFileResult> | NativeFileResult;
}
const unavailableNativeFile = async (): Promise<NativeFileResult> => ({
  status: 'failed',
  error: 'The file service is unavailable in this host.',
});
export const UNAVAILABLE_NATIVE_FILES: NativeFileServices = Object.freeze({
  read: unavailableNativeFile,
  write: unavailableNativeFile,
  saveAs: unavailableNativeFile,
  open: unavailableNativeFile,
});
export interface SaveDialogRequest extends SaveTextRequest {
  onSave(file: SandboxFile, persisted: boolean): void;
}
export type FileSelectionResult =
  | { status: 'selected'; file: File }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };
export interface FileSelection {
  readonly result: Promise<FileSelectionResult>;
  cancel(): void;
}
export interface AppServices {
  readonly initialFileId?: string;
  openFile?(fileId: string, application?: string): OpenResult;
  chooseFileApplication?(fileId: string): OpenResult;
  loadFileAsset?(fileId: string): Promise<Blob | undefined>;
  takeFileOpen?(appId: string): string | undefined;
  readonly reducedMotion?: boolean;
  readonly desktop?: DesktopCapabilities;
  readonly fileSurfaces?: FileSurfaceCapabilities;
  readonly nativeFiles?: NativeFileServices;
  readonly documentBackupLimit?: number;
  readonly clipboard: TextClipboard;
  pickFile(request: { accept: string }): FileSelection;
  readonly fileAudio: { open(fileId: string): FileAudio };
  /** Request a paint after an asynchronous result changes a static session. */
  invalidate(): void;
  openSaveDialog?(frame: AppFrame, request: SaveDialogRequest, save: AppServices['saveText']): void;
  exportSandbox?(): Promise<{ ok: true } | { ok: false; error: string }>;
  now(): number;
  readonly audio: AudioService;
  readonly wallpaper: { getWallpaper(): 0 | 1 | 2 | 3; setWallpaper(value: 0 | 1 | 2 | 3): void };
  doom: DoomState;
  files: FileSystem;
  documents: Documents;
  story: Story;
  ai: AiConnection;
  snapshot(): RuntimeSnapshot;
  doomUp(): void;
  doomDown(): boolean;
  open(appId: string, launchBounds?: { x: number; y: number; w: number; h: number }): OpenResult;
  close(winId: string): void;
  /** Live window roster for a task manager; absent in single-window hosts. */
  processes?(): readonly ProcessDescriptor[];
  /**
   * Raise a window and give it focus, restoring it first when minimized.
   * Optional: absent in single-window hosts, so "Switch To" affordances must guard.
   */
  focus?(winId: string): void;
  setTitle(winId: string, title: string): void;
  saveText(request: SaveTextRequest): Promise<SaveTextResult>;
  downloadText(name: string, content: string): void;
  exportDocuments?(): Promise<{ ok: true; content: string } | { ok: false; error: string }>;
  importDocuments?(content: string): Promise<{ ok: true } | { ok: false; error: string }>;
  msg(spec: MsgSpec): void;
  play(sound: SoundName): void;
  setTheme(name: string): void;
  themeName(): string;
}
export interface MsgSpec {
  title: string;
  icon?: 'error' | 'warn' | 'info' | 'question';
  lines: string[];
  buttons?: string[];
  def?: number;
  noClose?: boolean;
  check?: { label: string; checked: boolean };
  onBtn?: (index: number, env: AppServices, checked?: boolean) => void;
  /** Closing without selecting a button cancels a waiting application request. */
  onDismiss?: () => void;
}
export interface AppMetadata {
  register?: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  id: string;
  title: string;
  icon?: string;
  w: number;
  h: number;
  x?: number;
  y?: number;
  ctl?: 'mx' | 'x' | '';
  noClose?: boolean;
  modal?: boolean;
}
/** Authoring interface. State remains private to the registered session factory. */
export interface AssistantView {
  readonly draft: string;
  readonly mode: 'guide' | 'online';
  readonly onlineHost: string | null;
  readonly guideOpen: boolean;
  readonly canSend: boolean;
  readonly canStop: boolean;
  readonly canRetry: boolean;
  readonly canGuide: boolean;
  readonly status: string;
  readonly announcement: { readonly id: number; readonly text: string } | null;
  readonly messages: readonly {
    readonly role: 'You' | 'Assistant' | 'Online AI';
    readonly text: string;
  }[];
  readonly prompts: readonly { readonly id: string; readonly label: string }[];
}
export type AssistantCommand =
  | { kind: 'draft'; text: string; selection?: { start: number; end: number } }
  | { kind: 'mode'; mode: AssistantView['mode'] }
  | { kind: 'prompt'; id: string }
  | { kind: 'send' | 'stop' | 'retry' | 'toggle-guide' | 'connection' };
export interface App<S = unknown> extends AppMetadata {
  create(env: AppServices): S;
  draw(state: S, frame: AppFrame, env: AppServices): void;
  assistantView?(state: S, env: AppServices): AssistantView;
  assistantCommand?(state: S, command: AssistantCommand, env: AppServices): void;
  menus?(state: S, env: AppServices): AppMenus | undefined;
  status?(state: S, env: AppServices): string | undefined;
  /** Omitted applications retain continuous frames. Static applications opt in. */
  needsFrame?(state: S, env: AppServices): boolean;
  /** Save synchronously before page navigation; never close UI or show dialogs. */
  checkpoint?(state: S, env: AppServices): boolean;
  onClose?(state: S, env: AppServices): void | boolean | Promise<void | boolean>;
  dispose?(state: S, env: AppServices): void;
}
export interface AppSession {
  /** Synchronous checkpoint for the browser's cancellable beforeunload event. Never disposes. */
  prepareUnload(): boolean;
  frame(frame: AppFrameRequest): void;
  needsFrame?(): boolean;
  assistantView?(): AssistantView | undefined;
  assistantCommand?(command: AssistantCommand): void;
  menus(): AppMenus | undefined;
  status(): string | undefined;
  requestClose(): Promise<boolean>;
  flushClose(): Promise<boolean>;
  dispose(): void;
  readonly closed: boolean;
}
export interface CanvasApp extends AppMetadata {
  kind: 'canvas';
  createSession(env: AppServices, surface: AppSessionSurface): AppSession;
}
export interface HtmlApp extends AppMetadata {
  kind: 'html';
  html: string;
}
export type Application = CanvasApp | HtmlApp;
