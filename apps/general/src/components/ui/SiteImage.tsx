import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { resolveImageSrc } from '@/lib/images/url';

interface SiteImageProps {
  readonly src: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
  readonly loading?: 'lazy' | 'eager';
  readonly fetchPriority?: 'high' | 'low' | 'auto';
  readonly layoutId?: string;
  readonly className?: string;
  readonly wrapperClassName?: string;
}

/**
 * Shared image component with consistent loading, error fallback, and
 * shared-layout support. A failed load is retried once with a `?retry=1`
 * query parameter (bypassing CDN-cached error responses) before falling back
 * to the error placeholder.
 */
export default function SiteImage({
  src,
  alt,
  width,
  height,
  loading = 'lazy',
  fetchPriority,
  layoutId,
  className,
  wrapperClassName,
}: SiteImageProps) {
  const resolvedSrc = resolveImageSrc(src);

  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [retrySrc, setRetrySrc] = useState<string | null>(null);
  const hasRetried = useRef(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // 同一实例复用到不同 src 时重置重试状态。
  useEffect(() => {
    setStatus('loading');
    setRetrySrc(null);
    hasRetried.current = false;
  }, [src]);

  // 若图片已被 prefetch / 缓存，挂载时 load 事件早已错过，直接检查 complete。
  const activeSrc = retrySrc ?? resolvedSrc;
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalWidth > 0) {
      setStatus('loaded');
    }
  }, [activeSrc]);

  const handleError = () => {
    if (!hasRetried.current) {
      hasRetried.current = true;
      // 保留原路径与既有 query，追加 retry 参数绕过 CDN 的错误响应缓存。
      const separator = resolvedSrc.includes('?') ? '&' : '?';
      setRetrySrc(`${resolvedSrc}${separator}retry=1`);
      return;
    }
    setStatus('error');
  };

  const showPlaceholder = status !== 'loaded';
  const isError = status === 'error';

  return (
    <span className={cn('relative block overflow-hidden', wrapperClassName)}>
      {showPlaceholder && (
        <>
          {isError ? (
            <span className="absolute inset-0 z-0 flex items-center justify-center bg-neutral-950">
              <span className="max-w-full truncate px-4 text-center text-micro text-white/40">
                {alt}
              </span>
            </span>
          ) : (
            <span
              className="site-image-shimmer absolute inset-0 z-0 bg-neutral-950"
              aria-hidden="true"
            />
          )}
        </>
      )}

      <motion.img
        ref={imgRef}
        layoutId={layoutId}
        src={activeSrc}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        fetchPriority={fetchPriority}
        decoding="async"
        // 加载淡入走内联样式：调用方常自带 opacity 工具类（如画廊的
        // opacity-90），twMerge 去重会把加载态的 opacity-0 吃掉，导致
        // 图片边解码边闪现、失去过渡。内联样式不参与去重，加载完成后
        // 移除，透明度回落到 class 值并沿 transition 淡入。
        style={status === 'loaded' ? undefined : { opacity: 0 }}
        className={cn('relative z-10 block transition-opacity duration-500', className)}
        onLoad={() => setStatus('loaded')}
        onError={handleError}
      />
    </span>
  );
}
