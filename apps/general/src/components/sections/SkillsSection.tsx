import { useEffect } from 'react';
import { motion } from 'motion/react';
import AwardIcon from '~icons/lucide/award';
import {
  certificates,
  skills,
  skillsCurrentlyLearning,
  skillsQuote,
  type CertificateItem,
  type SkillItem,
} from '@/data/profile';
import Band from '@/components/layout/Band';
import Ledger from '@/components/layout/Ledger';
import SectionCanvas from '@/components/layout/SectionCanvas';
import SectionMasthead from '@/components/layout/SectionMasthead';
import { Swap } from '@/components/motion/Swap';
import { useCountUp } from '@/hooks/useCountUp';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { useCommandTargetHighlight } from '@/hooks/useCommandTargetHighlight';
import { useSectionReady } from '@/components/motion/SectionReadyContext';
import { useSectionCommandTarget } from '@/components/layout/SectionAppContext';
import { motionDuration, motionEase } from '@/lib/motion';
import SkillFilterBar from './skills/SkillFilterBar';
import SkillRow from './skills/SkillRow';
import { useSkillFilter, type SkillGroup } from './skills/useSkillFilter';
import { SkillIcon } from './skills/SkillIcon';

function SkillGroupColumn({ groups }: { readonly groups: readonly SkillGroup[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {groups.map(({ meta, items }) => (
        <Band key={meta.id} label={meta.label} className="mb-0">
          <div className="flex flex-col divide-y divide-black/8">
            {items.map((skill) => (
              <SkillRow key={skill.name} skill={skill} />
            ))}
          </div>
        </Band>
      ))}
    </div>
  );
}

/** Learning entry — icon + name + a slim level meter, echoing SkillRow. */
function LearningRow({ skill }: { readonly skill: SkillItem }) {
  const isReady = useSectionReady();
  const { ref, value } = useCountUp(skill.level, 1.1, isReady);
  const { reducedMotion } = useMediaCapabilities();

  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <SkillIcon icon={skill.icon} className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <span className="text-sm font-semibold leading-snug text-neutral-950">{skill.name}</span>
        {skill.note && <span className="ml-2 text-xs text-gray-500">{skill.note}</span>}
        <div className="mt-1.5 flex items-center gap-2.5">
          <div className="h-0.5 w-full max-w-[7.5rem] overflow-hidden rounded-full bg-black/8">
            <motion.div
              className="h-full w-full origin-left rounded-full bg-accent-base"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: isReady ? skill.level / 100 : 0 }}
              transition={
                reducedMotion
                  ? { duration: 0 }
                  : { duration: motionDuration.meter, ease: motionEase }
              }
            />
          </div>
          <span
            ref={ref}
            className="w-7 shrink-0 text-right font-mono text-xs tabular-nums text-gray-500"
          >
            {value}
          </span>
        </div>
      </div>
    </div>
  );
}

/** Certificate entry — icon + name + issuer + date, aligned with LearningRow. */
function CertificateRow({ cert }: { readonly cert: CertificateItem }) {
  return (
    <div className="flex items-start gap-2.5 py-2.5">
      <AwardIcon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline">
          <span className="text-sm font-semibold leading-snug text-neutral-950">{cert.name}</span>
          <span className="ml-2 text-xs text-gray-500">{cert.issuer}</span>
          <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-gray-500">
            {cert.date}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SkillsSection() {
  const commandTarget = useSectionCommandTarget();
  const isReady = useSectionReady();
  const filter = useSkillFilter();

  // 命令面板跳转的目标技能若被当前筛选隐藏,先清空筛选,保证高亮定位锚存在。
  // 该 effect 先于 useCommandTargetHighlight 执行,reset 为 setState,而高亮
  // hook 内部有 120ms 延迟,天然兼容时序。
  useEffect(() => {
    if (!commandTarget || commandTarget.sectionId !== 'skills') return;
    const itemId = commandTarget.itemId;
    const exists = skills.some((skill) => skill.name === itemId);
    if (!exists) return;
    // 必须查 visibleGroups(而非 filtered):分类 chip 的过滤只作用在 visibleGroups,
    // 用 filtered 判断会漏掉"被分类隐藏"的情况,导致定位锚不在 DOM、高亮静默失败。
    const visible = filter.visibleGroups.some((group) =>
      group.items.some((skill) => skill.name === itemId),
    );
    if (!visible) {
      filter.reset();
    }
  }, [commandTarget, filter.visibleGroups, filter.reset]);

  useCommandTargetHighlight('skills', isReady, commandTarget);

  const isEmpty = filter.visibleGroups.length === 0;
  // Balance the two list columns by row count rather than group count — group
  // sizes range from 3 to 14, so halving by group count skews column heights.
  const leftGroups: SkillGroup[] = [];
  const rightGroups: SkillGroup[] = [];
  let leftRows = 0;
  let rightRows = 0;
  for (const group of filter.visibleGroups) {
    if (leftRows <= rightRows) {
      leftGroups.push(group);
      leftRows += group.items.length;
    } else {
      rightGroups.push(group);
      rightRows += group.items.length;
    }
  }

  return (
    <SectionCanvas isDark={false} sectionId="skills">
      <SectionMasthead
        variant="chapter"
        title="技能专长"
        accent="tools of trade"
        className="shrink-0"
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:gap-14 xl:gap-16">
        {/* Left — filter bar + grouped skill rows */}
        <div className="flex min-w-0 flex-col gap-6">
          <SkillFilterBar
            query={filter.query}
            onQueryChange={filter.setQuery}
            activeCategory={filter.activeCategory}
            onCategoryChange={filter.setActiveCategory}
            sort={filter.sort}
            onSortChange={filter.setSort}
            counts={filter.counts}
          />

          {/* itemKey 不含 query:击键即换 key 会重挂载整棵列表,
              让每行的 count-up 与进度条动画反复重播。分类/排序切换才做交叉淡入。 */}
          <Swap itemKey={`${filter.activeCategory ?? 'all'}-${filter.sort}`} className="min-w-0">
            {isEmpty ? (
              <div className="border border-dashed border-black/15 bg-white/40 px-6 py-12 text-center">
                <p className="font-mono text-sm text-gray-400">// NO MATCH</p>
                <p className="mt-3 text-sm font-semibold text-neutral-950">没有匹配的技能</p>
                <p className="mt-1 text-xs text-gray-500">
                  {filter.query !== '' ? `「${filter.query}」` : ''}
                  {filter.activeCategory !== null ? ' · 当前分类下无结果' : ''}
                  {' 换个关键字或分类试试。'}
                </p>
                <button
                  type="button"
                  onClick={filter.reset}
                  data-cursor="BACK"
                  className="mt-5 inline-flex items-center gap-1.5 border border-black/10 bg-white/60 px-3 py-1.5 font-mono text-caption uppercase tracking-mono text-gray-600 transition-colors hover:border-accent-base hover:text-accent-ink"
                >
                  ← 清除筛选
                </button>
              </div>
            ) : (
              <div className="grid gap-x-10 gap-y-6 xl:grid-cols-2">
                <SkillGroupColumn groups={leftGroups} />
                {rightGroups.length > 0 && <SkillGroupColumn groups={rightGroups} />}
              </div>
            )}
          </Swap>
        </div>

        {/* Right — prose, certificates, learning */}
        <aside className="min-w-0 space-y-10 md:space-y-12 lg:sticky lg:top-24 lg:self-start">
          <p className="font-serif text-lg italic leading-relaxed text-gray-600 md:text-xl">
            {skillsQuote}
          </p>

          {skillsCurrentlyLearning.length > 0 && (
            <Band label="Currently learning" className="mb-0 md:mb-0">
              <Ledger>
                {skillsCurrentlyLearning.map((skill) => (
                  <LearningRow key={skill.name} skill={skill} />
                ))}
              </Ledger>
            </Band>
          )}

          {certificates.length > 0 && (
            <Band label="Certificates / 技术认证" className="mb-0 md:mb-0">
              <Ledger>
                {certificates.map((cert) => (
                  <CertificateRow key={cert.name} cert={cert} />
                ))}
              </Ledger>
            </Band>
          )}
        </aside>
      </div>
    </SectionCanvas>
  );
}
