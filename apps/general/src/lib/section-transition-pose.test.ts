import { describe, expect, it } from 'vite-plus/test';
import { resolveSectionPoseKind } from './section-transition-pose';

describe('resolveSectionPoseKind', () => {
  it('keeps the active visible section focused', () => {
    expect(
      resolveSectionPoseKind({
        isActive: true,
        sectionVisible: true,
        phase: 'idle',
      }),
    ).toBe('visible');
  });

  it('uses exit while the active section is defocusing', () => {
    expect(
      resolveSectionPoseKind({
        isActive: true,
        sectionVisible: false,
        phase: 'exit',
      }),
    ).toBe('exit');
  });

  it('uses enter on bridge/enter before content is shown', () => {
    expect(
      resolveSectionPoseKind({
        isActive: true,
        sectionVisible: false,
        phase: 'bridge',
      }),
    ).toBe('enter');
    expect(
      resolveSectionPoseKind({
        isActive: true,
        sectionVisible: false,
        phase: 'enter',
      }),
    ).toBe('enter');
  });

  it('parks inactive neighbours without an enter blur pose', () => {
    expect(
      resolveSectionPoseKind({
        isActive: false,
        sectionVisible: false,
        phase: 'exit',
      }),
    ).toBe('parked');
    expect(
      resolveSectionPoseKind({
        isActive: false,
        sectionVisible: true,
        phase: 'idle',
      }),
    ).toBe('parked');
  });
});
