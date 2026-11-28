import { describe, expect, it, vi } from 'vite-plus/test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  GISCUS_CONFIG,
  GISCUS_ORIGIN,
  GISCUS_WIDGET_DEFAULTS,
  giscusWidgetUrl,
} from '@mhk/site-core/config/giscus';

const captured = vi.hoisted(() => ({
  props: undefined as Record<string, unknown> | undefined,
}));

let stateCalls = 0;

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    // Open the visibility gate without a browser IntersectionObserver.
    useState: (initial: unknown) => [stateCalls++ === 0 ? true : initial, () => {}],
    useEffect: () => {},
    useRef: (initial: unknown) => ({ current: initial }),
  };
});

vi.mock('motion/react', () => ({
  AnimatePresence: () => null,
  motion: { div: 'div' },
}));

vi.mock('@giscus/react', () => ({
  default: (props: Record<string, unknown>) => {
    captured.props = props;
    return null;
  },
}));

import GiscusComments from './GiscusComments';

describe('GiscusComments widget parity', () => {
  it('renders the embed with the shared defaults', () => {
    stateCalls = 0;
    captured.props = undefined;
    renderToStaticMarkup(createElement(GiscusComments, { slug: 'colophon', bodyReady: false }));
    expect(captured.props).toEqual({
      repo: GISCUS_CONFIG.repo,
      repoId: 'R_kgXXXXXXXXXX',
      category: 'Announcements',
      categoryId: 'DIC_kwXXXXXXXXXXXX',
      mapping: 'specific',
      term: 'colophon',
      strict: '0',
      reactionsEnabled: '1',
      emitMetadata: '1',
      inputPosition: 'top',
      theme: 'transparent_dark',
      lang: 'zh-CN',
      loading: 'eager',
    });
  });

  it('matches the desktop widget URL emitted for the same term', () => {
    const props = captured.props!;
    const url = new URL(
      giscusWidgetUrl({
        ...GISCUS_CONFIG,
        term: String(props.term),
        theme: String(props.theme),
        origin: 'https://www.example.com/blog/colophon/',
        session: '',
        description: '',
        backLink: 'https://www.example.com/blog/colophon/',
      }),
    );
    expect(url.origin).toBe(GISCUS_ORIGIN);
    expect(url.pathname).toBe('/zh-CN/widget');
    expect(url.searchParams.get('repo')).toBe(GISCUS_CONFIG.repo);
    expect(url.searchParams.get('repoId')).toBe('R_kgXXXXXXXXXX');
    expect(url.searchParams.get('category')).toBe('Announcements');
    expect(url.searchParams.get('categoryId')).toBe('DIC_kwXXXXXXXXXXXX');
    expect(url.searchParams.get('term')).toBe('colophon');
    expect(url.searchParams.get('mapping')).toBe('specific');
    expect(url.searchParams.get('strict')).toBe('0');
    expect(url.searchParams.get('reactionsEnabled')).toBe('1');
    expect(url.searchParams.get('emitMetadata')).toBe('1');
    expect(url.searchParams.get('inputPosition')).toBe('top');
    expect(url.searchParams.get('theme')).toBe('transparent_dark');
    expect(GISCUS_WIDGET_DEFAULTS.theme).toBe('transparent_dark');
  });
});
