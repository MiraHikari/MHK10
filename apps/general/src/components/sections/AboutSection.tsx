import { useEffect, useMemo, useRef, useState } from 'react';
import MapPinIcon from '~icons/lucide/map-pin';
import CakeIcon from '~icons/lucide/cake';
import MailIcon from '~icons/lucide/mail';
import GlobeIcon from '~icons/lucide/globe';
import MonitorIcon from '~icons/lucide/monitor';
import GithubLucideIcon from '~icons/lucide/github';
import CodeIcon from '~icons/lucide/code';
import ClockIcon from '~icons/lucide/clock';
import BilibiliBrandIcon from '~icons/simple-icons/bilibili';
import CopyIcon from '~icons/lucide/copy';
import CheckIcon from '~icons/lucide/check';
import { useCountUp } from '@/hooks/useCountUp';
import { writeClipboard } from '@/lib/clipboard';
import { shouldRenderEager } from '@/lib/images/prefetch';
import { useClientFlag } from '@/hooks/useClientFlag';
import SiteImage from '@/components/ui/SiteImage';
import {
  aboutJourney,
  aboutPrinciples,
  aboutStats,
  education,
  experiences,
  honorStats,
  honors,
  honorTierMeta,
  languages,
  profile,
  type HonorItem,
} from '@/data/profile';
import { DESKTOP_SITE_URL, displayAddress } from '@/data/site-links';
import { PROJECT_REPOSITORY_LABEL, PROJECT_REPOSITORY_URL } from '@mhk/site-core/config/repository';
import { useCommandTargetHighlight } from '@/hooks/useCommandTargetHighlight';
import { useSectionReady } from '@/components/motion/SectionReadyContext';
import { useSectionCommandTarget } from '@/components/layout/SectionAppContext';
import { ApeironIcon, KairosIcon, EcstasisIcon } from './about/principle-icons';
import SectionShell from '../SectionShell';
import { HighlightCard, StandardCard } from './about/HonorLightCards';
import { HonorStat, TimelineRow } from './about/HonorLightStats';
import Lightbox from '../effects/Lightbox';
import type { LightboxItem } from '../effects/Lightbox';
import AboutHero from './about/AboutHero';

/** Row 1 sidebar facts — quick-scan identity data beside the editorial intro. */
const profileFacts = [
  {
    label: 'LOCATION / 坐标',
    value: profile.location,
    icon: MapPinIcon,
    href: `https://www.openstreetmap.org/search?query=${encodeURIComponent(profile.location)}`,
  },
  { label: 'AGE / 年龄', value: `${profile.age} 岁 · 生于 2010`, icon: CakeIcon },
  {
    label: 'EMAIL / 邮箱',
    value: profile.email,
    icon: MailIcon,
    href: `mailto:${profile.email}`,
    copyable: true,
  },
  {
    label: 'SITE / 站点',
    value: displayAddress(profile.website),
    icon: GlobeIcon,
    href: profile.website,
  },
  ...(DESKTOP_SITE_URL
    ? [
        {
          label: 'MHK10 / 桌面站',
          value: displayAddress(DESKTOP_SITE_URL),
          icon: MonitorIcon,
          href: DESKTOP_SITE_URL,
        },
      ]
    : []),
  {
    label: 'GITHUB',
    value: profile.github.replace('https://', ''),
    icon: GithubLucideIcon,
    href: profile.github,
  },
  {
    label: 'OPEN SOURCE / 开源',
    value: PROJECT_REPOSITORY_LABEL,
    icon: CodeIcon,
    href: PROJECT_REPOSITORY_URL,
  },
  {
    label: 'BILIBILI',
    value: profile.bilibili.replace('https://', ''),
    icon: BilibiliBrandIcon,
    href: profile.bilibili,
  },
] as const;

/** 访客时区与本站 UTC+8 的对比，挂载时算一次即可。 */
function VisitorTimezoneNote() {
  const note = useMemo(() => {
    // getTimezoneOffset 返回「本地落后 UTC 的分钟数」，取反得到 UTC 偏移小时。
    const visitorOffset = -new Date().getTimezoneOffset() / 60;
    if (visitorOffset === 8) return '与你同一时区';
    const sign = visitorOffset >= 0 ? '+' : '−';
    const abs = Math.abs(visitorOffset);
    const diff = 8 - visitorOffset;
    const relation = diff > 0 ? `慢 ${diff} 小时` : `快 ${-diff} 小时`;
    return `你 UTC${sign}${abs} · 比我${relation}`;
  }, []);
  return <span className="mt-1 block text-[11px] font-normal text-gray-400">{note}</span>;
}

/** EMAIL 行内复制按钮：不套在 <a> 里，独立交互。 */
function CopyEmailButton() {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.clearTimeout(resetTimer.current);
    };
  }, []);
  return (
    <button
      type="button"
      aria-label={copied ? '邮箱已复制' : '复制邮箱地址'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void writeClipboard(profile.email).then((ok) => {
          if (!ok || !mounted.current) return;
          setCopied(true);
          window.clearTimeout(resetTimer.current);
          resetTimer.current = window.setTimeout(() => setCopied(false), 1600);
        });
      }}
      className="inline-flex shrink-0 items-center gap-1 border border-gray-200 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-gray-400 transition-colors duration-300 hover:border-accent-base hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base"
    >
      {copied ? (
        <CheckIcon className="h-3 w-3 text-accent-ink" />
      ) : (
        <CopyIcon className="h-3 w-3" />
      )}
      {copied ? '已复制' : '复制'}
    </button>
  );
}

function IdentityCard() {
  // 省流 / 2G 弱网时头像降为 lazy，避免首屏大图抢带宽。
  const eager = useClientFlag(shouldRenderEager);
  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="aspect-4/5 h-full max-h-97.5 overflow-hidden border border-white/70 bg-white shadow-lift">
        <SiteImage
          src={profile.avatar}
          alt={profile.avatarAlt}
          width={800}
          height={1000}
          loading={eager ? 'eager' : 'lazy'}
          fetchPriority="high"
          wrapperClassName="h-full w-full"
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}

function StatCounter({ value, label, suffix }: { value: number; label: string; suffix: string }) {
  const isReady = useSectionReady();
  const { ref, value: count } = useCountUp(value, 1.2, isReady);

  return (
    <div className="flex items-baseline gap-2 py-3 border-b border-gray-200 last:border-b-0">
      <span ref={ref} className="text-3xl md:text-4xl font-black text-accent-ink tabular-nums">
        {count}
      </span>
      <span className="text-2xl font-black text-accent-ink">{suffix}</span>
      <span className="text-xs uppercase tracking-widest text-gray-500 font-medium ml-2">
        {label}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.3em] text-gray-400 mb-4">
      <span className="inline-block w-3 h-2 bg-neutral-950 -skew-x-12" />
      {children}
    </h3>
  );
}

export default function AboutSection() {
  const commandTarget = useSectionCommandTarget();
  const isReady = useSectionReady();
  const biographyRef = useRef<HTMLDivElement>(null);
  useCommandTargetHighlight('about', isReady, commandTarget);

  // Awards data (absorbed from the retired honors section), tier-ranked so
  // highlights/standards/timeline share one stable order. `toSorted` is
  // spec-guaranteed stable, so equal tiers keep their raw `honors` order —
  // the same order the command palette's `honor-${index}` ids refer to.
  const sortedHonors = useMemo(
    () => honors.toSorted((a, b) => honorTierMeta[b.tier].rank - honorTierMeta[a.tier].rank),
    [],
  );
  const honorHighlights = useMemo(
    () => sortedHonors.filter((honor) => honor.highlight),
    [sortedHonors],
  );
  const honorStandards = useMemo(
    () => sortedHonors.filter((honor) => !honor.highlight),
    [sortedHonors],
  );
  // 荣誉证书大图改走站点灯箱：只有带 imageSrc 的 highlight 可入箱。展示图与
  // FULL RES 下载 URL 由灯箱内部 resolveImageSrc 统一解析到 static 站，
  // 不再出现同源 /images/ 404 的新标签跳转。
  const [honorLightboxIdx, setHonorLightboxIdx] = useState<number | null>(null);
  const honorLightboxItems = useMemo<LightboxItem[]>(
    () =>
      honorHighlights
        .filter((honor): honor is HonorItem & { imageSrc: string } => Boolean(honor.imageSrc))
        .map((honor) => ({
          imageSrc: honor.imageSrc,
          imageAlt: honor.imageAlt ?? honor.title,
          title: honor.title,
          location: honor.issuerShort ?? honor.issuer,
          year: honor.date,
          dateLabel: honor.date,
          category: honorTierMeta[honor.tier].label,
          downloadSrc: honor.downloadSrc,
          description: honor.description,
        })),
    [honorHighlights],
  );
  // TIMELINE 按时间倒序自动编排（与 tier 排序的卡片区解耦）：year-only 视为
  // 该年年初，无效日期沉底；`toSorted` 的稳定排序让同日项保持 honors 原始
  // 相对顺序，无需求助 `indexOf`（后者在比较器内是 O(n²)）。
  const timelineHonors = useMemo(() => {
    const time = (date: string) => {
      const parsed = Date.parse(date.length === 4 ? `${date}-01-01` : date);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return honors.toSorted((a, b) => time(b.date) - time(a.date));
  }, []);

  return (
    <>
      <AboutHero />

      <div id="about-biography" ref={biographyRef} tabIndex={-1} className="outline-none">
        <SectionShell
          isDark={false}
          tagLine="▼ / MIRAHIKARI"
          badgeText="ABOUT"
          heading="关于我"
          accent="the person behind"
          metaLine="// MIRAHIKARI::PORTFOLIO::ABOUT::GET()"
        >
          {/* Row 1 — editorial intro + identity card */}
          <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 mb-16">
            <div className="lg:w-[55%]">
              <p className="text-xl md:text-2xl lg:text-3xl font-serif text-neutral-950 leading-snug mb-6">
                {profile.introduction}
              </p>
              <p className="text-base text-gray-500 leading-relaxed mb-8">{profile.detail}</p>

              <dl className="mt-10 grid grid-cols-1 gap-3 border-t border-gray-200 pt-8 sm:grid-cols-2">
                {profileFacts.map((fact) => {
                  const FactIcon = fact.icon;
                  const value = (
                    <>
                      <FactIcon
                        className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-colors duration-300 group-hover:text-accent-ink"
                        aria-hidden="true"
                      />
                      <span className="truncate">{fact.value}</span>
                    </>
                  );
                  return (
                    <div
                      key={fact.label}
                      className="group min-w-0 border border-gray-200 bg-white/70 p-3 transition-colors duration-300 hover:border-accent-base hover:bg-accent-wash"
                    >
                      <dt className="mb-2 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400">
                        {fact.label}
                        <span
                          className="h-1.5 w-1.5 -skew-x-12 bg-accent-base opacity-60"
                          aria-hidden="true"
                        />
                      </dt>
                      <dd className="flex min-w-0 items-center gap-2 text-sm font-bold text-neutral-950">
                        {'href' in fact && fact.href ? (
                          <a
                            href={fact.href}
                            target={fact.href.startsWith('mailto:') ? undefined : '_blank'}
                            rel={
                              fact.href.startsWith('mailto:') ? undefined : 'noopener noreferrer'
                            }
                            title={fact.value}
                            className="group inline-flex max-w-full min-w-0 items-center gap-1.5 transition-colors duration-300 hover:text-accent-ink"
                          >
                            {value}
                          </a>
                        ) : (
                          <span
                            className="group inline-flex max-w-full items-center gap-1.5"
                            title={fact.value}
                          >
                            {value}
                          </span>
                        )}
                        {'copyable' in fact && fact.copyable ? <CopyEmailButton /> : null}
                      </dd>
                    </div>
                  );
                })}
                {/* 时区单独渲染：附访客时区对比 */}
                <div className="min-w-0">
                  <dt className="mb-2 flex items-center justify-between font-mono text-[10px] font-bold uppercase tracking-[0.25em] text-gray-400">
                    TIMEZONE / 时区
                    <span
                      className="h-1.5 w-1.5 -skew-x-12 bg-accent-base opacity-60"
                      aria-hidden="true"
                    />
                  </dt>
                  <dd className="border border-gray-200 bg-white/70 p-3 text-sm font-bold text-neutral-950">
                    <span className="inline-flex items-center gap-1.5">
                      <ClockIcon
                        className="h-3.5 w-3.5 shrink-0 text-gray-400"
                        aria-hidden="true"
                      />
                      UTC+8
                    </span>
                    <VisitorTimezoneNote />
                  </dd>
                </div>
              </dl>
            </div>

            <div className="lg:w-[45%]">
              <div className="border border-gray-200 bg-white p-6 md:p-8">
                <SectionLabel>IDENTITY</SectionLabel>
                <div className="relative mb-6 overflow-hidden border border-gray-200 bg-[#EEF2F7]">
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        'radial-gradient(circle at 20% 20%, color-mix(in srgb, var(--section-accent) 22%, transparent), transparent 32%), linear-gradient(135deg, rgba(255,255,255,0.72), color-mix(in srgb, var(--section-accent) 8%, transparent))',
                    }}
                  />
                  <div className="absolute left-0 top-0 z-10 bg-accent-base px-3 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-white pointer-events-none">
                    MiraHikari
                  </div>
                  <div className="absolute right-0 top-0 z-10 border-l border-b border-black/10 bg-white/60 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.2em] text-accent-ink backdrop-blur-md pointer-events-none">
                    ID Card
                  </div>
                  <div className="relative h-97.5 sm:h-110 lg:h-125">
                    <IdentityCard />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between bg-white/58 px-3 py-2 text-[10px] font-mono uppercase tracking-[0.22em] text-neutral-950 backdrop-blur-md pointer-events-none">
                    <span>ID//001</span>
                    <span>Static Card</span>
                  </div>
                </div>
                <SectionLabel>KEY NUMBERS</SectionLabel>
                {aboutStats.map((stat, i) => (
                  <StatCounter key={i} {...stat} />
                ))}
              </div>
            </div>
          </div>

          {/* Row 3 — JOURNEY timeline + PRINCIPLES */}
          <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 mb-16">
            <div className="lg:w-[58%]">
              <SectionLabel>JOURNEY / 成长轨迹</SectionLabel>
              <ol className="relative border-l border-gray-200 pl-6 space-y-6">
                {aboutJourney.map((entry, index) => (
                  <li key={entry.year} className="relative">
                    <span className="absolute -left-7.75 top-1 w-3 h-3 bg-white border-2 border-neutral-950" />
                    {index === aboutJourney.length - 1 && (
                      <span className="absolute -left-8.25 top-0 w-4 h-4 bg-accent-base" />
                    )}
                    <div className="flex items-baseline gap-3 mb-1">
                      <span className="text-sm font-black text-accent-ink font-mono tabular-nums">
                        {entry.year}
                      </span>
                      <span className="text-base font-bold text-neutral-950">{entry.title}</span>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed">{entry.description}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="lg:w-[42%]">
              <SectionLabel>PHILOSOPHY / 个人哲学</SectionLabel>
              <div className="space-y-3">
                {aboutPrinciples.map((principle) => (
                  <div
                    key={principle.title}
                    className="bg-white border border-gray-200 border-l-2 border-l-accent-base p-5 md:p-6 group hover:bg-accent-wash transition-colors duration-300"
                  >
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-accent-ink group-hover:text-accent-soft transition-colors duration-300">
                          {principle.title === 'Apeiron' && <ApeironIcon />}
                          {principle.title === 'Kairos' && <KairosIcon />}
                          {principle.title === 'Ecstasis' && <EcstasisIcon />}
                        </span>
                        <h4 className="text-xl font-normal text-neutral-950 font-serif italic tracking-tight group-hover:text-accent-ink transition-colors duration-300">
                          {principle.title}
                        </h4>
                      </div>
                      {principle.greek && (
                        <span className="text-sm font-handwriting text-gray-400">
                          {principle.greek}
                        </span>
                      )}
                    </div>
                    {principle.zh && (
                      <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-accent-ink mb-2">
                        {principle.zh}
                      </p>
                    )}
                    <p className="text-sm text-gray-500 leading-relaxed">{principle.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Row 5 — EDUCATION + LANGUAGES */}
          <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 mb-16">
            <div className="lg:w-[58%]">
              <SectionLabel>EDUCATION / 教育经历</SectionLabel>
              <ol className="relative border-l border-gray-200 pl-6 space-y-5">
                {education.map((entry) => (
                  <li key={entry.institution} className="relative">
                    <span
                      className={`absolute -left-7.75 top-1.5 w-3 h-3 border-2 ${
                        entry.current
                          ? 'bg-accent-base border-accent-base'
                          : 'bg-white border-neutral-950'
                      }`}
                    />
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-1">
                      <span className="text-xs font-mono text-gray-400 tabular-nums">
                        {entry.startDate} — {entry.endDate ?? '至今'}
                      </span>
                      {entry.current && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent-ink">
                          · NOW
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-bold text-neutral-950">{entry.institution}</h4>
                    <p className="text-sm text-gray-500 leading-relaxed mt-0.5">{entry.area}</p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="lg:w-[42%]">
              <SectionLabel>LANGUAGES / 语言能力</SectionLabel>
              <div className="border border-gray-200 bg-white divide-y divide-gray-100">
                {languages.map((lang) => (
                  <div
                    key={lang.language}
                    className="flex items-center justify-between gap-4 px-5 py-4"
                  >
                    <span className="text-base font-bold text-neutral-950">{lang.language}</span>
                    <span className="text-xs font-mono text-gray-400 uppercase tracking-[0.2em]">
                      {lang.fluency}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-gray-500 leading-relaxed">中文母语，英文工作语言。</p>
            </div>
          </div>

          {/* Row 6 — EXPERIENCE 经历 */}
          <div className="mb-12">
            <SectionLabel>EXPERIENCE / 项目经历</SectionLabel>
            <div className="space-y-px bg-gray-200 border border-gray-200">
              {experiences.map((exp) => (
                <div
                  key={exp.name}
                  className="bg-white p-6 md:p-7 group hover:bg-accent-wash transition-colors duration-300"
                >
                  <div className="flex flex-col md:flex-row md:items-baseline md:justify-between gap-2 mb-3">
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <h4 className="text-lg font-bold text-neutral-950 group-hover:text-accent-ink transition-colors duration-300">
                        {exp.name}
                      </h4>
                      {exp.url && (
                        <a
                          href={exp.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-mono text-gray-400 hover:text-accent-ink transition-colors uppercase tracking-wider"
                        >
                          ↗ {new URL(exp.url).hostname}
                        </a>
                      )}
                    </div>
                    <div className="flex items-baseline gap-3 shrink-0">
                      <span className="text-xs font-mono text-gray-400 tabular-nums">
                        {exp.startDate} — {exp.endDate ?? '至今'}
                      </span>
                      {exp.current && (
                        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-accent-ink">
                          NOW
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-bold text-gray-600 mb-2">{exp.position}</p>
                  <p className="text-sm text-gray-500 leading-relaxed mb-4">{exp.summary}</p>
                  <ul className="space-y-1.5 mb-4">
                    {exp.highlights.map((highlight, hi) => (
                      <li
                        key={hi}
                        className="flex items-start gap-2 text-sm text-gray-600 leading-relaxed"
                      >
                        <span className="text-accent-ink mt-0.5 shrink-0">▸</span>
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-wrap gap-1.5 pt-3 border-t border-gray-100">
                    {exp.stack.map((tech) => (
                      <span
                        key={tech}
                        className="text-[11px] px-2.5 py-1 border border-gray-200 text-gray-500 font-medium font-mono"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Row 7 — AWARDS 荣誉奖项 (absorbed from the retired honors section) */}
          <div className="mb-12">
            <SectionLabel>AWARDS / 荣誉奖项</SectionLabel>

            {/* Stats grid — mirrors the CURRENTLY grid language */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-gray-200 border border-gray-200 mb-10">
              {honorStats.map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white p-5 md:p-6 flex flex-col gap-2 min-h-30 justify-center hover:bg-accent-wash transition-colors duration-300"
                >
                  <HonorStat value={stat.value} label={stat.label} />
                </div>
              ))}
            </div>

            {/* HIGHLIGHTS — featured award cards */}
            {honorHighlights.length > 0 && (
              <div className="mb-10">
                <SectionLabel>HIGHLIGHTS / 重点奖项</SectionLabel>
                <div className="grid md:grid-cols-2 gap-5">
                  {honorHighlights.map((honor) => (
                    <HighlightCard
                      key={`${honor.title}-${honor.date}`}
                      honor={honor}
                      index={honors.indexOf(honor)}
                      total={honors.length}
                      onOpenImage={
                        honor.imageSrc
                          ? () =>
                              setHonorLightboxIdx(
                                honorLightboxItems.findIndex(
                                  (item) => item.imageSrc === honor.imageSrc,
                                ),
                              )
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}

            {/* ALL AWARDS list + TIMELINE */}
            <div className="grid lg:grid-cols-[1.6fr_1fr] gap-8 lg:gap-10">
              <div>
                <SectionLabel>ALL AWARDS / 完整清单</SectionLabel>
                <div className="grid sm:grid-cols-2 gap-4">
                  {honorStandards.map((honor) => (
                    <StandardCard
                      key={`${honor.title}-${honor.date}`}
                      honor={honor}
                      index={honors.indexOf(honor)}
                    />
                  ))}
                </div>
              </div>

              <div>
                <SectionLabel>TIMELINE / 时间线</SectionLabel>
                <div className="border border-gray-200 bg-white p-6 md:p-7">
                  <ol className="relative">
                    {timelineHonors.map((honor, position) => (
                      <TimelineRow
                        key={`tl-${honor.title}-${honor.date}`}
                        honor={honor}
                        index={honors.indexOf(honor)}
                        delayIndex={position}
                      />
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <Lightbox
            items={honorLightboxItems}
            index={honorLightboxIdx}
            onClose={() => setHonorLightboxIdx(null)}
            onNavigate={setHonorLightboxIdx}
            variant="gallery"
          />
        </SectionShell>
      </div>
    </>
  );
}
