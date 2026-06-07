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
    const episodeId = request.nextUrl.searchParams.get('episodeId');

    const drama = await shortDramaManager.getById(id);
    if (!drama || drama.userId !== payload.userId) {
      return NextResponse.json({ error: '短剧不存在' }, { status: 404 });
    }

    const shots = episodeId
      ? await dramaWorkflowManager.getShotsByEpisodeId(episodeId)
      : await dramaWorkflowManager.getShotsByDramaId(id);

    return NextResponse.json({ success: true, data: shots });
  } catch (error) {
    console.error('获取分镜失败:', error);
    return NextResponse.json({ error: '获取分镜失败' }, { status: 500 });
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

    // 支持批量创建
    if (Array.isArray(body.shots)) {
      const shots = await dramaWorkflowManager.bulkCreateShots(
        body.shots.map((s: any, idx: number) => ({
          dramaId: id,
          episodeId: body.episodeId,
          userId: payload.userId,
          shotNumber: s.shotNumber || idx + 1,
          shotType: s.shotType || 'storyboard',
          sceneDescription: s.sceneDescription || null,
          cameraAngle: s.cameraAngle || null,
          cameraMovement: s.cameraMovement || null,
          dialogue: s.dialogue || null,
          voiceover: s.voiceover || null,
          soundEffects: s.soundEffects || null,
          characterIds: s.characterIds ? JSON.stringify(s.characterIds) : null,
          imagePrompt: s.imagePrompt || null,
          videoPrompt: s.videoPrompt || null,
          ttsText: s.ttsText || null,
          subtitle: s.subtitle || null,
          duration: s.duration || 3,
          status: 'draft',
        }))
      );
      return NextResponse.json({ success: true, data: shots });
    }

    const shot = await dramaWorkflowManager.createShot({
      dramaId: id,
      episodeId: body.episodeId,
      userId: payload.userId,
      shotNumber: body.shotNumber || 1,
      shotType: body.shotType || 'storyboard',
      sceneDescription: body.sceneDescription || null,
      cameraAngle: body.cameraAngle || null,
      cameraMovement: body.cameraMovement || null,
      dialogue: body.dialogue || null,
      voiceover: body.voiceover || null,
      soundEffects: body.soundEffects || null,
      characterIds: body.characterIds ? JSON.stringify(body.characterIds) : null,
      imagePrompt: body.imagePrompt || null,
      videoPrompt: body.videoPrompt || null,
      ttsText: body.ttsText || null,
      subtitle: body.subtitle || null,
      duration: body.duration || 3,
      status: 'draft',
    });
    return NextResponse.json({ success: true, data: shot });
  } catch (error) {
    console.error('创建分镜失败:', error);
    return NextResponse.json({ error: '创建分镜失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    const body = await request.json();
    if (!body.shotId) return NextResponse.json({ error: '缺少分镜ID' }, { status: 400 });

    // 获取旧的分镜数据，比对并物理删除旧文件
    const oldShot = await dramaWorkflowManager.getShotById(body.shotId);
    if (oldShot) {
      if ('imageUrl' in body && body.imageUrl !== oldShot.imageUrl) {
        await deleteLocalFileByUrl(oldShot.imageUrl);
      }
      if ('videoUrl' in body && body.videoUrl !== oldShot.videoUrl) {
        await deleteLocalFileByUrl(oldShot.videoUrl);
      }
    }

    const updated = await dramaWorkflowManager.updateShot(body.shotId, body);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('更新分镜失败:', error);
    return NextResponse.json({ error: '更新分镜失败' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();

    if (body.episodeId) {
      const drama = await shortDramaManager.getById(id);
      if (!drama || drama.userId !== payload.userId) {
        return NextResponse.json({ error: '短剧不存在' }, { status: 404 });
      }

      // 获取当前集的所有分镜，遍历物理删除文件
      const shotsToDelete = await dramaWorkflowManager.getShotsByEpisodeId(body.episodeId);
      for (const shot of shotsToDelete) {
        await deleteLocalFileByUrl(shot.imageUrl);
        await deleteLocalFileByUrl(shot.videoUrl);
      }

      await dramaWorkflowManager.deleteShotsByEpisodeId(body.episodeId);
      return NextResponse.json({ success: true, message: '分集分镜已清空' });
    }

    if (!body.shotId) return NextResponse.json({ error: '缺少分镜ID' }, { status: 400 });

    // 获取该分镜，物理删除关联文件后再从数据库删除记录
    const shotToDelete = await dramaWorkflowManager.getShotById(body.shotId);
    if (shotToDelete) {
      await deleteLocalFileByUrl(shotToDelete.imageUrl);
      await deleteLocalFileByUrl(shotToDelete.videoUrl);
    }

    await dramaWorkflowManager.deleteShot(body.shotId);
    return NextResponse.json({ success: true, message: '分镜已删除' });
  } catch (error) {
    console.error('删除分镜失败:', error);
    return NextResponse.json({ error: '删除分镜失败' }, { status: 500 });
  }
}
