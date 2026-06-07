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
    const scenes = await dramaWorkflowManager.getScenesByDramaId(id);
    return NextResponse.json({ success: true, data: scenes });
  } catch (error) {
    console.error('获取场景失败:', error);
    return NextResponse.json({ error: '获取场景失败' }, { status: 500 });
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
    const scene = await dramaWorkflowManager.createScene({
      dramaId: id,
      userId: payload.userId,
      name: body.name,
      description: body.description || null,
      atmosphere: body.atmosphere || null,
      imageUrl: body.imageUrl || null,
      imagePrompt: body.imagePrompt || null,
      sortOrder: body.sortOrder || 0,
    });
    return NextResponse.json({ success: true, data: scene });
  } catch (error) {
    console.error('创建场景失败:', error);
    return NextResponse.json({ error: '创建场景失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    const body = await request.json();
    if (!body.sceneId) return NextResponse.json({ error: '缺少场景ID' }, { status: 400 });

    // 比对并物理删除旧文件
    const oldScene = await dramaWorkflowManager.getSceneById(body.sceneId);
    if (oldScene && 'imageUrl' in body && body.imageUrl !== oldScene.imageUrl) {
      await deleteLocalFileByUrl(oldScene.imageUrl);
    }

    const updated = await dramaWorkflowManager.updateScene(body.sceneId, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('更新场景失败:', error);
    return NextResponse.json({ error: '更新场景失败' }, { status: 500 });
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

      // 遍历物理删除所有场景的图片
      const scenes = await dramaWorkflowManager.getScenesByDramaId(dramaId);
      for (const scene of scenes) {
        await deleteLocalFileByUrl(scene.imageUrl);
      }

      await dramaWorkflowManager.deleteScenesByDramaId(dramaId);
      return NextResponse.json({ success: true, message: '已清除全部场景' });
    }
    if (!body.sceneId) return NextResponse.json({ error: '缺少场景ID' }, { status: 400 });

    // 获取并物理删除场景的图片
    const scene = await dramaWorkflowManager.getSceneById(body.sceneId);
    if (scene) {
      await deleteLocalFileByUrl(scene.imageUrl);
    }

    await dramaWorkflowManager.deleteScene(body.sceneId);
    return NextResponse.json({ success: true, message: '场景已删除' });
  } catch (error) {
    console.error('删除场景失败:', error);
    return NextResponse.json({ error: '删除场景失败' }, { status: 500 });
  }
}
