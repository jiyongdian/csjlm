import { NextRequest } from 'next/server';
import { createLLMClient, getModelName, getTemperature } from '@/lib/ai-config';
import { getUserFromToken } from '@/lib/auth';
import { extractJsonObject } from '@/lib/json-parser';
import { modelPromptManager } from '@/storage/database';
import { scriptManager } from '@/storage/database';

async function getVideoSystemPrompt(): Promise<string> {
  const forcedRules = `
【最高优先级指令——不可违反】
- 你需要为场景生成完整的子镜头序列，videoPrompts数组中可以有1-8个对象
- 严格输出JSON，不要任何解释、前言、markdown标记
- 每个子镜头的prompt字段中必须完整引用分配给它的对白原文
- 必须描述说话者的口型、表情、肢体语言等视觉细节
- 所有对白必须被完整覆盖，不能遗漏任何一句
- 主镜头和子镜头都要生成，每个子镜头覆盖1-2句对白`;

  const outputFormat = `
【输出格式】
{
  "videoPrompts": [
    {
      "id": "vid_ch章号_s场景号_1",
      "sceneIndex": 场景编号,
      "subShotIndex": 1,
      "sceneTitle": "场景标题",
      "dialogueRange": "覆盖的对白：第X句-第Y句",
      "description": "本子镜头核心画面（15字内）",
      "startFrame": "起始画面描述",
      "cameraMovement": "镜头运动方式",
      "action": "角色动作路径和表情变化",
      "endFrame": "结束画面",
      "duration": "6秒",
      "prompt": "完整的中文视频生成提示词（必须完整引用对白原文）",
      "style": "画面风格关键词",
      "transition": "衔接方式"
    }
  ]
}`;

  try {
    const dbPrompt = await modelPromptManager.getPrompt('video-prompts-system');
    if (dbPrompt && dbPrompt.systemPrompt && dbPrompt.systemPrompt.trim().length > 50) {
      return forcedRules + '\n\n' + dbPrompt.systemPrompt + outputFormat;
    }
  } catch {}

  return forcedRules + '\n\n' + `你是一位顶级的影视视觉导演，精通AI视频生成技术。

【视频提示词构建】
- 从场景描述中提取环境氛围、光源、色调、空间深度
- 从对白中设计说话者的口型变化、面部表情、肢体语言、听话者的反应
- 设计镜头运动：情感高潮→快速推近特写；对话→正反打+微推；动作→跟拍+低角度
- 用"从...到..."的结构描述运动变化，描述5-8秒的动态片段
- prompt中必须完整引用对白原文，格式：角色名说「对白内容」
- 中文撰写，用词精准画面感强
- 每个场景根据对白数量生成对应子镜头，确保所有对白都被覆盖` + outputFormat;
}

// 安全推送数据到流
function safeEnqueue(controller: ReadableStreamDefaultController, encoder: TextEncoder, data: string, context: string): boolean {
  try {
    controller.enqueue(encoder.encode(data));
    return true;
  } catch (e) {
    console.warn(`[video-prompts] 流推送失败: ${context}`, e);
    return false;
  }
}

function safeClose(controller: ReadableStreamDefaultController) {
  try { controller.close(); } catch {}
}

// 保存一个场景的视频提示词
async function saveVideoPromptToDb(scriptId: string, chapterIndex: number, prompts: any[], sceneIndex: number): Promise<void> {
  const freshScript = await scriptManager.getScriptById(scriptId);
  if (!freshScript) return;
  const updatedChapters = Array.isArray(freshScript.chapters) ? [...freshScript.chapters] : [];
  if (chapterIndex < 0 || chapterIndex >= updatedChapters.length) return;

  const existingVp: any[] = Array.isArray(updatedChapters[chapterIndex].videoPrompts)
    ? [...updatedChapters[chapterIndex].videoPrompts]
    : [];
  
  // 用 sceneIndex+subShotIndex 作为唯一键去重，新数据覆盖旧数据
  const existingMap = new Map<string, any>();
  for (const v of existingVp) {
    const key = `${v.sceneIndex}_${v.subShotIndex ?? 0}`;
    existingMap.set(key, v);
  }
  
  // 新的子镜头覆盖同 sceneIndex+subShotIndex 的旧数据
  for (const p of prompts) {
    const key = `${p.sceneIndex ?? sceneIndex}_${p.subShotIndex ?? 0}`;
    existingMap.set(key, p);
  }

  // 将Map转换为数组并按 sceneIndex + subShotIndex 排序
  const allPrompts: any[] = Array.from(existingMap.values()).sort(
    (a: any, b: any) => (a.sceneIndex - b.sceneIndex) || ((a.subShotIndex || 0) - (b.subShotIndex || 0))
  );

  updatedChapters[chapterIndex] = {
    ...updatedChapters[chapterIndex],
    videoPrompts: allPrompts,
  };
  await scriptManager.updateScript(scriptId, { chapters: updatedChapters });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { scriptId, chapterIndex, configId } = body;

    // 验证登录
    const authHeader = request.headers.get('Authorization');
    const payload = getUserFromToken(authHeader || '');
    if (!payload) {
      return new Response(JSON.stringify({ error: '请先登录' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    // 获取剧本
    const script = await scriptManager.getScriptById(scriptId);
    if (!script || script.userId !== payload.userId) {
      return new Response(JSON.stringify({ error: '剧本不存在或无权访问' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const chapters = Array.isArray(script.chapters) ? script.chapters : [];
    if (chapterIndex < 0 || chapterIndex >= chapters.length) {
      return new Response(JSON.stringify({ error: '章节索引无效' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const chapter = chapters[chapterIndex];
    const screenplay = chapter?.screenplay;

    if (!screenplay || (!screenplay.scenes && !screenplay.rawText)) {
      return new Response(JSON.stringify({ error: '请先生成该章节的剧本' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const client = await createLLMClient(configId);
    const model = await getModelName(configId);
    const temperature = await getTemperature(configId, 0.6);

    const allScenes: any[] = screenplay.scenes || [];
    const totalScenes = allScenes.length;

    // 如果没有场景数据，回退到原始文本模式
    if (totalScenes === 0) {
      return generateSingleBatch(request, script, chapterIndex, screenplay.rawText || '', client, model, temperature);
    }

    // 获取已有视频提示词（断点续生：跳过已有提示词的场景）
    const existingVideoPrompts: any[] = Array.isArray(chapter.videoPrompts) ? chapter.videoPrompts : [];
    const existingSceneIndices = new Set(existingVideoPrompts.map((vp: any) => String(vp.sceneIndex)));

    const scenesToGenerate = allScenes.filter((s: any) => !existingSceneIndices.has(String(s.sceneIndex)));
    const skippedCount = totalScenes - scenesToGenerate.length;

    console.log(`[video-prompts] 第${chapterIndex + 1}章共${totalScenes}个场景，已有${skippedCount}个提示词，需生成${scenesToGenerate.length}个`);

    const encoder = new TextEncoder();
    let isStreamClosed = false;
    const newlyGeneratedPrompts: any[] = [];

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // 发送开始事件
          if (!safeEnqueue(controller, encoder, `data: ${JSON.stringify({
            type: 'start',
            totalScenes,
            scenesToGenerate: scenesToGenerate.length,
            skippedScenes: skippedCount,
          })}\n\n`, 'start')) {
            isStreamClosed = true;
          }

          // 逐场景生成
          for (let i = 0; i < scenesToGenerate.length; i++) {
            if (isStreamClosed) break;

            const scene = scenesToGenerate[i];
            const sceneIdx = scene.sceneIndex;

            // 发送场景开始事件
            if (!safeEnqueue(controller, encoder, `data: ${JSON.stringify({
              type: 'scene_start',
              sceneIndex: sceneIdx,
              sceneTitle: scene.sceneTitle || scene.title || '',
              progress: i + 1,
              total: scenesToGenerate.length,
            })}\n\n`, 'scene_start')) {
              isStreamClosed = true;
              break;
            }

            const sceneDialogues: any[] = scene.dialogues && Array.isArray(scene.dialogues) ? scene.dialogues : [];
            const dialogueCount = sceneDialogues.length;

            const systemPrompt = await getVideoSystemPrompt();
            const allSceneSubShots: any[] = [];

            // 构建完整场景文本，包含所有对白
            let fullSceneText = `【场景${sceneIdx}：${scene.sceneTitle || scene.title || ''}】\n`;
            fullSceneText += `环境描述：${scene.description || '无'}\n`;
            fullSceneText += `角色动作：${scene.actions || '无'}\n`;
            if (dialogueCount > 0) {
              fullSceneText += '本场景全部对白：\n';
              for (let di = 0; di < dialogueCount; di++) {
                const d = sceneDialogues[di];
                fullSceneText += `  第${di + 1}句：${d.character}：「${d.line}」${d.direction ? `（${d.direction}）` : ''}\n`;
              }
            }
            fullSceneText += `舞台指示：${scene.stageDirections || '无'}`;

            // 计算需要生成的子镜头数量
            const expectedShotCount = dialogueCount === 0 ? 1 : Math.ceil(dialogueCount / 2);

            const fullUserPrompt = `请为以下完整场景生成视频提示词子镜头序列。

场景：${scene.sceneTitle || scene.title || ''}
章节：${chapter.chapterTitle || chapter.title || `第${chapterIndex + 1}章`}（场景${i + 1}/${scenesToGenerate.length}）

【场景信息】
${fullSceneText}

【重要要求】
1. 本场景共有${dialogueCount}句对白，请生成${expectedShotCount}个子镜头，确保所有对白都被完整覆盖
2. 每个子镜头覆盖1-2句对白，subShotIndex从1开始递增
3. 每个子镜头的prompt字段必须完整引用分配给它的对白原文
4. 必须描述说话者的口型变化、表情、肢体语言等视觉细节
5. 可以有主镜头和子镜头，但所有对白都要覆盖

请生成${expectedShotCount}个视频提示词子镜头。`;

            const llmStream = client.stream([
              { role: 'system' as const, content: systemPrompt },
              { role: 'user' as const, content: fullUserPrompt },
            ], {
              model,
              thinking: 'disabled' as const,
              temperature,
            });

            let fullText = '';
            for await (const chunk of llmStream) {
              if (isStreamClosed) break;
              if (chunk.content) {
                const text = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
                fullText += text;
                if (!safeEnqueue(controller, encoder, `data: ${JSON.stringify({
                  type: 'content',
                  content: text,
                  sceneIndex: sceneIdx,
                  subShotIndex: null,
                })}\n\n`, 'content chunk')) {
                  isStreamClosed = true;
                  break;
                }
              }
            }

            if (isStreamClosed) {
              break;
            }

            let cleanedText = fullText;
            cleanedText = cleanedText.replace(/<think[\s\S]*?<\/think>/gi, '').replace(/<thinking[\s\S]*?<\/thinking>/gi, '').trim();

            const shotData = extractJsonObject<{ videoPrompts: any[] }>(cleanedText, ['videoPrompts']);
            const shotPrompts = shotData?.videoPrompts || [];

            // 无论AI返回多少子镜头，我们都强制按照对白数量生成完整的子镜头序列
            console.log(`[video-prompts] 场景${sceneIdx}共${dialogueCount}句对白，需要${expectedShotCount}个子镜头，AI返回${shotPrompts.length}个`);
            
            // 清空AI返回的子镜头，我们将完全重新生成
            allSceneSubShots.length = 0;
            
            // 根据对白数量严格生成子镜头，确保所有对白都被覆盖
            for (let sIdx = 0; sIdx < expectedShotCount; sIdx++) {
              const diStart = sIdx * 2;
              const diEnd = Math.min(diStart + 2, dialogueCount);
              const coveredDialogues = dialogueCount > 0 ? sceneDialogues.slice(diStart, diEnd) : [];
              
              const dialogueRangeStr = dialogueCount === 0 
                ? '无对白' 
                : (diEnd - diStart === 1 ? `第${diStart + 1}句` : `第${diStart + 1}句-第${diEnd}句`);
              
              // 尝试从AI返回的子镜头中获取对应的数据
              let aiShotData = null;
              if (shotPrompts.length > 0) {
                // 优先找对应subShotIndex的，找不到就按顺序取
                aiShotData = shotPrompts.find(sp => sp.subShotIndex === sIdx + 1) || shotPrompts[sIdx] || null;
              }
              
              const dialogueText = coveredDialogues.map(d => `${d.character}：「${d.line}」`).join('；');
              const promptText = coveredDialogues.map(d => `${d.character}说「${d.line}」`).join('；');
              
              // 使用AI数据或自动生成
              const newShot = {
                id: aiShotData?.id || `vid_ch${chapterIndex + 1}_s${sceneIdx}_${sIdx + 1}`,
                sceneIndex: sceneIdx,
                subShotIndex: sIdx + 1,
                sceneTitle: aiShotData?.sceneTitle || scene.sceneTitle || scene.title || '',
                dialogueRange: aiShotData?.dialogueRange && !aiShotData.dialogueRange.includes('X') 
                  ? aiShotData.dialogueRange 
                  : `覆盖的对白：${dialogueRangeStr}`,
                description: aiShotData?.description || (coveredDialogues.length > 0 ? `${coveredDialogues[0].character}与对手对话` : '场景氛围'),
                startFrame: aiShotData?.startFrame || '场景起始画面',
                cameraMovement: aiShotData?.cameraMovement || (coveredDialogues.length > 0 ? '正反打切换' : '平稳拍摄'),
                action: aiShotData?.action || (coveredDialogues.length > 0 ? '角色对话交流' : '场景展示'),
                endFrame: aiShotData?.endFrame || '自然结束',
                duration: aiShotData?.duration || '6秒',
                prompt: (aiShotData?.prompt || '') + (coveredDialogues.length > 0 
                  ? (aiShotData?.prompt && !aiShotData.prompt.includes(coveredDialogues[0]?.line) 
                    ? `。${promptText}，描述角色表情和肢体语言` 
                    : '') 
                  : ''),
                style: aiShotData?.style || '写实风格',
                transition: aiShotData?.transition || '自然衔接',
                dialogues: sceneDialogues,
                // 额外存储对白范围供前端显示
                coveredDialogues: coveredDialogues
              };
              
              // 如果AI没有提供有效的prompt，使用自动生成的
              if (!newShot.prompt || newShot.prompt.trim().length < 10) {
                newShot.prompt = coveredDialogues.length > 0 
                  ? `${promptText}，描述角色表情、口型变化和肢体语言，镜头适当切换` 
                  : `${scene.sceneTitle || '场景'}，环境氛围展示`;
              }
              
              allSceneSubShots.push(newShot);
              newlyGeneratedPrompts.push(newShot);
            }
            
            console.log(`[video-prompts] 场景${sceneIdx}生成完成，共${allSceneSubShots.length}个子镜头，覆盖${dialogueCount}句对白`);

            if (allSceneSubShots.length > 0) {
              try {
                await saveVideoPromptToDb(scriptId, chapterIndex, allSceneSubShots, sceneIdx);
                console.log(`[video-prompts] 场景${sceneIdx}保存成功(${allSceneSubShots.length}/${expectedShotCount}个子镜头)`);
              } catch (saveError) {
                console.error(`[video-prompts] 场景${sceneIdx}保存失败:`, saveError);
              }

              if (!safeEnqueue(controller, encoder, `data: ${JSON.stringify({
                type: 'scene_complete',
                sceneIndex: sceneIdx,
                prompts: allSceneSubShots,
                progress: i + 1,
                total: scenesToGenerate.length,
              })}\n\n`, 'scene_complete')) {
                isStreamClosed = true;
              }
            } else {
              console.warn(`[video-prompts] 场景${sceneIdx}全部子镜头解析失败`);
              if (!safeEnqueue(controller, encoder, `data: ${JSON.stringify({
                type: 'scene_skip',
                sceneIndex: sceneIdx,
                reason: 'AI输出解析失败',
                progress: i + 1,
                total: scenesToGenerate.length,
              })}\n\n`, 'scene_skip')) {
                isStreamClosed = true;
              }
            }

            // 发送进度更新
            const percent = Math.round(((i + 1) / scenesToGenerate.length) * 100);
            if (!safeEnqueue(controller, encoder, `data: ${JSON.stringify({
              type: 'progress',
              completed: i + 1,
              total: scenesToGenerate.length,
              percent,
            })}\n\n`, 'progress')) {
              isStreamClosed = true;
            }
          }

          if (!isStreamClosed) {
            safeEnqueue(controller, encoder, `data: ${JSON.stringify({
              type: 'complete',
              videoPrompts: newlyGeneratedPrompts,
              generated: scenesToGenerate.length,
              total: totalScenes,
            })}\n\n`, 'complete');
          }
          safeClose(controller);
        } catch (error: unknown) {
          console.error('[video-prompts] 生成错误:', error);
          if (!isStreamClosed) {
            safeEnqueue(
              controller,
              encoder,
              `data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : '未知错误', savedPrompts: newlyGeneratedPrompts.length })}\n\n`,
              'error'
            );
          }
          safeClose(controller);
        }
      },

      cancel() {
        console.log('[video-prompts] 客户端断开连接');
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : '服务器错误';
    console.error('[video-prompts] API错误:', error);
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

// 无场景数据时，使用原始文本模式
async function generateSingleBatch(
  request: NextRequest,
  script: any,
  chapterIndex: number,
  rawText: string,
  client: any,
  model: string,
  temperature: number,
) {
  const scriptId = script.id;
  const chapter = (Array.isArray(script.chapters) ? script.chapters : [])[chapterIndex];

  const systemPrompt = await getVideoSystemPrompt();

  const userPrompt = `请为以下剧本内容生成AI视频提示词。

章节：${chapter?.chapterTitle || chapter?.title || `第${chapterIndex + 1}章`}

【剧本内容】
${rawText.substring(0, 3000)}

请生成5-10个视频提示词。`;

  const llmStream = client.stream([
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ], { model, thinking: 'disabled' as const, temperature });

  const encoder = new TextEncoder();
  let fullText = '';
  let isStreamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of llmStream) {
          if (isStreamClosed) break;
          if (chunk.content) {
            const text = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
            fullText += text;
            if (!safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: 'content', content: text })}\n\n`, 'content chunk')) {
              isStreamClosed = true;
              break;
            }
          }
        }

        if (isStreamClosed) { safeClose(controller); return; }

        const videoPromptsData = extractJsonObject<{ videoPrompts: any[] }>(fullText, ['videoPrompts']);
        const videoPrompts = videoPromptsData?.videoPrompts || [];

        try {
          const freshScript = await scriptManager.getScriptById(scriptId);
          if (freshScript) {
            const updatedChapters = Array.isArray(freshScript.chapters) ? [...freshScript.chapters] : [];
            if (chapterIndex >= 0 && chapterIndex < updatedChapters.length) {
              updatedChapters[chapterIndex] = { ...updatedChapters[chapterIndex], videoPrompts };
              await scriptManager.updateScript(scriptId, { chapters: updatedChapters });
            }
          }
        } catch (saveError) {
          console.error('[video-prompts] 保存失败:', saveError);
        }

        safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: 'complete', videoPrompts })}\n\n`, 'complete');
        safeClose(controller);
      } catch (error: unknown) {
        console.error('[video-prompts] 生成错误:', error);
        if (!isStreamClosed) {
          safeEnqueue(controller, encoder, `data: ${JSON.stringify({ type: 'error', error: error instanceof Error ? error.message : '未知错误' })}\n\n`, 'error');
        }
        safeClose(controller);
      }
    },
    cancel() {},
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
