import { NextRequest, NextResponse } from 'next/server';
import { createLLMClient, getModelName, getTemperature } from '@/lib/ai-config';
import { getPromptWithFallback } from '@/lib/prompt-helper';
import { getUserFromToken } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // 验证用户登录（游客模式跳过）
    const authHeader = request.headers.get('Authorization');
    const payload = getUserFromToken(authHeader || '');

    const body = await request.json();
    const { theme, concept, characters, supportingCharacters, characterRelationships, setting, chapterCount, tone, genderTarget, narrativePerspective, protagonistName, supportingCharacterName, startChapter = 1, batchSize = 5, previousHooks = [], configId } = body;

    console.log('[Structure] Request received');

    if (!theme || !concept || !characters || !setting) {
      console.error('[Structure] Missing required fields:', { theme: !!theme, concept: !!concept, characters: !!characters, setting: !!setting });
      return NextResponse.json(
        { error: '主题创意信息不完整' },
        { status: 400 }
      );
    }

    const client = await createLLMClient(configId);
    const modelName = await getModelName(configId);
    const temperature = await getTemperature(configId, 0.7);
    
    const endChapter = Math.min(startChapter + batchSize - 1, chapterCount);
    const currentBatchCount = endChapter - startChapter + 1;

    // 构建之前的钩子信息
    let previousHooksContext = '';
    if (previousHooks && previousHooks.length > 0) {
      const maxRecentHooks = 20;
      let hooksToShow: string[];
      let earlierSummary = '';
      
      if (previousHooks.length > maxRecentHooks) {
        const earlyHooks = previousHooks.slice(0, 3);
        earlierSummary = `\n[早期概要] 第1-${earlyHooks.length}章：\n${earlyHooks.map((hook: string, idx: number) => `${idx + 1}. ${hook}`).join('\n')}\n...（中间章节省略）\n`;
        hooksToShow = previousHooks.slice(-maxRecentHooks);
      } else {
        hooksToShow = previousHooks;
      }
      
      const startIdx = previousHooks.length - hooksToShow.length;
      previousHooksContext = `\n\n之前已生成的章节钩子：${earlierSummary}\n${hooksToShow.map((hook: string, idx: number) => `${startIdx + idx + 1}. ${hook}`).join('\n')}`;
    }

    // 使用简化的系统提示词
    const systemPrompt = await getPromptWithFallback('structure-system', `你是一位世界级小说大师，精通创作跌宕起伏、震撼人心的顶级小说结构。只输出纯JSON，不要任何其他文字！

核心创作原则：
1. 冲突升级 - 每章必有核心冲突，冲突必须层层升级，多重冲突交织推进，不允许冲突断崖消失
2. 反转频出 - 每5-8章至少一次大反转，反转必须有前置铺垫和合理逻辑，让读者拍大腿而非骂编剧
3. 情感冲击 - 每章都有情感爆发点，情感要有多层次（表层情绪/深层动机/隐藏创伤），靠细节传递不靠直白陈述
4. 节奏控制 - 开场炸裂抓人，中段持续加速，高潮前猛踩刹车制造窒息感，结尾留悬念或情绪余韵
5. 场景独特 - 每个关键场景有独特氛围标签（光线/气味/声音/温度），场景随剧情推进氛围要变化，同一地点第1章和第10章的感觉必须不同
6. 物品有象征意义 - 关键物品不是道具，是角色命运和主题的具象载体，出现时机和方式要有设计感
7. 章节钩子要连贯 - 每个钩子不是孤立的爽点，而是整条剧情线上的一环，上一章的结局是下一章的开场

【人物命名铁律 - 绝对禁止使用以下AI烂大街名字】
❌ 禁止男性名：叶辰、林辰、楚辰、夜宸、江辰、墨渊、墨尘、墨寒、墨枭、墨辞、萧逸、萧珩、萧烬、萧玄、萧辰、顾言琛、顾夜寒、顾云深、顾临川、顾景琛、陆沉渊、陆知衍、陆廷川、陆星辞、陆泽言、沈寂、沈砚、沈聿、沈辞、沈亦臻、凌夜、凌骁、凌宸、凌烬、凌玄、厉霆骁、厉烬言、厉司寒、厉夜珩、厉泽渊、傅斯年、傅景深、傅夜辞、傅云宸、傅聿白、云澈、玄澈、苍珩、冥夜、君夜、陈默
❌ 禁止女性名：苏晚、苏清鸢、苏念、苏瑶、苏汐、温阮、温瑜、温舒然、温知夏、温晚卿、洛璃、洛汐、洛烟、洛清欢、洛知予、云舒、云绾、云瑶、云晚、云汐月、许念、许知意、许清禾、许绾宁、许悠然、白芷、白若溪、白灵汐、白慕颜、白清瑶、叶绾绾、叶知微、叶晚柠、叶灵萱、叶清寒、唐知予、唐慕晚、唐沁柔、唐云汐、唐舒颜、宁汐、宁晚、宁知鸢、宁清瑶、宁绾柔、夏晚晴、夏知柠、夏灵玥、慕晚、林语嫣
✅ 必须使用真实、生活化、有烟火气的名字

【输出格式要求】
1. emotionalCurve：用箭头连接的情感词序列，如 好奇→恐惧→震惊→怀疑→执念→愤怒→无助→绝望→希望→坚定
2. keyConflicts：带序号的关键冲突列表，每条含标题和描述，格式：
1. 冲突标题\n冲突描述（50-100字）\n\n2. 冲突标题\n冲突描述\n\n3. 冲突标题\n冲突描述（以此类推）
【数量规则】：必须根据主题创意中主要人物、配角设定、角色关系体系的实际内容逐一提炼冲突，有多少关系链和矛盾点就生成多少条（通常4-8个），禁止固定为2个！
3. keyScenes：带序号的关键地点列表，名称必须是具体地点（如"通天塔底层""废弃古庙""皇城议事殿"），禁止用"初次相遇""真相揭露"等抽象事件名，格式：
1. 地点名称\n地点详细介绍（地理/建筑/氛围/剧情作用，50-100字）\n氛围：xxx\n\n2. 地点名称\n...（以此类推）
【数量规则】：必须根据世界观设定中提到的地点、场所逐一展开，有多少场景就生成多少条（通常4-8个），禁止固定为2个！
4. keyItems：带序号的关键物品列表，格式同keyConflicts
【数量规则】：必须根据主题创意、角色设定、世界观中提到的重要道具、信物、象征物逐一列出，有多少就生成多少条（通常3-6个），禁止固定为2个！

完整JSON示例：
{"mainPlot":"主线情节概述","emotionalCurve":"好奇→恐惧→震惊→怀疑→执念→愤怒→无助→绝望→希望→坚定","keyConflicts":"1. 范晓灵与镜中自己的对抗\n镜子里的范晓灵行为异常，试图传递信息，但现实中的范晓灵无法控制镜像，冲突在镜中角色说出往后看时达到第一个高潮。\n\n2. 范晓灵与林海生的信任拉扯\n林海生每晚送馄饨和写有别怕的纸条，既像保护又像控制，范晓灵不知是否该相信他，冲突在范晓灵发现他后颈针脚时加剧。","keyScenes":"1. 出租屋小阁楼\n位于老旧居民楼顶层的逼仄空间，墙皮脱落露出发黄的报纸，窗户封死，唯一的光来自裂缝。主角在此第一次发现镜中异象，地板上有不知何时留下的血迹。氛围：压抑、阴森。\n\n2. 旧货市场深巷\n城市边缘的杂乱集市，摊位间隙幽暗，空气中混着樟脑与铁锈味。镜子在这里被发现，摊主总是消失得莫名其妙，据说深夜会传来低语声。氛围：诡异、混乱。","keyItems":"1. 老镜子\n净重三十七斤，雕花纹路非民国风，更古老。它连接着镜中世界与现实，象征真相与死亡的边界。\n\n2. 馄饨碗\n林海生每晚带来的馄饨，碗底隐约刻着字，热气腾腾的馄饨是温暖表象，碗底的字却是警告。","chapterHooks":["第1章钩子","第2章钩子"]}

⚠️ 只输出JSON，不要Markdown、不要解释！
⚠️ keyConflicts/keyScenes/keyItems 必须生成实际内容，禁止留空或复制示例！
⚠️ keyConflicts/keyScenes/keyItems 的数量必须由主题创意的实际内容决定（人物→冲突、世界观→场景、道具/信物→物品），不允许固定生成2个！`);

    const userPrompt = `根据以下小说创意生成结构分析：

主题：${theme}
创意核心：${concept}
主要人物：${characters}
${supportingCharacters ? `配角：${supportingCharacters}` : ''}
${characterRelationships ? `角色关系：${characterRelationships}` : ''}
世界观：${setting}
章节数：${chapterCount}章
风格：${Array.isArray(tone) ? tone.join('、') : tone}

当前生成：第${startChapter}章到第${endChapter}章（共${currentBatchCount}个钩子）
${previousHooksContext}

要求：
1. chapterHooks 必须是字符串数组，每条钩子50-100字，有冲突和悬念
2. 钩子要连贯${startChapter > 1 ? `，第${startChapter}章要承接第${startChapter - 1}章` : ''}
3. chapterHooks 必须精确包含 ${currentBatchCount} 条，从第${startChapter}章到第${endChapter}章
4. chapterHooks 格式示例："chapterHooks":["主角发现线索，被人追杀，跌落悬崖","主角获救，与神秘人相遇，命运转折"]
5. 只输出JSON！`;

    // 追加格式强制提醒（确保即使数据库中提示词版本较旧也能正确生成）
    const formatReminder = `\n\n【强制输出要求】\nkeyConflicts、keyScenes、keyItems 三个字段必须根据上方提供的主题创意（主要人物、配角设定、角色关系体系、世界观设定）中实际存在的内容来生成，数量不固定，有多少就写多少：\n- keyConflicts：从角色关系和矛盾中逐一提炼冲突线（通常4-8条），格式：\"1. 冲突标题\\n冲突描述（50-100字）\\n\\n2. 冲突标题\\n冲突描述\\n\\n3. ...\"\n- keyScenes：从世界观设定中逐一展开重要地点（通常4-8条），格式：\"1. 具体地点名称（禁止使用初次相遇/真相揭露等事件名）\\n地点详细介绍（50-100字）\\n氛围：xxx\\n\\n2. 具体地点名称\\n...\\n\\n3. ...\"\n- keyItems：从角色设定和世界观中逐一列出关键道具/信物/象征物（通常3-6条），格式：\"1. 物品名称\\n物品描述（50-100字）\\n\\n2. 物品名称\\n物品描述\\n\\n3. ...\"\n⚠️ 禁止仅生成2条！必须充分覆盖主题创意中所有重要冲突、场景、物品！\nchapterHooks: 必须是字符串数组，精确包含 ${currentBatchCount} 条，每条50-100字的章节钩子，如 [\"第${startChapter}章描述...\", \"第${startChapter + 1}章描述...\"]`;
    const finalSystemPrompt = systemPrompt + formatReminder;

    const messages = [
      { role: 'system' as const, content: finalSystemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    console.log('[Structure] Calling AI model:', modelName);
    let response;
    try {
      response = await client.invoke(messages, {
        model: modelName,
        thinking: 'disabled',
        temperature,
      });
      console.log('[Structure] AI call completed');
    } catch (aiError) {
      console.error('[Structure] AI call failed:', aiError);
      return NextResponse.json(
        { error: 'AI调用失败: ' + (aiError instanceof Error ? aiError.message : String(aiError)) },
        { status: 500 }
      );
    }

    console.log('[Structure] AI response preview:', response.content.substring(0, 300));

    // 尝试解析AI响应
    let parsedResponse = tryParseStructureResponse(response.content, currentBatchCount, startChapter, theme, concept);
    
    if (!parsedResponse) {
      console.warn('[Structure] AI response parse failed, using fallback');
      // 创建fallback响应
      parsedResponse = createFallbackStructure(theme, concept, currentBatchCount, startChapter);
    }

    // 检测 AI 是否返回了说明占位文字或过短的无意义文本
    const isPlaceholder = (val: any): boolean => {
      if (!val || typeof val !== 'string') return true;
      const trimmed = val.trim();
      // 过短（少于15个字符）且没有序号列表格式的，视为占位
      if (trimmed.length < 15 && !/^\d+\./.test(trimmed)) return true;
      // 匹配已知的占位模式
      const patterns = [/100-\d+字/, /\(\d+-\d+字\)/, /列出\d+-\d+个/, /描述\d+-\d+个/, /关键冲突列表/, /关键场景设定/, /关键物品设定/, /^核心冲突$/, /^关键场景$/, /^重要物品$/, /^关键冲突$/, /^关键物品$/];
      return patterns.some(p => p.test(trimmed));
    };

    // 确保必需字段存在 - 占位内容用实质性 fallback 替换
    const fallbackData = createFallbackStructure(theme, concept, currentBatchCount, startChapter);
    if (!parsedResponse.mainPlot) parsedResponse.mainPlot = theme;
    if (!parsedResponse.emotionalCurve) parsedResponse.emotionalCurve = '紧张→激动→高潮→结局';
    if (!parsedResponse.keyConflicts || isPlaceholder(parsedResponse.keyConflicts)) parsedResponse.keyConflicts = fallbackData.keyConflicts;
    if (!parsedResponse.keyScenes || isPlaceholder(parsedResponse.keyScenes)) parsedResponse.keyScenes = fallbackData.keyScenes;
    if (!parsedResponse.keyItems || isPlaceholder(parsedResponse.keyItems)) parsedResponse.keyItems = fallbackData.keyItems;
    if (!Array.isArray(parsedResponse.chapterHooks)) {
      parsedResponse.chapterHooks = [];
    }

    // 标准化chapterHooks：处理对象数组 [{chapter: 1, title: "xxx", hook: "..."}] 或直接是字符串数组
    let normalizedHooks: string[] = [];
    if (Array.isArray(parsedResponse.chapterHooks)) {
      for (const item of parsedResponse.chapterHooks) {
        if (typeof item === 'string' && item.trim()) {
          normalizedHooks.push(item.trim());
        } else if (typeof item === 'object' && item !== null && item.hook) {
          // 处理对象格式 {chapter: 1, title: "xxx", hook: "..."}
          const hookText = typeof item.hook === 'string' ? item.hook.trim() : '';
          if (hookText) {
            normalizedHooks.push(hookText);
          }
        } else if (typeof item === 'object' && item !== null && item.title) {
          // 处理对象格式 {chapter: 1, title: "xxx", hook: "..."} - 有时hook字段可能是空的，用title替代
          const titleText = typeof item.title === 'string' ? item.title.trim() : '';
          if (titleText) {
            normalizedHooks.push(titleText);
          }
        }
      }
    }

    // 确保章节钩子数量正确（如果实际钩子不足一半，说明AI生成质量差，使用更有意义的占位）
    if (normalizedHooks.length < currentBatchCount) {
      console.warn(`[Structure] Hooks insufficient: got ${normalizedHooks.length}, need ${currentBatchCount}`);
    }
    while (normalizedHooks.length < currentBatchCount) {
      const idx = normalizedHooks.length;
      const chapterNum = startChapter + idx;
      // 基于主题生成更有意义的占位钩子
      const fillers = [
        `第${chapterNum}章：${theme}的故事继续展开，主角面临新的挑战和选择`,
        `第${chapterNum}章：关键线索逐渐浮出水面，${concept ? concept.slice(0, 20) : '局势'}发生变化`,
        `第${chapterNum}章：新角色登场，打破现有局面，推动剧情向更深层发展`,
        `第${chapterNum}章：主角的过去被揭开一角，与当下的冲突产生致命关联`,
        `第${chapterNum}章：一场意外打乱所有人的计划，真相比想象的更加复杂`
      ];
      normalizedHooks.push(fillers[idx % fillers.length]);
    }
    normalizedHooks = normalizedHooks.slice(0, currentBatchCount);

    // 清理钩子
    normalizedHooks = normalizedHooks.map((hook: string, idx: number) => {
      if (!hook || hook.trim() === '') {
        return `第${startChapter + idx}章：剧情展开，新的转折即将到来`;
      }
      // 过滤掉非字符串内容（如 "[object Object]"）
      if (hook === '[object Object]') {
        return `第${startChapter + idx}章：剧情展开，新的转折即将到来`;
      }
      let cleaned = hook.trim();
      // 如果钩子过长（超过200字），截断到合理长度（AI可能误输出了章节内容）
      if (cleaned.length > 200) {
        cleaned = cleaned.slice(0, 150) + '...';
      }
      return cleaned;
    });

    // 更新parsedResponse中的chapterHooks
    parsedResponse.chapterHooks = normalizedHooks;

    // 添加批次信息
    parsedResponse.batchInfo = {
      startChapter,
      endChapter,
      currentBatch: Math.ceil(startChapter / batchSize),
      totalBatches: Math.ceil(chapterCount / batchSize),
      isLastBatch: endChapter >= chapterCount
    };

    console.log('[Structure] Success! Hooks count:', parsedResponse.chapterHooks.length);
    return NextResponse.json(parsedResponse);
  } catch (error) {
    console.error('Error generating novel structure:', error);
    return NextResponse.json(
      { error: '生成结构分析失败：' + (error instanceof Error ? error.message : '未知错误') },
      { status: 500 }
    );
  }
}

// 尝试解析结构响应
function tryParseStructureResponse(content: string, expectedCount: number, startChapter: number, theme: string, concept: string): any {
  try {
    let jsonStr = content;

    // 移除思考标签
    jsonStr = jsonStr.replace(/<think[\s\S]*?<\/think\s*>/g, '').trim();

    // 尝试从代码块提取
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    } else {
      // 尝试从文本中提取JSON对象（处理AI在JSON前后附加说明文字的情况）
      const jsonObjMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (jsonObjMatch) {
        jsonStr = jsonObjMatch[0];
      }
    }

    // 清理并尝试解析
    jsonStr = cleanJsonString(jsonStr);
    const parsed = JSON.parse(jsonStr);

    // 处理JSON数组格式 [{chapter: 1, title: "xxx", hook: "..."}]
    if (Array.isArray(parsed)) {
      const hooks: string[] = [];
      for (const item of parsed) {
        if (typeof item === 'object' && item !== null) {
          // 优先使用 hook 字段
          if (item.hook && typeof item.hook === 'string') {
            hooks.push(item.hook.trim());
          }
          // 其次使用 title 字段
          else if (item.title && typeof item.title === 'string') {
            hooks.push(item.title.trim());
          }
          // 再其次使用 content 字段
          else if (item.content && typeof item.content === 'string') {
            hooks.push(item.content.trim());
          }
        } else if (typeof item === 'string') {
          hooks.push(item.trim());
        }
      }
      if (hooks.length > 0) {
        return {
          mainPlot: theme || '小说主线情节',
          emotionalCurve: '好奇→恐惧→震惊→怀疑→执念→愤怒→无助→绝望→希望→坚定',
          keyConflicts: '',
          keyScenes: '',
          keyItems: '',
          chapterHooks: hooks
        };
      }
    }

    // 处理JSON对象格式
    if (parsed && typeof parsed === 'object') {
      // 如果返回的是idea格式的内容（title, theme等），尝试转换
      if (!parsed.mainPlot && !parsed.chapterHooks) {
        // 处理coreConflict可能是对象的情况
        let keyConflictsText = '';
        if (typeof parsed.keyConflicts === 'string') {
          keyConflictsText = parsed.keyConflicts;
        } else if (parsed.coreConflict) {
          if (typeof parsed.coreConflict === 'string') {
            keyConflictsText = parsed.coreConflict;
          } else if (typeof parsed.coreConflict === 'object') {
            // coreConflict是对象，尝试提取文本
            const conflictParts: string[] = [];
            if (parsed.coreConflict.surface) conflictParts.push(parsed.coreConflict.surface);
            if (parsed.coreConflict.middle) conflictParts.push(parsed.coreConflict.middle);
            if (parsed.coreConflict.deep) conflictParts.push(parsed.coreConflict.deep);
            keyConflictsText = conflictParts.join('；');
          }
        }

        const converted: any = {
          mainPlot: parsed.theme || parsed.concept || parsed.title || '',
          emotionalCurve: parsed.emotionalCurve || '好奇→恐惧→震惊→怀疑→执念→愤怒→无助→绝望→希望→坚定',
          keyConflicts: keyConflictsText || '',
          keyScenes: (typeof parsed.keyScenes === 'string' && parsed.keyScenes.length > 10) ? parsed.keyScenes : '',
          keyItems: (typeof parsed.keyItems === 'string' && parsed.keyItems.length > 10) ? parsed.keyItems : ''
        };

        // 如果有章节数据
        if (parsed.chapters && Array.isArray(parsed.chapters)) {
          converted.chapterHooks = parsed.chapters.map((c: any) => {
            return c.hook || c.title || c.content || '';
          }).filter((h: string) => h);
        } else if (parsed.chapterHooks) {
          converted.chapterHooks = parsed.chapterHooks;
        }

        // 如果有章节钩子数据，返回转换后的内容
        if (converted.chapterHooks && converted.chapterHooks.length > 0) {
          return converted;
        }

        // 没有章节钩子数据但有其他结构信息，也返回（让后续逻辑补全钩子）
        if (converted.mainPlot && converted.mainPlot !== '核心冲突') {
          converted.chapterHooks = [];
          return converted;
        }

        // 完全无用数据，返回null触发createFallbackStructure重新生成
        return null;
      }

      // 验证基本结构：有mainPlot时，确保chapterHooks是有实质内容的字符串数组
      if (parsed.mainPlot || parsed.chapterHooks) {
        // 尝试从 chapters 字段提取钩子（AI有时会把钩子放在 chapters 数组里）
        if ((!Array.isArray(parsed.chapterHooks) || parsed.chapterHooks.length === 0) && Array.isArray(parsed.chapters) && parsed.chapters.length > 0) {
          parsed.chapterHooks = parsed.chapters.map((c: any) => {
            if (typeof c === 'string') return c;
            return c.hook || c.content || c.summary || c.title || '';
          }).filter((h: string) => h && h.trim());
        }
        // 检查 chapterHooks 里是否有明显占位文字（如"第N章"、"第N章剧情发展"），过滤掉
        // 注意：保留"第N章：[实际内容]"格式的钩子（AI按formatReminder要求生成的合法格式）
        if (Array.isArray(parsed.chapterHooks)) {
          const realHooks = parsed.chapterHooks.filter((h: string) => {
            if (typeof h !== 'string' || !h.trim()) return false;
            const trimmed = h.trim();
            if (trimmed.length < 12) return false;
            // 仅过滤明显无内容的占位：纯章节号或"第N章剧情发展/故事继续"等
            if (/^第\d+章$/.test(trimmed)) return false;
            if (/^第\d+章[：:]?\s*(剧情发展|故事继续|待续|略)/.test(trimmed)) return false;
            return true;
          });
          if (realHooks.length > 0) {
            parsed.chapterHooks = realHooks;
          } else {
            parsed.chapterHooks = [];
          }
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[Structure] Parse attempt failed:', e);
  }

  // 尝试直接提取钩子
  try {
    const hooks = extractHooksFromText(content, expectedCount, startChapter);
    if (hooks.length > 0) {
      return {
        mainPlot: theme || '小说主线情节',
        emotionalCurve: '好奇→恐惧→震惊→怀疑→执念→愤怒→无助→绝望→希望→坚定',
        keyConflicts: '',
        keyScenes: '',
        keyItems: '',
        chapterHooks: hooks
      };
    }
  } catch (e) {
    console.warn('[Structure] Hook extraction failed:', e);
  }

  return null;
}

// 从文本中提取钩子
function extractHooksFromText(text: string, count: number, startChapter: number): string[] {
  const hooks: string[] = [];
  
  // 尝试匹配数字列表
  const listMatches = text.match(/\d+\.\s*[^\n\r]+/g);
  if (listMatches) {
    for (const match of listMatches) {
      const hook = match.replace(/^\d+\.\s*/, '').trim();
      if (hook) hooks.push(hook);
    }
  }
  
  // 尝试匹配引号内容
  if (hooks.length === 0) {
    const quoteMatches = text.match(/"([^"\\]|\\.)*"/g);
    if (quoteMatches) {
      for (const match of quoteMatches) {
        const hook = match.replace(/^"|"$/g, '').trim();
        if (hook && hook.length > 5) hooks.push(hook);
      }
    }
  }
  
  return hooks.slice(0, count);
}

// 清理JSON字符串
function cleanJsonString(str: string): string {
  let result = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escapeNext) {
      result += ch;
      escapeNext = false;
      continue;
    }
    if (ch === '\\') {
      result += ch;
      escapeNext = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      result += ch;
      continue;
    }
    if (inString) {
      const code = ch.charCodeAt(0);
      if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
        if (ch === '\n' || ch === '\r' || ch === '\t') {
          result += ' ';
        } else {
          result += '\\u' + code.toString(16).padStart(4, '0');
        }
        continue;
      }
    }
    result += ch;
  }
  
  return result.replace(/,(\s*[}\]])/g, '$1').trim();
}

// 创建fallback结构
function createFallbackStructure(theme: string, concept: string, count: number, startChapter: number): any {
  const hooks: string[] = [];
  for (let i = 0; i < count; i++) {
    hooks.push(`第${startChapter + i}章：${theme}剧情发展`);
  }
  
  const shortTheme = theme ? theme.slice(0, 20) : '故事';
  const shortConcept = concept ? concept.slice(0, 40) : theme || '核心情节';

  return {
    mainPlot: concept || theme,
    emotionalCurve: '平静→好奇→紧张→冲突→危机→转折→高潮→释然',
    keyConflicts: `1. 主角与核心障碍的对抗\n围绕「${shortTheme}」展开，主角在追寻目标的过程中遭遇层层阻碍，每次突破都付出惨重代价。\n\n2. 内部信任与背叛的较量\n盟友之间因利益分歧产生裂痕，关键时刻的背叛让主角陷入绝境，推动故事走向真正的高潮。\n\n3. 外部势力的介入与压迫\n来自外部的强大势力将主角逼入绝境，「${shortTheme}」的核心矛盾由此激化至无法回避的程度。\n\n4. 自我认知与蜕变的内在冲突\n主角在经历重重打击后陷入自我怀疑，信念的崩塌与重建构成贯穿全篇的内在弧线。`,
    keyScenes: `1. 故事核心地点\n与「${shortTheme}」直接相关的关键场所，是主角命运转折的起点，隐藏着推动整个故事的秘密。氛围：紧张、神秘。\n\n2. 势力交锋之地\n各方力量在此正面碰撞，「${shortConcept}」的冲突在此达到第一个高潮，空间布局暗示权力格局。氛围：压迫、肃杀。\n\n3. 主角的庇护与落脚处\n在险境中短暂喘息的空间，也是秘密被悄然策划的地方，表面安全背后暗流涌动。氛围：暗沉、警觉。\n\n4. 最终对决场景\n主角与最大阻力正面交锋之地，「${shortConcept}」的真相在此揭晓，决定所有人的命运归属。氛围：决绝、宿命。`,
    keyItems: `1. 核心关键物\n与「${shortTheme}」密切相关的重要物品，是推动情节发展的核心线索，承载着不为人知的真相。\n\n2. 身份象征物\n代表主角身份与使命的特殊存在，在关键时刻起到扭转局势的决定性作用。\n\n3. 矛盾引爆器\n表面上普通的物品，实则是各方争夺的焦点，围绕它展开的争斗揭开了「${shortTheme}」最深层的秘密。`,
    chapterHooks: hooks
  };
}
