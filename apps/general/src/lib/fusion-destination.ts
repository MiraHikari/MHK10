import type { FusionDestination } from '@mhk/site-core/fusion/protocol-model';
import type { SectionId } from './sections';

/** Presentation targets keep authored IDs separate from command-history IDs. */
export function sectionTargetFromDestination(
  destination: FusionDestination | null,
): { sectionId: SectionId; itemId: string } | null {
  if (!destination) return null;
  if (destination.kind === 'project') return { sectionId: 'projects', itemId: destination.id };
  if (
    (destination.kind === 'skills' ||
      destination.kind === 'gallery' ||
      destination.kind === 'friends') &&
    destination.id
  )
    return { sectionId: destination.kind, itemId: destination.id };
  return null;
}
