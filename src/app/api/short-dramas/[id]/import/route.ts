import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { shortDramaManager } from '@/storage/database';
import { novelManager } from '@/storage/database/novelManager';
import { novelDetailManager } from '@/storage/database/novelDetailManager';
import { scriptManager } from '@/storage/database/scriptManager';

/**
 * POST /api/short-dramas/[id]/import
 * 从小说和剧本导入数据到短剧
 * 
 * body: { novelId, scriptId? }
 * 
 * 流程：
 * 1. 读取小说数据（标题、简介、分类、角色、场景等）
 * 2. 如果有 scriptId，读取剧本章节数据
 * 3. 根据剧本/小说章节自动创建短剧分集
 * 4. 每集关联对应的小说章节号 + 剧本章节索引
 * 5. 将剧本内容（screenplay/scenes/dialogues/directions）填入分集
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    const { id } = await params;

    const drama = await shortDramaManager.getById(id);
    if (!drama || drama.userId !== payload.userId) {
      return NextResponse.json({ error: '短剧不存在' }, { status: 404 });
    }

    const body = await request.json();
    const { novelId, scriptId } = body;

    if (!novelId) {
      return NextResponse.json({ error: '缺少 novelId' }, { status: 400 });
    }

    // 1. 读取小说基本信息
    const novel = await novelManager.getById(novelId);
    if (!novel) {
      return NextResponse.json({ error: '小说不存在' }, { status: 404 });
    }

    // 2. 读取小说结构化数据（角色、场景等）
    const novelDetails = await novelDetailManager.getNovelDetails(novelId);

    // 3. 读取小说章节
    let novelChapters: any[] = [];
    if (novel.chapters) {
      try {
        novelChapters = typeof novel.chapters === 'string' ? JSON.parse(novel.chapters) : novel.chapters;
      } catch { novelChapters = []; }
    }

    // 4. 读取剧本数据（如果有）
    let script: any = null;
    let scriptChapters: any[] = [];
    const resolvedScriptId = scriptId || drama.scriptId;
    if (resolvedScriptId) {
      script = await scriptManager.getScriptById(resolvedScriptId);
    }
    if (!script && novelId) {
      // 尝试通过 novelId 找到剧本
      script = await scriptManager.getScriptByNovelId(novelId, payload.userId);
    }
    if (script?.chapters) {
      scriptChapters = Array.isArray(script.chapters) ? script.chapters : [];
    }

    // 5. 更新短剧关联
    await shortDramaManager.update(id, {
      novelId,
      scriptId: script?.id || null,
      title: drama.title === '未命名短剧' || !drama.title ? novel.title : drama.title,
      description: drama.description || novel.description || null,
      genre: drama.genre || novel.category || null,
    });

    // 6. 创建分集
    // 优先用剧本章节，否则用小说章节
    const sourceChapters = scriptChapters.length > 0 ? scriptChapters : novelChapters;
    const existingEpisodes = await shortDramaManager.getEpisodesByDramaId(id);
    const existingCount = existingEpisodes.length;

    const createdEpisodes = [];
    for (let i = 0; i < sourceChapters.length; i++) {
      const ch = sourceChapters[i];
      const epNum = existingCount + i + 1;

      // 从剧本章节提取数据
      let title = '';
      let synopsis = '';
      let screenplay = '';
      let scenes: string | null = null;
      let dialogues: string | null = null;
      let directions: string | null = null;
      let imagePrompts: string | null = null;
      let videoPrompts: string | null = null;

      if (scriptChapters.length > 0) {
        // 剧本章节结构：{ title, screenplay, scenes: [], imagePrompts: [], videoPrompts: [], ... }
        title = ch.title || `第${epNum}集`;
        screenplay = ch.screenplay || '';
        if (ch.scenes) scenes = typeof ch.scenes === 'string' ? ch.scenes : JSON.stringify(ch.scenes);
        if (ch.dialogues) dialogues = typeof ch.dialogues === 'string' ? ch.dialogues : JSON.stringify(ch.dialogues);
        if (ch.directions) directions = typeof ch.directions === 'string' ? ch.directions : ch.directions;
        if (ch.imagePrompts) imagePrompts = typeof ch.imagePrompts === 'string' ? ch.imagePrompts : JSON.stringify(ch.imagePrompts);
        if (ch.videoPrompts) videoPrompts = typeof ch.videoPrompts === 'string' ? ch.videoPrompts : JSON.stringify(ch.videoPrompts);
        try { synopsis = screenplay ? (JSON.parse(screenplay).summary || '') : ''; } catch { synopsis = ''; }
      } else {
        // 小说章节结构：{ index, title, content }
        title = ch.title || `第${epNum}集`;
        synopsis = ch.content ? ch.content.slice(0, 500) : '';
      }

      const episode = await shortDramaManager.createEpisode({
        dramaId: id,
        userId: payload.userId,
        episodeNumber: epNum,
        title,
        synopsis,
        screenplay: screenplay || null,
        scenes,
        dialogues,
        directions,
        imagePrompts,
        videoPrompts,
        sourceChapter: ch.index ?? ch.chapterIndex ?? i + 1,
        sourceScriptChapterIndex: scriptChapters.length > 0 ? i : null,
        status: screenplay ? 'imported' : 'draft',
      });

      createdEpisodes.push(episode);
    }

    // 7. 返回汇总
    return NextResponse.json({
      success: true,
      data: {
        drama: await shortDramaManager.getById(id),
        importedEpisodes: createdEpisodes.length,
        novelTitle: novel.title,
        novelChaptersCount: novelChapters.length,
        scriptId: script?.id || null,
        scriptChaptersCount: scriptChapters.length,
        novelCharacters: novelDetails?.characters || [],
        novelScenes: novelDetails?.scenes || [],
      },
    });
  } catch (error: any) {
    console.error('导入数据失败:', error);
    return NextResponse.json({ error: error.message || '导入失败' }, { status: 500 });
  }
}

/**
 * GET /api/short-dramas/[id]/import
 * 获取可导入的小说和剧本列表
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    const { id } = await params;

    const drama = await shortDramaManager.getById(id);
    if (!drama || drama.userId !== payload.userId) {
      return NextResponse.json({ error: '短剧不存在' }, { status: 404 });
    }

    // 获取用户的所有小说（带章节数）
    const { novels: userNovels } = await novelManager.getUserNovels(payload.userId, { limit: 200 });
    const novelList = userNovels.map((n: any) => {
      let chapterCount = 0;
      if (n.chapters) {
        try {
          const chs = typeof n.chapters === 'string' ? JSON.parse(n.chapters) : n.chapters;
          chapterCount = Array.isArray(chs) ? chs.length : 0;
        } catch {}
      }
      return {
        id: n.id,
        title: n.title,
        category: n.category,
        totalChapters: n.totalChapters,
        currentChapters: n.currentChapters,
        chapterCount,
        status: n.status,
      };
    });

    // 获取用户的所有剧本
    const scripts = await scriptManager.getScriptsByUserId(payload.userId);
    const scriptList = scripts.map((s: any) => {
      const chapterCount = Array.isArray(s.chapters) ? s.chapters.length : 0;
      const hasScreenplay = Array.isArray(s.chapters) && s.chapters.some((c: any) => c.screenplay);
      const hasImagePrompts = Array.isArray(s.chapters) && s.chapters.some((c: any) => c.imagePrompts?.length > 0);
      const hasVideoPrompts = Array.isArray(s.chapters) && s.chapters.some((c: any) => c.videoPrompts?.length > 0);
      return {
        id: s.id,
        novelId: s.novelId,
        status: s.status,
        chapterCount,
        hasScreenplay,
        hasImagePrompts,
        hasVideoPrompts,
        createdAt: s.createdAt,
      };
    });

    // 当前短剧的关联信息
    return NextResponse.json({
      success: true,
      data: {
        currentNovelId: drama.novelId,
        currentScriptId: drama.scriptId,
        novels: novelList,
        scripts: scriptList,
      },
    });
  } catch (error: any) {
    console.error('获取导入数据失败:', error);
    return NextResponse.json({ error: error.message || '获取失败' }, { status: 500 });
  }
}
