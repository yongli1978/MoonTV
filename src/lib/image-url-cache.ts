/**
 * 图片降级链成功地址的会话级记忆缓存。
 *
 * SmartImage / SmartImg 每次 mount 都从候选链第 0 个开始尝试，
 * 即使之前已经知道第 N 个候选才有效。浏览器 HTTP 缓存能加速，
 * 但组件仍会先请求注定失败的 URL（等失败耗时），造成"每次都是全新加载"的体感。
 *
 * 这个 Map 记录 originalUrl -> 实际加载成功的候选 URL，
 * 下次 mount 时直接从成功的候选开始，跳过已知的失败项。
 *
 * 仅内存存储（不进 localStorage），页面刷新后清空。
 * 上限 3000 条，超出时按插入顺序淘汰最旧的，防止长时间会话无界增长。
 */

const MAX_ENTRIES = 3000;

const successCache = new Map<string, string>();

export function getCachedImageUrl(originalUrl: string): string | undefined {
  if (!originalUrl) return undefined;
  return successCache.get(originalUrl);
}

export function setCachedImageUrl(
  originalUrl: string,
  successfulUrl: string
): void {
  if (!originalUrl || !successfulUrl) return;
  // 已存在时先删再插，保证淘汰顺序按最近写入算
  if (successCache.has(originalUrl)) {
    successCache.delete(originalUrl);
  } else if (successCache.size >= MAX_ENTRIES) {
    const oldest = successCache.keys().next();
    if (!oldest.done) successCache.delete(oldest.value);
  }
  successCache.set(originalUrl, successfulUrl);
}

/** 返回缓存命中的候选下标；未命中或不在候选链中时返回 -1 */
export function getCachedCandidateIndex(
  originalUrl: string,
  candidates: string[]
): number {
  const cached = getCachedImageUrl(originalUrl);
  if (!cached) return -1;
  return candidates.indexOf(cached);
}
