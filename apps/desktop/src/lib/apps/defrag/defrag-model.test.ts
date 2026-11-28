import { describe, expect, it } from 'vite-plus/test';
import { createDisk, DISK_BLOCKS, startDisk, stepDisk, stopDisk } from './defrag-model';

describe('disk utility progress', () => {
  it('keeps functional progress but freezes unsolicited changes with reduced motion', () => {
    const initial = startDisk(createDisk(), 'defrag');
    const complete = stepDisk(initial, 8, 86, true);
    expect(complete.cursor).toBe(DISK_BLOCKS);
    expect(complete.disturbances).toBe(0);
    expect(complete.blocks).toEqual(Array.from({ length: DISK_BLOCKS }, (_, i) => i));
    expect(stepDisk(complete, 10, 86, true)).toBe(complete);
  });
  it('defragments every block, reports all fragments and preserves the input', () => {
    const initial = startDisk(createDisk(), 'defrag');
    const complete = stepDisk(initial, 8, 5);
    expect(complete.cursor).toBe(DISK_BLOCKS);
    expect(complete.running).toBe(false);
    expect(complete.blocks).toEqual(Array.from({ length: DISK_BLOCKS }, (_, i) => i));
    expect(complete.fragments).toEqual([0, 1, 2]);
    expect(initial.cursor).toBe(0);
  });
  it('ScanDisk checks without moving blocks and stopping retains progress', () => {
    const initial = startDisk(createDisk(), 'scan');
    const checked = stepDisk(initial, 3, 5);
    expect(checked.cursor).toBe(60);
    expect(checked.blocks).toEqual(initial.blocks);
    expect(stepDisk(stopDisk(checked), 20, 5).cursor).toBe(60);
  });
  it('gives the same result across frame rates and rearranges at high risk even while idle', () => {
    const initial = startDisk(createDisk(), 'defrag');
    const whole = stepDisk(initial, 9, 86);
    let frames = initial;
    for (let i = 0; i < 90; i++) frames = stepDisk(frames, 0.1, 86);
    expect(frames).toEqual(whole);
    expect(whole.disturbances).toBe(6);
    const idle = stepDisk(stopDisk(whole), 3, 86);
    expect(idle.cursor).toBe(whole.cursor);
    expect(idle.blocks).not.toEqual(whole.blocks);
    expect([...idle.blocks].sort((a, b) => a - b)).toEqual(
      Array.from({ length: DISK_BLOCKS }, (_, i) => i),
    );
  });
});
