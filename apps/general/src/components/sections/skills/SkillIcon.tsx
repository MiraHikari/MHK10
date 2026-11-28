import type { ForwardRefExoticComponent, SVGProps } from 'react';
import TypescriptIcon from '~icons/simple-icons/typescript';
import JavascriptIcon from '~icons/simple-icons/javascript';
import PhpIcon from '~icons/simple-icons/php';
import GoIcon from '~icons/simple-icons/go';
import GnubashIcon from '~icons/simple-icons/gnubash';
import ReactIcon from '~icons/simple-icons/react';
import AstroIcon from '~icons/simple-icons/astro';
import NextdotjsIcon from '~icons/simple-icons/nextdotjs';
import VuedotjsIcon from '~icons/simple-icons/vuedotjs';
import SolidIcon from '~icons/simple-icons/solid';
import SvelteIcon from '~icons/simple-icons/svelte';
import ViteIcon from '~icons/simple-icons/vite';
import TanstackIcon from '~icons/simple-icons/tanstack';
import TailwindcssIcon from '~icons/simple-icons/tailwindcss';
import Html5Icon from '~icons/simple-icons/html5';
import CssIcon from '~icons/simple-icons/css';
import NodedotjsIcon from '~icons/simple-icons/nodedotjs';
import NestjsIcon from '~icons/simple-icons/nestjs';
import MongodbIcon from '~icons/simple-icons/mongodb';
import NginxIcon from '~icons/simple-icons/nginx';
import SocketdotioIcon from '~icons/simple-icons/socketdotio';
import WordpressIcon from '~icons/simple-icons/wordpress';
import RustIcon from '~icons/simple-icons/rust';
import TauriIcon from '~icons/simple-icons/tauri';
import ElectronIcon from '~icons/simple-icons/electron';
import CplusplusIcon from '~icons/simple-icons/cplusplus';
import PythonIcon from '~icons/simple-icons/python';
import PlatformioIcon from '~icons/simple-icons/platformio';
import CloudflareIcon from '~icons/simple-icons/cloudflare';
import GithubIcon from '~icons/simple-icons/github';
import GitIcon from '~icons/simple-icons/git';
import DockerIcon from '~icons/simple-icons/docker';
import LinuxIcon from '~icons/simple-icons/linux';
import VercelIcon from '~icons/simple-icons/vercel';
import NetlifyIcon from '~icons/simple-icons/netlify';
import SolidityIcon from '~icons/simple-icons/solidity';
import EthereumIcon from '~icons/simple-icons/ethereum';
import IpfsIcon from '~icons/simple-icons/ipfs';
import FastapiIcon from '~icons/simple-icons/fastapi';
import SqlalchemyIcon from '~icons/simple-icons/sqlalchemy';
import RedisIcon from '~icons/simple-icons/redis';
import PydanticIcon from '~icons/simple-icons/pydantic';
import SupabaseIcon from '~icons/simple-icons/supabase';
import DatabaseIcon from '~icons/lucide/database';
import CpuIcon from '~icons/lucide/cpu';
import ScanEyeIcon from '~icons/lucide/scan-eye';
import CloudIcon from '~icons/lucide/cloud';
import LinkIcon from '~icons/lucide/link';
import TimerIcon from '~icons/lucide/timer';
import BotIcon from '~icons/lucide/bot';
import AnvilIcon from '~icons/lucide/anvil';
import OrbitIcon from '~icons/lucide/orbit';
import ChartCandlestickIcon from '~icons/lucide/chart-candlestick';
import GpuIcon from '~icons/lucide/gpu';

type IconComponent = ForwardRefExoticComponent<SVGProps<SVGSVGElement> & { title?: string }>;

/**
 * Explicit static map from `profile.ts` icon strings ('set:name') to the
 * matching unplugin-icons virtual component. `~icons/` is a static virtual
 * module, so paths can never be assembled at runtime — every icon used in
 * `skills` / `skillsCurrentlyLearning` must be imported here.
 */
// 导出常量供命令面板 skill-* 命令复用品牌图标（command-icons.ts）。
export const SKILL_ICON_MAP: Readonly<Record<string, IconComponent>> = {
  'simple-icons:typescript': TypescriptIcon,
  'simple-icons:javascript': JavascriptIcon,
  'simple-icons:php': PhpIcon,
  'simple-icons:go': GoIcon,
  'simple-icons:gnubash': GnubashIcon,
  'simple-icons:react': ReactIcon,
  'simple-icons:astro': AstroIcon,
  'simple-icons:nextdotjs': NextdotjsIcon,
  'simple-icons:vuedotjs': VuedotjsIcon,
  'simple-icons:solid': SolidIcon,
  'simple-icons:svelte': SvelteIcon,
  'simple-icons:vite': ViteIcon,
  'simple-icons:tanstack': TanstackIcon,
  'simple-icons:tailwindcss': TailwindcssIcon,
  'simple-icons:html5': Html5Icon,
  'simple-icons:css': CssIcon,
  'simple-icons:nodedotjs': NodedotjsIcon,
  'simple-icons:nestjs': NestjsIcon,
  'simple-icons:mongodb': MongodbIcon,
  'simple-icons:nginx': NginxIcon,
  'simple-icons:socketdotio': SocketdotioIcon,
  'simple-icons:wordpress': WordpressIcon,
  'simple-icons:rust': RustIcon,
  'simple-icons:tauri': TauriIcon,
  'simple-icons:electron': ElectronIcon,
  'simple-icons:cplusplus': CplusplusIcon,
  'simple-icons:python': PythonIcon,
  'simple-icons:platformio': PlatformioIcon,
  'simple-icons:cloudflare': CloudflareIcon,
  'simple-icons:github': GithubIcon,
  'simple-icons:git': GitIcon,
  'simple-icons:docker': DockerIcon,
  'simple-icons:linux': LinuxIcon,
  'simple-icons:vercel': VercelIcon,
  'simple-icons:netlify': NetlifyIcon,
  'simple-icons:solidity': SolidityIcon,
  'simple-icons:ethereum': EthereumIcon,
  'simple-icons:ipfs': IpfsIcon,
  'simple-icons:fastapi': FastapiIcon,
  'simple-icons:sqlalchemy': SqlalchemyIcon,
  'simple-icons:redis': RedisIcon,
  'simple-icons:pydantic': PydanticIcon,
  'simple-icons:supabase': SupabaseIcon,
  'lucide:database': DatabaseIcon,
  'lucide:cpu': CpuIcon,
  'lucide:scan-eye': ScanEyeIcon,
  'lucide:cloud': CloudIcon,
  'lucide:link': LinkIcon,
  'lucide:timer': TimerIcon,
  'lucide:bot': BotIcon,
  'lucide:anvil': AnvilIcon,
  'lucide:orbit': OrbitIcon,
  'lucide:chart-candlestick': ChartCandlestickIcon,
  'lucide:gpu': GpuIcon,
};

interface SkillIconProps {
  readonly icon?: string;
  readonly className?: string;
}

export function SkillIcon({ icon, className }: SkillIconProps) {
  const Cmp = icon ? SKILL_ICON_MAP[icon] : undefined;
  if (!Cmp) {
    // 占位 span 保持行内对齐,避免缺图标时布局跳动
    return <span aria-hidden="true" className={className} />;
  }
  return <Cmp aria-hidden="true" className={className} />;
}
