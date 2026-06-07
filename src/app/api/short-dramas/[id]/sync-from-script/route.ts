import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { shortDramaManager, scriptManager } from '@/storage/database';

/**
 * POST /api/short-dramas/[id]/sync-from-script
 * 将关联剧本的章节剧本内容同步到分集（补充缺失的 screenplay/scenes/dialogues/directions）
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const payload = getUserFromToken(authHeader);
    if (!payload) return NextResponse.json({ error: '未登录' }, { status: 401 });

    const { id: dramaId } = await params;
    const drama = await shortDramaManager.getById(dramaId);
    if (!drama) return NextResponse.json({ error: '短剧不存在' }, { status: 404 });
    if (drama.userId !== payload.userId && payload.role !== 'admin') {
      return NextResponse.json({ error: '无权限' }, { status: 403 });
    }
    if (!drama.scriptId) {
      return NextResponse.json({ error: '该短剧未关联剧本' }, { status: 400 });
    }

    // 获取剧本章节
    const script = await scriptManager.getScriptById(drama.scriptId);
    if (!script) return NextResponse.json({ error: '关联剧本不存在' }, { status: 404 });

    const scriptChapters: any[] = Array.isArray(script.chapters)
      ? script.chapters
      : (() => { try { return JSON.parse(script.chapters as string) ?? []; } catch { return []; } })();

    if (scriptChapters.length === 0) {
      return NextResponse.json({ error: '剧本暂无章节内容' }, { status: 400 });
    }

    // 获取现有分集
    const episodes = await shortDramaManager.getEpisodesByDramaId(dramaId);
    if (episodes.length === 0) {
      return NextResponse.json({ error: '短剧暂无分集' }, { status: 400 });
    }

    let synced = 0;
    let skipped = 0;

    for (const ep of episodes) {
      const chIdx = ep.sourceScriptChapterIndex != null
        ? ep.sourceScriptChapterIndex
        : ep.episodeNumber - 1;

      if (chIdx < 0 || chIdx >= scriptChapters.length) { skipped++; continue; }
      const ch = scriptChapters[chIdx];
      if (!ch?.screenplay) { skipped++; continue; }

      await shortDramaManager.updateEpisode(ep.id, {
        screenplay: typeof ch.screenplay === 'string' ? ch.screenplay : JSON.stringify(ch.screenplay),
        scenes: ch.scenes ? (typeof ch.scenes === 'string' ? ch.scenes : JSON.stringify(ch.scenes)) : undefined,
        dialogues: ch.dialogues ? (typeof ch.dialogues === 'string' ? ch.dialogues : JSON.stringify(ch.dialogues)) : undefined,
        directions: ch.directions ? (typeof ch.directions === 'string' ? ch.directions : JSON.stringify(ch.directions)) : undefined,
        sourceScriptChapterIndex: chIdx,
        status: 'imported',
      });
      synced++;
    }

    return NextResponse.json({
      success: true,
      message: `同步完成：更新 ${synced} 集，跳过 ${skipped} 集`,
      data: { synced, skipped, total: episodes.length },
    });
  } catch (error: any) {
    console.error('[sync-from-script] 失败:', error);
    return NextResponse.json({ error: '同步失败: ' + error.message }, { status: 500 });
  }
}
