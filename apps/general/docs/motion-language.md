# Motion Language — 意识如水，光是它的痕迹

全站动效共享一条叙事线：访客不是在翻页，而是顺着一股缓慢的意识流漂移；每个动效都是这条流的一次显形。

评审新动画时，先问：它属于哪一种意象？是否与下列隐喻冲突？

## 「思绪浮现」— Blur reveal

文字不是被打印出来的，是从景深里被想起来的——先是一团模糊的预感，随后聚焦为确切的词。

- 实现：`SectionViewport` 的容器级 `filter: blur(12px) → 0` + y/opacity（`full` 档；跨明暗收为 `blur(8px)`，见下）；滚动触发用 `Swap`（`blur(8px) → 0`）
- 规则：全站入场只用「聚焦」这一个隐喻，避免弹跳、旋转、缩放混用

## 「散焦 · 聚焦」— Depth focus（章节切换）

章节切换只有一个手势，与「思绪浮现」同构：旧章节整体散焦退场，色彩在景深中完成更替，新章节从同一片景深中聚焦入场。克制的代价是删——切换期间没有横扫色带、没有全列表 stagger、没有 clip-path 斜切，色彩 morph 成为唯一主角。

- 实现：`SectionViewport` — exit `{opacity 0, y ∓28, scale 0.985, blur}`、enter `{opacity 0, y ±28, scale 1.012, blur}`；同氛围 `blur(12px)`，跨明暗 `blur(8px)`（盖层已近不透明遮帷幕，收一档减轻 GPU 争用）；`mobile` 档不带 blur，`reduced` 由 `durationFor` 归零瞬切
- 邻居姿态：预挂的 ±1 节停在 `parked`（opacity 0、无 filter）；只有正在 exit/enter 的活跃节才挂 `will-change` 与 blur。姿态判定见 `src/lib/section-transition-pose.ts`
- 同步场景：标题随 `SectionReadyContext` 入场，内容延后 `sectionContentDelay` 90ms，均采用 `sectionEnter` 500ms 和同一缓动；入口作者身份先到，精选作品延后 `entryWorkDelay` 120ms，时长 `entry` 620ms。新的导航只保留最后一次意图；卸载会中止等待并释放计时器。项目媒体、标题、简介和操作作为同一 keyed article 过渡，`popLayout` 避免连续点击排队等待。
- 作者入口（Hero）：名字逐字母 `blur(14px) → 0`（`heroGlyph` 500ms，`heroGlyphStagger` 30ms），顶部细轨先于名字（`heroRailDelay` 80ms），自述 `heroIntroDelay` 300ms，底部作品/数字/推荐细轨 `heroBottomDelay` 400ms；整段编排在遮罩让位后约 0.9s 完成。reduced 档为静态成品，`perfTier === 'low'` 关闭光斑画布。
- 色随潮至：`--section-accent` 不随内容一起提交，而是延迟 `transitionScore.accentCrest`（约桥接中段）发布；换色由 veil OKLab morph（0.9s）+ 跨界 opacity 叠层盖层 + accent 补间（0.7s）承接
- 跨明暗盖层（性能）：禁止单层 `backgroundColor` 关键夜↔纸（主线程逐帧 paint + sRGB 中灰）。改为稳态实色盖层瞬切目标色 + outgoing 实色淡出 + accent 中转层仅 opacity 脉冲至 `BG_COVER_PEAK`；`bgCrossing` 在 `veilMorph` 结束后清除，避免打字重渲染重启 keyframe。跨界期间 DarkVeil `frameRate` 压到 30（不改 `resolutionScale`，以免重建 GL context）
- 水印打字：`WatermarkLayer` 走完整终端序列——exit 逐字退格擦除、bridge 强制空串（防擦除被晚挂载的 effect 截断后残留）、enter 逐字打入（末字 blur→focus 微 settle）；光标以 `--section-accent` 闪烁贯穿全程。步进 cadence 由 `src/lib/typewriter.ts`（`playTypewriter*`）独占，乐谱仍是 `typewriterScore`；`runTransition` 只消费 `typewriterPhaseDelays` 的闭合时长（`Math.max(exitPose, erase)` / `Math.max(enterSettle, type)`），不再自算 interval。全程保持静止底纹透明度——不在过渡期提亮或加辉光

## 「让位 · 接管」— Presentation handoff

模式切换不是另一次章节过渡。classic 的棱镜亮边收成一条硬边像素线，交给 MHK10 自己的 POST/splash。装饰不参与握手，也不会决定什么时候能操作。

- **首次主动进入**：`motionDuration.presentation`（260ms）只调整入口亮边与像素线的 `transform` / `opacity`。光从推荐卡的上缘向左收束，以硬边分档落在信号卡旁；握手提前到达可直接截断。没有全屏缩放、假进度或第二套启动画面。系统／站点减少动效、低性能档、非桌面输入设备和省流模式省略装饰。
- **等待与返回**：`motionDuration.presentationHandoff`（220ms）是提示阈值，不是交接下限。慢握手用静态纸面信号卡显示状态：以套准十字、VGA 色条和 `DISPLAY BRIDGE` 呼应真实 POST。它贴推荐卡旁的留白，其他入口贴画面边缘，能取消，正文不盖罩。热返回不动整个画面、不重新开机；回 classic 时边缘按钮恢复章节色，正文接回原阅读点。
- **已选择桌面的直达**：host 只暂留没有最短展示的静态底（防止 classic 闪现），收到可信 `startup` 或提交可用目的地即移除。未收到信号的安全兜底为 3000ms（`BOOT_LAST_RESORT_MS`）。实际启动阶段由桌面自己绘制。
- **性能边界**：桌面目标存在时 `DarkVeil` 固定为静态帧；host 自定义光标随可见模式卸载，桌面释放自己的指针栅格。焦点交接不等待任何 CSS 动画事件。

## 「墨滴」— Click ink ring

按下鼠标时，纸面只落下一滴墨：以当前章节的 `--section-accent-ink` 画出的单圈，从指针位置扩散、淡出。它不是全局粒子系统，也不进入 React 状态——每次按下只创建一个 `transform` / `opacity` 动画的 span，`pointerdown` 结束后自动移除；触摸、reduced motion 与 Win95 模式都不出现。`src/components/effects/InkRipple.tsx` + `ink-ripple.css` 拥有实现，颜色随章节 accent 自动变化。

## 「墨与光的呼吸」— Scroll breath / veil morph

背景湍流不是布景，是一副沉睡的呼吸。快速滚动时微微加快，停驻时沉静。章节切换时，同一片墨流在 OKLab 空间里连续变色：暗夜墨色 ↔ 纸面淡墨。

- 实现：常驻 `DarkVeil`（`uTint` / `uTintAmount` / `uLightMix`）+ `useScrollBreath` → MotionValue `breath` 乘子
- 性能边界：滚动呼吸等逐帧值保留在 MotionValue / ref / shader uniform 中，禁止写入 React state 触发整棵 App 重渲染
- 时段染色：`time-tint.ts` 按晨/昼/暮/夜微调 `veilTint`
- 氛围层：`DarkVeil` shader 的径向色斑随 section `mesh` 字段 tween
- bridge 阶段短促脉冲与换色同拍

## 「纸上微尘」— Film grain

再黑的夜也有尘埃在光里游动；grain 让每一帧都像有生命的胶片。

- 实现：主 grain 折叠进 `DarkVeil` shader（`uNoise`，`FOLDED_NOISE = 0.035`），随渲染循环逐帧变化；章节色带内另复用 `.rail-grain`（SVG feTurbulence 噪声纹理）打破平涂色柱
- shader 噪声幅度约 3.5%；`.rail-grain` 不透明度 12%，`mix-blend-mode: overlay`

## 「章节色带」— Section rail

左侧色带是章节身份与进度的物化：渐变底色跟 section accent，顶部页码记进度。导航仍交给侧栏与命令面板，色带本身不交互。

- 实现：`src/components/rail/`（`SectionRail`）
- 首页隐藏

## 门控

| motionLevel | 行为                                                                                                                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `full`      | 全开（含容器 blur 散焦/聚焦、mesh 漂移、帷幕完整分辨率）                                                                                               |
| `mobile`    | 容器无 blur（仅 y/opacity/scale）；mesh 维持 2 斑（次级斑强度由 `tintBAmount` 控制，无独立裁剪）；App 侧 veil 速度系数 0.72，降低 DarkVeil 分辨率/帧率 |
| `reduced`   | 静态成品状态；无循环装饰动画；帷幕仍可做一次 palette 跳变                                                                                              |

所有视口默认 full；系统 reduced-motion 或手动 reduced 使用静态等价体验。`mobile` 是用户可选档位，窄屏采用完整的独立布局。命令面板可手动覆盖档位（`useMotionPreference` → localStorage），并写 `html.motion-forced` / `html.motion-suppressed` 以覆盖 CSS `prefers-reduced-motion`。

### 设备性能轴（自动）

`motionLevel` 之上叠加 `DevicePerfTier = high | medium | low`。每次会话从完整 high 预算开始，仅连续的实测慢窗口减少装饰渲染，不按视口、CPU、显存或网络声明预先降级。

- DarkVeil 每约 2s 上报帧耗时；平均超出预算间隔 ≥14ms 连续 3 窗口降低一档（冷却 30s），低于预算间隔 ≥2ms 连续 6 窗口恢复一档（冷却 60s，上限 high）。阅读、静态帧、隐藏页面不采样。
- full 预算的 resolutionScale 为 0.55/0.45/0.36、dprCap 1.75/1.5/1.25、帧率 60/60/30。low 关闭装饰 blur、滚动呼吸与 Lenis，保留内容、输入和过渡乐谱。reduced 保持静态画面。
- 命令面板 `perf-full` 固定完整渲染、`perf-auto` 恢复自动；选择沿用现有 storage key。没有遮住正文的性能提示。自动预算不会缩短开机、章节过渡、水印打字或故事时序。

## 令牌

单一来源：`src/lib/motion.ts`（ease / duration / spring / 过渡乐谱）。组件内禁止再写 `[0.22, 1, 0.36, 1]`。

- 缓动与时长：`motionEase`、`motionDuration`
- 弹簧：`springStiff` / `springSoft` / `springHover` / `springSnappy`；两个专用手感——`springTrail`（章节指示器的惯性拖尾）、`springParallax`（水印/视差的低刚度跟随，供 `useSpring` 展开）
- 过渡乐谱：`transitionScore`（exit/bridge/enter 各阶段 hold 与 `accentCrest`）+ `typewriterScore`（erase/type/gap/typeDelay/settle/mountSkew），翻页过渡时序只改这两处。当前值：`exitPose` 320ms、`bridgeHold` 50ms、`enterHold` 0ms、`enterSettle` 140ms、`unlockDelay` 180ms；水印 `eraseMs` 30 / `typeMs` 42 / `gapMs` 70 / `typeDelayMs` 90 / `settleMs` 120 / `mountSkewMs` 48。单次过渡总锁定随水印字数伸缩（约 0.9–1.3s）；`pauseFor(reduced, ms)` 统一 reduced 档压缩（各阶段 hold 坍缩为帧级停顿、打字瞬切、`unlockDelay` 归零）
- 入场节奏：标题、媒体和正文按同一 scene token 协同入场，避免列表逐项累计等待；水印打字仍使用独立的 typewriterScore
- 作者入口数值：`heroGlyph` 500ms / `heroGlyphStagger` 30ms / `heroRail` 450ms / `heroRailDelay` 80ms / `heroIntroDelay` 300ms / `heroBottomDelay` 400ms；由 `Layout.astro` 发布为 `--scene-hero-*`，Hero CSS 只消费这些变量。

主题色令牌：`src/lib/sections.ts` 的 `accent` / `accentSoft` / `veilTint` / `mesh`；OKLab 工具在 `src/lib/palette.ts`；运行时经 `--section-accent` CSS 变量下发。

## 彩蛋

「灵光模式」：Konami（↑↑↓↓←→←→BA）或命令面板切换。帷幕加速与色相漂移；再次输入或 ESC 退出。

## 测量方法与基准

动效改动（尤其首屏与过渡时序）必须量化验证，不凭观感判断。

- **boot-ready 打点**：classic 由 `App.tsx` 预热实际初始章节（`initialSection`）chunk 后请求广播 `portfolio:boot-ready`；Win95 的真实 `startup`、无开机动画的目的地提交、取消或失败均可请求同一事件，协调器只派发一次。不把 `startup` 计为目的地可操作。复测方法：DevTools Console 执行
  `window.addEventListener('portfolio:boot-ready', () => console.log('boot-ready', performance.now()), { once: true })`，
  冷加载刷新记录 `performance.now()` 时间点；或直接录 Performance 面板取事件时间戳。
- **历史基准**：全量 modulepreload 注入章节 chunk 时，boot 信号由 616ms 恶化到 2732ms（首访冷加载、桌面 Chrome、无省流模式）——这就是「根页只注入根章节、其余章节改空闲预载」策略的实测依据。改动 chunk 预热策略后必须重测该指标，目标保持在数百毫秒量级。
- **帧耗时探针**：`DarkVeil` 渲染循环经 `onFrameWindow`（~2s 窗口）上报实测帧耗时，驱动设备性能轴动态降/升档（见「设备性能轴」）；验收连续帧耗时、Canvas 分辨率与帧率变化，并确认页面没有性能提示遮住正文。
- **过渡时序复测**：过渡总锁定随水印字数伸缩（约 0.9–1.3s，见「令牌 · 过渡乐谱」）；改动 `transitionScore` / `typewriterScore` 后，用 Performance 面板核对 exit→bridge→enter 各阶段时长与预算表一致，并确认 `reduced` 档瞬切（hold 坍缩为帧级停顿）。
- **测量环境约定**：所有基准数字默认「桌面 Chrome 最新稳定版、清缓存冷加载、关闭省流模式、无 DevTools 录制开销干扰首帧」；移动端与弱网数据单独标注，不与桌面基准混用。
