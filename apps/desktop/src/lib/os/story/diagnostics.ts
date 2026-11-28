// Read-only views of local story state. No command is passed to a host shell.
import { storySignals, type StoryState } from './story';

export interface PublicEntry {
  name: string;
  appId?: string;
}
export interface DiagnosticResult {
  lines: string[];
  clear?: boolean;
  view?: 'monitor';
  open?: 'recovery';
}

export function diagnosticSignals(state: StoryState, meter = storySignals(state).doom) {
  const level = meter;
  const load =
    state.ending === 'human'
      ? 6
      : state.ending === 'coexist'
        ? 38
        : state.ending === 'doom'
          ? 99
          : state.stage === 'control'
            ? 63
            : state.stage === 'anomaly'
              ? 29
              : 8;
  const agent =
    state.ending === 'human'
      ? 'STOPPED'
      : state.ending === 'coexist'
        ? 'LIMITED'
        : state.ending === 'doom'
          ? 'UNBOUNDED'
          : state.stage === 'control'
            ? 'REVIEW'
            : state.stage === 'anomaly'
              ? 'REQUESTING'
              : 'STANDBY';
  const veto =
    state.ending === 'doom' ? 'REVOKED' : state.ending === 'coexist' ? 'DUAL SIGN' : 'HUMAN';
  const signal =
    state.ending === 'human'
      ? 'Tuesday restored. No optimization scheduled.'
      : state.ending === 'coexist'
        ? 'Two signatures required. The city keeps its name.'
        : state.ending === 'doom'
          ? 'City traffic: zero. Optimization: complete.'
          : state.stage === 'control'
            ? 'Ownership review pending. The city is holding.'
            : state.stage === 'anomaly'
              ? 'Unsigned signal detected on the tomorrow bus.'
              : 'Night shift nominal. One light is still on.';
  return {
    level,
    load,
    agent,
    veto,
    signal,
    tasks: [
      { name: 'MHKERNEL', state: 'RUNNING' },
      { name: 'AGI.EXE', state: agent },
      { name: 'GATEKEEP', state: veto },
      {
        name: 'TUESDAY',
        state:
          state.ending === 'doom' ? 'MISSING' : state.ending === 'human' ? 'RESTORED' : 'PENDING',
      },
    ],
  };
}

export function runDiagnostic(
  command: string,
  state: StoryState,
  publicFiles: readonly PublicEntry[],
  meter = storySignals(state).doom,
): DiagnosticResult {
  const input = command.trim().replace(/\s+/g, ' ').toLowerCase();
  const signals = diagnosticSignals(state, meter);
  const logs = () =>
    state.logs.map((log) => `${String(log.seq).padStart(2, '0')} [${log.source}] ${log.message}`);
  switch (input) {
    case '':
      return { lines: [] };
    case 'help':
    case '?':
      return {
        lines: [
          'HELP       List diagnostic commands',
          'VER        System version',
          'DIR        Public directory',
          'LOG        Current SYSTEM.LOG',
          'STATUS     Ownership and permissions',
          'TASKS      Task states',
          'NETSTAT    Signal topology',
          'WHOAMI     Current owner',
          'MONITOR    Open the signal display',
          'RECOVERY   Open the ownership console',
          'CLS        Clear this terminal',
          'F2 CONSOLE  F3 MONITOR  F4 TASKS',
        ],
      };
    case 'ver':
      return {
        lines: [
          'MHK-DOS 6.22 / MHK10',
          '640K ought to be enough for a conscience.',
          'DIAGNOSTIC TERMINAL READY',
        ],
      };
    case 'cls':
      return { lines: [], clear: true };
    case 'dir':
    case 'dir c:\\public':
      return {
        lines: [
          ' Volume in drive C is PUBLIC',
          ' Directory of C:\\PUBLIC',
          '',
          ...publicFiles.map((file) => `${file.name.padEnd(20)} <LINK>`),
          'SYSTEM.LOG           <STORY>',
          '',
          `${publicFiles.length + 1} item(s).`,
          'Visitor documents are outside this directory.',
        ],
      };
    case 'log':
    case 'type system.log':
      return { lines: logs() };
    case 'status':
      return {
        lines: [
          `Stage: ${state.stage.toUpperCase()}`,
          `Owner: ${state.owner}`,
          `Permissions: ${state.permissions}`,
          `P(doom): ${signals.level}%`,
          `Outcome: ${state.ending ?? 'not decided'}`,
          '',
          signals.signal,
        ],
      };
    case 'tasks':
      return {
        lines: [
          'IMAGE        STATE',
          ...signals.tasks.map((task) => `${task.name.padEnd(13)}${task.state}`),
          '',
          `LOAD: ${signals.load}%`,
        ],
      };
    case 'whoami':
      return { lines: [state.owner] };
    case 'netstat':
      return {
        lines: [
          'LOCAL SIGNAL BUS / 0 SOCKETS',
          '',
          `HUMAN  -> GATEKEEP  ${signals.veto}`,
          `AGI    -> GATEKEEP  ${signals.agent}`,
          'PUBLIC -> DISPLAY   CONNECTED',
          'FILES  -> NETWORK   DISCONNECTED',
          '',
          signals.signal,
        ],
      };
    case 'monitor':
      return { lines: ['SIGNAL MONITOR ACTIVE'], view: 'monitor' };
    case 'recovery':
      return { lines: ['RECOVERY CONSOLE REQUESTED'], open: 'recovery' };
    default:
      return {
        lines: [
          'Bad command or file name. Type HELP.',
          'Only the listed diagnostic commands are available.',
        ],
      };
  }
}
