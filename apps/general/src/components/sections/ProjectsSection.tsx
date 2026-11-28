import { useCallback, useEffect, useMemo, useState } from 'react';
import SectionShell from '../SectionShell';
import Lightbox from '../effects/Lightbox';
import { useCommandTargetHighlight } from '@/hooks/useCommandTargetHighlight';
import { useSectionReady } from '@/components/motion/SectionReadyContext';
import { useSectionCommandTarget, useSectionProjects } from '@/components/layout/SectionAppContext';
import { ProjectShowcase } from './projects/ProjectShowcase';
import { createProjectLightboxItems } from './projects/projectLightbox';

export default function ProjectsSection() {
  const projects = useSectionProjects();
  const commandTarget = useSectionCommandTarget();
  const isReady = useSectionReady();
  const [featuredIndex, setFeaturedIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  useEffect(() => {
    if (commandTarget?.sectionId !== 'projects') return;
    const index = projects.findIndex((project) => project.id === commandTarget.itemId);
    if (index >= 0) setFeaturedIndex(index);
  }, [commandTarget, projects]);

  useCommandTargetHighlight('projects', isReady, commandTarget);

  const go = useCallback(
    (next: number) => {
      const len = projects.length;
      if (!len) return;
      setDirection(next > featuredIndex || (featuredIndex === len - 1 && next === 0) ? 1 : -1);
      setFeaturedIndex((next + len) % len);
    },
    [featuredIndex, projects.length],
  );

  const handlePrev = useCallback(() => go(featuredIndex - 1), [go, featuredIndex]);
  const handleNext = useCallback(() => go(featuredIndex + 1), [go, featuredIndex]);
  const handleSelect = useCallback(
    (originalIndex: number) => {
      if (originalIndex === featuredIndex) return;
      go(originalIndex);
    },
    [featuredIndex, go],
  );

  const lightboxItems = useMemo(() => createProjectLightboxItems(projects), [projects]);
  const hasProjects = projects.length > 0;

  return (
    <SectionShell
      isDark={true}
      tagLine="▼ / MIRAHIKARI"
      badgeText="PROJECTS"
      heading="精选项目"
      accent="selected works"
      metaLine="// MIRAHIKARI::PORTFOLIO::WORKS::GET()"
    >
      {hasProjects ? (
        <>
          <div className="flex flex-col gap-6 lg:gap-8 mb-10">
            <ProjectShowcase
              projects={projects}
              featuredIndex={featuredIndex}
              direction={direction}
              onPrevious={handlePrev}
              onNext={handleNext}
              onSelect={handleSelect}
              onOpenLightbox={setLightboxIdx}
            />
          </div>
        </>
      ) : (
        <div className="border border-white/10 bg-white/3 px-6 py-10 text-sm font-mono text-white/45">
          暂无可展示项目。
        </div>
      )}

      <Lightbox
        items={lightboxItems}
        index={lightboxIdx}
        onClose={() => setLightboxIdx(null)}
        onNavigate={setLightboxIdx}
        variant="project"
      />
    </SectionShell>
  );
}
