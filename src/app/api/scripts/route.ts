import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { scriptManager, novelManager, shortDramaManager } from '@/storage/database';

/**
 * GET /api/scripts — 获取当前用户的所有剧本（含关联小说标题）
 */
export async function GET(request: NextRequest) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });

    const allScripts = await scriptManager.getScriptsByUserId(payload.userId);
    console.log(`[Scripts API] 用户 ${payload.userId} 查到 ${allScripts.length} 个剧本`);

    // 按 novelId 去重，只保留每个小说最新的剧本
    const novelScriptMap = new Map<string, any>();
    for (const s of allScripts) {
      const key = s.novelId || s.id;
      if (!novelScriptMap.has(key)) {
        novelScriptMap.set(key, s);
      }
      // allScripts 已按 createdAt DESC 排序，第一个就是最新的
    }
    const scripts = Array.from(novelScriptMap.values());

    // 附加小说标题（每个 script 独立 try-catch，防止单个失败影响整个列表）
    const list = await Promise.all(scripts.map(async (s: any) => {
      let novelTitle = '';
      let dramaId: string | null = null;
      try {
        if (s.novelId) {
          const novel = await novelManager.getById(s.novelId);
          novelTitle = novel?.title || '';
        }
      } catch (e) {
        console.warn(`[Scripts API] 获取小说标题失败 novelId=${s.novelId}:`, e);
      }
      try {
        if (s.novelId) {
          const dramas = await shortDramaManager.getDramasByNovelId(s.novelId);
          if (dramas.length > 0) dramaId = dramas[0].id;
        }
      } catch (e) {
        console.warn(`[Scripts API] 获取短剧关联失败 novelId=${s.novelId}:`, e);
      }
      const chapterCount = Array.isArray(s.chapters) ? s.chapters.length : 0;
      const hasScreenplay = Array.isArray(s.chapters) && s.chapters.some((c: any) => c.screenplay);
      const hasImagePrompts = Array.isArray(s.chapters) && s.chapters.some((c: any) => c.imagePrompts?.length > 0);
      const hasVideoPrompts = Array.isArray(s.chapters) && s.chapters.some((c: any) => c.videoPrompts?.length > 0);
      return {
        id: s.id,
        novelId: s.novelId,
        novelTitle,
        dramaId,
        status: s.status,
        chapterCount,
        hasScreenplay,
        hasImagePrompts,
        hasVideoPrompts,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      };
    }));

    return NextResponse.json({ success: true, data: list });
  } catch (error: any) {
    console.error('获取剧本列表失败:', error);
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 });
  }
}
