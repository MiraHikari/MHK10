import { describe, expect, it, vi } from 'vite-plus/test';
import { printPreviewApp } from './print-preview.app';
import { appTestFixture, memoryStorage } from '../testing/app-test-fixture';
import { createFileSystem } from '../../os/files/filesystem';
import { publicLibrary, publicArticles } from '../../../data/public-files';

describe('Print Preview publication loading', () => {
  it('keeps export unavailable during loading, reports failure and retries the selected body', async () => {
    let unavailable = true;
    const load = vi.fn(async () => {
      if (unavailable) throw new Error('Offline');
      return '---\ntitle: Complete book\n---\n\nComplete body text.';
    });
    const files = createFileSystem(memoryStorage(), {
      library: { ...publicLibrary, readText: load },
    });
    const preview = appTestFixture(printPreviewApp, { files });
    preview.frame();
    expect(preview.session.status()).toBe('Loading document...');
    expect(preview.session.menus()?.File).toContainEqual(
      expect.objectContaining({ command: 'export', disabled: true }),
    );
    await vi.waitFor(() => expect(preview.session.status()).toContain('could not be loaded'));
    unavailable = false;
    preview.command('reload-document', 'Document');
    await vi.waitFor(() => expect(preview.session.status()).toContain('A4 portrait'));
    preview.command('export');
    expect(preview.env.downloadText).toHaveBeenCalledWith(
      'Complete book.txt',
      'Complete book\n\nComplete body text.',
    );
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('ignores an older selection and a completion after disposal', async () => {
    const first = Promise.withResolvers<string>();
    const next = Promise.withResolvers<string>();
    const files = createFileSystem(memoryStorage(), {
      library: {
        ...publicLibrary,
        readText: (id) => (id.endsWith(publicArticles[0].slug) ? first.promise : next.promise),
      },
    });
    const preview = appTestFixture(printPreviewApp, { files });
    preview.frame();
    preview.command('next-document', 'Document');
    first.resolve('---\ntitle: Old selection\n---\n\nOld body.');
    await vi.waitFor(() =>
      expect(files.get(`library:article:${publicArticles[0].slug}`)?.content).toContain(
        'Old body.',
      ),
    );
    expect(preview.session.status()).toBe('Loading document...');
    preview.command('close');
    expect(preview.env.close).toHaveBeenCalledOnce();
    preview.session.dispose();
    next.resolve('---\ntitle: Late selection\n---\n\nLate body.');
    await vi.waitFor(() =>
      expect(files.get(`library:article:${publicArticles[1].slug}`)?.content).toContain(
        'Late body.',
      ),
    );
    expect(preview.env.downloadText).not.toHaveBeenCalled();
  });
});
