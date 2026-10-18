'use client';

import { useEffect, useMemo, useState } from 'react';

import { buildImageCandidates } from '@/lib/utils';

interface SmartImgProps {
  /** 原始图片地址（未经代理加工，降级链由本组件按用户设置生成） */
  url: string;
  alt: string;
  className?: string;
  /** 候选链全部失败后的回调 */
  onExhausted?: () => void;
}

/**
 * 带降级链的普通 <img> 组件（LibreTV SmartImage 模式，plain img 版）。
 * 按 buildImageCandidates 的顺序尝试加载，onError 自动切换到下一个候选；
 * 全部失败后触发 onExhausted 并停止渲染（不会无限循环）。
 * referrerPolicy=no-referrer：不向图床发送来源页，绕过豆瓣等站点的防盗链校验。
 */
export function SmartImg({ url, alt, className, onExhausted }: SmartImgProps) {
  const candidates = useMemo(() => buildImageCandidates(url), [url]);
  const [idx, setIdx] = useState(0);

  // 地址变化时重置降级进度
  useEffect(() => {
    setIdx(0);
  }, [url]);

  // 候选耗尽后通知调用方（render 阶段不做副作用）
  useEffect(() => {
    if (candidates.length > 0 && idx >= candidates.length) {
      onExhausted?.();
    }
  }, [idx, candidates.length, onExhausted]);

  const src = candidates[idx];
  // 候选为空或已耗尽时停止渲染：没有 <img> 就不会再触发 onError，天然避免无限循环
  if (!src) return null;

  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setIdx((i) => i + 1)}
    />
  );
}
