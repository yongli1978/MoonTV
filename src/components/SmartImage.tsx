'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';

import { buildImageCandidates } from '@/lib/utils';
import {
  getCachedCandidateIndex,
  setCachedImageUrl,
} from '@/lib/image-url-cache';

interface SmartImageProps {
  /** 原始图片地址（未经代理加工，降级链由本组件按用户设置生成） */
  url: string;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  onLoad?: () => void;
  /** 候选链全部失败后的回调 */
  onExhausted?: () => void;
}

/**
 * 带降级链的封面图组件（LibreTV SmartImage 模式）。
 * 按 buildImageCandidates 的顺序尝试加载（用户首选 → 腾讯云 → 阿里云 → img3 → 直连 → 服务器代理），
 * onError 自动切换到下一个候选；全部失败后触发 onExhausted 并停止渲染（不会无限循环）。
 * 会话级记忆：加载成功的候选 URL 会被记住（内存 Map），下次 mount 直接从它开始，
 * 避免切换页面回来时重放整个失败链。
 * referrerPolicy=no-referrer：不向图床发送来源页，绕过豆瓣等站点的防盗链校验。
 */
export function SmartImage({
  url,
  alt,
  fill,
  width,
  height,
  className,
  sizes,
  priority,
  onLoad,
  onExhausted,
}: SmartImageProps) {
  // SSR 时 buildImageCandidates 返回 [url]，客户端 hydration 后按用户设置重新计算
  const candidates = useMemo(() => buildImageCandidates(url), [url]);
  // 首次挂载即尝试上次成功的候选，避免每次 remount 都重放整个失败链
  const [idx, setIdx] = useState(() =>
    Math.max(0, getCachedCandidateIndex(url, buildImageCandidates(url)))
  );

  // 地址变化时：优先从缓存命中的候选开始，否则从头尝试
  useEffect(() => {
    setIdx(Math.max(0, getCachedCandidateIndex(url, candidates)));
  }, [url, candidates]);

  // 候选耗尽后通知调用方（render 阶段不做副作用）
  useEffect(() => {
    if (candidates.length > 0 && idx >= candidates.length) {
      onExhausted?.();
    }
  }, [idx, candidates.length, onExhausted]);

  const src = candidates[idx];
  // 候选为空或已耗尽时停止渲染：没有 <img> 就不会再触发 onError，天然避免无限循环
  if (!src) return null;

  // 图片加载成功时记住这个候选，下次 mount 直接从它开始，跳过已知的失败项
  const handleLoad = () => {
    setCachedImageUrl(url, src);
    onLoad?.();
  };

  return (
    <Image
      src={src}
      alt={alt}
      fill={fill}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      className={className}
      sizes={sizes}
      priority={priority}
      referrerPolicy="no-referrer"
      loading={priority ? undefined : 'lazy'}
      onLoad={handleLoad}
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
