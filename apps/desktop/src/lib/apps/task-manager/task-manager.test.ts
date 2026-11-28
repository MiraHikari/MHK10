import { describe, expect, it, vi } from 'vite-plus/test';
import type { AppServices, ProcessDescriptor } from '../../os/host/app-contracts';
import { taskManagerApp } from './task-manager.app';
import { appTestFixture } from '../testing/app-test-fixture';

describe('Task Manager session host operations', () => {
  it('scrolls the keyboard selection into view and routes switch/close by stable id', () => {
    let roster: ProcessDescriptor[] = Array.from({ length: 24 }, (_, index) => ({
      id: `w${index}`,
      appId: 'clock',
      title: `Task ${String(index).padStart(2, '0')}`,
      minimized: index === 23,
      focused: false,
    }));
    const env = {
      processes: () => roster,
      play: vi.fn(),
      focus: vi.fn(),
      close: vi.fn(),
    } as Partial<AppServices>;
    const c = appTestFixture(taskManagerApp, env, { x: 0, y: 0, w: 316, h: 204 });
    const { session, text } = c;
    const frame = (key?: string) => c.send({ key });
    frame('End');
    expect(session.status()).toBe('Task 23 | Minimized');
    expect(vi.mocked(text).mock.calls.some(([label]) => label === 'Task 23')).toBe(true);
    frame('Enter');
    expect(env.focus).toHaveBeenCalledWith('w23');
    frame('Delete');
    expect(env.close).toHaveBeenCalledWith('w23');
    expect(session.status()).toContain('Close requested');
    frame();
    expect(session.status()).toContain('Close requested');
    roster = roster.filter((process) => process.id !== 'w23');
    frame();
    expect(session.status()).toBe('Closed Task 23.');
    session.dispose();
  });

  it('explains unavailable capabilities in a standalone host without inventing tasks', () => {
    const c = appTestFixture(taskManagerApp, {}, { x: 0, y: 0, w: 316, h: 204 });
    const { session } = c;
    c.frame();
    expect(session.status()).toBe('Open on the desktop to manage MHK10 windows.');
    const taskMenu = session.menus()?.Task;
    expect(taskMenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'switch', disabled: true }),
        expect.objectContaining({ command: 'close', disabled: true }),
      ]),
    );
    session.dispose();
  });

  it('draws dialog and unknown application entries without failing on missing app sprites', () => {
    const roster: ProcessDescriptor[] = [
      { id: '$run', appId: '$run', title: 'Run', focused: false, minimized: false },
      { id: '$find', appId: '$find', title: 'Find: Programs', focused: false, minimized: false },
      { id: '$rename', appId: '$rename', title: 'Rename', focused: false, minimized: false },
      { id: 'msg1', appId: '$msg', title: 'MHK10 Help', focused: true, minimized: false },
      {
        id: 'custom',
        appId: 'unregistered',
        title: 'Custom App',
        focused: false,
        minimized: false,
      },
    ];
    const c = appTestFixture(
      taskManagerApp,
      { processes: () => roster },
      { x: 0, y: 0, w: 316, h: 204 },
    );
    const spr = vi.spyOn(c.draw, 'spr');
    expect(() => c.frame()).not.toThrow();
    expect(spr.mock.calls.map(([name]) => name)).toEqual([
      'i_exe',
      'i_find',
      'i_msg',
      'i_rename',
      'i_run',
    ]);
    c.session.dispose();
  });
});
