/**
 * Command palette icon map — presentation-layer counterpart to
 * `@/lib/command-registry`. The registry stays icon-free on purpose:
 * vitest has no unplugin-icons plugin, so `~icons/` virtual modules can
 * only live in the component layer (same constraint as `SkillIcon`).
 *
 * Resolution order:
 *   1. exact static command id (STATIC_ICONS)
 *   2. dynamic id prefix — skill-* reuses the skills brand-icon map,
 *      article/tag/project/honor fall back to a generic lucide glyph
 *   3. remaining link commands → ExternalLinkIcon
 * `toggle-bgm` intentionally renders without an icon, matching the
 * previous UI where its label plus the BGM home-row FFT carry the meaning.
 */
import type { ComponentType } from 'react';
import GithubIcon from '~icons/simple-icons/github';
import BilibiliIcon from '~icons/simple-icons/bilibili';
import WechatIcon from '~icons/simple-icons/wechat';
import SendIcon from '~icons/lucide/send';
import MailIcon from '~icons/lucide/mail';
import CopyIcon from '~icons/lucide/copy';
import HeartHandshakeIcon from '~icons/lucide/heart-handshake';
import FileTextIcon from '~icons/lucide/file-text';
import HouseIcon from '~icons/lucide/house';
import ChevronsRightIcon from '~icons/lucide/chevrons-right';
import ShuffleIcon from '~icons/lucide/shuffle';
import SparklesIcon from '~icons/lucide/sparkles';
import ZapIcon from '~icons/lucide/zap';
import GaugeIcon from '~icons/lucide/gauge';
import SmartphoneIcon from '~icons/lucide/smartphone';
import HashIcon from '~icons/lucide/hash';
import FolderIcon from '~icons/lucide/folder';
import AwardIcon from '~icons/lucide/award';
import ExternalLinkIcon from '~icons/lucide/external-link';
import { skills } from '@/data/profile';
import { SKILL_ICON_MAP } from '@/components/sections/skills/SkillIcon';
import type { Command } from '@/lib/command-registry';

type PaletteIcon = ComponentType<{ className?: string }>;

const STATIC_ICONS: Readonly<Record<string, PaletteIcon>> = {
  github: GithubIcon,
  bilibili: BilibiliIcon,
  email: MailIcon,
  'copy-email': CopyIcon,
  'copy-result': CopyIcon,
  wechat: WechatIcon,
  // simple-icons 无 feishu 条目，用纸飞机贴近其品牌意象
  feishu: SendIcon,
  zanshang: HeartHandshakeIcon,
  'resume-pdf': FileTextIcon,
  'goto-home': HouseIcon,
  'goto-last': ChevronsRightIcon,
  'random-section': ShuffleIcon,
  'lucid-mode': SparklesIcon,
  'motion-full': ZapIcon,
  'motion-mobile': SmartphoneIcon,
  'motion-reduced': GaugeIcon,
};

/** 技能名 → 品牌图标，与 SkillsSection 同源（profile.json 的 icon 字段）。 */
const skillIconByName: ReadonlyMap<string, PaletteIcon> = new Map(
  skills.flatMap((skill) => {
    const icon = skill.icon ? SKILL_ICON_MAP[skill.icon] : undefined;
    return icon ? [[skill.name, icon] as const] : [];
  }),
);

export function commandIcon(command: Command): PaletteIcon | null {
  if (command.id === 'toggle-bgm') return null;

  const exact = STATIC_ICONS[command.id];
  if (exact) return exact;

  if (command.id.startsWith('skill-')) {
    return skillIconByName.get(command.id.slice('skill-'.length)) ?? null;
  }
  if (command.id.startsWith('article-')) return FileTextIcon;
  if (command.id.startsWith('tag-')) return HashIcon;
  if (command.id.startsWith('project-')) return FolderIcon;
  if (command.id.startsWith('honor-')) return AwardIcon;

  if (command.type === 'link') return ExternalLinkIcon;
  return null;
}
