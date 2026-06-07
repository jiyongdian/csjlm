import { shortDramaManager, scriptManager, dramaWorkflowManager, novelDetailManager } from '@/storage/database';

/**
 * 为一部小说自动创建短剧 + 分集
 * - 如已有短剧且有分集 → 跳过
 * - 如已有短剧但无分集 → 补充分集
 * - 如无短剧 → 创建短剧 + 分集
 * 分集数据优先取剧本章节，否则取小说章节
 */
/**
 * 从角色文本中解析角色列表
 * 格式: "纪凡赛尔  男\n【性格词】描述文本..."
 */
function parseCharactersFromText(text: string, defaultRole: string = 'protagonist'): Array<{ name: string; role: string; gender: string | null; description: string; personality: string; appearance: string }> {
  if (!text || typeof text !== 'string') return [];

  // Check if text is a comma/、 separated list of names without descriptions (严格判断：每项必须是 2-5 字的正名)
  const commaNames = text.split(/[，,、;；]+/).map(s => s.trim()).filter(s => s.length >= 2);
  const PROPER_NAME_RE = /^[^\s【\[（(，,、—。？！：:\n他她它我你您这那其而但因所为等从以被]{2,5}$/;
  const looksLikeNameList = commaNames.length >= 2 && commaNames.length <= 12
    && commaNames.every(s => PROPER_NAME_RE.test(s));
  if (looksLikeNameList) {
    return commaNames.map(name => ({ name, role: defaultRole, gender: null, description: '', personality: '', appearance: '' }));
  }

  // Split by header lines matching 「名字——」pattern to avoid splitting inside descriptions
  const lines = text.split('\n');
  const headerIndexes: number[] = [];
  const PARTICLE_RE = /^[他她它我你您这那其而但因所为等从以被]/;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const headerMatch = l.match(/^([^\s【\[（(，,、—]{2,6})\s*(?:（[^）)]*[）)])?\s*(?:——|—)/);
    if (headerMatch && !PARTICLE_RE.test(headerMatch[1])) headerIndexes.push(i);
  }

  if (headerIndexes.length === 0) {
    // fallback: only pick standalone short lines that look like proper nouns (≤5 chars)
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || l.length > 5 || PARTICLE_RE.test(l)) continue;
      if (/[【\[，,、—。？！：:（(]/.test(l)) continue;
      if (/[的地得了着过是有被把与和或]/.test(l)) continue;
      headerIndexes.push(i);
    }
    if (headerIndexes.length === 0) return [];
  }

  const characters: Array<{ name: string; role: string; gender: string | null; description: string; personality: string; appearance: string }> = [];
  for (let hi = 0; hi < headerIndexes.length; hi++) {
    const startIdx = headerIndexes[hi];
    const endIdx = hi + 1 < headerIndexes.length ? headerIndexes[hi + 1] : lines.length;
    const block = lines.slice(startIdx, endIdx).join('\n').trim();
    const firstLine = lines[startIdx].trim();
    const headerMatch = firstLine.match(/^([^\s【\[（(，,、—]{2,6})\s*(?:（[^）)]*[）)])?\s*(?:——|—)/)
      || firstLine.match(/^([^\s【\[（(，,、—。？！：:]{2,5})$/);
    if (!headerMatch) continue;
    const name = headerMatch[1].trim();
    if (!name || name.length > 6) continue;
    const inlineGender = firstLine.match(/\s+(男|女)\s*(?:[\[【]|$)/)?.[1] || null;
    const bracketGender = firstLine.match(/【(男|女)】/);
    const gender = inlineGender || (bracketGender ? bracketGender[1] : null);
    // Extract appearance from 【外貌】 tag
    const appearanceMatch = block.match(/【外貌】([^【]*)/);
    const appearance = appearanceMatch ? appearanceMatch[1].trim() : '';
    // Remove appearance section, then extract description + personality
    const descBlock = block.replace(/【外貌】[^【]*/g, '').trim();
    const personalityMatch = descBlock.match(/[【\[](.*?)[】\]]/);
    const personality = personalityMatch ? personalityMatch[1] : '';
    const description = descBlock.replace(/^[^】]*】\s*/, '').replace(/[【\[][^】\]]*[】\]]\s*/g, '').trim();
    characters.push({ name, role: defaultRole, gender, description, personality, appearance });
  }
  return characters;
}

export async function autoCreateDramaForNovel(novel: {
  id: string;
  userId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  totalChapters?: number;
  currentChapters?: number;
  chapters?: string | any[] | null;
  idea?: any;
  structure?: any;
}): Promise<string> {
  console.log(`[AutoDrama] 开始处理小说: "${novel.title}" (${novel.id})`);

  // 1. 查找关联剧本
  let script: any = null;
  try {
    script = await scriptManager.getScriptByNovelId(novel.id, novel.userId);
    console.log(`[AutoDrama] 关联剧本: ${script?.id || '无'}`);
  } catch (e: any) {
    console.warn(`[AutoDrama] 查找剧本失败（继续）:`, e.message);
  }

  // 2. 解析小说章节
  let chapterCount = novel.currentChapters || novel.totalChapters || 0;
  let novelChapters: any[] = [];
  if (novel.chapters) {
    try {
      const parsed = typeof novel.chapters === 'string' ? JSON.parse(novel.chapters) : novel.chapters;
      if (Array.isArray(parsed)) {
        novelChapters = parsed;
        chapterCount = Math.max(chapterCount, novelChapters.length);
      }
    } catch {}
  }

  // 3. 解析剧本章节
  let scriptChapters: any[] = [];
  if (script?.chapters) {
    if (Array.isArray(script.chapters)) {
      scriptChapters = script.chapters;
    } else if (typeof script.chapters === 'string') {
      try {
        const parsed = JSON.parse(script.chapters);
        if (Array.isArray(parsed)) scriptChapters = parsed;
      } catch {}
    }
  }

  console.log(`[AutoDrama] 剧本章节: ${scriptChapters.length}, 小说章节: ${novelChapters.length}, 总章节数: ${chapterCount}`);

  // 4. 检查是否已有关联短剧
  let drama: any = null;
  try {
    const existing = await shortDramaManager.getDramasByNovelId(novel.id);
    if (existing.length > 0) {
      drama = existing[0];
      console.log(`[AutoDrama] 已有关联短剧: ${drama.id}`);

      // 同步小说的标题、简介、分类到短剧
      const syncFields: Record<string, any> = {};
      if (novel.title && novel.title !== drama.title) syncFields.title = novel.title;
      if (novel.description !== undefined && (novel.description || '') !== (drama.description || '')) syncFields.description = novel.description || '';
      if (novel.category !== undefined && (novel.category || '') !== (drama.genre || '')) syncFields.genre = novel.category || '';
      if (!drama.scriptId && script) syncFields.scriptId = script.id;
      if (Object.keys(syncFields).length > 0) {
        try {
          await shortDramaManager.update(drama.id, syncFields);
          console.log(`[AutoDrama] 同步字段到短剧:`, Object.keys(syncFields));
        } catch (e: any) {
          console.warn(`[AutoDrama] 同步短剧字段失败:`, e.message);
        }
      }

      // 同步角色、场景、物品
      await syncCharactersToDrama(drama.id, novel.userId, novel.id, novel.idea);
      await syncScenesToDrama(drama.id, novel.userId, novel.id, novel.structure);
      await syncItemsToDrama(drama.id, novel.userId, novel.id, novel.structure);

      // 检查是否已有分集
      const eps = await shortDramaManager.getEpisodesByDramaId(drama.id);
      if (eps.length > 0) {
        // 若剧本章节存在，且现有分集缺少剧本内容，则补充同步
        if (scriptChapters.length > 0) {
          const needSync = eps.filter(ep => !ep.screenplay);
          if (needSync.length > 0) {
            console.log(`[AutoDrama] 短剧已有 ${eps.length} 集，其中 ${needSync.length} 集缺少剧本内容，从剧本章节同步`);
            for (const ep of eps) {
              if (ep.screenplay) continue;
              const chIdx = (ep.sourceScriptChapterIndex != null ? ep.sourceScriptChapterIndex : ep.episodeNumber - 1);
              if (chIdx < 0 || chIdx >= scriptChapters.length) continue;
              const ch = scriptChapters[chIdx];
              if (!ch?.screenplay) continue;
              await shortDramaManager.updateEpisode(ep.id, {
                screenplay: typeof ch.screenplay === 'string' ? ch.screenplay : JSON.stringify(ch.screenplay),
                scenes: ch.scenes ? (typeof ch.scenes === 'string' ? ch.scenes : JSON.stringify(ch.scenes)) : null,
                dialogues: ch.dialogues ? (typeof ch.dialogues === 'string' ? ch.dialogues : JSON.stringify(ch.dialogues)) : null,
                directions: ch.directions ? (typeof ch.directions === 'string' ? ch.directions : JSON.stringify(ch.directions)) : null,
                sourceScriptChapterIndex: chIdx,
                status: 'imported',
              });
            }
          } else {
            console.log(`[AutoDrama] 短剧已有 ${eps.length} 集且均有剧本内容，跳过`);
          }
        } else {
          console.log(`[AutoDrama] 短剧已有 ${eps.length} 集，跳过`);
        }
        return drama.id;
      }
      console.log(`[AutoDrama] 短剧已存在但无分集，补充分集`);
    }
  } catch (e: any) {
    console.error(`[AutoDrama] 查询关联短剧失败:`, e.message);
    throw new Error(`查询关联短剧失败: ${e.message}`);
  }

  // 5. 创建短剧（如果不存在）
  if (!drama) {
    try {
      drama = await shortDramaManager.create({
        novelId: novel.id,
        scriptId: script?.id || null,
        userId: novel.userId,
        title: novel.title,
        description: novel.description || '',
        genre: novel.category || '',
        targetAudience: '',
        totalEpisodes: chapterCount,
        episodeDuration: 60,
        status: 'draft',
        coverImage: '',
        tags: '',
        style: '',
        platform: '',
      });
      console.log(`[AutoDrama] 短剧创建成功: ${drama.id}`);
    } catch (e: any) {
      console.error(`[AutoDrama] 创建短剧失败:`, e.message);
      throw new Error(`创建短剧失败: ${e.message}`);
    }
  }

  // 6. 创建分集（优先剧本章节，否则小说章节）
  const sourceChapters = scriptChapters.length > 0 ? scriptChapters : novelChapters;
  const fromScript = scriptChapters.length > 0;
  let createdCount = 0;

  for (let i = 0; i < sourceChapters.length; i++) {
    const ch = sourceChapters[i];
    let title = '';
    let synopsis = '';
    let screenplay: string | null = null;
    let scenes: string | null = null;
    let dialogues: string | null = null;
    let directions: string | null = null;
    let imagePrompts: string | null = null;
    let videoPrompts: string | null = null;

    if (fromScript) {
      title = ch.title || `第${i + 1}集`;
      screenplay = ch.screenplay ? (typeof ch.screenplay === 'string' ? ch.screenplay : JSON.stringify(ch.screenplay)) : null;
      if (ch.scenes) scenes = typeof ch.scenes === 'string' ? ch.scenes : JSON.stringify(ch.scenes);
      if (ch.dialogues) dialogues = typeof ch.dialogues === 'string' ? ch.dialogues : JSON.stringify(ch.dialogues);
      if (ch.directions) directions = typeof ch.directions === 'string' ? ch.directions : JSON.stringify(ch.directions);
      if (ch.imagePrompts) imagePrompts = typeof ch.imagePrompts === 'string' ? ch.imagePrompts : JSON.stringify(ch.imagePrompts);
      if (ch.videoPrompts) videoPrompts = typeof ch.videoPrompts === 'string' ? ch.videoPrompts : JSON.stringify(ch.videoPrompts);
      try { synopsis = screenplay ? (JSON.parse(screenplay).summary || '') : ''; } catch { synopsis = ''; }
    } else {
      title = ch.title || `第${i + 1}集`;
      synopsis = ch.content ? ch.content.slice(0, 500) : '';
    }

    try {
      await shortDramaManager.createEpisode({
        dramaId: drama.id,
        userId: novel.userId,
        episodeNumber: i + 1,
        title,
        synopsis,
        screenplay,
        scenes,
        dialogues,
        directions,
        imagePrompts,
        videoPrompts,
        sourceChapter: ch.index ?? ch.chapterIndex ?? i + 1,
        sourceScriptChapterIndex: fromScript ? i : null,
        status: screenplay ? 'imported' : 'draft',
      });
      createdCount++;
    } catch (epErr: any) {
      console.error(`[AutoDrama] 创建第${i + 1}集失败:`, epErr.message);
    }
  }

  // 7. 同步角色、场景、物品
  await syncCharactersToDrama(drama.id, novel.userId, novel.id, novel.idea);
  await syncScenesToDrama(drama.id, novel.userId, novel.id, novel.structure);
  await syncItemsToDrama(drama.id, novel.userId, novel.id, novel.structure);

  console.log(`[AutoDrama] 小说"${novel.title}" → 短剧 ${drama.id}，创建${createdCount}/${sourceChapters.length}集 (来源: ${fromScript ? '剧本' : '小说'})`);
  return drama.id;
}

/**
 * 将小说角色（优先sub表，fallback idea文本）同步到短剧
 */
async function syncCharactersToDrama(dramaId: string, userId: string, novelId: string, idea: any) {
  try {
    const existing = await dramaWorkflowManager.getCharactersByDramaId(dramaId);
    const existingNames = new Set(existing.map((c: any) => c.name));
    let created = 0;

    // 优先从 novel_characters 子表获取（含 personality/appearance/background）
    // 若子表只有合并名（含逗号），视为旧格式无效数据，跳过
    const novelChars = await novelDetailManager.getCharactersByNovelId(novelId);
    const hasMergedChars = novelChars.some((c: any) => /[，,、]/.test(c.name));
    if (novelChars.length > 0 && !hasMergedChars) {
      for (let i = 0; i < novelChars.length; i++) {
        const c = novelChars[i];
        if (existingNames.has(c.name)) continue;
        try {
          await dramaWorkflowManager.createCharacter({
            dramaId, userId,
            name: c.name,
            role: c.role || 'supporting',
            description: c.description,
            personality: c.personality,
            appearance: c.appearance,
            sortOrder: i,
          });
          existingNames.add(c.name);
          created++;
        } catch (e: any) {
          console.warn(`[AutoDrama] 创建角色"${c.name}"失败:`, e.message);
        }
      }
      if (created > 0) console.log(`[AutoDrama] 从sub表同步${created}个角色到短剧 ${dramaId}`);
      return;
    }

    // Fallback: 解析 idea 文本
    if (!idea) return;
    const ideaData = typeof idea === 'string' ? JSON.parse(idea) : idea;
    const protagonists = parseCharactersFromText(ideaData.characters || '', 'protagonist');
    const supporting = parseCharactersFromText(ideaData.supportingCharacters || '', 'supporting');
    const allChars = [...protagonists, ...supporting];
    for (let i = 0; i < allChars.length; i++) {
      const c = allChars[i];
      if (existingNames.has(c.name)) continue;
      try {
        await dramaWorkflowManager.createCharacter({
          dramaId, userId,
          name: c.name, role: c.role, gender: c.gender || null, description: c.description,
          personality: c.personality, appearance: c.appearance, sortOrder: i,
        });
        existingNames.add(c.name);
        created++;
      } catch (e: any) {
        console.warn(`[AutoDrama] 创建角色"${c.name}"失败:`, e.message);
      }
    }
    if (created > 0) console.log(`[AutoDrama] 从idea文本同步${created}个角色到短剧 ${dramaId}`);
  } catch (e: any) {
    console.warn(`[AutoDrama] 角色同步失败:`, e.message);
  }
}

/**
 * 将小说场景（优先sub表，fallback structure JSON）同步到短剧
 */
async function syncScenesToDrama(dramaId: string, userId: string, novelId: string, structure: any) {
  try {
    const existing = await dramaWorkflowManager.getScenesByDramaId(dramaId);
    const existingNames = new Set(existing.map((s: any) => s.name));
    let created = 0;

    // 优先从 novel_scenes 子表获取（含 atmosphere/relatedChapters）
    const novelScenes = await novelDetailManager.getScenesByNovelId(novelId);
    if (novelScenes.length > 0) {
      for (let i = 0; i < novelScenes.length; i++) {
        const s = novelScenes[i];
        if (existingNames.has(s.name)) continue;
        await dramaWorkflowManager.createScene({
          dramaId, userId, name: s.name,
          description: s.description, atmosphere: s.atmosphere, sortOrder: i,
        });
        existingNames.add(s.name);
        created++;
      }
      if (created > 0) console.log(`[AutoDrama] 从sub表同步${created}个场景到短剧 ${dramaId}`);
      return;
    }

    // Fallback: 解析 structure JSON
    if (!structure) return;
    const sd = typeof structure === 'string' ? JSON.parse(structure) : structure;
    const rawScenes: any[] = sd.keyScenes || sd.scenes || [];
    for (let i = 0; i < rawScenes.length; i++) {
      const sc = rawScenes[i];
      const name = typeof sc === 'string' ? sc : (sc.name || sc.title || '');
      if (!name || existingNames.has(name)) continue;
      await dramaWorkflowManager.createScene({
        dramaId, userId, name,
        description: sc.description || null, atmosphere: sc.atmosphere || null, sortOrder: i,
      });
      existingNames.add(name);
      created++;
    }
    if (created > 0) console.log(`[AutoDrama] 从structure同步${created}个场景到短剧 ${dramaId}`);
  } catch (e: any) {
    console.warn(`[AutoDrama] 场景同步失败:`, e.message);
  }
}

/**
 * 将小说物品（优先sub表，fallback structure JSON）同步到短剧
 */
async function syncItemsToDrama(dramaId: string, userId: string, novelId: string, structure: any) {
  try {
    const existing = await dramaWorkflowManager.getItemsByDramaId(dramaId);
    const existingNames = new Set(existing.map((it: any) => it.name));
    let created = 0;

    // 优先从 novel_items 子表获取（含 significance/relatedChapters）
    const novelItems = await novelDetailManager.getItemsByNovelId(novelId);
    if (novelItems.length > 0) {
      for (let i = 0; i < novelItems.length; i++) {
        const it = novelItems[i];
        if (existingNames.has(it.name)) continue;
        await dramaWorkflowManager.createItem({
          dramaId, userId, name: it.name,
          description: it.description, significance: it.significance, sortOrder: i,
        });
        existingNames.add(it.name);
        created++;
      }
      if (created > 0) console.log(`[AutoDrama] 从sub表同步${created}个物品到短剧 ${dramaId}`);
      return;
    }

    // Fallback: 解析 structure JSON
    if (!structure) return;
    const sd = typeof structure === 'string' ? JSON.parse(structure) : structure;
    const rawItems: any[] = sd.keyItems || sd.items || [];
    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i];
      const name = typeof it === 'string' ? it : (it.name || it.title || '');
      if (!name || existingNames.has(name)) continue;
      await dramaWorkflowManager.createItem({
        dramaId, userId, name,
        description: it.description || null, significance: it.significance || null, sortOrder: i,
      });
      existingNames.add(name);
      created++;
    }
    if (created > 0) console.log(`[AutoDrama] 从structure同步${created}个物品到短剧 ${dramaId}`);
  } catch (e: any) {
    console.warn(`[AutoDrama] 物品同步失败:`, e.message);
  }
}
