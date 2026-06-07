import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { scriptManager, novelManager, userManager, shortDramaManager } from '@/storage/database';

// GET /api/admin/scripts - 获取所有剧本列表（管理员）
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const payload = getUserFromToken(authHeader);
    if (!payload) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }
    if (payload.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const searchParams = request.nextUrl.searchParams;
    const novelId = searchParams.get('novelId');
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || '';

    // 1. 获取所有剧本
    let scripts: any[] = [];
    try {
      if (novelId) {
        const result = await scriptManager.getScriptByNovelIdAdmin(novelId);
        scripts = Array.isArray(result) ? result : result ? [result] : [];
      } else {
        scripts = await scriptManager.getAllScripts(500);
      }
    } catch (e: any) {
      console.error('[Admin Scripts] 获取剧本失败:', e);
      return NextResponse.json({ error: '查询剧本数据库失败: ' + (e?.message || '未知错误') }, { status: 500 });
    }
    console.log(`[Admin Scripts] 查到 ${scripts.length} 个剧本`);

    // 2. 按状态过滤
    if (status) {
      scripts = scripts.filter((s: any) => s.status === status);
    }

    // 3. 预加载所有用户和小说映射
    let novelMap = new Map<string, any>();
    let userMap = new Map<string, any>();
    try {
      const allUsers = await userManager.getAllUsers();
      userMap = new Map(allUsers.map((u: any) => [u.id, u]));
    } catch (e) {
      console.warn('[Admin Scripts] 加载用户列表失败:', e);
    }

    // 逐个加载关联的小说
    const novelIds = [...new Set(scripts.map((s: any) => s.novelId).filter(Boolean))];
    for (const nid of novelIds) {
      try {
        const novel = await novelManager.getById(nid);
        if (novel) novelMap.set(nid, novel);
      } catch (e) {
        console.warn(`[Admin Scripts] 加载小说失败 novelId=${nid}:`, e);
      }
    }

    // 4. 组装数据
    const enrichedScripts = scripts.map((script: any) => {
      const novel = novelMap.get(script.novelId);
      const user = novel ? userMap.get(novel.userId) : userMap.get(script.userId);
      return {
        ...script,
        novelTitle: novel?.title || '未知小说',
        userName: user?.nickname || user?.username || user?.email || '未知用户',
        dramaId: null,
      };
    });

    // 5. 按关键词搜索（搜小说标题或用户名）
    let filtered = enrichedScripts;
    if (search) {
      const kw = search.toLowerCase();
      filtered = enrichedScripts.filter((s: any) =>
        (s.novelTitle || '').toLowerCase().includes(kw) ||
        (s.userName || '').toLowerCase().includes(kw)
      );
    }

    // 6. 异步加载短剧关联（不阻塞主流程）
    try {
      await Promise.all(filtered.map(async (s: any) => {
        if (s.novelId) {
          try {
            const dramas = await shortDramaManager.getDramasByNovelId(s.novelId);
            if (dramas.length > 0) s.dramaId = dramas[0].id;
          } catch {}
        }
      }));
    } catch {}

    return NextResponse.json({
      success: true,
      data: { scripts: filtered, total: filtered.length },
    });
  } catch (error: any) {
    console.error('Admin get scripts error:', error);
    return NextResponse.json({ error: '获取剧本列表失败: ' + (error?.message || '未知错误') }, { status: 500 });
  }
}
