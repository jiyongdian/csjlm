import { novelDetailManager } from "@/storage/database";

/**
 * 从小说保存数据中提取结构化信息，同步到 5 张子表
 * 在创建/更新小说时异步调用，不阻塞主流程
 */
export async function syncNovelDetails(
  novelId: string,
  userId: string,
  body: any
): Promise<void> {
  const structure = body.structure;
  if (!structure) return;

  // 解析 structure（可能是字符串或对象）
  let struct: any;
  if (typeof structure === 'string') {
    try { struct = JSON.parse(structure); } catch { return; }
  } else {
    struct = structure;
  }

  // 1. 同步剧情表 (novel_plots)
  if (struct.mainPlot || struct.emotionalCurve || struct.keyConflicts) {
    await novelDetailManager.upsertPlot(novelId, userId, {
      mainPlot: struct.mainPlot || null,
      emotionalCurve: struct.emotionalCurve || null,
      keyConflicts: struct.keyConflicts || null,
    });
  }

  // 2. 同步章节钩子表 (novel_chapter_hooks)
  if (Array.isArray(struct.chapterHooks) && struct.chapterHooks.length > 0) {
    const hooks = struct.chapterHooks.map((hook: string, idx: number) => ({
      chapterNumber: idx + 1,
      hook: typeof hook === 'string' ? hook : String(hook),
      status: 'generated' as const,
    }));
    await novelDetailManager.bulkUpsertHooks(novelId, userId, hooks);
  }

  // 3. 同步场景表 (novel_scenes) — 从 keyScenes 文本中解析
  if (struct.keyScenes && typeof struct.keyScenes === 'string' && struct.keyScenes.length > 15) {
    const scenes = parseSceneList(struct.keyScenes);
    if (scenes.length > 0) {
      // 先清除旧数据再批量插入
      await novelDetailManager.deleteScenesByNovelId(novelId);
      await novelDetailManager.bulkCreateScenes(novelId, userId,
        scenes.map((s, i) => ({
          name: s.title,
          description: s.description,
          atmosphere: s.atmosphere || null,
          sortOrder: i,
        }))
      );
    }
  }

  // 4. 同步物品表 (novel_items) — 从 keyItems 文本中解析
  if (struct.keyItems && typeof struct.keyItems === 'string' && struct.keyItems.length > 15) {
    const items = parseNumberedList(struct.keyItems);
    if (items.length > 0) {
      await novelDetailManager.deleteItemsByNovelId(novelId);
      await novelDetailManager.bulkCreateItems(novelId, userId,
        items.map((it, i) => ({
          name: it.title,
          description: it.description,
          sortOrder: i,
        }))
      );
    }
  }

  // 5. 同步角色关系表 (novel_character_relationships) — 解析 idea.characterRelationships
  const idea = body.idea;
  if (idea) {
    let ideaObj: any;
    if (typeof idea === 'string') {
      try { ideaObj = JSON.parse(idea); } catch { ideaObj = null; }
    } else {
      ideaObj = idea;
    }
    if (ideaObj?.characterRelationships && typeof ideaObj.characterRelationships === 'string'
        && ideaObj.characterRelationships.length > 10) {
      const rels = parseRelationships(ideaObj.characterRelationships);
      if (rels.length > 0) {
        await novelDetailManager.deleteRelationshipsByNovelId(novelId);
        await novelDetailManager.bulkCreateRelationships(novelId, userId,
          rels.map((r, i) => ({ fromCharacter: r.from, toCharacter: r.to, relationship: r.description, sortOrder: i }))
        );
      }
    }
  }

  // 6. 同步角色表 (novel_characters) — 解析 idea.characters + idea.supportingCharacters
  // (reuse already-parsed ideaObj below)
  if (idea) {
    let ideaObj: any;
    if (typeof idea === 'string') {
      try { ideaObj = JSON.parse(idea); } catch { ideaObj = null; }
    } else {
      ideaObj = idea;
    }
    if (ideaObj) {
      const protagonists = parseCharactersFromText(ideaObj.characters || '', 'protagonist');
      const supporting = parseCharactersFromText(ideaObj.supportingCharacters || '', 'supporting');
      const allChars = [...protagonists, ...supporting];

      if (allChars.length > 0) {
        const existingChars = await novelDetailManager.getCharactersByNovelId(novelId);
        const hasMergedEntry = existingChars.length === 1 && /[，,、]/.test(existingChars[0].name);
        const expectedNames = new Set(allChars.map(c => c.name));
        // 若已有角色且至少一个名字命中期望列表 → 说明数据基本正确，仅补充缺失角色
        const matchingCount = existingChars.filter((c: any) => expectedNames.has(c.name)).length;
        const shouldRebuild = existingChars.length === 0 || hasMergedEntry || matchingCount === 0;

        if (shouldRebuild) {
          if (existingChars.length > 0) await novelDetailManager.deleteCharactersByNovelId(novelId);
          for (const c of allChars) {
            await novelDetailManager.createCharacter(novelId, userId, {
              name: c.name, role: c.role, description: c.description,
              personality: c.personality, appearance: c.appearance || null,
            });
          }
        } else if (matchingCount < allChars.length) {
          // 补充缺失角色，保留已有（含用户手动编辑）
          const existingNameSet = new Set(existingChars.map((c: any) => c.name));
          for (const c of allChars) {
            if (existingNameSet.has(c.name)) continue;
            await novelDetailManager.createCharacter(novelId, userId, {
              name: c.name, role: c.role, description: c.description,
              personality: c.personality, appearance: c.appearance || null,
            });
          }
        }
      } else if (body.protagonist) {
        const existingChars = await novelDetailManager.getCharactersByNovelId(novelId);
        if (existingChars.length === 0) {
          const fallbackNames = body.protagonist.split(/[，,、;；]+/).map((s: string) => s.trim()).filter(Boolean);
          for (const fallbackName of fallbackNames) {
            await novelDetailManager.createCharacter(novelId, userId, {
              name: fallbackName, role: 'protagonist',
              description: ideaObj && typeof ideaObj.characters === 'string' ? ideaObj.characters.slice(0, 300) : '',
            });
          }
        }
      }
    }
  }
}

/**
 * 解析角色关系体系文本
 * 格式: "A → B\n描述文字\n\nA → C\n描述文字"
 */
function parseRelationships(text: string): { from: string; to: string; description: string }[] {
  const results: { from: string; to: string; description: string }[] = [];
  // 按空行或「角色名 →」开头拆分块
  const blocks = text.split(/\n(?=[^\n]+[→>\-]{1,2}[^\n]+)/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const lines = trimmed.split('\n');
    const header = lines[0].trim();
    // 匹配 "A → B" 或 "A->B" 或 "A - B"
    const arrowMatch = header.match(/^(.+?)\s*[→>\-]{1,2}\s*(.+?)$/);
    if (!arrowMatch) continue;
    const from = arrowMatch[1].trim();
    const to = arrowMatch[2].trim();
    if (!from || !to || from.length > 30 || to.length > 30) continue;
    const description = lines.slice(1).join('\n').trim();
    results.push({ from, to, description });
  }
  return results;
}

/** 从角色文本中解析独立角色列表（用于 novel_characters 同步） */
function parseCharactersFromText(
  text: string,
  defaultRole: string
): Array<{ name: string; role: string; description: string; personality: string; appearance: string }> {
  if (!text || typeof text !== 'string') return [];
  // 逗号/顿号分隔的纯名字列表（严格判断：每项必须是 2-5 字的正名）
  const commaNames = text.split(/[，,、;；]+/).map(s => s.trim()).filter(s => s.length >= 2);
  const PROPER_NAME_RE = /^[^\s【\[（(，,、—。？！：:\n他她它我你您这那其而但因所为等从以被]{2,5}$/;
  const looksLikeNameList = commaNames.length >= 2 && commaNames.length <= 12
    && commaNames.every(s => PROPER_NAME_RE.test(s));
  if (looksLikeNameList) {
    return commaNames.map(name => ({ name, role: defaultRole, description: '', personality: '', appearance: '' }));
  }
  // 按「名字——」header 行拆分角色块（避免描述续行被误判为新角色）
  const results: Array<{ name: string; role: string; description: string; personality: string; appearance: string }> = [];
  const lines = text.split('\n');
  const headerIndexes: number[] = [];
  // header 特征：2-6字短名，不以虚词/代词开头，含「——」分隔符
  const PARTICLE_RE = /^[他她它我你您这那其而但因所为等从以被]/;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const headerMatch = l.match(/^([^\s【\[（(，,、—]{2,6})\s*(?:（[^）)]*[）)])?\s*(?:——|—)/);
    if (headerMatch && !PARTICLE_RE.test(headerMatch[1])) headerIndexes.push(i);
  }
  // 若没有「——」格式的header，尝试老格式（名字单独一行，≤5字，不含虚词）
  if (headerIndexes.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l || l.length > 5 || PARTICLE_RE.test(l)) continue;
      if (/[【\[，,、—。？！：:（(]/.test(l)) continue;  // 含标点/括号则非名字行
      if (/[的地得了着过是有被把与和或]/.test(l)) continue; // 含助词则非名字
      headerIndexes.push(i);
    }
    if (headerIndexes.length === 0) return results;  // 实在解析不出来，返回空
  }
  for (let hi = 0; hi < headerIndexes.length; hi++) {
    const startIdx = headerIndexes[hi];
    const endIdx = hi + 1 < headerIndexes.length ? headerIndexes[hi + 1] : lines.length;
    const block = lines.slice(startIdx, endIdx).join('\n').trim();
    const firstLine = lines[startIdx].trim();
    // 支持两种格式：「名字——描述」或「名字（单独一行）」
    const headerMatch = firstLine.match(/^([^\s【\[（(，,、—]{2,6})\s*(?:（[^）)]*[）)])?\s*(?:——|—)/)
      || firstLine.match(/^([^\s【\[（(，,、—。？！：:]{2,5})$/);
    if (!headerMatch) continue;
    const name = headerMatch[1].trim();
    if (!name || name.length > 6) continue;
    const bracketGender = firstLine.match(/【(男|女)】/);
    const gender = bracketGender ? bracketGender[1] : null;
    // 提取外貌（【外貌】...）
    const appearanceMatch = block.match(/【外貌】([^【]*)/);
    const appearance = appearanceMatch ? appearanceMatch[1].trim() : '';
    // 去掉外貌段，提取描述
    const descBlock = block.replace(/【外貌】[^【]*/g, '').trim();
    const personalityMatch = descBlock.match(/[【\[](.*?)[】\]]/);
    const personality = personalityMatch ? personalityMatch[1] : '';
    const description = descBlock.replace(/^[^】]*】\s*/, '').replace(/[【\[][^】\]]*[】\]]\s*/g, '').trim();
    results.push({ name, role: defaultRole, description, personality, appearance });
  }
  return results;
}

/**
 * 解析带序号的列表文本
 * 格式："1. 标题\n描述\n\n2. 标题\n描述"
 */
function parseNumberedList(text: string): { title: string; description: string }[] {
  const results: { title: string; description: string }[] = [];
  const blocks = text.split(/(?=\d+\.\s)/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const withoutNumber = trimmed.replace(/^\d+\.\s*/, '');
    const lines = withoutNumber.split('\n').map((l: string) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const title = lines[0];
    const description = lines.slice(1).join('\n');
    if (title) results.push({ title, description });
  }
  return results;
}

/**
 * 解析场景列表，提取 atmosphere 字段
 * 格式："1. 地点名称\n地点描述（50-100字）\n氛围：xxx\n\n2. ..."
 */
function parseSceneList(text: string): { title: string; description: string; atmosphere: string | null }[] {
  const results: { title: string; description: string; atmosphere: string | null }[] = [];
  const blocks = text.split(/(?=\d+\.\s)/);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const withoutNumber = trimmed.replace(/^\d+\.\s*/, '');
    const lines = withoutNumber.split('\n').map((l: string) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const title = lines[0];
    let atmosphere: string | null = null;
    const descLines: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const atmosphereMatch = lines[i].match(/^氛围[：:]\s*(.+)/);
      if (atmosphereMatch) {
        atmosphere = atmosphereMatch[1].trim();
      } else {
        descLines.push(lines[i]);
      }
    }
    const description = descLines.join('\n');
    if (title) results.push({ title, description, atmosphere });
  }
  return results;
}
