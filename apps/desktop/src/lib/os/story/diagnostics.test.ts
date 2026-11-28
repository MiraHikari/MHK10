import { describe, expect, it } from 'vite-plus/test';
import { advanceStory, initialStory, type StoryEnding } from './story';
import { diagnosticSignals, runDiagnostic } from './diagnostics';

describe('local diagnostic terminal', () => {
  it('reads the current log and ownership without changing the story', () => {
    const state = advanceStory(initialStory(), 'train');
    const before = JSON.stringify(state);
    expect(runDiagnostic(' LoG ', state, []).lines.join('\n')).toContain(
      'Operator started a training run',
    );
    expect(runDiagnostic('status', state, []).lines).toContain('Owner: HUMAN');
    expect(runDiagnostic('type SYSTEM.LOG', state, []).lines).toEqual(
      runDiagnostic('log', state, []).lines,
    );
    expect(JSON.stringify(state)).toBe(before);
  });

  it('lists only explicitly supplied public directory entries', () => {
    const result = runDiagnostic('dir', initialStory(), [
      { name: 'About Me', appId: 'about' },
      { name: 'Blog', appId: 'blog' },
    ]);
    expect(result.lines.join('\n')).toContain('About Me');
    expect(result.lines.join('\n')).toContain('SYSTEM.LOG');
    expect(result.lines.join('\n')).toContain('3 item(s)');
    expect(result.lines.join('\n')).toContain('Visitor documents are outside');
  });

  it.each([
    'dir & rm -rf /',
    'type diary.txt',
    'curl https://example.com',
    'recovery; doom',
    'powershell',
    'eval(1)',
    'del SYSTEM.LOG',
  ])('rejects unsupported command %s without emitting an action', (command) => {
    expect(runDiagnostic(command, initialStory(), [])).toEqual({
      lines: [
        'Bad command or file name. Type HELP.',
        'Only the listed diagnostic commands are available.',
      ],
    });
  });

  it.each<StoryEnding>(['human', 'coexist', 'doom'])(
    'reflects the %s branch in live simulated signals',
    (ending) => {
      const state = advanceStory(
        advanceStory(advanceStory(initialStory(), 'train'), 'install'),
        ending,
      );
      const signals = diagnosticSignals(state);
      expect(signals.load).toBe(ending === 'human' ? 6 : ending === 'coexist' ? 38 : 99);
      expect(signals.agent).toBe(
        ending === 'human' ? 'STOPPED' : ending === 'coexist' ? 'LIMITED' : 'UNBOUNDED',
      );
      expect(runDiagnostic('whoami', state, []).lines[0]).toBe(state.owner);
      expect(runDiagnostic('tasks', state, []).lines.join('\n')).toContain(signals.agent);
    },
  );

  it('limits side effects to local view navigation and clearing output', () => {
    expect(runDiagnostic('cls', initialStory(), [])).toEqual({ lines: [], clear: true });
    expect(runDiagnostic('monitor', initialStory(), []).view).toBe('monitor');
    expect(runDiagnostic('recovery', initialStory(), []).open).toBe('recovery');
    expect(runDiagnostic('help', initialStory(), []).lines.join('\n')).toContain('F2 CONSOLE');
  });
});
