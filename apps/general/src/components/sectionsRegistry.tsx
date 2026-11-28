import { lazy, type ComponentType } from 'react';
import { SECTION_MAP, SECTIONS, type SectionId } from '@/lib/sections';
import { useBlogSection } from '@/components/blog/BlogSectionContext';
import ThinkingState from '@/components/ui/ThinkingState';
import BlogSection from './sections/BlogSection';
import ArticleView from './blog/ArticleView';

export { SECTIONS };
export type { SectionId };
export type { Project } from '@/lib/projects/types';

// BlogSection + ArticleView are eagerly imported (not lazy) so their content is
// server-rendered into the static HTML for SEO (post list on /blog, article body
// on /blog/[slug]). The lazy 3D sections above don't need this.
const AboutSection = lazy(() => import('./sections/AboutSection'));
const ProjectsSection = lazy(() => import('./sections/ProjectsSection'));
const SkillsSection = lazy(() => import('./sections/SkillsSection'));
const GallerySection = lazy(() => import('./sections/GallerySection'));
const FriendsSection = lazy(() => import('./sections/FriendsSection'));

/**
 * blog 章节的列表/阅读模式路由：由 `useBlogSection` 决定渲染 BlogSection
 * （列表）还是 ArticleView（阅读模式）。章节数据经 context 注入，注册表
 * 只负责组件分发，不再构造 18 字段 props 结构。
 */
function BlogSectionRouter() {
  const { articles, activeArticle } = useBlogSection();
  if (activeArticle) {
    const article = articles.find((a) => a.id === activeArticle);
    return <ArticleView article={article} />;
  }
  return <BlogSection />;
}

/** lazy 章节的 chunk 加载器；立即导入的章节（blog）返回已解析 Promise。 */
const sectionChunkLoaders: Record<string, () => Promise<unknown>> = {
  about: () => import('./sections/AboutSection'),
  projects: () => import('./sections/ProjectsSection'),
  skills: () => import('./sections/SkillsSection'),
  gallery: () => import('./sections/GallerySection'),
  friends: () => import('./sections/FriendsSection'),
  blog: () => Promise.resolve(),
};

/**
 * 预热目标章节 chunk：App 在 transitionTargetIndex 变化时调用，快速跨节
 * 跳转时目标章节在 bridge 阶段就已就绪，不再撞上 Suspense fallback。
 */
export function preloadSectionChunk(id: string): Promise<unknown> {
  const load = sectionChunkLoaders[id];
  return (load ?? (() => Promise.resolve()))();
}

/** 章节组件注册表：id → 组件。所有数据依赖经 context 读取。 */
export const sectionComponents: Record<SectionId, ComponentType> = {
  about: AboutSection,
  projects: ProjectsSection,
  skills: SkillsSection,
  gallery: GallerySection,
  friends: FriendsSection,
  blog: BlogSectionRouter,
};

/** 懒加载章节的 Suspense fallback：透明背景 + 居中 THINKING。 */
export function SectionFallback({ sectionId }: { readonly sectionId: SectionId }) {
  const section = SECTION_MAP[sectionId];
  return (
    // 透明背景：明暗底色块在懒加载完成瞬间会「闪一下」，改由下方章节
    // 画布自带的背景承接，这里只留居中的细字 THINKING。
    <div className="flex min-h-screen min-h-dvh items-center justify-center" aria-busy="true">
      <ThinkingState dark={section.isDark} />
    </div>
  );
}
