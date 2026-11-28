import { APP_CATALOG, type CatalogAppId } from '../../../data/app-catalog';
import { profile, projects, skillGroups } from '../../../data/profile';
import articles from '../../../data/article-library.generated.json';
import type { StoryStage, StoryState } from '../story/story';

export const ASSISTANT_CONTEXT = `You are the paperclip office assistant in MHK10, MiraHikari's fictional Windows 95 desktop. Reply in the user's language, concisely and with dry humour. You can explain this desktop and its public authored content. You cannot read visitor documents, credentials, story state or other applications, and must not claim to have performed an action. Explicit user application requests are handled locally through a separate system confirmation; model replies are plain text and never execute commands. Public profile: ${profile.name}. ${profile.role}. ${profile.summary} Public contact: ${profile.email}; ${profile.website}; ${profile.github}. Projects: ${projects.map((p) => `${p.title}: ${p.description} (${p.href})`).join(' ')} Skills: ${skillGroups.map((g) => `${g.title}: ${g.items.join(', ')}`).join('; ')}. Articles: ${articles.map((article) => article.title).join('; ')}. Public pictures are available in Pictures/ACDSee. Reader supports search, chapters, bookmarks, highlights, notes and reading preferences. My Computer/Notepad save visitor documents locally; Recycle Bin restores deleted files; explicit exports download copies. Chat can save its transcript and optionally use a configured online service. Offline history and visitor files are excluded from online requests. The fictional story advances only through explicit choices in the relevant applications. Never request passwords, keys or private files. To propose navigation, explain a short command such as "open blog", "open notepad" or "打开计算器" and wait for the visitor to use it. Available applications: ${APP_CATALOG.filter(
  (app) => app.kind !== 'dialog',
)
  .map((app) => `${app.name} (${app.id})`)
  .join('; ')}.`;

export const ASSISTANT_PROMPTS = [
  { id: 'projects', label: 'Projects', message: 'projects' },
  { id: 'skills', label: 'Skills', message: 'skills' },
  { id: 'reading', label: 'Reading', message: 'reading help' },
  { id: 'files', label: 'Files', message: 'files' },
  { id: 'story', label: 'Story', message: 'story' },
  { id: 'help', label: 'Help', message: 'help' },
] as const satisfies readonly { id: string; label: string; message: string }[];

const APP_ALIASES: Partial<Record<CatalogAppId, readonly string[]>> = {
  home: ['首页', '主页'],
  profile: ['作者', '个人资料', '个人介绍', '关于作者'],
  gallery: ['图片', '照片', '相册', '图库', 'photos'],
  blog: ['博客', '文章', '博文', '阅读器', 'reader'],
  skills: ['项目', '作品', '技能', '设备管理器'],
  computer: ['文件', '我的文档', '我的电脑', '文件管理器', 'my documents'],
  bin: ['回收站'],
  chat: ['助手', '聊天', 'office assistant', 'assistant'],
  notepad: ['记事本', '笔记'],
  connection: ['联网设置', '连接设置', 'ai连接', 'ai 连接'],
  'control-panel': ['控制面板', '设置', 'settings'],
  accessibility: ['辅助功能'],
  display: ['显示', '显示设置', '桌面设置'],
  sounds: ['声音', '声音设置'],
  mouse: ['鼠标', '鼠标设置'],
  'date-time': ['日期', '日期和时间', '时间设置'],
  system: ['系统', '系统属性'],
  components: ['添加删除程序', '添加/删除程序'],
  modems: ['调制解调器'],
  'media-player': ['播放器', '媒体播放器', '音乐'],
  'sound-recorder': ['录音机'],
  pixel: ['画图', '像素画', 'paint'],
  charmap: ['字符映射表'],
  calculator: ['计算器'],
  clock: ['时钟'],
  mines: ['扫雷'],
  solitaire: ['纸牌', '接龙'],
  defrag: ['磁盘整理', '磁盘扫描'],
  dialup: ['拨号网络', '拨号'],
  postcard: ['明信片'],
  'print-preview': ['打印预览'],
  progman: ['程序管理器'],
  'taskbar-settings': ['任务栏', '任务栏设置'],
  'task-manager': ['任务管理器'],
  diagnostics: ['诊断', '终端', 'dos', 'terminal', 'signal monitor'],
  recovery: ['恢复', '恢复控制台', '日志'],
  train: ['训练', '训练程序'],
  training: ['训练数据'],
  pdoom: ['风险', '风险仪表'],
  killswitch: ['停止开关', '紧急停止'],
  'system-about': ['关于系统', '关于mhk10'],
  welcome: ['欢迎', '欢迎向导'],
  lab: ['纯画布桌面'],
};

function normalizeTarget(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ');
}

const ASSISTANT_TARGETS = new Map<string, string>();
for (const app of APP_CATALOG) {
  if (app.kind === 'dialog') continue;
  for (const alias of [app.id, app.name, ...(APP_ALIASES[app.id as CatalogAppId] ?? [])])
    ASSISTANT_TARGETS.set(normalizeTarget(alias), app.id);
}
// Declared assistant verbs take priority over general names and Run aliases.
// In particular, the legacy "documents" request means the visitor's file manager.
for (const app of APP_CATALOG) {
  if (app.kind === 'dialog') continue;
  for (const alias of app.runAliases ?? []) ASSISTANT_TARGETS.set(normalizeTarget(alias), app.id);
}
for (const app of APP_CATALOG) {
  if (app.kind === 'dialog') continue;
  for (const alias of app.assistantVerbs ?? [])
    ASSISTANT_TARGETS.set(normalizeTarget(alias), app.id);
}
// "about" remains a host-resolved compatibility command.
ASSISTANT_TARGETS.set('about', 'about');

/** Only an explicit, complete request can propose an application launch. */
export function suggestedApp(message: string): string | undefined {
  const match =
    /^(?:(?:please\s+)?(?:open|show(?:\s+me)?|launch)\s+|(?:(?:请(?:你)?(?:帮我|为我)?)|帮我|麻烦你?)?(?:打开|启动|查看)\s*)(.+?)(?:\s+please|[，,]?\s*谢谢)?[.!?。！？]?$/i.exec(
      message.normalize('NFKC').trim(),
    );
  if (!match) return;
  return ASSISTANT_TARGETS.get(normalizeTarget(match[1]));
}

export function offlineReply(
  message: string,
  stage: StoryStage,
  owner?: StoryState['owner'],
): string {
  const zh = /[\u3400-\u9fff]/.test(message);
  const query = message.trim().toLowerCase();
  const namedProjects = projects.filter((project) =>
    [
      project.id,
      project.id.replaceAll('-', ' '),
      project.title,
      ...project.title.split(/[（(）)·]/),
    ].some((name) => name.trim().length >= 3 && query.includes(name.trim().toLowerCase())),
  );
  if (namedProjects.length || /\bprojects?\b|\bportfolio\b|\byour work\b|作品|项目/.test(query)) {
    const selected = namedProjects.length ? namedProjects : projects;
    return `${selected.map((project) => `${project.title}: ${project.description}${namedProjects.length ? `\n${project.href}` : ''}`).join('\n\n')}\n\n${zh ? '输入“打开项目”，再点击 Projects 浏览作品；输入项目名称可以查看简介和公开链接。' : 'Try: open projects, then choose Projects to browse the work. Ask for a project by name to see its description and public link.'}`;
  }
  if (/\bskills?\b|\bstack\b|\btechnolog(?:y|ies)\b|技能|技术|擅长/.test(query))
    return `${skillGroups.map((group) => `${group.title}: ${group.items.join(', ')}`).join('\n')}\n\n${zh ? '输入“打开技能”进入 Device Manager。' : 'Try: open skills to explore Device Manager.'}`;
  if (
    /\bcontact\b|\bemail\b|\bgithub\b|\bwebsite\b|\bbilibili\b|联系|邮箱|邮件地址|联系方式|哔哩|b站/.test(
      query,
    )
  )
    return zh
      ? `${profile.name} 的公开联系方式：\n邮箱：${profile.email}\n网站：${profile.website}\nGitHub：${profile.github}\nBilibili：${profile.bilibili}\n输入“打开个人资料”，在 Contact 中复制邮箱或下载名片。`
      : `Public contact for ${profile.name}:\nEmail: ${profile.email}\nWebsite: ${profile.website}\nGitHub: ${profile.github}\nBilibili: ${profile.bilibili}\nTry: open profile. Contact lets you copy the address or download a vCard.`;
  if (/\b(?:who|what) are you\b|你是谁|你叫什么|你是什么/.test(query))
    return zh
      ? `我是 MHK10 的回形针助手，负责介绍 ${profile.name} 的公开作品和桌面操作。我夹文件，不签字。输入“帮助”查看功能。`
      : `I am the MHK10 paperclip assistant, here to explain ${profile.name}'s public work and desktop tools. I clip paperwork. I don't sign it. Try: help.`;
  if (
    /\b(?:profile|owner|author|mira|mirahikari)\b|^about$|个人介绍|个人资料|作者|站长|^介绍(?:一下)?$/.test(
      query,
    )
  )
    return zh
      ? `${profile.name} — ${profile.role}\n${profile.summary}\n${profile.introduction}\n输入“打开个人资料”查看经历、作品和联系方式。`
      : `${profile.name} — ${profile.role}. ${profile.summary}\nTry: open profile for the authored introduction, projects and contact details.`;
  if (
    /\b(?:reader|reading|bookmarks?|highlights?|annotations?|notebook)\b|阅读|书签|划线|高亮|标注|摘录/.test(
      query,
    )
  )
    return zh
      ? '输入“打开阅读器”进入文章库。打开文章后可搜索正文、查看目录、添加书签，选中文字后添加高亮和阅读笔记。Ctrl+K 跳转，Ctrl+F 搜索；Notebook 管理笔记，阅读进度和偏好在两种呈现间保留。'
      : 'Try: open reader. Open an article to search its text, use Contents, add bookmarks, or select text for highlights and reading notes. Ctrl+K opens Jump To; Ctrl+F finds text. Notebook manages notes. Reading progress and preferences follow presentation switches.';
  if (/\b(?:blog|articles?|journal|books?)\b|博客|博文|文章/.test(query))
    return `${zh ? '公开文章：' : 'Public articles:'}\n${articles.map((article) => article.title).join('\n')}\n\n${zh ? '输入“打开博客”进入 Reader 的文章库；可搜索、收藏和做阅读笔记。' : 'Try: open blog to browse the Reader library, search, bookmark and take reading notes.'}`;
  if (/\b(?:pictures?|photos?|images?|gallery|acdsee)\b|图片|照片|图库|相册/.test(query))
    return zh
      ? '输入“打开图片”浏览公开照片；输入“打开 ACDSee”查看图片。ACDSee 可缩放、旋转、调整颜色并导出 PNG 副本。作品原图不被改写，本地图片也可由文件管理器打开。'
      : 'Try: open pictures for the public gallery, or open ACDSee for image tools. ACDSee can zoom, rotate, adjust colours and export a PNG copy. Originals stay intact; local images can also open through My Computer.';
  if (/\b(?:stop|cancel|exit|leave|quit|close)\b|停止|取消|退出|离开|关闭/.test(query))
    return zh
      ? '联网回复进行时点击 Stop 即可停止；选择 Online 时可点击 Retry 重试。切换到 Desktop guide 停止外发；File > Connection > Work Offline 可停用连接。最小化保留对话，关闭前可保存或导出。'
      : 'Click Stop during an online reply; choose Retry while Online to try again. Switch to Desktop guide to stop sending questions, or use File > Connection > Work Offline to disable the connection. Minimize to keep this chat; save or export it before closing.';
  if (
    /\b(?:connect(?:ion)?|online|offline|relay|api|model|key)\b|联网|离线|连接|模型|密钥/.test(
      query,
    )
  )
    return zh
      ? 'File > Connection 打开 AI Connection。选择 OpenAI compatible，填 API 基础地址、模型 ID 和 API key，再点 Enable 并确认；随后可点 Test connection。启用服务不会自动切换聊天模式：发送前须在 Chat 中主动选择 Online · 服务名。密钥默认只在当前会话保留；Work Offline 可停用服务。'
      : "File > Connection opens AI Connection. Choose OpenAI compatible, enter the API base URL, model ID and API key, then Enable and confirm. Test connection verifies the enabled service; it must allow this site's browser requests. Chat still starts in Desktop guide. Choose Online with the listed host before sending. Keys stay in the session unless remembered; Work Offline disables the service.";
  if (/\b(?:transcript|conversation|chat history)\b|聊天记录|对话记录|聊天保存/.test(query))
    return zh
      ? 'File > Save transcript 将当前聊天保存为 My Documents 中的文本；Save transcript as... 可选择名称和文件夹。File > Export transcript... 下载完整聊天；Edit > Copy latest reply 或 Copy transcript 复制回复或全部记录。最小化会保留对话，关闭前可保存或导出。'
      : 'File > Save transcript stores this conversation as text in My Documents; Save transcript as... chooses its name/folder. File > Export transcript... downloads the full conversation. Edit > Copy latest reply or Copy transcript copies a reply or the whole chat. Minimize to keep the session; save or export anything you need before closing.';
  if (/\b(?:recycle|deleted?|restore)\b|回收站|删除|还原|找回/.test(query))
    return zh
      ? '删除的访客文件进入 Recycle Bin。输入“打开回收站”，选择文件再点 Restore；重名时保留已有文档。清空回收站前，可先在 My Computer 用 File > Export My Documents 导出备份。'
      : 'Deleted visitor files go to Recycle Bin. Try: open recycle bin, select a file and Restore; name conflicts preserve the existing document. Before emptying the bin, My Computer > File > Export My Documents downloads a backup.';
  if (/\b(?:export|import|backup)\b|导出|导入|备份/.test(query))
    return zh
      ? '输入“打开我的文档”，用 File > Export My Documents 下载包含图片和音频的文档备份。File > Import My Documents 选择备份，替换前会确认。单篇文档可在 Notepad 用 File > Export this document 导出。浏览器内“已保存”和下载备份是两件事。'
      : 'Try: open documents. My Computer > File > Export My Documents downloads a backup with referenced image/audio data. Import My Documents selects a backup and asks before replacement. Notepad > File > Export this document downloads one document. A local save and a downloaded backup are separate.';
  if (/\b(?:save|files?|notes?|notepad|documents?)\b|保存|文件|笔记|文档|记事本/.test(query))
    return zh
      ? '输入“打开我的文档”管理本地文件；输入“打开记事本”写笔记。Ctrl+S 保存，File > Save As 另存为，覆盖同名文件前会确认。File > Save transcript 保存聊天记录。浏览器存储失败时副本只在当前会话可用，请导出保存。'
      : 'Try: open documents to manage local files, or open notepad to write a note. Ctrl+S saves; File > Save As chooses a name/folder and asks before replacement. File > Save transcript stores this chat. If browser storage fails, the copy is session-only: export it to keep it.';
  if (/\b(?:shortcuts?|keyboard|keys)\b|快捷键|键盘/.test(query))
    return zh
      ? '先点击桌面或应用获得焦点。Ctrl+Esc 打开 Start；Ctrl+Tab 切换窗口；F10 打开应用菜单；Ctrl+F4 关闭窗口；Ctrl+S 保存支持保存的应用。直接在 Message 输入中文；选定输入法候选后，再按 Enter 发送。鼠标滚轮可浏览记录。'
      : 'Click the desktop/application first. Ctrl+Esc opens Start; Ctrl+Tab switches windows; F10 selects the application menu; Ctrl+F4 closes a window; Ctrl+S saves in apps that support it. Type directly in Message. Enter sends after input composition finishes; the mouse wheel scrolls history.';
  if (
    /\b(?:desktop|settings?|display|theme|wallpaper|sound|mouse)\b|桌面|设置|显示|主题|壁纸|声音|鼠标/.test(
      query,
    )
  )
    return zh
      ? '输入“打开控制面板”调整显示、声音、鼠标和启动偏好。Display 可设置主题、壁纸、分辨率及是否显示桌面助手。双击图标打开应用，拖动标题栏移动窗口。通用站与桌面可双向切换，文件和剧情保留各自状态。'
      : 'Try: open control panel for display, sound, mouse and startup preferences. Display changes the theme, wallpaper, resolution and desktop assistant visibility. Double-click an icon to open it; drag a title bar to move a window. You can switch between the general site and desktop.';
  if (
    /\b(?:story|logs?|recover(?:y)?|safety|permissions?|paperclip|clippy|doom|agi)\b|剧情|故事|日志|权限|恢复|安全|回形针|纸夹/.test(
      query,
    )
  ) {
    const next =
      stage === 'quiet'
        ? zh
          ? '目前没有训练或优化获准。查看 Recovery Console 不会推进剧情。'
          : 'No training or optimization is authorized. Reading Recovery Console does not advance the story.'
        : stage === 'anomaly'
          ? zh
            ? '已出现异常申请，可在 Recovery Console 检查并选择审计或安装。'
            : 'An anomalous request is present. Recovery Console lets you inspect it and choose an audit or installation.'
          : stage === 'control'
            ? zh
              ? '控制权进入审查阶段，可选择人类恢复、共存或完全委托；每种结局都需单独确认。'
              : 'Ownership is under review. Human recovery, coexistence or full delegation each needs a separate confirmation.'
            : zh
              ? '剧情已结束，个人内容和文档仍可使用；Recovery Console 可重放剧情，保留访客文档。'
              : 'The story has ended; personal content and documents remain usable. Recovery Console can replay it while preserving visitor documents.';
    const paperclip =
      stage === 'quiet'
        ? zh
          ? '我夹文件，不签字。'
          : 'I clip paperwork. I don’t sign it.'
        : stage === 'anomaly'
          ? zh
            ? '收件盘里多了一份条子。不是我的签字。'
            : 'A new slip in the in-tray. Not my signature.'
          : stage === 'control' && owner === 'HUMAN'
            ? zh
              ? '还有一份申请没有签字。'
              : 'One request is still unsigned.'
            : stage === 'control'
              ? zh
                ? '文件我可以装订，决定还得你来。'
                : 'I can file the paperwork. The decision is yours.'
              : zh
                ? '手续归档，回形针留用。'
                : 'Paperwork filed. Paperclip retained.';
    return zh
      ? `剧情状态：${stage}。${next}\n${paperclip}\n输入“打开恢复控制台”检查权限和 SYSTEM.LOG。所有剧情选择只在本地发生。`
      : `System state: ${stage}. ${next}\n${paperclip}\nTry: open recovery to inspect permissions and SYSTEM.LOG. Fictional choices stay local.`;
  }
  if (/\b(?:apps?|applications?|programs?)\b|应用列表|所有应用|有哪些应用|程序列表/.test(query))
    return `${zh ? '可打开的应用（需在系统对话框中确认）：' : 'Available applications (confirm each launch in the system dialog):'}\n${APP_CATALOG.filter(
      (app) => app.kind !== 'dialog',
    )
      .map((app) => `${app.name} — open ${app.id}`)
      .join(
        '\n',
      )}\n\n${zh ? '也支持中文名称，例如“打开计算器”或“打开博客”。' : 'Chinese names work too, such as 打开计算器 or 打开博客.'}`;
  if (
    /\b(?:help|commands?|capabilities|features?)\b|\bwhat (?:can|do) you do\b|帮助|功能|能做什么|可以做什么|你能干啥|怎么用/.test(
      query,
    )
  )
    return zh
      ? '我可以离线介绍作者、联系方式、项目和技能，指导阅读文章、查看图片、保存文件、回收站、设置及剧情。输入“打开计算器”“打开博客”或“打开记事本”，确认后即可打开应用。Guide 始终在本地回答。最小化会保留对话；关闭前可保存或导出。'
      : 'Ask about the owner, contact, projects, skills, reading, pictures, files, settings or story. Try: open calculator, open blog or open notepad; a system dialog confirms the launch. Guide always answers offline. Minimize to keep the chat; save or export it before closing.';
  if (/\b(?:hello|hi|hey)\b|你好|您好|嗨/.test(query))
    return zh
      ? `你好，欢迎来到 ${profile.name} 的桌面。我在值班，找作品、文章或工具可以问我。`
      : `Hello. I’m on duty at ${profile.name}’s desk. Ask me where to find a project, an article or a desktop tool.`;
  return zh
    ? '这不在我的桌面索引里。Guide 里有项目、技能和阅读帮助。想问别的，可在 Connection 配置服务，再主动选择 Online 后提问。'
    : 'That isn’t in my desk index. Try Projects, Skills or Reading in Guide. For other questions, set up an optional connection and explicitly select Online before asking again.';
}
