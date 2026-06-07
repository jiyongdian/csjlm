import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { shortDramaManager, dramaWorkflowManager } from '@/storage/database';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    const { id } = await params;
    const body = await request.json();
    const { episodeId, type } = body;

    if (!episodeId) return NextResponse.json({ error: '缺少 episodeId' }, { status: 400 });
    if (type !== 'image' && type !== 'video') return NextResponse.json({ error: '类型必须为 image 或 video' }, { status: 400 });

    const drama = await shortDramaManager.getById(id);
    if (!drama || drama.userId !== payload.userId) {
      return NextResponse.json({ error: '短剧不存在' }, { status: 404 });
    }

    const shots = await dramaWorkflowManager.getShotsByEpisodeId(episodeId);
    const field = type === 'image' ? { imagePrompt: null } : { videoPrompt: null };

    await Promise.all(shots.map((s: any) => dramaWorkflowManager.updateShot(s.id, field)));

    return NextResponse.json({ success: true, message: `已清空 ${shots.length} 个分镜的${type === 'image' ? '图片' : '视频'}提示词` });
  } catch (error) {
    console.error('清空提示词失败:', error);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
