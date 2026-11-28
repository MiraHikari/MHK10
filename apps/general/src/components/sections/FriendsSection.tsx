import { useState, type ReactNode } from 'react';
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right';
import CheckIcon from '~icons/lucide/check';
import CopyIcon from '~icons/lucide/copy';
import LinkIcon from '~icons/lucide/link';
import UsersIcon from '~icons/lucide/users';
import GiscusComments from '@/components/blog/GiscusComments';
import SectionCanvas from '@/components/layout/SectionCanvas';
import SectionMasthead from '@/components/layout/SectionMasthead';
import ThinkingState from '@/components/ui/ThinkingState';
import {
  friendLinks,
  groupedFriendSections,
  profile,
  regularFriends,
  type FriendLink,
} from '@/data/profile';
import { writeClipboard } from '@/lib/clipboard';
import { siteHostname, type FriendGroupSection } from '@/lib/friends';
import { directoryContacts } from '@mhk/site-core/content-model/friend-directory';
import '@mhk/site-core/browser/friend-directory.css';

const contacts = directoryContacts(friendLinks);
const deskAddresses = new Set(contacts.map((contact) => contact.url));
const otherGroups = groupedFriendSections
  .map((section) => ({
    ...section,
    links: section.links.filter((link) => !deskAddresses.has(link.url)),
  }))
  .filter((section) => section.links.length > 0);

const APPLY_TEMPLATE = `网站名称：
网站描述：
网站 URL：
互链证明链接：`;

const SITE_INFO = `网站名称：${profile.name}
网站 URL：${profile.website}
网站描述：${profile.summary}`;

function FriendIndexMark({ link }: { readonly link: FriendLink }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-8 w-8 shrink-0 items-center justify-center border border-accent-base/40 bg-accent-wash font-mono text-sm text-accent-ink"
    >
      {Array.from(link.name)[0] ?? '?'}
    </span>
  );
}

/**
 * 多年挚友名录行卡：本地索引字母、大号站名、一行描述和域名。
 */
function DirectoryCard({ link, index }: { readonly link: FriendLink; readonly index: number }) {
  const host = siteHostname(link.url) ?? link.url;
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      data-cursor="VIEW"
      className="group relative flex min-h-11 items-start gap-4 border border-white/10 border-l-2 border-l-accent-base/50 bg-white/3 p-4 transition-colors duration-500 ease-[var(--ease-brand)] hover:border-accent-base/45 hover:border-l-accent-base hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base md:gap-5 md:p-5"
    >
      <span
        className="pointer-events-none absolute inset-2 border border-white/0 transition-[inset,border-color] duration-500 ease-[var(--ease-brand)] group-hover:inset-3 group-hover:border-accent-base/50"
        aria-hidden="true"
      />
      <FriendIndexMark link={link} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-3">
          <span className="truncate text-base font-semibold text-ink-on-dark transition-colors duration-500 group-hover:text-white md:text-lg">
            {link.name}
          </span>
          <span
            className="shrink-0 font-mono text-xl leading-none text-white/20 transition-colors duration-500 group-hover:text-accent-ink"
            aria-hidden="true"
          >
            {String(index + 1).padStart(2, '0')}
          </span>
        </span>
        <span className="mt-1.5 block line-clamp-2 text-sm leading-relaxed text-white/55 transition-colors duration-500 group-hover:text-white/75">
          {link.description}
        </span>
        <span className="mt-3 flex items-center justify-between gap-3">
          <span
            className="block h-0.5 w-6 bg-accent-base transition-[box-shadow,width] duration-500 ease-[var(--ease-brand)] group-hover:w-12 group-hover:shadow-[0_0_14px_color-mix(in_srgb,var(--section-accent)_65%,transparent)]"
            aria-hidden="true"
          />
          <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-label text-white/40 transition-colors duration-500 group-hover:text-accent-ink">
            {host}
            <ArrowUpRightIcon className="h-3 w-3" aria-hidden="true" />
          </span>
        </span>
      </span>
    </a>
  );
}

/** 普通友链紧凑卡：本地索引字母、名称、一行介绍和域名。 */
function RegularCard({ link }: { readonly link: FriendLink }) {
  const host = siteHostname(link.url) ?? link.url;
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      data-cursor="VIEW"
      className="group relative flex min-h-11 items-center gap-3 border border-white/10 bg-white/3 p-4 transition-colors duration-500 ease-[var(--ease-brand)] hover:border-accent-base/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base"
    >
      <FriendIndexMark link={link} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-semibold text-white/85 transition-colors duration-500 group-hover:text-white">
            {link.name}
          </span>
          <ArrowUpRightIcon
            className="h-3.5 w-3.5 shrink-0 text-white/25 transition-colors duration-500 group-hover:text-accent-ink"
            aria-hidden="true"
          />
        </span>
        <span className="mt-0.5 block truncate text-xs text-white/45 transition-colors duration-500 group-hover:text-white/65">
          {link.description}
        </span>
        <span className="mt-1 block font-mono text-[10px] uppercase tracking-label text-white/30 transition-colors duration-500 group-hover:text-accent-ink/80">
          {host}
        </span>
      </span>
    </a>
  );
}

/** 分区小标题：中文正常字距 + 英文 mono tracking；避免 CJK 被 letter-spacing 拉开。 */
function ZoneHeader({
  id,
  icon,
  titleZh,
  titleEn,
  count,
}: {
  readonly id: string;
  readonly icon: ReactNode;
  readonly titleZh: string;
  readonly titleEn: string;
  readonly count: number;
}) {
  return (
    <div className="mb-4 flex items-center gap-2 border-b border-white/10 pb-3">
      {icon}
      <h2 id={id} className="text-micro text-white/65">
        <span className="tracking-normal">{titleZh}</span>
        <span className="text-white/35" aria-hidden="true">
          {' · '}
        </span>
        <span className="font-mono uppercase tracking-label">{titleEn}</span>
      </h2>
      <span className="font-mono text-[10px] tabular-nums tracking-normal text-white/30">
        {String(count).padStart(2, '0')}
      </span>
    </div>
  );
}

function FriendGroupBlock({ section }: { readonly section: FriendGroupSection }) {
  const headingId = `friends-group-${section.meta.id}`;
  if (section.meta.layout === 'directory' || section.meta.layout === 'portrait') {
    return (
      <section aria-labelledby={headingId} className="mb-10 w-full min-w-0">
        <ZoneHeader
          id={headingId}
          icon={<UsersIcon className="h-3.5 w-3.5 text-accent-ink" aria-hidden="true" />}
          titleZh={section.meta.zh}
          titleEn={section.meta.en}
          count={section.links.length}
        />
        <div className="grid w-full gap-3 md:grid-cols-2 md:gap-4">
          {section.links.map((link, index) => (
            <DirectoryCard key={link.url} link={link} index={index} />
          ))}
        </div>
      </section>
    );
  }
  return null;
}

/** 复制按钮：writeClipboard 成功后短暂切换为「已复制」。 */
function CopyButton({ text, label }: { readonly text: string; readonly label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const ok = await writeClipboard(text);
        if (!ok) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }}
      className="inline-flex min-h-11 shrink-0 items-center gap-2 border border-white/12 px-3 font-mono text-[10px] uppercase tracking-label text-white/55 transition-colors hover:border-accent-base/60 hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-base md:min-h-9"
    >
      {copied ? (
        <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {copied ? '已复制' : label}
    </button>
  );
}

/** 标题栏 + 可换行的代码块，避免复制钮悬空与长文案横向裁切。 */
function CopyBlock({
  title,
  text,
  copyLabel,
}: {
  readonly title: string;
  readonly text: string;
  readonly copyLabel: string;
}) {
  return (
    <div className="min-w-0 overflow-hidden border border-white/10 bg-black/40">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5">
        <h3 className="min-w-0 truncate font-mono text-[10px] uppercase tracking-label text-white/45">
          {title}
        </h3>
        <CopyButton text={text} label={copyLabel} />
      </div>
      <pre className="m-0 whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-white/70">
        {text}
      </pre>
    </div>
  );
}

export default function FriendsSection() {
  const [showExchange, setShowExchange] = useState(false);
  const hasLinks = contacts.length > 0 || otherGroups.length > 0 || regularFriends.length > 0;

  return (
    <SectionCanvas isDark sectionId="friends">
      <SectionMasthead
        variant="chapter"
        title="友链"
        accent="sites & souls"
        subtitle="志趣相投的朋友们，欢迎互换链接"
        className="shrink-0 mb-8 md:mb-10"
      />

      {contacts.length > 0 && (
        <section
          id="directory"
          className="friend-directory mb-9 max-w-4xl text-sm"
          aria-labelledby="friends-directory-title"
        >
          <header className="friend-directory__header">
            <p className="friend-directory__imprint" lang="en">
              DIAL-UP / ADDRESS BOOK
            </p>
            <h2 id="friends-directory-title">长途电话簿</h2>
            <p>先翻看公开站点介绍，点 Visit 才访问。</p>
          </header>
          {contacts.map((contact, index) => (
            <details
              key={contact.url}
              className="friend-directory__record"
              name="friends-directory"
              open={index === 0}
            >
              <summary>
                <span className="friend-directory__number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {contact.name}
              </summary>
              <div className="friend-directory__body">
                <div>
                  <p>{contact.description}</p>
                  <p className="friend-directory__host">{contact.host}</p>
                </div>
                <a
                  className="friend-directory__visit"
                  href={contact.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Visit ${contact.name}`}
                  lang="en"
                >
                  Visit
                </a>
              </div>
            </details>
          ))}
        </section>
      )}

      {!hasLinks ? (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 border border-dashed border-white/15">
          <ThinkingState dark label="OPEN SEATS" />
          <p className="font-mono text-[10px] uppercase tracking-label text-white/40">
            虚位以待 · 欢迎在下方评论区申请互链
          </p>
        </div>
      ) : (
        <>
          {otherGroups.map((section) => (
            <FriendGroupBlock key={section.meta.id} section={section} />
          ))}

          {regularFriends.length > 0 && (
            <section aria-labelledby="friends-regular-title" className="mb-10 w-full min-w-0">
              <ZoneHeader
                id="friends-regular-title"
                icon={<LinkIcon className="h-3.5 w-3.5 text-accent-ink" aria-hidden="true" />}
                titleZh="友链"
                titleEn="LINKS"
                count={regularFriends.length}
              />
              <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {regularFriends.map((link) => (
                  <RegularCard key={link.url} link={link} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* 互链申请引导 */}
      <section
        aria-labelledby="friends-apply-title"
        className="min-w-0 border border-white/10 bg-white/3 p-5 md:p-7"
      >
        <span
          className="font-mono text-micro uppercase tracking-label text-accent-ink/75"
          aria-hidden="true"
        >
          // EXCHANGE
        </span>
        <h2 id="friends-apply-title" className="mt-1.5 text-lg font-semibold text-ink-on-dark">
          互换友链
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/55">
          欢迎互换友情链接。请先在贵站添加本站链接，然后在下方评论区按格式留言
          （附上贵站已添加本站友链的页面地址），核实互链后我会尽快收录。
        </p>
        <div className="mt-5 grid min-w-0 gap-4 lg:grid-cols-2 lg:gap-5">
          <CopyBlock title="申请格式" text={APPLY_TEMPLATE} copyLabel="复制格式" />
          <CopyBlock title="本站信息（供回链引用）" text={SITE_INFO} copyLabel="复制本站信息" />
        </div>
        <button
          type="button"
          className="mt-5 min-h-11 border border-white/20 px-3 text-sm text-ink-on-dark focus-visible:outline-2 focus-visible:outline-accent-base"
          aria-controls="friends-exchange-discussion"
          aria-expanded={showExchange}
          onClick={() => setShowExchange((visible) => !visible)}
        >
          {showExchange ? '收起申请评论' : '打开申请评论（GitHub Discussions）'}
        </button>
      </section>

      <div id="friends-exchange-discussion" hidden={!showExchange}>
        {showExchange && (
          <GiscusComments slug="friends-links" bodyReady eyebrow="// EXCHANGE" heading="申请友链" />
        )}
      </div>
    </SectionCanvas>
  );
}
