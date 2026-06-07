import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { shortDramaManager, dramaWorkflowManager } from '@/storage/database';
import { deleteLocalFileByUrl } from '@/lib/system-settings';

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
    const items = await dramaWorkflowManager.getItemsByDramaId(id);
    return NextResponse.json({ success: true, data: items });
  } catch (error) {
    console.error('获取物品失败:', error);
    return NextResponse.json({ error: '获取物品失败' }, { status: 500 });
  }
}

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
    const item = await dramaWorkflowManager.createItem({
      dramaId: id,
      userId: payload.userId,
      name: body.name,
      description: body.description || null,
      significance: body.significance || null,
      imageUrl: body.imageUrl || null,
      imagePrompt: body.imagePrompt || null,
      sortOrder: body.sortOrder || 0,
    });
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    console.error('创建物品失败:', error);
    return NextResponse.json({ error: '创建物品失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    const body = await request.json();
    if (!body.itemId) return NextResponse.json({ error: '缺少物品ID' }, { status: 400 });

    // 比对并物理删除旧文件
    const oldItem = await dramaWorkflowManager.getItemById(body.itemId);
    if (oldItem && 'imageUrl' in body && body.imageUrl !== oldItem.imageUrl) {
      await deleteLocalFileByUrl(oldItem.imageUrl);
    }

    const updated = await dramaWorkflowManager.updateItem(body.itemId, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('更新物品失败:', error);
    return NextResponse.json({ error: '更新物品失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    const { id: dramaId } = await params;
    const body = await request.json();
    if (body.clearAll) {
      const drama = await shortDramaManager.getById(dramaId);
      if (!drama || (drama.userId !== payload.userId && payload.role !== 'admin')) {
        return NextResponse.json({ error: '无权限' }, { status: 403 });
      }

      // 遍历物理删除所有物品的图片
      const items = await dramaWorkflowManager.getItemsByDramaId(dramaId);
      for (const item of items) {
        await deleteLocalFileByUrl(item.imageUrl);
      }

      await dramaWorkflowManager.deleteItemsByDramaId(dramaId);
      return NextResponse.json({ success: true, message: '已清除全部物品' });
    }
    if (!body.itemId) return NextResponse.json({ error: '缺少物品ID' }, { status: 400 });

    // 获取并物理删除物品的图片
    const item = await dramaWorkflowManager.getItemById(body.itemId);
    if (item) {
      await deleteLocalFileByUrl(item.imageUrl);
    }

    await dramaWorkflowManager.deleteItem(body.itemId);
    return NextResponse.json({ success: true, message: '物品已删除' });
  } catch (error) {
    console.error('删除物品失败:', error);
    return NextResponse.json({ error: '删除物品失败' }, { status: 500 });
  }
}
