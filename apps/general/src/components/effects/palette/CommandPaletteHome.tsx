import { useMemo, type RefObject } from 'react';
import PlayIcon from '~icons/lucide/play';
import PauseIcon from '~icons/lucide/pause';
import FFTVisualizer from '@/components/effects/FFTVisualizer';
import { honors, skills } from '@/data/profile';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { setMotionOverride, useMotionOverride } from '@/hooks/useMotionPreference';
import { computeMonthlyArticleTrend } from '@/lib/article-trend';
import type { MotionLevel } from '@/lib/motion';
import type { ArticleListItem } from '@/lib/blog/types';
import type { Project } from '@/lib/projects/types';

interface CommandPaletteHomeProps {
  readonly articles: readonly ArticleListItem[];
  readonly projects: readonly Project[];
  readonly bgmPlaying: boolean;
  readonly bgmAnalyser?: RefObject<AnalyserNode | null>;
  readonly onToggleBGM?: () => void;
}

const TIER_LABEL: Record<MotionLevel, string> = {
  full: '完整',
  mobile: '精简',
  reduced: '静态',
};

const MOTION_OPTIONS: readonly { level: MotionLevel | null; label: string; desc: string }[] = [
  { level: null, label: '自动', desc: '跟随设备' },
  { level: 'full', label: '完整', desc: '全部效果' },
  { level: 'mobile', label: '精简', desc: '降低负载' },
  { level: 'reduced', label: '静态', desc: '仅留内容' },
];

function Stat({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="bg-neutral-950 px-3 py-2">
      <div className="text-lg font-bold font-mono tabular-nums text-white/90">{value}</div>
      <div className="text-micro font-mono uppercase tracking-eyebrow text-white/30">{label}</div>
    </div>
  );
}

/** 空查询时的主页仪表盘:站点统计、更新趋势、BGM 控制与动效档位。 */
export default function CommandPaletteHome({
  articles,
  projects,
  bgmPlaying,
  bgmAnalyser,
  onToggleBGM,
}: CommandPaletteHomeProps) {
  const override = useMotionOverride();
  const { motionLevel } = useMediaCapabilities();
  const trend = useMemo(() => computeMonthlyArticleTrend(articles), [articles]);
  const maxCount = Math.max(1, ...trend.map((bucket) => bucket.count));
  const totalCount = trend.reduce((sum, bucket) => sum + bucket.count, 0);

  return (
    <div className="space-y-3 border-b border-white/10 px-4 py-3">
      {/* 站点统计 */}
      <div className="grid grid-cols-4 gap-px border border-white/10 bg-white/10">
        <Stat label="文章" value={articles.length} />
        <Stat label="项目" value={projects.length} />
        <Stat label="技能" value={skills.length} />
        <Stat label="荣誉" value={honors.length} />
      </div>

      {/* 近 12 个月更新趋势 */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-micro font-mono uppercase tracking-eyebrow text-white/30">
            更新趋势 / 近 12 个月
          </span>
          <span className="text-micro font-mono tabular-nums text-white/40">
            共 {totalCount} 篇
          </span>
        </div>
        <svg
          viewBox="0 0 120 24"
          preserveAspectRatio="none"
          className="h-6 w-full"
          aria-hidden="true"
        >
          {trend.map((bucket, i) => {
            const h = bucket.count > 0 ? Math.max(2, (bucket.count / maxCount) * 24) : 1;
            return (
              <rect
                key={bucket.key}
                x={i * 10 + 1}
                y={24 - h}
                width={8}
                height={h}
                fill="var(--section-accent)"
                opacity={bucket.count > 0 ? 0.9 : 0.15}
              />
            );
          })}
        </svg>
        <div className="flex justify-between text-micro font-mono tabular-nums text-white/25">
          <span>{trend[0]?.label}</span>
          <span>{trend[trend.length - 1]?.label}</span>
        </div>
      </div>

      {/* BGM 控制 */}
      <button
        type="button"
        onClick={onToggleBGM}
        className="flex w-full items-center gap-3 border border-white/10 px-3 py-2.5 text-left transition-colors hover:border-accent-base/60 hover:bg-white/5"
      >
        <FFTVisualizer analyser={bgmAnalyser?.current ?? null} playing={bgmPlaying} />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-mono text-white/80">背景音乐 / BGM</span>
          <span className="block text-micro font-mono text-white/30">
            {bgmPlaying ? '播放中,点击暂停' : '已暂停,点击播放'}
          </span>
        </span>
        {bgmPlaying ? (
          <PauseIcon className="h-4 w-4 shrink-0 text-white/60" />
        ) : (
          <PlayIcon className="h-4 w-4 shrink-0 text-white/60" />
        )}
      </button>

      {/* 动效档位 */}
      <div>
        <div className="mb-1.5 text-micro font-mono uppercase tracking-eyebrow text-white/30">
          外观 / 动效档位
        </div>
        <div className="grid grid-cols-4 gap-px border border-white/10 bg-white/10 max-sm:grid-cols-2">
          {MOTION_OPTIONS.map((option) => {
            const isActive = override === option.level;
            const desc =
              option.level === null && isActive
                ? `${option.desc} · ${TIER_LABEL[motionLevel]}`
                : option.desc;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={isActive}
                onClick={() => setMotionOverride(option.level)}
                className={`bg-neutral-950 px-2 py-2 text-left transition-colors ${
                  isActive
                    ? 'bg-accent-base/20 text-white'
                    : 'text-white/45 hover:bg-white/5 hover:text-white/80'
                }`}
              >
                <span className="block text-xs font-mono">{option.label}</span>
                <span className="block text-micro font-mono text-white/30">{desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
