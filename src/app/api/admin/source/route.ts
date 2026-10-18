/* eslint-disable @typescript-eslint/no-explicit-any,no-console */

import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getConfig } from '@/lib/config';
import { getStorage } from '@/lib/db';
import { IStorage } from '@/lib/types';

export const runtime = 'edge';

// 支持的操作类型
type Action = 'add' | 'disable' | 'enable' | 'delete' | 'sort' | 'batchDisable' | 'batchEnable' | 'batchDelete' | 'test';

interface BaseBody {
  action?: Action;
}

export async function POST(request: NextRequest) {
  const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
  if (storageType === 'localstorage') {
    return NextResponse.json(
      {
        error: '不支持本地存储进行管理员配置',
      },
      { status: 400 }
    );
  }

  try {
    const body = (await request.json()) as BaseBody & Record<string, any>;
    const { action } = body;

    const authInfo = getAuthInfoFromCookie(request);
    if (!authInfo || !authInfo.username) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const username = authInfo.username;

    // 基础校验
    const ACTIONS: Action[] = ['add', 'disable', 'enable', 'delete', 'sort', 'batchDisable', 'batchEnable', 'batchDelete', 'test'];
    if (!username || !action || !ACTIONS.includes(action)) {
      return NextResponse.json({ error: '参数格式错误' }, { status: 400 });
    }

    // 获取配置与存储
    const adminConfig = await getConfig();
    const storage: IStorage | null = getStorage();

    // 权限与身份校验
    if (username !== process.env.USERNAME) {
      const userEntry = adminConfig.UserConfig.Users.find(
        (u) => u.username === username
      );
      if (!userEntry || userEntry.role !== 'admin' || userEntry.banned) {
        return NextResponse.json({ error: '权限不足' }, { status: 401 });
      }
    }

    switch (action) {
      case 'add': {
        const { key, name, api, detail } = body as {
          key?: string;
          name?: string;
          api?: string;
          detail?: string;
        };
        if (!key || !name || !api) {
          return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
        }
        if (adminConfig.SourceConfig.some((s) => s.key === key)) {
          return NextResponse.json({ error: '该源已存在' }, { status: 400 });
        }
        adminConfig.SourceConfig.push({
          key,
          name,
          api,
          detail,
          from: 'custom',
          disabled: false,
        });
        break;
      }
      case 'disable': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const entry = adminConfig.SourceConfig.find((s) => s.key === key);
        if (!entry)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        entry.disabled = true;
        break;
      }
      case 'enable': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const entry = adminConfig.SourceConfig.find((s) => s.key === key);
        if (!entry)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        entry.disabled = false;
        break;
      }
      case 'delete': {
        const { key } = body as { key?: string };
        if (!key)
          return NextResponse.json({ error: '缺少 key 参数' }, { status: 400 });
        const idx = adminConfig.SourceConfig.findIndex((s) => s.key === key);
        if (idx === -1)
          return NextResponse.json({ error: '源不存在' }, { status: 404 });
        const entry = adminConfig.SourceConfig[idx];
        if (entry.from === 'config') {
          return NextResponse.json({ error: '该源不可删除' }, { status: 400 });
        }
        adminConfig.SourceConfig.splice(idx, 1);
        break;
      }
      case 'sort': {
        const { order } = body as { order?: string[] };
        if (!Array.isArray(order)) {
          return NextResponse.json(
            { error: '排序列表格式错误' },
            { status: 400 }
          );
        }
        const map = new Map(adminConfig.SourceConfig.map((s) => [s.key, s]));
        const newList: typeof adminConfig.SourceConfig = [];
        order.forEach((k) => {
          const item = map.get(k);
          if (item) {
            newList.push(item);
            map.delete(k);
          }
        });
        // 未在 order 中的保持原顺序
        adminConfig.SourceConfig.forEach((item) => {
          if (map.has(item.key)) newList.push(item);
        });
        adminConfig.SourceConfig = newList;
        break;
      }
      case 'batchDisable': {
        const { keys } = body as { keys?: string[] };
        if (!Array.isArray(keys) || keys.length === 0) {
          return NextResponse.json({ error: '缺少 keys 参数或列表为空' }, { status: 400 });
        }
        keys.forEach((key) => {
          const entry = adminConfig.SourceConfig.find((s) => s.key === key);
          if (entry) {
            entry.disabled = true;
          }
        });
        break;
      }
      case 'batchEnable': {
        const { keys } = body as { keys?: string[] };
        if (!Array.isArray(keys) || keys.length === 0) {
          return NextResponse.json({ error: '缺少 keys 参数或列表为空' }, { status: 400 });
        }
        keys.forEach((key) => {
          const entry = adminConfig.SourceConfig.find((s) => s.key === key);
          if (entry) {
            entry.disabled = false;
          }
        });
        break;
      }
      case 'batchDelete': {
        const { keys } = body as { keys?: string[] };
        if (!Array.isArray(keys) || keys.length === 0) {
          return NextResponse.json({ error: '缺少 keys 参数或列表为空' }, { status: 400 });
        }
        // 只删除自定义源，系统默认源不可删除
        keys.forEach((key) => {
          const idx = adminConfig.SourceConfig.findIndex((s) => s.key === key);
          if (idx !== -1) {
            const entry = adminConfig.SourceConfig[idx];
            if (entry.from !== 'config') {
              adminConfig.SourceConfig.splice(idx, 1);
            }
          }
        });
        break;
      }
      case 'test': {
        const { api } = body as { api?: string };
        if (!api) {
          return NextResponse.json({ error: '缺少 api 参数' }, { status: 400 });
        }
        try {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 10000);
          const testUrl = api.includes('?') ? `${api}&ac=list` : `${api}?ac=list`;
          const resp = await fetch(testUrl, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          clearTimeout(timeout);
          if (!resp.ok) {
            return NextResponse.json({ ok: false, error: `HTTP ${resp.status}` });
          }
          const text = await resp.text();
          // 检查是否返回有效数据（JSON code=1 或 XML 包含 video/list）
          const isValid = text.includes('"code":1') || text.includes('<video>') || text.includes('<list');
          if (isValid) {
            return NextResponse.json({ ok: true, message: '连接正常' });
          } else {
            return NextResponse.json({ ok: false, error: '返回数据格式异常' });
          }
        } catch (err) {
          return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : '连接失败' });
        }
      }
      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }

    // 持久化到存储
    if (storage && typeof (storage as any).setAdminConfig === 'function') {
      await (storage as any).setAdminConfig(adminConfig);
    }

    return NextResponse.json(
      { ok: true },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('视频源管理操作失败:', error);
    return NextResponse.json(
      {
        error: '视频源管理操作失败',
        details: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
