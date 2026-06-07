import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { novelDetailManager } from '@/storage/database';

/**
 * PUT /api/admin/novels/[id]/details
 * 更新小说的角色/场景/物品
 * body: { type: 'character'|'scene'|'item', entityId: string, data: {...} }
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const payload = getUserFromToken(authHeader);
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    if (payload.role !== 'admin') return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });

    await params;
    const { type, entityId, data } = await request.json();
    if (!type || !entityId || !data) return NextResponse.json({ error: '参数不完整' }, { status: 400 });

    let updated;
    if (type === 'character') {
      updated = await novelDetailManager.updateCharacter(entityId, data);
    } else if (type === 'scene') {
      updated = await novelDetailManager.updateScene(entityId, data);
    } else if (type === 'item') {
      updated = await novelDetailManager.updateItem(entityId, data);
    } else {
      return NextResponse.json({ error: '无效的类型' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('更新小说详情失败:', error);
    return NextResponse.json({ error: '更新失败' }, { status: 500 });
  }
}

/**
 * GET /api/admin/novels/[id]/details
 * 获取小说的结构化子表数据（剧情、钩子、角色、场景、物品）
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authHeader = request.headers.get('authorization');
    const payload = getUserFromToken(authHeader);
    if (!payload) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }
    if (payload.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const { id } = await params;
    const details = await novelDetailManager.getNovelDetails(id);

    return NextResponse.json({
      success: true,
      data: details,
    });
  } catch (error) {
    console.error('获取小说详情失败:', error);
    return NextResponse.json({ error: '获取小说详情失败' }, { status: 500 });
  }
}
