import { IMAGE_PRESENTATION_EVENT, pixelImagesEnabled } from '../../ui/browser/image-presentation';
import { UNAVAILABLE_NATIVE_FILES, type NativeFileServices } from '../../os/host/app-contracts';
import { mediaForAsset } from '../../../data/media';
import { canonicalImageSrc, imageBaseUrl } from '../../../data/images';
import type { MediaRecord } from '../../../data/media';
import {
  ImageBrowser,
  type ImageBrowserIntent,
  type ImageCommandContext,
  type ImageSort,
  type ImageView,
} from './image-browser-model';
import { claimSurface, createLifetime } from '../../ui/browser/lifetime';
import { ImageSurface } from './image-surface';
import { LocalImages } from './local-images';
import { ImageExport } from './image-export';
const sizeLabel = (bytes: number | undefined): string =>
  bytes === undefined
    ? 'Unknown size'
    : bytes < 1024
      ? `${bytes} B`
      : bytes < 1024 * 1024
        ? `${(bytes / 1024).toFixed(1)} KB`
        : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/** Composes image owners, commands, dialogs and slideshow for one HTML client. */
export function mountImageBrowser(
  root: HTMLElement,
  records: readonly MediaRecord[],
  nativeFiles?: NativeFileServices,
): () => void {
  const lifetime = createLifetime();
  lifetime.defer(claimSurface(root));
  try {
    return mountImageBrowserSession(root, records, lifetime, nativeFiles);
  } catch (error) {
    lifetime.dispose();
    throw error;
  }
}

function mountImageBrowserSession(
  root: HTMLElement,
  records: readonly MediaRecord[],
  lifetime: ReturnType<typeof createLifetime>,
  nativeFiles?: NativeFileServices,
): () => void {
  const controller = new AbortController();
  lifetime.defer(() => controller.abort());
  const signal = controller.signal;
  const get = <T extends HTMLElement>(selector: string): T => {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing image browser element: ${selector}`);
    return element;
  };
  const launchUrl = new URL(location.href);
  const mediaTarget = launchUrl.searchParams.get('media');
  const selectedId = mediaTarget
    ? (mediaForAsset(mediaTarget)?.id ?? mediaTarget)
    : mediaForAsset(launchUrl.searchParams.get('item') ?? '')?.id;
  const nativeFileId = new URL(location.href).searchParams.get('file');
  let nativePending = !!nativeFileId;
  const imageBase = imageBaseUrl();
  const model = new ImageBrowser(records, selectedId ?? undefined, imageBase);
  const body = get<HTMLElement>('.image-body');
  const stage = get<HTMLElement>('#image-stage');
  const list = get<HTMLElement>('#image-list');
  const emptyList = get<HTMLElement>('#image-list-empty');
  const search = get<HTMLInputElement>('#image-search');
  const sort = get<HTMLSelectElement>('#image-sort');
  const layout = get<HTMLSelectElement>('#image-layout');
  const input = get<HTMLInputElement>('#image-open');
  const original = get<HTMLAnchorElement>('#image-original');
  const properties = get<HTMLDialogElement>('#image-properties');
  const help = get<HTMLDialogElement>('#image-help');
  const adjustmentsDialog = get<HTMLDialogElement>('#image-adjustments');
  const adjustmentInputs = {
    brightness: get<HTMLInputElement>('#image-brightness'),
    contrast: get<HTMLInputElement>('#image-contrast'),
    saturation: get<HTMLInputElement>('#image-saturation'),
  };
  const adjustmentStatus = get<HTMLElement>('#image-adjustment-status');
  const copyStatus = get<HTMLElement>('#image-copy-status');
  const propertyValues = get<HTMLElement>('#image-property-values');
  const feedback = get<HTMLElement>('#image-feedback');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const isReducedMotion = () =>
    reducedMotion.matches || document.documentElement.dataset.reducedMotion === 'true';
  const files = nativeFiles ?? UNAVAILABLE_NATIVE_FILES;
  const localImages = new LocalImages();
  lifetime.defer(() => localImages.dispose());
  const imageSurface = new ImageSurface(
    root,
    (message) => {
      if (message || feedback.textContent.startsWith('Pixel processing is unavailable'))
        feedback.textContent = message;
    },
    imageBase,
  );
  lifetime.defer(() => imageSurface.dispose());
  const imageExport = new ImageExport(root, (request) => model.isCurrentCopy(request));
  lifetime.defer(() => imageExport.dispose());
  let pixelOverride: boolean | undefined;
  const isPixel = () => pixelOverride ?? pixelImagesEnabled();
  let timer: number | undefined;
  lifetime.defer(stopSlideshow);
  const initialList = [...list.childNodes];
  const initialProperties = [...propertyValues.childNodes];
  lifetime.defer(() => {
    list.replaceChildren(...initialList);
    propertyValues.replaceChildren(...initialProperties);
    properties.close();
    help.close();
    adjustmentsDialog.close();
  });
  // Astro owns these elements; release the attributes and values changed by this session.
  function preserveAttributes(element: HTMLElement, names: readonly string[]): void {
    const values = names.map((name) => [name, element.getAttribute(name)] as const);
    lifetime.defer(() => {
      for (const [name, value] of values) {
        if (value === null) element.removeAttribute(name);
        else element.setAttribute(name, value);
      }
    });
  }
  preserveAttributes(body, ['data-mode']);
  preserveAttributes(root, ['aria-busy']);
  preserveAttributes(original, ['href', 'download', 'aria-disabled']);
  preserveAttributes(emptyList, ['hidden']);
  for (const button of root.querySelectorAll<HTMLButtonElement>('[data-command]')) {
    preserveAttributes(button, ['aria-pressed', 'disabled', 'hidden']);
  }
  const reverse = get<HTMLButtonElement>('[data-command="reverse"]');
  const reverseLabel = reverse.textContent;
  lifetime.defer(() => {
    reverse.textContent = reverseLabel;
  });
  for (const control of [search, sort, layout, ...Object.values(adjustmentInputs)]) {
    const value = control.value;
    lifetime.defer(() => {
      control.value = value;
    });
  }
  feedback.textContent = '';
  copyStatus.textContent = '';
  if (selectedId && records.some((item) => item.id === selectedId)) setMode('view');
  else if (selectedId) feedback.textContent = 'Image not found';

  function setPressed(command: string, pressed: boolean): void {
    root
      .querySelectorAll(`[data-command="${command}"]`)
      .forEach((button) => button.setAttribute('aria-pressed', String(pressed)));
  }
  function setMode(mode: 'browse' | 'view'): void {
    const moveFocus = body.contains(document.activeElement);
    body.dataset.mode = mode;
    setPressed('browse', mode === 'view');
    imageSurface.refresh();
    if (moveFocus) {
      if (mode === 'view') stage.focus();
      else focusSelectedImage();
    }
  }
  function focusSelectedImage(): void {
    (list.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? search).focus();
  }
  function stopSlideshow(): void {
    if (timer !== undefined) window.clearInterval(timer);
    timer = undefined;
    setPressed('slideshow', false);
  }
  function startSlideshow(): void {
    if (timer !== undefined) return;
    setMode('view');
    setPressed('slideshow', true);
    timer = window.setInterval(() => {
      if (lifetime.disposed) return;
      // Direct movement keeps the slideshow running; a next command would stop it.
      model.move(1);
      render();
    }, 2500);
  }
  function render(rebuild = false): void {
    if (lifetime.disposed) return;
    const state = model.snapshot();
    if (imageExport.cancelIfStale()) copyFeedback('Export cancelled because the image changed.');
    const selected = state.selected;
    if (rebuild) {
      const fragment = document.createDocumentFragment();
      for (const item of state.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.mediaId = item.id;
        button.setAttribute('role', 'option');
        const image = document.createElement('img');
        image.src = pixelImagesEnabled() ? item.preview : item.display;
        image.dataset.originalSrc = item.display;
        image.dataset.pixelSrc = item.preview;
        image.style.imageRendering = pixelImagesEnabled() ? 'pixelated' : 'auto';
        image.alt = '';
        image.width = 64;
        image.height = 48;
        image.loading = 'lazy';
        const title = document.createElement('span');
        title.textContent = item.title;
        title.dataset.cjk = '';
        const detail = document.createElement('small');
        detail.textContent = `${item.date || 'No date'} · ${sizeLabel(item.file?.bytes)}`;
        button.append(image, title, detail);
        fragment.append(button);
      }
      list.replaceChildren(fragment);
    }
    list.dataset.view = state.view;
    list.querySelectorAll<HTMLButtonElement>('[data-media-id]').forEach((button) => {
      const active = button.dataset.mediaId === selected?.id;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
    });
    root.querySelectorAll<HTMLButtonElement>('[data-folder]').forEach((button) => {
      const selected = button.dataset.folder === state.folder;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
    });
    get<HTMLInputElement>('#image-path').value = state.folder || 'All images';
    get('#image-title').textContent = selected?.title ?? 'Image';
    get('#image-position').textContent = selected
      ? `${state.items.findIndex((item) => item.id === selected.id) + 1} / ${state.items.length}`
      : '0 / 0';
    get('#image-empty').hidden = state.items.length > 0;
    emptyList.hidden = state.items.length > 0;
    get<HTMLButtonElement>('[data-command="clear-search"]').hidden = !state.query;
    if (selected) {
      original.href = selected.original;
      original.download = selected.local
        ? selected.title
        : (selected.original.split('/').at(-1) ?? 'image');
      original.removeAttribute('aria-disabled');
    } else {
      original.removeAttribute('href');
      original.setAttribute('aria-disabled', 'true');
      get('#image-dimensions').textContent = '';
      get('#image-zoom').textContent = '';
    }
    for (const button of root.querySelectorAll<HTMLButtonElement>('[data-command]')) {
      button.disabled = model.commandDisabled(button.dataset.command ?? '', {
        reducedMotion: isReducedMotion(),
        exportBusy: imageExport.busy,
      });
    }
    for (const key of ['brightness', 'contrast', 'saturation'] as const) {
      adjustmentInputs[key].value = String(state.adjustments[key]);
      adjustmentInputs[key].disabled = !selected;
      get<HTMLOutputElement>(`#image-${key}-value`).value = `${state.adjustments[key]}%`;
    }
    setPressed('browse', body.dataset.mode === 'view');
    setPressed('fit', !!selected && state.zoom === 'fit');
    setPressed('actual', !!selected && state.zoom === 1);
    setPressed('flip-x', state.flipX);
    setPressed('flip-y', state.flipY);
    setPressed('reverse', state.descending);
    setPressed('compare', state.comparing);
    setPressed('slideshow', state.slideshow);
    reverse.textContent = state.descending ? '↓' : '↑';
    adjustmentStatus.textContent = state.comparing
      ? 'Showing original colours. Your adjustments are kept.'
      : 'Adjustments affect this view and exported copies.';
    root.setAttribute('aria-busy', String(imageExport.busy));
    if (selected && !selected.local && !nativeFileId)
      history.replaceState(
        null,
        '',
        `/acdsee/?media=${encodeURIComponent(selected.id === selectedId && mediaTarget ? mediaTarget : canonicalImageSrc(selected.display))}`,
      );
    setPressed('pixel', isPixel());
    imageSurface.render(state, isPixel());
  }
  function cancelExport(message?: string): void {
    if (imageExport.cancel() && message && !lifetime.disposed) copyFeedback(message);
  }
  function copyFeedback(message: string): void {
    feedback.textContent = message;
    feedback.title = message;
    copyStatus.textContent = message;
  }
  async function exportCopy(): Promise<void> {
    if (imageExport.busy || lifetime.disposed) return;
    const request = model.copyRequest();
    if (!request) return;
    const pending = imageExport.start(request);
    copyFeedback('Creating PNG copy…');
    render();
    const result = await pending;
    if (lifetime.disposed || result.status === 'superseded') return;
    render();
    if (result.status === 'downloaded')
      copyFeedback(
        `PNG copy: ${result.width} × ${result.height}${result.scaled ? ' (scaled to fit export limits)' : ''}.`,
      );
    else copyFeedback(result.status === 'failed' ? result.error : 'Export cancelled.');
  }
  function selectFolder(folder: HTMLButtonElement): void {
    apply(model.filterTo(folder.dataset.folder ?? '', search.value));
  }
  function showProperties(): void {
    const item = model.snapshot().selected;
    if (!item) return;
    const values: [string, string][] = [
      ['Name', item.title],
      [
        'File',
        item.original.startsWith('blob:')
          ? item.title
          : (item.original.split('/').at(-1) ?? item.title),
      ],
      ['Format', item.file?.format ?? item.image.format],
      ['Original size', item.file ? `${item.file.width} × ${item.file.height}` : 'Not recorded'],
      ['Preview size', `${item.image.width} × ${item.image.height}`],
      ['File size', sizeLabel(item.file?.bytes)],
      ['Date', item.date || 'Not recorded'],
      ['Location', item.folders.join(' / ')],
    ];
    propertyValues.replaceChildren();
    for (const [key, value] of values) {
      const dt = document.createElement('dt');
      dt.textContent = key;
      const dd = document.createElement('dd');
      dd.textContent = value;
      propertyValues.append(dt, dd);
    }
    if (!properties.open) properties.showModal();
  }
  function closeMenus(): void {
    root
      .querySelectorAll<HTMLDetailsElement>('.image-menubar details[open]')
      .forEach((menu) => (menu.open = false));
  }
  function commandContext(): ImageCommandContext {
    return { zoom: imageSurface.zoom, reducedMotion: isReducedMotion() };
  }
  function presentDialog(
    name: Extract<ImageBrowserIntent, { type: 'dialog' }>['name'],
    open: boolean,
  ): void {
    const dialog =
      name === 'adjustments' ? adjustmentsDialog : name === 'properties' ? properties : help;
    if (!open) {
      dialog.close();
      return;
    }
    if (name === 'properties') {
      showProperties();
      return;
    }
    if (!dialog.open) dialog.showModal();
  }
  function apply(intents: readonly ImageBrowserIntent[]): void {
    let rebuild: boolean | undefined;
    let focusSearch = false;
    for (const intent of intents) {
      switch (intent.type) {
        case 'render':
          rebuild = Boolean(rebuild) || intent.rebuild;
          break;
        case 'slideshow':
          if (intent.running) startSlideshow();
          else stopSlideshow();
          break;
        case 'open-files':
          input.click();
          break;
        case 'dialog':
          presentDialog(intent.name, intent.open);
          break;
        case 'export':
          void exportCopy();
          break;
        case 'cancel-export':
          cancelExport(intent.message);
          break;
        case 'mode':
          setMode(
            intent.mode === 'toggle'
              ? body.dataset.mode === 'view'
                ? 'browse'
                : 'view'
              : 'browse',
          );
          break;
        case 'search':
          search.value = intent.value;
          focusSearch = intent.focus;
          break;
        case 'print':
          window.print();
          break;
        case 'pixel':
          pixelOverride = !isPixel();
          break;
      }
    }
    if (rebuild !== undefined) render(rebuild);
    if (focusSearch) search.focus();
  }
  function command(id: string): void {
    closeMenus();
    apply(model.perform(id, commandContext()));
  }
  root.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return;
      const action = event.target.closest<HTMLButtonElement>('[data-command]');
      if (action && !action.disabled) {
        command(action.dataset.command ?? '');
        return;
      }
      const item = event.target.closest<HTMLButtonElement>('[data-media-id]');
      if (item) apply(model.choose(item.dataset.mediaId ?? ''));
    },
    { signal },
  );
  // Bind folder controls directly as well as through the list surface. The
  // embedded desktop bridge can focus a tree item before the parent surface
  // receives its bubbling click; the control itself remains the source of
  // truth for the filter action.
  root.querySelectorAll<HTMLButtonElement>('[data-folder]').forEach((folder) => {
    folder.addEventListener('click', () => selectFolder(folder), { signal });
  });
  list.addEventListener(
    'dblclick',
    (event) => {
      if (event.target instanceof Element && event.target.closest('[data-media-id]')) {
        setMode('view');
        stage.focus();
      }
    },
    { signal },
  );
  search.addEventListener(
    'input',
    () => {
      apply(model.filterTo(model.snapshot().folder, search.value));
    },
    { signal },
  );
  sort.addEventListener(
    'change',
    (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (value === 'name' || value === 'date' || value === 'size')
        model.order(value as ImageSort, model.snapshot().descending);
      render(true);
    },
    { signal },
  );
  layout.addEventListener(
    'change',
    (event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      if (value === 'thumbnails' || value === 'details' || value === 'list')
        model.layout(value as ImageView);
      render();
    },
    { signal },
  );
  for (const key of ['brightness', 'contrast', 'saturation'] as const) {
    adjustmentInputs[key].addEventListener(
      'input',
      () => {
        model.adjust({ [key]: Number(adjustmentInputs[key].value) });
        render();
      },
      { signal },
    );
  }
  root.addEventListener(
    'keydown',
    (event) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        properties.open ||
        help.open ||
        adjustmentsDialog.open
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest('.folder-tree, .image-menubar, [role="combobox"]')
      )
        return;
      if (
        event.target instanceof Element &&
        event.target.closest('[data-hybrid-toolbar]') &&
        ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)
      )
        return;
      if (
        event.key === 'Enter' &&
        event.target instanceof Element &&
        event.target.closest('button, a[href]') &&
        event.target.getAttribute('role') !== 'option'
      )
        return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement)
        return;
      const binding = model.keyIntent(event.key);
      if (!binding) return;
      event.preventDefault();
      if (binding.dismissMenus) closeMenus();
      apply(model.perform(binding.command, commandContext()));
      const inList = event.target instanceof Element && event.target.closest('#image-list');
      if (
        inList &&
        (binding.refocus === 'list' ||
          (binding.refocus === 'browsing-list' && body.dataset.mode === 'browse'))
      )
        focusSelectedImage();
    },
    { signal },
  );
  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) apply(model.haltSlideshow());
    },
    { signal },
  );
  reducedMotion.addEventListener(
    'change',
    () => {
      if (isReducedMotion()) apply(model.haltSlideshow());
      render();
    },
    { signal },
  );
  const motionObserver = new MutationObserver(() => {
    if (isReducedMotion()) apply(model.haltSlideshow());
    render();
  });
  lifetime.defer(() => motionObserver.disconnect());
  motionObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-reduced-motion'],
  });
  window.addEventListener(IMAGE_PRESENTATION_EVENT, () => render(), { signal });
  async function openFiles(files: readonly File[]): Promise<void> {
    const result = await localImages.open(files);
    if (lifetime.disposed || result.status === 'cancelled') return;
    if (result.records.length) {
      model.add(result.records);
      search.value = '';
      setMode('browse');
      render(true);
    }
    feedback.textContent = result.failures
      ? `${result.records.length} opened; ${result.failures} unreadable`
      : `${result.total} local images`;
  }
  input.addEventListener(
    'change',
    () => {
      const files = [...(input.files ?? [])];
      input.value = '';
      apply(model.haltSlideshow());
      if (!files.length) return;
      nativePending = false;
      cancelExport('Export cancelled because another image is opening.');
      render();
      void openFiles(files);
    },
    { signal },
  );
  window.addEventListener(
    'pagehide',
    (event) => {
      if (!event.persisted) lifetime.dispose();
      else {
        apply(model.haltSlideshow());
        imageSurface.suspend();
        localImages.cancel();
        nativePending = false;
        cancelExport();
        render();
      }
    },
    { signal },
  );
  render(true);
  if (nativeFileId) {
    feedback.textContent = 'Opening file…';
    void Promise.resolve(files.read(nativeFileId)).then((result) => {
      if (lifetime.disposed || !nativePending) return;
      nativePending = false;
      if (result.status === 'read' && result.file.kind === 'image') {
        void openFiles([
          new File([result.file.blob], result.file.title, { type: result.file.mime }),
        ]);
      } else
        feedback.textContent =
          result.status === 'failed' ? result.error : 'This file is not an image.';
    });
  }
  return lifetime.dispose;
}
