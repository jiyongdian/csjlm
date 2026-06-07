import { NextRequest, NextResponse } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { shortDramaManager, dramaWorkflowManager, novelDetailManager, novelManager } from '@/storage/database';

/**
 * POST /api/short-dramas/[id]/sync-from-novel
 * 从关联小说的子表（novel_characters / novel_scenes / novel_items）全量重新同步到短剧
 * 已存在同名记录则跳过（增量），返回同步统计
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
    if (!drama.novelId) {
      return NextResponse.json({ error: '该短剧未关联小说' }, { status: 400 });
    }

    const novelId = drama.novelId;
    const userId = drama.userId;

    // 获取小说结构化子表数据
    const { characters: novelChars, scenes: novelScenes, items: novelItems } =
      await novelDetailManager.getNovelDetails(novelId);

    // 获取小说基础数据（fallback idea/structure）
    const novel = await novelManager.getById(novelId);

    // ── 角色 ──────────────────────────────────────────
    const existChars = await dramaWorkflowManager.getCharactersByDramaId(dramaId);
    const existCharNames = new Set(existChars.map((c: any) => c.name));
    let charCreated = 0;

    // 若 novel_characters 只有合并名（含逗号）则视为无效数据，改用 idea 文本解析
    const hasMergedChars = novelChars.length > 0 && novelChars.some((c: any) => /[，,、]/.test(c.name));
    const useSubTable = novelChars.length > 0 && !hasMergedChars;

    if (useSubTable) {
      for (let i = 0; i < novelChars.length; i++) {
        const c = novelChars[i];
        if (existCharNames.has(c.name)) continue;
        await dramaWorkflowManager.createCharacter({
          dramaId, userId, name: c.name,
          role: c.role || 'supporting',
          description: c.description,
          personality: c.personality,
          appearance: c.appearance,
          sortOrder: existChars.length + i,
        });
        existCharNames.add(c.name);
        charCreated++;
      }
    } else if (novel?.idea) {
      // Fallback: 解析 idea JSON，按主角/配角分别提取
      try {
        const idea = typeof novel.idea === 'string' ? JSON.parse(novel.idea) : novel.idea;
        const parseChars = (text: string, defaultRole: string) => {
          if (!text) return [];
          const commaNames = text.split(/[，,、;；]+/).map((s: string) => s.trim()).filter((s: string) => s.length >= 2);
          const PROPER_NAME_RE2 = /^[^\s【\[（(，,、—。？！：:\n他她它我你您这那其而但因所为等从以被]{2,5}$/;
          const looksLikeNameList = commaNames.length >= 2 && commaNames.length <= 12
            && commaNames.every((s: string) => PROPER_NAME_RE2.test(s));
          if (looksLikeNameList) return commaNames.map((name: string) => ({ name, role: defaultRole, gender: null, description: '', personality: '', appearance: '' }));
          const allLines = text.split('\n');
          const headerIdxs: number[] = [];
          const PTCL = /^[他她它我你您这那其而但因所为等从以被]/;
          for (let i = 0; i < allLines.length; i++) {
            const l = allLines[i].trim();
            const hm = l.match(/^([^\s【\[（(，,、—]{2,6})\s*(?:（[^）)]*[）)])?\s*(?:——|—)/);
            if (hm && !PTCL.test(hm[1])) headerIdxs.push(i);
          }
          if (headerIdxs.length === 0) {
            for (let i = 0; i < allLines.length; i++) {
              const l = allLines[i].trim();
              if (!l || l.length > 5 || PTCL.test(l)) continue;
              if (/[【\[，,、—。？！：:（(]/.test(l)) continue;
              if (/[的地得了着过是有被把与和或]/.test(l)) continue;
              headerIdxs.push(i);
            }
          }
          if (headerIdxs.length === 0) return [];
          const results: any[] = [];
          for (let hi = 0; hi < headerIdxs.length; hi++) {
            const si = headerIdxs[hi], ei = hi + 1 < headerIdxs.length ? headerIdxs[hi + 1] : allLines.length;
            const block = allLines.slice(si, ei).join('\n').trim();
            const fl = allLines[si].trim();
            const hm = fl.match(/^([^\s【\[（(，,、—]{2,6})\s*(?:（[^）)]*[）)])?\s*(?:——|—)/)
              || fl.match(/^([^\s【\[（(，,、—。？！：:]{2,5})$/);
            if (!hm) continue;
            const name = hm[1].trim();
            if (!name || name.length > 6) continue;
            const bracketGenderM = fl.match(/【(男|女)】/);
            const gender = bracketGenderM ? bracketGenderM[1] : null;
            const appearanceM = block.match(/【外貌】([^【]*)/);
            const appearance = appearanceM ? appearanceM[1].trim() : '';
            const descBlock = block.replace(/【外貌】[^【]*/g, '').trim();
            const pm = descBlock.match(/[【\[](.*?)[】\]]/);
            const personality = pm ? pm[1] : '';
            const description = descBlock.replace(/^[^】]*】\s*/, '').replace(/[【\[][^】\]]*[】\]]\s*/g, '').trim();
            results.push({ name, role: defaultRole, gender, description, personality, appearance });
          }
          return results;
        };
        const allParsed = [
          ...parseChars(idea.characters || '', 'protagonist'),
          ...parseChars(idea.supportingCharacters || '', 'supporting'),
        ];
        for (let i = 0; i < allParsed.length; i++) {
          const c = allParsed[i];
          if (!c.name || existCharNames.has(c.name)) continue;
          await dramaWorkflowManager.createCharacter({ dramaId, userId, name: c.name, role: c.role, gender: c.gender || null, description: c.description || null, personality: c.personality || null, sortOrder: existChars.length + i });
          existCharNames.add(c.name);
          charCreated++;
        }
      } catch (e) { console.warn('[sync-from-novel] idea parse failed:', e); }
    }

    // ── 场景 ──────────────────────────────────────────
    const existScenes = await dramaWorkflowManager.getScenesByDramaId(dramaId);
    const existSceneNames = new Set(existScenes.map((s: any) => s.name));
    let sceneCreated = 0;

    if (novelScenes.length > 0) {
      for (let i = 0; i < novelScenes.length; i++) {
        const s = novelScenes[i];
        if (existSceneNames.has(s.name)) continue;
        await dramaWorkflowManager.createScene({
          dramaId, userId, name: s.name,
          description: s.description, atmosphere: s.atmosphere,
          sortOrder: existScenes.length + i,
        });
        existSceneNames.add(s.name);
        sceneCreated++;
      }
    } else if (novel?.structure) {
      try {
        const sd = typeof novel.structure === 'string' ? JSON.parse(novel.structure) : novel.structure;
        const raw: any[] = sd.keyScenes || sd.scenes || [];
        for (let i = 0; i < raw.length; i++) {
          const sc = raw[i];
          const name = typeof sc === 'string' ? sc : (sc.name || sc.title || '');
          if (!name || existSceneNames.has(name)) continue;
          await dramaWorkflowManager.createScene({ dramaId, userId, name, description: sc.description || null, atmosphere: sc.atmosphere || null, sortOrder: existScenes.length + i });
          existSceneNames.add(name);
          sceneCreated++;
        }
      } catch {}
    }

    // ── 物品 ──────────────────────────────────────────
    const existItems = await dramaWorkflowManager.getItemsByDramaId(dramaId);
    const existItemNames = new Set(existItems.map((it: any) => it.name));
    let itemCreated = 0;

    if (novelItems.length > 0) {
      for (let i = 0; i < novelItems.length; i++) {
        const it = novelItems[i];
        if (existItemNames.has(it.name)) continue;
        await dramaWorkflowManager.createItem({
          dramaId, userId, name: it.name,
          description: it.description, significance: it.significance,
          sortOrder: existItems.length + i,
        });
        existItemNames.add(it.name);
        itemCreated++;
      }
    } else if (novel?.structure) {
      try {
        const sd = typeof novel.structure === 'string' ? JSON.parse(novel.structure) : novel.structure;
        const raw: any[] = sd.keyItems || sd.items || [];
        for (let i = 0; i < raw.length; i++) {
          const it = raw[i];
          const name = typeof it === 'string' ? it : (it.name || it.title || '');
          if (!name || existItemNames.has(name)) continue;
          await dramaWorkflowManager.createItem({ dramaId, userId, name, description: it.description || null, significance: it.significance || null, sortOrder: existItems.length + i });
          existItemNames.add(name);
          itemCreated++;
        }
      } catch {}
    }

    // 返回最新数据
    const [characters, scenes, items] = await Promise.all([
      dramaWorkflowManager.getCharactersByDramaId(dramaId),
      dramaWorkflowManager.getScenesByDramaId(dramaId),
      dramaWorkflowManager.getItemsByDramaId(dramaId),
    ]);

    return NextResponse.json({
      success: true,
      message: `同步完成：新增角色${charCreated}个、场景${sceneCreated}个、物品${itemCreated}个`,
      data: { characters, scenes, items, charCreated, sceneCreated, itemCreated },
    });
  } catch (error: any) {
    console.error('[sync-from-novel] 失败:', error);
    return NextResponse.json({ error: '同步失败: ' + error.message }, { status: 500 });
  }
}
