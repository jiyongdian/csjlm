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
    const characters = await dramaWorkflowManager.getCharactersByDramaId(id);
    return NextResponse.json({ success: true, data: characters });
  } catch (error) {
    console.error('获取角色失败:', error);
    return NextResponse.json({ error: '获取角色失败' }, { status: 500 });
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
    const character = await dramaWorkflowManager.createCharacter({
      dramaId: id,
      userId: payload.userId,
      name: body.name,
      role: body.role || 'supporting',
      description: body.description || null,
      personality: body.personality || null,
      appearance: body.appearance || null,
      voiceId: body.voiceId || null,
      voiceProvider: body.voiceProvider || null,
      voiceConfig: body.voiceConfig ? JSON.stringify(body.voiceConfig) : null,
      imageUrl: body.imageUrl || null,
      imagePrompt: body.imagePrompt || null,
      referenceImages: body.referenceImages ? JSON.stringify(body.referenceImages) : null,
      sortOrder: body.sortOrder || 0,
    });
    return NextResponse.json({ success: true, data: character });
  } catch (error) {
    console.error('创建角色失败:', error);
    return NextResponse.json({ error: '创建角色失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    const body = await request.json();
    if (!body.characterId) return NextResponse.json({ error: '缺少角色ID' }, { status: 400 });

    // 比对并物理删除旧文件
    const oldChar = await dramaWorkflowManager.getCharacterById(body.characterId);
    if (oldChar && 'imageUrl' in body && body.imageUrl !== oldChar.imageUrl) {
      await deleteLocalFileByUrl(oldChar.imageUrl);
    }

    const updated = await dramaWorkflowManager.updateCharacter(body.characterId, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('更新角色失败:', error);
    return NextResponse.json({ error: '更新角色失败' }, { status: 500 });
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

      // 遍历物理删除所有角色的图片
      const chars = await dramaWorkflowManager.getCharactersByDramaId(dramaId);
      for (const char of chars) {
        await deleteLocalFileByUrl(char.imageUrl);
      }

      await dramaWorkflowManager.deleteCharactersByDramaId(dramaId);
      return NextResponse.json({ success: true, message: '已清除全部角色' });
    }
    if (!body.characterId) return NextResponse.json({ error: '缺少角色ID' }, { status: 400 });

    // 获取并物理删除角色的图片
    const char = await dramaWorkflowManager.getCharacterById(body.characterId);
    if (char) {
      await deleteLocalFileByUrl(char.imageUrl);
    }

    await dramaWorkflowManager.deleteCharacter(body.characterId);
    return NextResponse.json({ success: true, message: '角色已删除' });
  } catch (error) {
    console.error('删除角色失败:', error);
    return NextResponse.json({ error: '删除角色失败' }, { status: 500 });
  }
}
