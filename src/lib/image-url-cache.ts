/**
 * 图片降级链成功地址的持久化记忆缓存。
 *
 * SmartImage / SmartImg 每次 mount 都从候选链第 0 个开始尝试，
 * 即使之前已经知道第 N 个候选才有效。浏览器 HTTP 缓存能加速，
 * 但组件仍会先请求注定失败的 URL（等失败耗时），造成"每次都是全新加载"的体感。
 *
 * 这个缓存记录 originalUrl -> 实际加载成功的候选 URL，
 * 下次 mount 时直接从成功的候选开始，跳过已知的失败项。
 *
 * 持久化到 localStorage，页面刷新后依然有效。
 * 上限 3000 条，超出时按插入顺序淘汰最旧的，防止无界增长。
 */

const MAX_ENTRIES = 3000;
const STORAGE_KEY = 'moontv-img-success-cache-v1';

// 内存 Map 作为热缓存，localStorage 作为持久层
const successCache = new Map<string, string>();
let hydrated = false;

/** 从 localStorage 加载到内存（懒加载，只做一次） */
function hydrate(): void {
  if (hydrated || typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  hydrated = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const obj = JSON.parse(raw) as Record<string, string>;
    const entries = Object.entries(obj);
    // 只取最后 MAX_ENTRIES 条（最新的在后面）
    for (const [k, v] of entries.slice(-MAX_ENTRIES)) {
      if (k && v) successCache.set(k, v);
    }
  } catch {
    // localStorage 不可用或数据损坏时静默降级为纯内存缓存
  }
}

/** 把内存 Map 写回 localStorage（节流：每次写入全量，3000 条以内可接受） */
function persist(): void {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
  try {
    const obj: Record<string, string> = {};
    successCache.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    // 配额满等异常时静默忽略
  }
}

export function getCachedImageUrl(originalUrl: string): string | undefined {
  if (!originalUrl) return undefined;
  hydrate();
  return successCache.get(originalUrl);
}

export function setCachedImageUrl(
  originalUrl: string,
  successfulUrl: string
): void {
  if (!originalUrl || !successfulUrl) return;
  hydrate();
  // 已存在时先删再插，保证淘汰顺序按最近写入算
  if (successCache.has(originalUrl)) {
    successCache.delete(originalUrl);
  } else if (successCache.size >= MAX_ENTRIES) {
    const oldest = successCache.keys().next();
    if (!oldest.done) successCache.delete(oldest.value);
  }
  successCache.set(originalUrl, successfulUrl);
  persist();
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

/** 清空缓存（供设置页"重置图片缓存"按钮使用） */
export function clearImageUrlCache(): void {
  successCache.clear();
  hydrated = true;
  if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 忽略
    }
  }
}
