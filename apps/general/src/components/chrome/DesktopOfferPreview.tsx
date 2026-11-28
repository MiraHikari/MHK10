import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useMediaCapabilities } from '@/hooks/useMediaCapabilities';
import {
  PREVIEW_SIZE,
  hitTest,
  layoutMicroDesktop,
  trayClock,
  type Point,
} from './desktop-offer-preview-model';
import './desktop-offer-preview.css';

/**
 * A live 640×360 miniature of MHK10, drawn with the same 16-colour vocabulary
 * as the real desktop. It is the recommendation's argument: drag the title bar,
 * press Start, close the window — the offer demonstrates the world it opens
 * instead of describing it. Decorative in the accessibility tree: the buttons
 * below it carry the real decision.
 */
export default function DesktopOfferPreview() {
  const { reducedMotion, finePointer } = useMediaCapabilities();
  const [offset, setOffset] = useState<Point>({ x: 74, y: 42 });
  const [startOpen, setStartOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [clock, setClock] = useState(() => trayClock(new Date()));
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);
  const desktop = layoutMicroDesktop({ offset, startOpen, minimized });

  useEffect(() => {
    const timer = window.setInterval(() => setClock(trayClock(new Date())), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (reducedMotion || !finePointer) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - bounds.left) / bounds.width) * PREVIEW_SIZE.width,
      y: ((event.clientY - bounds.top) / bounds.height) * PREVIEW_SIZE.height,
    };
    const target = hitTest(desktop, point);
    if (target === 'start') {
      setStartOpen((open) => !open);
      return;
    }
    if (target === 'task') {
      setMinimized((parked) => !parked);
      return;
    }
    if (target === 'close') {
      setMinimized(true);
      setStartOpen(false);
      return;
    }
    if (target !== 'title') return;
    dragRef.current = { dx: point.x - desktop.appWindow.x, dy: point.y - desktop.appWindow.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const point = {
      x: ((event.clientX - bounds.left) / bounds.width) * PREVIEW_SIZE.width,
      y: ((event.clientY - bounds.top) / bounds.height) * PREVIEW_SIZE.height,
    };
    setOffset({ x: point.x - drag.dx, y: point.y - drag.dy });
  };

  const endDrag = (event: ReactPointerEvent<SVGSVGElement>) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const {
    appWindow: win,
    title,
    close,
    menu,
    body,
    taskbar,
    start,
    tray,
    taskButton,
    startMenu,
  } = desktop;

  return (
    <svg
      className="desktop-preview"
      viewBox={`0 0 ${PREVIEW_SIZE.width} ${PREVIEW_SIZE.height}`}
      role="img"
      aria-label="MHK10 桌面缩略预览"
      shapeRendering="crispEdges"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      data-draggable={!reducedMotion && finePointer ? 'true' : undefined}
    >
      <rect width={PREVIEW_SIZE.width} height={PREVIEW_SIZE.height} fill="var(--win95-desktop)" />
      <path
        d="M34 26h34l8 8h26v26H34z"
        fill="var(--win95-silver)"
        stroke="var(--win95-black)"
        strokeWidth="2"
      />
      <rect x="520" y="24" width="76" height="34" fill="var(--win95-navy)" />
      <path d="m530 52 14-16 12 10 14-18 16 24z" fill="var(--win95-silver)" />

      {!desktop.minimized && (
        <g>
          <rect
            x={win.x + 3}
            y={win.y + 3}
            width={win.w}
            height={win.h}
            fill="var(--win95-black)"
            opacity="0.55"
          />
          <rect
            x={win.x}
            y={win.y}
            width={win.w}
            height={win.h}
            fill="var(--win95-silver)"
            stroke="var(--win95-black)"
            strokeWidth="2"
          />
          <rect
            x={title.x + 2}
            y={title.y + 2}
            width={title.w - 4}
            height={title.h - 4}
            fill="var(--win95-navy)"
          />
          <text x={title.x + 8} y={title.y + 16} fill="var(--win95-white)" fontSize="12">
            MiraHikari
          </text>
          <rect
            x={close.x}
            y={close.y}
            width={close.w}
            height={close.h}
            fill="var(--win95-silver)"
            stroke="var(--win95-black)"
            strokeWidth="1.5"
          />
          <path
            d={`m${close.x + 4} ${close.y + 4} 8 7m0-7-8 7`}
            stroke="var(--win95-black)"
            strokeWidth="1.5"
          />
          <rect
            x={menu.x + 2}
            y={menu.y}
            width={menu.w - 4}
            height={menu.h}
            fill="var(--win95-silver)"
          />
          {['File', 'Edit', 'View', 'Help'].map((label, index) => (
            <text
              key={label}
              x={menu.x + 10 + index * 42}
              y={menu.y + 13}
              fill="var(--win95-black)"
              fontSize="11"
            >
              {label}
            </text>
          ))}
          <rect
            x={body.x + 3}
            y={body.y + 2}
            width={body.w - 6}
            height={body.h - 6}
            fill="var(--win95-white)"
            stroke="var(--win95-silver)"
            strokeWidth="2"
          />
          <text x={body.x + 16} y={body.y + 32} fill="var(--win95-black)" fontSize="26">
            MHK10
          </text>
          {[0, 1, 2].map((row) => (
            <rect
              key={row}
              x={body.x + 16}
              y={body.y + 48 + row * 15}
              width={body.w - 130 - row * 34}
              height="7"
              fill="var(--win95-silver)"
            />
          ))}
          <rect
            x={body.x + 16}
            y={body.y + 106}
            width="104"
            height="26"
            fill="var(--win95-silver)"
            stroke="var(--win95-black)"
            strokeWidth="1.5"
          />
          <rect
            x={body.x + body.w - 112}
            y={body.y + 44}
            width="96"
            height="88"
            fill="var(--win95-navy)"
          />
          <path
            d={`M${body.x + body.w - 100} ${body.y + 120}v-30l18-16 18 18 18-26 24 54z`}
            fill="var(--win95-silver)"
          />
        </g>
      )}

      <rect
        x={taskbar.x}
        y={taskbar.y}
        width={taskbar.w}
        height={taskbar.h}
        fill="var(--win95-silver)"
      />
      <path
        d={`M0 ${taskbar.y}h${PREVIEW_SIZE.width}`}
        stroke="var(--win95-white)"
        strokeWidth="2"
      />
      <rect
        x={start.x}
        y={start.y}
        width={start.w}
        height={start.h}
        fill="var(--win95-silver)"
        stroke="var(--win95-black)"
        strokeWidth="1.5"
      />
      <path d={`m${start.x + 8} ${start.y + 6} 8 5-8 5z`} fill="var(--win95-black)" />
      <text x={start.x + 22} y={start.y + 16} fill="var(--win95-black)" fontSize="12">
        Start
      </text>
      <rect
        x={taskButton.x}
        y={taskButton.y}
        width={taskButton.w}
        height={taskButton.h}
        fill={desktop.minimized ? 'var(--win95-white)' : 'var(--win95-silver)'}
        stroke="var(--win95-black)"
        strokeWidth="1.5"
      />
      <text
        x={taskButton.x + 8}
        y={taskButton.y + 16}
        fill="var(--win95-black)"
        fontSize="11"
        fontWeight={desktop.minimized ? '700' : '400'}
      >
        MiraHikari
      </text>
      <rect
        x={tray.x}
        y={tray.y}
        width={tray.w}
        height={tray.h}
        fill="var(--win95-silver)"
        stroke="var(--win95-black)"
        strokeWidth="1"
      />
      <text x={tray.x + 8} y={tray.y + 14} fill="var(--win95-black)" fontSize="11">
        {clock}
      </text>

      {startMenu && (
        <g>
          <rect
            x={startMenu.x}
            y={startMenu.y}
            width={startMenu.w}
            height={startMenu.h}
            fill="var(--win95-silver)"
            stroke="var(--win95-black)"
            strokeWidth="2"
          />
          <rect
            x={startMenu.x + 3}
            y={startMenu.y + 3}
            width="26"
            height={startMenu.h - 6}
            fill="var(--win95-navy)"
          />
          <text
            x={startMenu.x + 19}
            y={startMenu.y + startMenu.h - 12}
            fill="var(--win95-white)"
            fontSize="11"
            textAnchor="start"
            transform={`rotate(-90 ${startMenu.x + 19} ${startMenu.y + startMenu.h - 12})`}
          >
            MHK10
          </text>
          {['Programs', 'Documents', 'Settings', 'Shut Down…'].map((label, index) => (
            <g key={label}>
              <rect
                x={startMenu.x + 34}
                y={startMenu.y + 10 + index * 24}
                width="16"
                height="16"
                fill="var(--win95-silver)"
                stroke="var(--win95-black)"
                strokeWidth="1"
              />
              <text
                x={startMenu.x + 58}
                y={startMenu.y + 23 + index * 24}
                fill="var(--win95-black)"
                fontSize="11"
              >
                {label}
              </text>
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
