import type { AppFrame } from '../../os/host/app-contracts';
import { appMetadata } from '../../../data/app-catalog';
import { C } from '../../gfx/palette';

import type { AppServices } from '../../os/host/app-contracts';
import { defineCanvasApp } from '../../os/host/app-session';

import { storySignals } from '../../os/story/story';
import type { PrintLayout } from '../../ui/text/print-layout';
import articleMetadata from '../../../data/article-library.generated.json';

import {
  articleDocument,
  certificateDocument,
  createPrintLayout,
  type PrintableDocument,
} from './print-model';

const articles = articleMetadata.map((article) => ({
  id: `library:article:${article.slug}`,
  title: article.title,
}));
interface PrintDocumentChoice {
  id: string;
  title: string;
  content?: string;
}
type Zoom = 'page' | 1 | 2;
interface State {
  selected: string;
  page: number;
  zoom: Zoom;
  x: number;
  y: number;
  notice: string;
  printing: boolean;
  alive: boolean;
  loadGeneration: number;
  loading?: string;
  failed?: string;
  document?: PrintableDocument;
  layout?: { content: string; revision: number; value: PrintLayout };
  rendered?: {
    title: string;
    content: string;
    page: number;
    revision: number;
    canvas: HTMLCanvasElement;
  };
}
function documents(env: AppServices): PrintDocumentChoice[] {
  const story = env.story.get();
  return [
    ...articles,
    ...env.files
      .folders()
      .flatMap((folder) => env.files.list('documents', folder.id))
      .filter((file) => file.source !== 'personal' && (!file.kind || file.kind === 'text'))
      .map((file) => ({ id: file.id, title: file.name, content: file.content })),
    certificateDocument(story.owner, story.permissions, storySignals(story).stageLabel),
  ];
}
function loadDocument(state: State, env: AppServices, choice: PrintDocumentChoice): void {
  const generation = ++state.loadGeneration;
  state.layout = undefined;
  state.rendered = undefined;
  state.failed = undefined;
  state.notice = '';
  if (choice.content !== undefined) {
    state.document = { ...choice, content: choice.content };
    state.loading = undefined;
    return;
  }
  state.document = undefined;
  state.loading = choice.id;
  state.notice = 'Loading document...';
  void env.files.readText(choice.id).then((result) => {
    if (!state.alive || generation !== state.loadGeneration) return;
    state.loading = undefined;
    if (result.ok) {
      state.document = articleDocument(choice.id, result.text);
      state.notice = '';
    } else {
      state.failed = choice.id;
      state.notice = result.error;
    }
    env.invalidate();
  });
}
function layoutFor(frame: AppFrame, state: State, document: PrintableDocument): PrintLayout {
  if (
    !state.layout ||
    state.layout.content !== document.content ||
    state.layout.revision !== frame.draw.fonts.fontRevision
  )
    state.layout = {
      content: document.content,
      revision: frame.draw.fonts.fontRevision,
      value: createPrintLayout(document.content, (value) => frame.draw.tw(value, 'cjk')),
    };
  return state.layout.value;
}
function paperFor(
  frame: AppFrame,
  state: State,
  document: PrintableDocument,
  layout: PrintLayout,
): HTMLCanvasElement {
  const previous = state.rendered;
  if (
    previous &&
    previous.content === document.content &&
    previous.title === document.title &&
    previous.page === state.page &&
    previous.revision === frame.draw.fonts.fontRevision
  )
    return previous.canvas;
  const canvas = frame.draw.offscreen(layout.width, layout.height, (offscreenDraw) => {
    offscreenDraw.rect(0, 0, layout.width, layout.height, C.white);
    const width = layout.width - layout.margin * 2;
    offscreenDraw.text(
      offscreenDraw.fitText(document.title, width, 'cjk'),
      layout.margin,
      layout.margin,
      {
        font: 'cjk',
        color: C.black,
      },
    );
    offscreenDraw.rect(layout.margin, layout.margin + layout.headerHeight - 8, width, 1, C.gray);
    layout.pages[state.page].forEach((line, index) =>
      offscreenDraw.text(
        line,
        layout.margin,
        layout.margin + layout.headerHeight + index * layout.lineHeight,
        {
          font: 'cjk',
          color: C.black,
        },
      ),
    );
    const footer = layout.height - layout.margin - layout.footerHeight;
    offscreenDraw.rect(layout.margin, footer, width, 1, C.gray);
    offscreenDraw.text(
      `MHK10  |  ${state.page + 1} / ${layout.pages.length}`,
      layout.width - layout.margin,
      footer + 6,
      { font: 'cjk', color: C.black, align: 'right' },
    );
  });
  state.rendered = {
    title: document.title,
    content: document.content,
    page: state.page,
    revision: frame.draw.fonts.fontRevision,
    canvas,
  };
  return canvas;
}
function changePage(state: State, page: number, count: number): void {
  state.notice = '';
  state.page = Math.max(0, Math.min(count - 1, page));
  state.x = state.y = 0;
}
function changeZoom(state: State, zoom: Zoom): void {
  state.notice = '';
  state.zoom = zoom;
  state.x = state.y = 0;
}
async function print(
  state: State,
  env: AppServices,
  document: PrintableDocument,
  layout: PrintLayout,
): Promise<void> {
  if (state.printing || !env.desktop?.printDocument) return;
  state.printing = true;
  state.notice = 'Preparing print job...';
  env.invalidate();
  try {
    await env.desktop.printDocument(document.title, document.content, layout);
    if (state.alive) state.notice = 'Print dialog opened.';
  } catch {
    if (state.alive) state.notice = 'The print job could not be opened. Please try again.';
  } finally {
    if (state.alive) {
      state.printing = false;
      env.invalidate();
    }
  }
}
export const printPreviewApp = defineCanvasApp<State>({
  ...appMetadata('print-preview'),
  create: () => ({
    selected: articles[0]?.id ?? 'certificate',
    page: 0,
    zoom: 1,
    x: 0,
    y: 0,
    notice: '',
    printing: false,
    alive: true,
    loadGeneration: 0,
  }),
  needsFrame: () => false,
  menus: (state, env) => ({
    File: [
      {
        command: 'print',
        label: 'Print...',
        disabled: !env.desktop?.printDocument || state.printing || !state.document,
      },
      { command: 'export', label: 'Export text', disabled: !state.document },
      '-',
      { command: 'close', label: 'Close' },
    ],
    View: [
      { command: 'zoom-page', label: 'One page' },
      { command: 'zoom-100', label: '100%' },
      { command: 'zoom-200', label: '200%' },
      '-',
      { command: 'first-page', label: 'First page' },
      { command: 'last-page', label: 'Last page' },
    ],
    Document: [
      { command: 'previous-document', label: 'Previous document' },
      { command: 'next-document', label: 'Next document' },
      { command: 'reload-document', label: 'Retry loading', disabled: !state.failed },
    ],
    Help: [{ command: 'help', label: 'Print Preview Help' }],
  }),
  status: (state) =>
    state.notice ||
    (state.document
      ? `Page ${state.page + 1} of ${state.layout?.value.pages.length ?? 1} | ${state.zoom === 'page' ? 'One page' : `${state.zoom * 100}%`} | A4 portrait`
      : 'Loading document...'),
  checkpoint: (state) => !state.printing,
  onClose: (state) => !state.printing,
  dispose: (state) => {
    state.alive = false;
    state.loadGeneration++;
    state.document = undefined;
    state.loading = undefined;
    state.rendered = undefined;
    state.layout = undefined;
  },
  draw(state, view, env) {
    const c = view.client,
      action = view.menuSel?.command;
    const files = documents(env);
    let selected = Math.max(
      0,
      files.findIndex((file) => file.id === state.selected),
    );
    const select = (index: number) => {
      selected = Math.max(0, Math.min(files.length - 1, index));
      state.selected = files[selected].id;
      state.page = 0;
      state.x = state.y = 0;
      state.notice = '';
      state.loadGeneration++;
      state.document = undefined;
      state.loading = undefined;
      state.failed = undefined;
    };
    if (action === 'previous-document') select(selected - 1);
    if (action === 'next-document') select(selected + 1);
    if (action === 'zoom-page') changeZoom(state, 'page');
    if (action === 'zoom-100') changeZoom(state, 1);
    if (action === 'zoom-200') changeZoom(state, 2);
    view.draw.rect(c.x, c.y, c.w, c.h, view.draw.TH.face);
    if (view.widgets.button(c.x + c.w - 60, c.y + 31, 24, 21, '<', { disabled: selected === 0 }))
      select(selected - 1);
    if (
      view.widgets.button(c.x + c.w - 32, c.y + 31, 24, 21, '>', {
        disabled: selected === files.length - 1,
      })
    )
      select(selected + 1);
    const choice = files[selected];
    state.selected = choice.id;
    if (
      action === 'reload-document' ||
      (state.document?.id !== choice.id &&
        state.loading !== choice.id &&
        state.failed !== choice.id) ||
      (choice.content !== undefined && state.document?.content !== choice.content)
    )
      loadDocument(state, env, choice);
    env.setTitle(view.win.id, `${choice.title} - Print Preview`);
    view.draw.text(view.draw.fitText(choice.title, c.w - 86), c.x + 8, c.y + 36, {
      color: view.draw.TH.text,
    });
    if (!state.document) {
      view.widgets.button(c.x + 5, c.y + 4, 60, 23, 'Print...', { disabled: true });
      if (view.widgets.button(c.x + c.w - 62, c.y + 4, 56, 23, 'Close') || action === 'close')
        env.close(view.win.id);
      view.draw.text(view.draw.fitText(state.notice, c.w - 24), c.x + 12, c.y + 76, {
        color: view.draw.TH.text,
      });
      if (state.failed && view.widgets.button(c.x + 12, c.y + 96, 68, 23, 'Retry'))
        loadDocument(state, env, choice);
      return;
    }
    const document = state.document;
    const layout = layoutFor(view, state, document);
    state.page = Math.max(0, Math.min(layout.pages.length - 1, state.page));
    if (action === 'first-page') changePage(state, 0, layout.pages.length);
    if (action === 'last-page') changePage(state, layout.pages.length - 1, layout.pages.length);
    if (
      view.widgets.button(c.x + 5, c.y + 4, 60, 23, 'Print...', {
        disabled: state.printing || !env.desktop?.printDocument,
      }) ||
      action === 'print'
    )
      void print(state, env, document, layout);
    if (view.widgets.button(c.x + 71, c.y + 4, 24, 23, '<', { disabled: state.page === 0 }))
      changePage(state, state.page - 1, layout.pages.length);
    if (
      view.widgets.button(c.x + 99, c.y + 4, 24, 23, '>', {
        disabled: state.page === layout.pages.length - 1,
      })
    )
      changePage(state, state.page + 1, layout.pages.length);
    view.draw.text(`${state.page + 1} / ${layout.pages.length}`, c.x + 158, c.y + 11, {
      align: 'center',
    });
    if (view.widgets.button(c.x + 199, c.y + 4, 24, 23, '-', { disabled: state.zoom === 'page' }))
      changeZoom(state, state.zoom === 2 ? 1 : 'page');
    if (
      view.widgets.button(
        c.x + 227,
        c.y + 4,
        54,
        23,
        state.zoom === 'page' ? 'Page' : `${state.zoom * 100}%`,
      )
    )
      changeZoom(state, state.zoom === 'page' ? 1 : state.zoom === 1 ? 2 : 'page');
    if (view.widgets.button(c.x + 285, c.y + 4, 24, 23, '+', { disabled: state.zoom === 2 }))
      changeZoom(state, state.zoom === 'page' ? 1 : 2);
    if (
      view.widgets.button(c.x + 319, c.y + 4, 68, 23, 'One page', {
        pressed: state.zoom === 'page',
      })
    )
      changeZoom(state, 'page');
    if (
      (c.w >= 456 && view.widgets.button(c.x + c.w - 62, c.y + 4, 56, 23, 'Close')) ||
      action === 'close'
    )
      env.close(view.win.id);
    if (action === 'export') {
      env.downloadText(`${document.title.replace(/[<>:"/\\|?*]/g, '-')}.txt`, document.content);
      state.notice = 'Document exported.';
    }
    if (action === 'help')
      env.msg({
        title: 'Print Preview Help',
        icon: 'info',
        lines: [
          'One page shows the complete sheet.',
          '100% and 200% enlarge the same printed page.',
          'The mouse wheel and scroll bars move the sheet.',
          'Page arrows turn pages. Document arrows select a file.',
          'Print uses the same margins and page breaks shown here.',
        ],
      });
    const viewport = { x: c.x + 7, y: c.y + 58, w: c.w - 31, h: c.h - 81 };
    view.widgets.bevel(
      viewport.x - 2,
      viewport.y - 2,
      viewport.w + 4,
      viewport.h + 4,
      'sunken',
      view.draw.TH.shadow,
    );
    const zoom =
      state.zoom === 'page'
        ? Math.min((viewport.w - 12) / layout.width, (viewport.h - 12) / layout.height)
        : state.zoom;
    const width = Math.max(1, Math.floor(layout.width * zoom)),
      height = Math.max(1, Math.floor(layout.height * zoom));
    const maxX = Math.max(0, width - viewport.w + 12),
      maxY = Math.max(0, height - viewport.h + 12);
    if (view.input.hit(viewport.x, viewport.y, viewport.w, viewport.h).hover && view.input.io.wheel)
      state.y += Math.sign(view.input.io.wheel) * layout.lineHeight * 3;
    if (view.focused && view.win.menu.open < 0) {
      if (view.input.io.keyPressed.has('PageDown')) state.y += viewport.h - 16;
      if (view.input.io.keyPressed.has('PageUp')) state.y -= viewport.h - 16;
      if (view.input.io.keyPressed.has('Home')) state.y = 0;
      if (view.input.io.keyPressed.has('End')) state.y = maxY;
    }
    if (view.widgets.button(c.x + c.w - 20, viewport.y, 17, 18, '^', { disabled: state.y <= 0 }))
      state.y -= 32;
    if (
      view.widgets.button(c.x + c.w - 20, viewport.y + viewport.h - 18, 17, 18, 'v', {
        disabled: state.y >= maxY,
      })
    )
      state.y += 32;
    if (view.widgets.button(viewport.x, c.y + c.h - 19, 18, 17, '<', { disabled: state.x <= 0 }))
      state.x -= 32;
    if (
      view.widgets.button(viewport.x + viewport.w - 18, c.y + c.h - 19, 18, 17, '>', {
        disabled: state.x >= maxX,
      })
    )
      state.x += 32;
    state.x = Math.max(0, Math.min(maxX, state.x));
    state.y = Math.max(0, Math.min(maxY, state.y));
    const left =
      viewport.x + (width < viewport.w - 12 ? Math.floor((viewport.w - width) / 2) : 6) - state.x;
    const top = viewport.y + 6 - state.y;
    const context = view.draw.getCtx();
    context.save();
    context.beginPath();
    context.rect(viewport.x, viewport.y, viewport.w, viewport.h);
    context.clip();
    view.draw.rect(left + 3, top + 3, width, height, C.black);
    context.imageSmoothingEnabled = false;
    context.drawImage(paperFor(view, state, document, layout), left, top, width, height);
    context.restore();
  },
});
