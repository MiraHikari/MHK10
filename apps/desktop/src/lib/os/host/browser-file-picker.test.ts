import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createBrowserFilePicker } from './browser-file-picker';

class Input extends EventTarget {
  type = '';
  accept = '';
  hidden = false;
  files: File[] = [];
  click = vi.fn();
  remove = vi.fn();
}

function fixture() {
  const inputs: Input[] = [];
  const root = { append: vi.fn() };
  vi.stubGlobal('document', {
    createElement: () => {
      const input = new Input();
      inputs.push(input);
      return input;
    },
  });
  return { picker: createBrowserFilePicker(root as unknown as HTMLElement), root, inputs };
}

afterEach(() => vi.unstubAllGlobals());

describe('host-owned external file selection', () => {
  it('returns the selected File and removes its node and both listeners', async () => {
    const c = fixture();
    const selected = c.picker.pick({ accept: '.json,application/json' });
    const input = c.inputs[0];
    const removed = vi.spyOn(input, 'removeEventListener');
    const file = new File(['{}'], 'documents.json', { type: 'application/json' });
    input.files = [file];
    input.dispatchEvent(new Event('change'));
    expect(await selected.result).toEqual({ status: 'selected', file });
    expect(input.accept).toBe('.json,application/json');
    expect(input.remove).toHaveBeenCalledOnce();
    expect(removed).toHaveBeenCalledTimes(2);
    selected.cancel();
    c.picker.dispose();
    expect(input.remove).toHaveBeenCalledOnce();
  });

  it('settles native cancel, explicit cancel and host disposal independently', async () => {
    const c = fixture();
    const native = c.picker.pick({ accept: '.txt' });
    c.inputs[0].dispatchEvent(new Event('cancel'));
    expect(await native.result).toEqual({ status: 'cancelled' });
    const explicit = c.picker.pick({ accept: '.txt' });
    explicit.cancel();
    expect(await explicit.result).toEqual({ status: 'cancelled' });
    const pending = c.picker.pick({ accept: '.txt' });
    c.picker.dispose();
    c.picker.dispose();
    expect(await pending.result).toEqual({ status: 'cancelled' });
    expect(c.inputs.every((input) => input.remove.mock.calls.length === 1)).toBe(true);
  });

  it('reports a partial opening failure and leaves no pending picker', async () => {
    const c = fixture();
    c.root.append.mockImplementation(() => {
      throw new Error('Detached host');
    });
    const pending = c.picker.pick({ accept: '.json' });
    expect(await pending.result).toEqual({
      status: 'failed',
      error: 'The file picker could not be opened.',
    });
    expect(c.inputs[0].remove).toHaveBeenCalledOnce();
    c.picker.dispose();
    expect(c.inputs[0].remove).toHaveBeenCalledOnce();
    const closed = c.picker.pick({ accept: '.json' });
    expect(await closed.result).toEqual({ status: 'cancelled' });
    expect(c.inputs[1].click).not.toHaveBeenCalled();
  });
});
