import { NextRequest } from 'next/server';
import { getUserFromToken } from '@/lib/auth';
import { shortDramaManager, dramaWorkflowManager } from '@/storage/database';
import { aiConfigManager } from '@/storage/database/aiConfigManager';
import { getPromptsWithFallback } from '@/lib/prompt-helper';

export const maxDuration = 300;

function enc(obj: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(obj)}\n\n`);
}

function safeEnqueue(ctrl: ReadableStreamDefaultController, obj: object): boolean {
  try {
    if (ctrl.desiredSize === null) return false;
    ctrl.enqueue(enc(obj));
    return true;
  } catch { return false; }
}

function safeClose(ctrl: ReadableStreamDefaultController) {
  try { ctrl.close(); } catch {}
}

function extractJSON(text: string): string {
  let s = text.trim()
    .replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  if (!s.startsWith('[') && !s.startsWith('{')) {
    const a = s.indexOf('['), o = s.indexOf('{');
    const start = a === -1 ? o : o === -1 ? a : Math.min(a, o);
    if (start !== -1) s = s.slice(start);
  }
  const lastClose = Math.max(s.lastIndexOf(']'), s.lastIndexOf('}'));
  if (lastClose !== -1 && lastClose < s.length - 1) s = s.slice(0, lastClose + 1);
  return s;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const payload = getUserFromToken(request.headers.get('authorization'));
  if (!payload) return new Response('未授权', { status: 401 });

  const { id: dramaId } = await params;
  const body = await request.json();
  const { type, episodeId, configId, style, customSystemPrompt, customUserPromptTpl } = body as {
    type: 'image' | 'video';
    episodeId: string;
    configId?: string;
    style?: string;
    customSystemPrompt?: string;
    customUserPromptTpl?: string;
  };

  if (!episodeId) return new Response(JSON.stringify({ error: '缺少 episodeId' }), { status: 400 });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // 1. 获取分集 & 分镜
        const episode = await shortDramaManager.getEpisodeById(episodeId);
        if (!episode) { safeEnqueue(controller, { type: 'error', message: '分集不存在' }); return safeClose(controller); }

        let shots = await dramaWorkflowManager.getShotsByEpisodeId(episodeId);

        // 2. 如果没有分镜，从剧本自动创建
        if (!shots.length) {
          safeEnqueue(controller, { type: 'status', message: '从剧本自动创建分镜...' });
          let screenplay = episode.screenplay;
          if (!screenplay && episode.sourceScriptChapterIndex != null) {
            try {
              const drama = await shortDramaManager.getById(dramaId);
              if (drama?.scriptId) {
                const { scriptManager } = await import('@/storage/database');
                const script = await scriptManager.getScriptById(drama.scriptId);
                const chapters = Array.isArray(script?.chapters) ? script.chapters : [];
                screenplay = chapters[episode.sourceScriptChapterIndex]?.screenplay || null;
              }
            } catch {}
          }
          let scenes: any[] = [];
          if (screenplay) {
            try {
              const p = JSON.parse(screenplay);
              if (Array.isArray(p?.scenes)) scenes = p.scenes;
              else if (Array.isArray(p)) scenes = p;
            } catch {}
          }
          if (!scenes.length && (episode as any).scenes) {
            try {
              const s2 = JSON.parse((episode as any).scenes);
              if (Array.isArray(s2)) scenes = s2;
              else if (Array.isArray(s2?.scenes)) scenes = s2.scenes;
            } catch {}
          }
          if (!scenes.length) { safeEnqueue(controller, { type: 'error', message: '分集剧本内容不存在或格式不支持' }); return safeClose(controller); }
          const shotObjs = scenes.map((scene: any, idx: number) => {
            const dialogueLines: string[] = [];
            if (Array.isArray(scene.dialogues)) {
              for (const d of scene.dialogues) { if (d.character && d.line) dialogueLines.push(`${d.character}：${d.line}`); }
            }
            return {
              dramaId, episodeId, userId: payload.userId,
              shotNumber: idx + 1,
              shotType: 'storyboard' as const,
              sceneDescription: [scene.description, scene.actions, scene.sceneDescription].filter(Boolean).join('\n') || null,
              cameraAngle: null, cameraMovement: null,
              dialogue: dialogueLines.length > 0 ? dialogueLines.join('\n') : null,
              voiceover: null, soundEffects: null, characterIds: null,
              imagePrompt: null, videoPrompt: null,
              ttsText: dialogueLines.length > 0 ? dialogueLines.join('\n') : null,
              subtitle: dialogueLines.length > 0 ? dialogueLines[0] : null,
              duration: 3, status: 'draft' as const,
            };
          });
          await dramaWorkflowManager.bulkCreateShots(shotObjs);
          shots = await dramaWorkflowManager.getShotsByEpisodeId(episodeId);
        }

        if (!shots.length) { safeEnqueue(controller, { type: 'error', message: '该分集暂无剧本场景' }); return safeClose(controller); }

        // 3. 获取 AI 配置
        let config: any = null;
        if (configId) {
          const c = await aiConfigManager.getConfigById(configId);
          if (c && (!c.modelType || c.modelType === 'text')) config = c;
        }
        const apiUrl = config?.apiUrl || process.env.AI_API_URL || process.env.OPENAI_BASE_URL || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
        const apiKey = config?.apiKey || process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
        const model = config?.model || process.env.AI_MODEL || 'deepseek-chat';
        if (!apiKey) { safeEnqueue(controller, { type: 'error', message: '缺少AI API密钥，请在AI设置中配置文字大模型，或在服务器设置 AI_API_KEY 环境变量' }); return safeClose(controller); }

        // 4. 构建上下文
        const characters = await dramaWorkflowManager.getCharactersByDramaId(dramaId);
        const scenes = await dramaWorkflowManager.getScenesByDramaId(dramaId);
        const items = await dramaWorkflowManager.getItemsByDramaId(dramaId);

        // ── 🛡️ 后端自动补齐 @ 守护机制 (Backend Guard) ──
        // 收集所有已知资产名字，按长度降序排序以防止子词提前替换导致的重叠冲突
        const assetNames: string[] = [];
        (characters || []).forEach((c: any) => { if (c.name) assetNames.push(c.name); });
        (scenes || []).forEach((s: any) => { if (s.name) assetNames.push(s.name); });
        (items || []).forEach((i: any) => { if (i.name) assetNames.push(i.name); });
        const sortedAssetNames = assetNames.filter(Boolean).sort((a, b) => b.length - a.length);

        const repairAtSymbols = (text: string): string => {
          if (!text) return '';
          let result = text;
          for (const name of sortedAssetNames) {
            const escapedName = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            // 匹配没有被 @ 修饰的名字
            const regex = new RegExp(`(?<!@)${escapedName}`, 'g');
            result = result.replace(regex, `@${name}`);
          }
          return result;
        };

        // 5. 过滤待生成分镜（已有提示词的跳过，支持断点续传）
        const pendingShots = type === 'image'
          ? shots.filter((s: any) => !s.imagePrompt)
          : shots.filter((s: any) => !s.videoPrompt);
        const skippedCount = shots.length - pendingShots.length;

        safeEnqueue(controller, {
          type: 'start', total: shots.length,
          pending: pendingShots.length, skipped: skippedCount, promptType: type,
        });

        if (pendingShots.length === 0) {
          safeEnqueue(controller, { type: 'done', saved: 0, total: shots.length, skipped: skippedCount });
          return safeClose(controller);
        }

        // 6. 构建系统提示词（一次性构建，所有分镜共用）
        let systemPrompt = '';
        let imgUserTpl: string | null = null;

        if (type === 'image') {
          const sampleChar = characters[0]?.name || '角色名';
          const sampleScene = scenes[0]?.name || '场景名';
          const sampleItem = items[0]?.name || '道具名';

          const charList = characters.map((c: any) => `  - ID:${c.id} 名字:${c.name}${c.appearance ? ' 外貌:' + c.appearance : ''}`).join('\n');
          const sceneList = scenes.map((s: any) => `  - ${s.name}${s.description ? '：' + s.description : ''}${s.atmosphere ? ' 氛围:' + s.atmosphere : ''}`).join('\n');
          const itemList = items.map((i: any) => `  - ${i.name}${i.description ? '：' + i.description : ''}`).join('\n');
          const { systemPrompt: dbSystem, userPrompt: dbUserTpl } = await getPromptsWithFallback(
            'image-prompts-system',
            `你是一位顶级影视分镜师，精通AI绘画提示词技术。将剧本场景转化为具有叙事张力和电影质感的分镜画面描述。核心原则：为每个场景选择最具戏剧张力的那一帧，让画面本身就在讲故事。每条提示词必须自包含所有视觉信息，80-150字，中文撰写。`
          );
          
          const activeSystem = customSystemPrompt?.trim() || dbSystem;
          imgUserTpl = customUserPromptTpl?.trim() || dbUserTpl || null;

          systemPrompt = [
            activeSystem,
            charList ? `可用角色列表（描述时提及角色名，必须在名字前方自动加上@，如 @${sampleChar}）:\n${charList}` : '',
            sceneList ? `可用场景列表（描述时提及场景名，必须在名字前方自动加上@，如 @${sampleScene}）:\n${sceneList}` : '',
            itemList ? `可用物品列表（描述时提及物品名，必须在名字前方自动加上@，如 @${sampleItem}）:\n${itemList}` : '',
            `风格要求: ${style || 'cinematic, photorealistic'}`,
            '',
            '**输出要求**：直接输出纯JSON对象（不含代码块）：',
            `{"imagePrompt":"含带@符号的角色/场景/物品名（例如：@${sampleChar}站在@${sampleScene}旁，手里拿着@${sampleItem}）的中文提示词","characterIds":["角色ID1"]}`,
            '**严禁输出图片URL**：绝对不能在任何字段输出图片链接、![]()等富文本地址或本地 file 路径！只需要输出带@符号的资产名称。',
          ].filter(Boolean).join('\n');
        } else {
          const sampleChar = characters[0]?.name || '角色名';
          const sampleScene = scenes[0]?.name || '场景名';
          const sampleItem = items[0]?.name || '道具名';

          const charRef = characters.length > 0
            ? `\n主要角色列表（请在对应的描述字眼前方自动加上@符号，如 @${sampleChar}，不要显示图片URL）:\n${characters.map((c: any) => `- ${c.name}${c.appearance ? '，外貌：' + c.appearance : ''}`).join('\n')}` : '';
          const sceneRef = scenes.length > 0
            ? `\n场景设定列表（请在描述场景名称时前方加上@符号，如 @${sampleScene}，不要显示图片URL）:\n${scenes.map((s: any) => `- ${s.name}${s.description ? '：' + s.description : ''}`).join('\n')}` : '';
          const itemRef = items.length > 0
            ? `\n关键道具列表（请在描述关键道具时前方加上@符号，如 @${sampleItem}，不要显示图片URL）:\n${items.map((i: any) => `- ${i.name}${i.description ? '：' + i.description : ''}`).join('\n')}` : '';
          const { systemPrompt: dbSystem2 } = await getPromptsWithFallback(
            'video-prompts-system',
            `你是一位顶级影视视觉导演，精通AI视频生成技术。将剧本文字转化为精准、可执行的AI视频提示词，让AI视频模型"看到"一个完整的动态片段（3-10秒）。`
          );

          const activeSystem2 = customSystemPrompt?.trim() || dbSystem2;

          systemPrompt = [
            activeSystem2, charRef, sceneRef, itemRef,
            '',
            '**输出要求（必须严格遵守）**：直接输出纯JSON对象（不含代码块），第一个字符必须是 {',
            '格式：{"startFrame":"起始画面","endFrame":"结束画面","prompt":"视频提示词","cameraMovement":"运镜方式","characterAction":"角色动作","stateNote":"状态备注"}',
            '**对白规则**：若分镜含有对白台词，必须将台词原文嵌入 prompt 和 characterAction，格式：角色名（语气）："台词原文"，不得省略。',
            `**关联引用规则**：极其重要！在 prompt、startFrame、endFrame、cameraMovement 和 characterAction 的所有描述字眼只要提及上述角色、场景、物品名字，必须在名字前方加上 @ 符号！例如：@${sampleChar} 站在 @${sampleScene} 旁边，手里拿着 @${sampleItem}。`,
            `**严禁输出图片URL**：绝对不能在任何字段输出图片链接、![]()等富文本地址或本地 file 路径！只需要输出带@符号的资产名称，如 @${sampleChar}，多余的链接必须完全隐藏过滤。`,
          ].filter(Boolean).join('\n');
        }

        // 7. 逐个分镜生成（每个独立AI调用，流式输出，即时保存，支持断点续传）
        let saved = 0;
        let shotIndex = 0;
        for (const shot of pendingShots) {
          // 在处理连续分镜之间加入 1.2 秒的间隔，防止由于请求过快触发服务商 QPS / 并发 / RPM 限制
          if (shotIndex > 0) {
            await new Promise(resolve => setTimeout(resolve, 1200));
          }
          shotIndex++;

          safeEnqueue(controller, { type: 'generating', shotId: shot.id, shotNumber: shot.shotNumber, pending: pendingShots.length });

          // 构建当前分镜用户消息
          let userContent: string;
          if (type === 'image') {
            const desc = [shot.sceneDescription, (shot as any).dialogue ? `[对白] ${(shot as any).dialogue}` : ''].filter(Boolean).join(' ');
            userContent = imgUserTpl
              ? imgUserTpl.replace(/\{\{sceneTitle\}\}/g, `镜头${shot.shotNumber}`).replace(/\{\{sceneDescription\}\}/g, desc)
              : `镜头${shot.shotNumber}: ${desc}`;
          } else {
            const parts: string[] = [];
            if (shot.sceneDescription) parts.push(shot.sceneDescription);
            if ((shot as any).dialogue) parts.push(`【对白原文，必须引入prompt和characterAction】\n${(shot as any).dialogue}`);
            userContent = `镜头${shot.shotNumber}:\n${parts.join('\n') || '（无描述）'}`;
          }

          try {
            let attempts = 0;
            const maxAttempts = 3;
            let aiRes: Response | null = null;

            while (attempts < maxAttempts) {
              try {
                aiRes = await fetch(`${apiUrl}/chat/completions`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
                  body: JSON.stringify({
                    model, temperature: 0.7, max_tokens: 1024, stream: true,
                    messages: [
                      { role: 'system', content: systemPrompt },
                      { role: 'user', content: userContent },
                    ],
                  }),
                });

                if (aiRes.ok) {
                  break; // 成功，退出重试
                }
              } catch (err) {
                console.error(`[PromptGen] Shot ${shot.shotNumber} network error:`, err);
              }

              attempts++;
              if (attempts < maxAttempts) {
                // 如果是 401、403 或 429，极大概率是触发了服务商的 QPS 限制 / 速率限制或临时并发槽满
                // 此时采用更宽松的退避重试延迟（每次乘以 3 秒，即 3s, 6s），让服务商窗口期安全重置
                const isRateLimited = aiRes && (aiRes.status === 401 || aiRes.status === 403 || aiRes.status === 429);
                const delayMs = isRateLimited ? attempts * 3000 : attempts * 1000;
                await new Promise(resolve => setTimeout(resolve, delayMs));
              }
            }

            if (!aiRes || !aiRes.ok) {
              const statusStr = aiRes ? `错误码 ${aiRes.status}` : '网络连接失败';
              safeEnqueue(controller, { type: 'shotError', shotId: shot.id, shotNumber: shot.shotNumber, message: `AI接口错误 (${statusStr})，已达到最大重试次数` });
              continue;
            }

            const shotReader = aiRes.body?.getReader();
            if (!shotReader) {
              safeEnqueue(controller, { type: 'shotError', shotId: shot.id, shotNumber: shot.shotNumber, message: 'AI流读取失败' });
              continue;
            }

            const dec = new TextDecoder();
            let buf = '';
            let accum = '';
            while (true) {
              const { done: d, value: v } = await shotReader.read();
              if (d) break;
              buf += dec.decode(v, { stream: true });
              const ls = buf.split('\n');
              buf = ls.pop() || '';
              for (const ln of ls) {
                if (!ln.startsWith('data: ')) continue;
                const raw = ln.slice(6).trim();
                if (raw === '[DONE]') break;
                try {
                  const ck = JSON.parse(raw);
                  const delta = ck.choices?.[0]?.delta?.content || '';
                  if (delta) {
                    accum += delta;
                    safeEnqueue(controller, { type: 'token', shotId: shot.id, shotNumber: shot.shotNumber, content: delta });
                  }
                } catch {}
              }
            }
            shotReader.releaseLock();

            // 解析并立即保存
            let parsed: any = {};
            try { parsed = JSON.parse(extractJSON(accum) || '{}'); } catch {}

            if (type === 'image') {
              let imgPrompt = parsed.imagePrompt || parsed.prompt || parsed.description || accum.trim().slice(0, 500);
              if (imgPrompt) {
                // 后端自动校准补全
                imgPrompt = repairAtSymbols(imgPrompt);
                const upd: any = { imagePrompt: imgPrompt };
                if (Array.isArray(parsed.characterIds) && parsed.characterIds.length > 0)
                  upd.characterIds = JSON.stringify(parsed.characterIds);
                const result = await dramaWorkflowManager.updateShot(shot.id, upd);
                if (result) { saved++; safeEnqueue(controller, { type: 'saved', shotId: shot.id, shotNumber: shot.shotNumber, imagePrompt: imgPrompt }); }
              } else {
                safeEnqueue(controller, { type: 'shotError', shotId: shot.id, shotNumber: shot.shotNumber, message: '未生成有效提示词' });
              }
            } else {
              let promptText = parsed.prompt || parsed.videoPrompt || parsed.description || accum.trim().slice(0, 500);
              if (promptText) {
                // 后端自动校准补全
                const startFrame = repairAtSymbols(parsed.startFrame || '');
                const endFrame = repairAtSymbols(parsed.endFrame || '');
                const stateNote = parsed.stateNote || '';
                const cameraMovement = repairAtSymbols(parsed.cameraMovement || '');
                const characterAction = repairAtSymbols(parsed.characterAction || '');
                promptText = repairAtSymbols(promptText);

                const structured = JSON.stringify({
                  startFrame, endFrame, stateNote, cameraMovement, characterAction, prompt: promptText,
                });
                const result = await dramaWorkflowManager.updateShot(shot.id, { videoPrompt: structured });
                if (result) { saved++; safeEnqueue(controller, { type: 'saved', shotId: shot.id, shotNumber: shot.shotNumber, videoPrompt: promptText, videoPromptJson: structured }); }
              } else {
                safeEnqueue(controller, { type: 'shotError', shotId: shot.id, shotNumber: shot.shotNumber, message: '未生成有效提示词' });
              }
            }
          } catch (e: any) {
            safeEnqueue(controller, { type: 'shotError', shotId: shot.id, shotNumber: shot.shotNumber, message: e.message });
          }
        }

        safeEnqueue(controller, { type: 'done', saved, total: shots.length });
      } catch (err: any) {
        safeEnqueue(controller, { type: 'error', message: err.message || '生成失败' });
      } finally {
        safeClose(controller);
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
