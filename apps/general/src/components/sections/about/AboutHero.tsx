import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { motion, useMotionValueEvent, useScroll, useTransform } from 'motion/react';
import ArrowUpRightIcon from '~icons/lucide/arrow-up-right';
import { aboutCurrently, profile } from '@/data/profile';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import { usePointer } from '@/hooks/usePointer';
import { useSectionReady } from '@/components/motion/SectionReadyContext';
import { useSectionScrollRoot } from '@/components/motion/SectionScrollContext';
import { useSectionNavigation, useSectionProjects } from '@/components/layout/SectionAppContext';
import SiteImage from '@/components/ui/SiteImage';
import DesktopOffer from '../../chrome/DesktopOffer';
import '../about-entry.css';

const NAME_LINES = ['Mira', 'Hikari'] as const;
const PIXEL_SCALE_TARGET = 300;
const PIXEL_COLOR_FALLBACK = [0, 0, 128] as const;
const PIXEL_ALT_FALLBACK = [0, 128, 128] as const;

type Rgb = readonly [number, number, number];

function parseHexColor(value: string, fallback: Rgb): Rgb {
  const hex = value.trim().replace(/^#/, '');
  if (hex.length !== 3 && hex.length !== 6) return fallback;
  const normalized =
    hex.length === 3
      ? hex
          .split('')
          .map((character) => character + character)
          .join('')
      : hex;
  const parsed = Number.parseInt(normalized, 16);
  if (!Number.isFinite(parsed)) return fallback;
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255];
}

function drawPixelName(stage: HTMLElement, heading: HTMLElement, canvas: HTMLCanvasElement): void {
  const stageRect = stage.getBoundingClientRect();
  if (stageRect.width < 1 || stageRect.height < 1) return;

  const pixel = Math.max(3, Math.round(stageRect.width / PIXEL_SCALE_TARGET));
  const width = Math.max(1, Math.ceil(stageRect.width / pixel));
  const height = Math.max(1, Math.ceil(stageRect.height / pixel));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.style.width = `${stageRect.width}px`;
  canvas.style.height = `${stageRect.height}px`;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return;
  context.clearRect(0, 0, width, height);

  const headingStyle = getComputedStyle(heading);
  const fontFamily = headingStyle.fontFamily;
  const fontWeight = headingStyle.fontWeight;
  const fontSize = Number.parseFloat(headingStyle.fontSize);
  const lineHeight = Number.parseFloat(headingStyle.lineHeight);
  const letterSpacing = Number.parseFloat(headingStyle.letterSpacing) || 0;
  if (!Number.isFinite(fontSize) || fontSize <= 0) return;

  context.font = `${fontWeight} ${fontSize / pixel}px ${fontFamily}`;
  context.textBaseline = 'alphabetic';
  context.fillStyle = 'black';

  const metrics = context.measureText('Mg');
  const ascent =
    metrics.fontBoundingBoxAscent ??
    (Number.isFinite(lineHeight) ? lineHeight * 0.72 : fontSize * 0.8) / pixel;
  const descent = metrics.fontBoundingBoxDescent ?? 0;
  const leading =
    ((Number.isFinite(lineHeight) ? lineHeight : fontSize * 0.82) / pixel - (ascent + descent)) / 2;

  for (const line of heading.querySelectorAll<HTMLElement>('[data-name-line]')) {
    const bounds = line.getBoundingClientRect();
    const text = line.textContent ?? '';
    let x = (bounds.left - stageRect.left) / pixel;
    const baseline = (bounds.top - stageRect.top) / pixel + leading + ascent;
    for (const glyph of text) {
      context.fillText(glyph, x, baseline);
      x += context.measureText(glyph).width + letterSpacing / pixel;
    }
  }

  const image = context.getImageData(0, 0, width, height);
  const tokens = getComputedStyle(stage);
  const ink = parseHexColor(tokens.getPropertyValue('--win95-navy'), PIXEL_COLOR_FALLBACK);
  const shimmer = parseHexColor(tokens.getPropertyValue('--win95-desktop'), PIXEL_ALT_FALLBACK);
  for (let index = 0; index < image.data.length; index += 4) {
    if (image.data[index + 3] < 96) {
      image.data[index + 3] = 0;
      continue;
    }
    const pixelIndex = index / 4;
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);
    const accent = (x + y * 2) % 5 === 0;
    const color = accent ? shimmer : ink;
    image.data[index] = color[0];
    image.data[index + 1] = color[1];
    image.data[index + 2] = color[2];
    image.data[index + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function usePixelName(
  stageRef: React.RefObject<HTMLDivElement | null>,
  headingRef: React.RefObject<HTMLHeadingElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    const stage = stageRef.current;
    const heading = headingRef.current;
    const canvas = stage?.querySelector<HTMLCanvasElement>('[data-pixel-name]');
    if (!stage || !heading || !canvas) return;

    let disposed = false;
    let frame = 0;
    const draw = () => {
      if (disposed) return;
      drawPixelName(stage, heading, canvas);
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(draw);
    };

    void document.fonts.ready.then(schedule).catch(() => undefined);
    const observer = new ResizeObserver(schedule);
    observer.observe(stage);
    observer.observe(heading);
    window.addEventListener('resize', schedule);
    schedule();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [enabled, headingRef, stageRef]);
}

export default function AboutHero() {
  const isReady = useSectionReady();
  const { reducedMotion, finePointer, perfTier } = useMediaCapabilities();
  const { x, y } = usePointer();
  const scrollRoot = useSectionScrollRoot();
  const projects = useSectionProjects();
  const { onNavigate } = useSectionNavigation();
  const featured = useMemo(
    () => projects.find((project) => project.featured) ?? projects[0],
    [projects],
  );

  const stageRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const scopeRef = useRef<HTMLDivElement | null>(null);
  const stageBoundsRef = useRef<DOMRect | null>(null);
  const [spotReady, setSpotReady] = useState(false);
  const pixelEnabled = perfTier !== 'low';
  const interactivePixels = pixelEnabled && finePointer && !reducedMotion;
  usePixelName(stageRef, headingRef, pixelEnabled);

  const { scrollYProgress } = useScroll({
    container: scrollRoot ?? undefined,
    offset: ['start start', 'end start'],
  });
  const stageY = useTransform(scrollYProgress, [0, 0.24], [0, -36]);
  const stageOpacity = useTransform(scrollYProgress, [0, 0.3], [1, 0.55]);
  const stageBlur = useTransform(
    scrollYProgress,
    [0, 0.24],
    ['blur(0px)', perfTier === 'low' ? 'blur(0px)' : 'blur(5px)'],
  );

  const placeSpot = useCallback((clientX: number, clientY: number) => {
    const stage = stageRef.current;
    const scope = scopeRef.current;
    if (!stage || !scope) return;
    // 指针每帧都会调用：缓存 stage 的矩形，避免在写 --spot-* 之后立刻
    // getBoundingClientRect() 触发同步布局（读-写-读的 layout thrash）。
    const bounds = (stageBoundsRef.current ??= stage.getBoundingClientRect());
    if (bounds.width < 1 || bounds.height < 1) return;
    const localX = Math.min(
      Math.max(clientX - bounds.left, bounds.width * 0.08),
      bounds.width * 0.92,
    );
    const localY = Math.min(
      Math.max(clientY - bounds.top, bounds.height * 0.18),
      bounds.height * 0.82,
    );
    scope.style.setProperty('--spot-x', `${localX}px`);
    scope.style.setProperty('--spot-y', `${localY}px`);
  }, []);

  useEffect(() => {
    if (!pixelEnabled) return;
    const stage = stageRef.current;
    const heading = headingRef.current;
    if (!stage || !heading) return;
    const frame = window.requestAnimationFrame(() => {
      const stageBounds = stage.getBoundingClientRect();
      const lineBounds = [...heading.querySelectorAll<HTMLElement>('[data-name-line]')].map(
        (line) => line.getBoundingClientRect(),
      );
      const left = lineBounds.length
        ? Math.min(...lineBounds.map((bounds) => bounds.left))
        : stageBounds.left;
      const right = lineBounds.length
        ? Math.max(...lineBounds.map((bounds) => bounds.right))
        : stageBounds.right;
      const top = lineBounds.length
        ? Math.min(...lineBounds.map((bounds) => bounds.top))
        : stageBounds.top;
      const bottom = lineBounds.length
        ? Math.max(...lineBounds.map((bounds) => bounds.bottom))
        : stageBounds.bottom;
      const lastLine = lineBounds.at(-1);
      const lineTops = lineBounds.map((bounds) => bounds.top);
      const multiLine = lineTops.length > 1 && Math.max(...lineTops) - Math.min(...lineTops) > 8;
      const spotX =
        multiLine && lastLine
          ? lastLine.left + lastLine.width * 0.55
          : left + (right - left) * 0.55;
      const spotY =
        multiLine && lastLine ? lastLine.top + lastLine.height * 0.5 : top + (bottom - top) * 0.5;
      placeSpot(spotX, spotY);
      setSpotReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [pixelEnabled, placeSpot]);

  // 缓存矩形的失效点：元素尺寸、窗口尺寸、任何祖先滚动（scroll 不冒泡，
  // 用 capture 捕获 .section-scroll）、以及字体就绪（字体度量会改 hero 高度）。
  useEffect(() => {
    if (!interactivePixels) return;
    const stage = stageRef.current;
    if (!stage) return;
    const invalidate = () => {
      stageBoundsRef.current = null;
    };
    const observer = new ResizeObserver(invalidate);
    observer.observe(stage);
    window.addEventListener('resize', invalidate, { passive: true });
    window.addEventListener('scroll', invalidate, { passive: true, capture: true });
    void document.fonts?.ready.then(invalidate, () => {});
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', invalidate);
      window.removeEventListener('scroll', invalidate, { capture: true });
    };
  }, [interactivePixels]);

  useMotionValueEvent(x, 'change', (latestX) => {
    if (!interactivePixels) return;
    placeSpot(latestX, y.get());
  });

  const scrollToBiography = (event: React.MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    const biography = document.getElementById('about-biography');
    const host = scrollRoot?.current;
    if (!biography || !host) return;
    host.scrollTo({
      top:
        host.scrollTop +
        biography.getBoundingClientRect().top -
        host.getBoundingClientRect().top -
        76,
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
    biography.focus({ preventScroll: true });
  };

  return (
    <section
      className="about-entry"
      aria-label="MiraHikari 与精选作品"
      data-ready={isReady}
      data-hero-motion={reducedMotion ? 'static' : 'animated'}
      data-pixel={pixelEnabled ? 'on' : 'off'}
    >
      <header className="about-entry__toprail">
        <p className="about-entry__kicker">
          <span className="about-entry__mark" aria-hidden="true" />
          <span>{profile.location}</span>
          <span className="about-entry__eyebrow-sep" aria-hidden="true">
            /
          </span>
          <span>{profile.label}</span>
        </p>
        <p className="about-entry__signal">
          <span>UTC+8</span>
          <span className="about-entry__eyebrow-sep" aria-hidden="true">
            ·
          </span>
          <span>{profile.website.replace('https://', '')}</span>
        </p>
      </header>

      <motion.div
        ref={stageRef}
        className="about-entry__stage"
        style={reducedMotion ? undefined : { y: stageY, opacity: stageOpacity, filter: stageBlur }}
      >
        <h1 ref={headingRef} className="about-entry__name" aria-label={profile.name}>
          {NAME_LINES.map((line, lineIndex) => (
            <span key={line} className="about-entry__name-line" data-name-line aria-hidden="true">
              {Array.from(line).map((glyph, glyphIndex) => (
                <span
                  key={`${line}-${glyphIndex}`}
                  className="about-entry__glyph"
                  style={
                    {
                      '--glyph-index': lineIndex * NAME_LINES[0].length + glyphIndex,
                    } as CSSProperties
                  }
                >
                  {glyph}
                </span>
              ))}
            </span>
          ))}
        </h1>

        <div
          ref={scopeRef}
          className="about-entry__scope"
          data-spot={spotReady ? 'ready' : 'idle'}
          aria-hidden="true"
        >
          <div className="about-entry__scope-lens">
            <canvas data-pixel-name className="about-entry__pixel-name" />
          </div>
          <span className="about-entry__scope-caption">
            <span>LIGHT TRACE</span>
            <span>16 COLOR</span>
          </span>
        </div>
      </motion.div>

      <div className="about-entry__intro">
        <div className="about-entry__intro-copy">
          <p className="about-entry__tagline">{profile.heroLine}</p>
          <p className="about-entry__summary">{profile.summary}</p>
        </div>
        <div className="about-entry__actions">
          <a
            href="/projects/"
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onNavigate('projects');
            }}
            className="about-entry__action about-entry__action--primary"
          >
            看我的作品 <ArrowUpRightIcon aria-hidden="true" className="h-4 w-4" />
          </a>
          <a href="#about-biography" className="about-entry__action" onClick={scrollToBiography}>
            完整介绍 <span aria-hidden="true">↓</span>
          </a>
        </div>
      </div>

      <div className="about-entry__bottom">
        {featured && (
          <a
            href={`/projects/?item=${encodeURIComponent(featured.id)}`}
            className="about-entry__work"
            aria-label={`查看精选项目：${featured.title}`}
          >
            <div className="about-entry__work-visual">
              {featured.image ? (
                <SiteImage
                  src={featured.image}
                  alt={featured.title}
                  width={1920}
                  height={1080}
                  loading="eager"
                  wrapperClassName="h-full w-full"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="about-entry__work-placeholder" aria-hidden="true" />
              )}
              <span className="about-entry__work-index" aria-hidden="true">
                01
              </span>
            </div>
            <div className="about-entry__work-copy">
              <div className="about-entry__work-label">
                <span>SELECTED WORK / 精选作品</span>
                <ArrowUpRightIcon className="h-4 w-4" aria-hidden="true" />
              </div>
              <h2>{featured.title}</h2>
              <p>{featured.description}</p>
              <span className="about-entry__work-tags">{featured.tags.join(' · ')}</span>
            </div>
          </a>
        )}

        <div className="about-entry__meta">
          <dl className="about-entry__facts">
            {aboutCurrently.map((item) => (
              <div key={item.label} className="about-entry__fact">
                <dt>{item.label}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
          <div className="about-entry__specialties" aria-label="创作方向">
            {profile.specialties.map((specialty) => (
              <span key={specialty}>{specialty}</span>
            ))}
          </div>
        </div>

        <div className="about-entry__offer-dock">
          <DesktopOffer />
        </div>
      </div>
    </section>
  );
}
