import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { dramaWorkflowManager, shortDramaManager } from '@/storage/database';
import { getSystemSettings } from '@/lib/system-settings';
import fs from 'fs';
import path from 'path';

async function getWorkDirs(dramaId: string) {
  const drama = await shortDramaManager.getById(dramaId);
  const cleanTitle = (drama?.title || 'untitled').replace(/[\\/:*?"<>|\s]/g, '_');
  const folderName = `${cleanTitle}_${dramaId}`;
  
  const settings = await getSystemSettings();
  const baseSavePath = settings.mediaSavePath || 'public';
  const mediaWebPath = settings.mediaWebPath || '/media';
  const websiteUrl = settings.websiteUrl ? settings.websiteUrl.replace(/\/$/, '') : '';

  const rootPhysicalPath = path.isAbsolute(baseSavePath)
    ? baseSavePath
    : path.join(process.cwd(), baseSavePath);

  const dramaSavePath = settings.dramaSavePath || 'works';

  const baseDir = path.join(rootPhysicalPath, 'media', dramaSavePath, folderName);
  const dirs = {
    base: baseDir,
    texts: path.join(baseDir, 'texts'),
    images: path.join(baseDir, 'images'),
    videos: path.join(baseDir, 'videos'),
    audios: path.join(baseDir, 'audios'),
  };
  
  // Ensure all directories exist
  for (const dirPath of Object.values(dirs)) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
  
  return {
    dirs,
    relativePrefix: `${websiteUrl}${mediaWebPath}/${dramaSavePath}/${folderName}`,
  };
}

async function downloadToLocal(
  src: string,
  type: 'image' | 'video' | 'audio',
  id: string,
  dramaId?: string
): Promise<string> {
  const ext = type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'jpg';
  const subDir = type === 'video' ? 'videos' : type === 'audio' ? 'audios' : 'images';
  
  const settings = await getSystemSettings();
  const baseSavePath = settings.mediaSavePath || 'public';
  const mediaWebPath = settings.mediaWebPath || '/media';
  const websiteUrl = settings.websiteUrl ? settings.websiteUrl.replace(/\/$/, '') : '';

  const rootPhysicalPath = path.isAbsolute(baseSavePath)
    ? baseSavePath
    : path.join(process.cwd(), baseSavePath);

  let dir = path.join(rootPhysicalPath, 'media', 'shots', subDir);
  let relativePathPrefix = `${websiteUrl}${mediaWebPath}/shots/${subDir}`;
  
  if (dramaId) {
    try {
      const { dirs, relativePrefix } = await getWorkDirs(dramaId);
      dir = dirs[type === 'video' ? 'videos' : type === 'audio' ? 'audios' : 'images'];
      relativePathPrefix = `${relativePrefix}/${type === 'video' ? 'videos' : type === 'audio' ? 'audios' : 'images'}`;
    } catch (err) {
      console.error('[downloadToLocal] failed to get dynamic work dirs', err);
    }
  }

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${id}.${ext}`;
  const localPath = path.join(dir, filename);

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 90_000);
      try {
        const res = await fetch(src, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        fs.writeFileSync(localPath, Buffer.from(await res.arrayBuffer()));
      } finally {
        clearTimeout(timer);
      }
      return `/media/shots/${subDir}/${filename}`;
    } catch (e) {
      if (attempt < 3) await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  return src;
}

/**
 * POST /api/short-dramas/[id]/localize-media
 * 将外部媒体 URL 下载保存到本地，并更新数据库记录。
 * Body: [{ assetType: 'character'|'scene'|'item'|'shot', assetId: string, url: string, mediaType?: 'image'|'video'|'audio' }]
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getUserFromToken(request.headers.get('authorization'));
    if (!payload) return NextResponse.json({ error: '未授权' }, { status: 401 });
    const { id: dramaId } = await params;

    const drama = await shortDramaManager.getById(dramaId);
    if (!drama || (drama.userId !== payload.userId && payload.role !== 'admin')) {
      return NextResponse.json({ error: '短剧不存在' }, { status: 404 });
    }

    const items: Array<{ assetType: string; assetId: string; url: string; mediaType?: string }> =
      await request.json();

    const results: Array<{ assetId: string; localUrl: string }> = [];

    for (const item of items) {
      const { assetType, assetId, url, mediaType = 'image' } = item;
      if (!url || !url.startsWith('http')) continue;

      const localUrl = await downloadToLocal(url, mediaType as 'image' | 'video' | 'audio', assetId, dramaId);
      if (localUrl === url) continue; // download failed, skip

      if (assetType === 'character') {
        await dramaWorkflowManager.updateCharacter(assetId, { imageUrl: localUrl });
      } else if (assetType === 'scene') {
        await dramaWorkflowManager.updateScene(assetId, { imageUrl: localUrl });
      } else if (assetType === 'item') {
        await dramaWorkflowManager.updateItem(assetId, { imageUrl: localUrl });
      } else if (assetType === 'shot') {
        const field = mediaType === 'video' ? { videoUrl: localUrl } : mediaType === 'audio' ? { audioUrl: localUrl } : { imageUrl: localUrl };
        await dramaWorkflowManager.updateShot(assetId, field);
      }
      results.push({ assetId, localUrl });
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('[localize-media]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
