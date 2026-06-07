import { NextRequest } from 'next/server';
import { getModelName, getTemperature, getRawAIConfig } from '@/lib/ai-config';
import { extractJsonObject } from '@/lib/json-parser';
import { modelPromptManager } from '@/storage/database';
import { scriptManager } from '@/storage/database/scriptManager';
import { novelManager } from '@/storage/database/novelManager';

export const maxDuration = 300;

async function getScriptSystemPrompt(customPromptEnabled?: boolean, customSystemPrompt?: string): Promise<string> {
  const forcedRules = `
【强制执行指令——以下规则优先级最高，任何情况下不可违反】
- 严格遵守下面的【输出格式】JSON结构
- scenes数组的场景数量由您根据小说情节完整改编的需要自主决定，确保故事有头有尾、节奏完美
- 每个场景的sceneIndex必须按顺序递增
- 严格只输出JSON，不要任何解释、前言或markdown标记`;

  const outputFormat = `
## 输出格式要求
严格输出合法JSON，不要输出任何其他文字：
{
  "scenes": [
    {
      "sceneIndex": 0,
      "sceneTitle": "场景标题（格式：内外景-地点-时间，如：内景-出租屋-傍晚）",
      "description": "场景环境描述（氛围、光线、陈设、声音等，至少50字）",
      "actions": "角色动作描述（具体、可视化的肢体动作和表情，至少30字）",
      "dialogues": [
        {"character": "角色名", "line": "台词内容"}
      ],
      "stageDirections": "镜头/舞台指示（景别、运镜方式、转场建议）"
    }
  ]
}

## 注意事项
- sceneIndex递增
- 无对白的场景dialogues设为空数组[]
- 角色名必须与原文一致
- sceneTitle格式统一：内外景-地点-时间
- 只输出JSON，不要输出markdown代码块标记或其他说明文字`;

  if (customPromptEnabled && customSystemPrompt && customSystemPrompt.trim().length > 10) {
    return customSystemPrompt;
  }

  try {
    const dbPrompt = await modelPromptManager.getPrompt('script-generate-system');
    if (dbPrompt && dbPrompt.systemPrompt && dbPrompt.systemPrompt.trim().length > 50) {
      return dbPrompt.systemPrompt;
    }
  } catch {}
  return forcedRules + '\n\n' + `你是一位资深影视剧本编剧，擅长将小说章节精准转化为专业影视剧本场景序列。你深知"可视化"是剧本的核心——所有情绪、冲突、关系必须通过可见的画面和可听的对白呈现，而非文字叙述。

## 场景划分原则
1. **时空转换**即换场景：地点变化、时间跳跃、内外景切换都必须新开场景
2. **焦点转移**即换场景：主要角色变化、叙事视角切换应拆分场景
3. **情绪转折**可换场景：情感基调发生显著变化时
4. **对白场景**：一段完整对话（含动作穿插）为一个场景
5. **动作场景**：一个连续动作段落为一个场景

## 各字段写作要求

### description（场景环境描述）— 至少50字
- 必须包含：时辰/光线 + 地点陈设 + 环境氛围 + 至少一个声音或气味细节
- 示例："傍晚，出租屋内光线昏暗，地板堆满外卖盒。窗外传来楼道里的争吵声，空气里混着廉价方便面的味道。"
- ❌ 禁止只写"室内，白天"这种干巴巴的描述

### actions（角色动作描述）— 至少30字
- 必须是具体、可视化的肢体动作和微表情，不能写心理活动
- 示例："她放下手机，沉默片刻，走到窗边背对镜头，手指无意识地摩挲窗框边缘。"
- ❌ 禁止"她很伤心""他心里复杂"等不可视化的情绪陈述

### dialogues（对白）
- 台词必须口语化、符合人物性格，有潜台词
- 有对白的场景台词不少于2句；纯动作/环境场景设为空数组[]
- 角色名必须与原文一致，不得改名

### stageDirections（镜头/舞台指示）
- 必须包含景别（特写/近景/中景/全景/远景）+ 运镜（推/拉/摇/跟/手持/固定）
- 示例："近景跟拍，镜头随她移动，结尾定格在手指摩挲窗框的特写。"

### sceneTitle（场景标题）— 格式严格统一：内外景-地点-时间
- ✅ 示例："内景-出租屋-傍晚" "外景-街头-深夜" "内景-办公室-清晨"
- ❌ 禁止：只写地点不写时间，或格式不统一` + outputFormat;
}

// 每批最多生成的场景数（设为30以确保通常单章在单次完整批次内一口气生成完毕，保障剧情的完美连贯度）
const SCENES_PER_BATCH = 30;

// 安全地将数据推送到流
function safeEnqueue(controller: ReadableStreamDefaultController, data: string, errorContext: string): boolean {
  try {
    if (controller.desiredSize === null) {
      console.warn(`[generate] 流已关闭，跳过推送: ${errorContext}`);
      return false;
    }
    controller.enqueue(new TextEncoder().encode(data));
    return true;
  } catch (e) {
    console.warn(`[generate] 流推送失败: ${errorContext}`, e);
    return false;
  }
}

// 安全关闭流
function safeClose(controller: ReadableStreamDefaultController) {
  try {
    controller.close();
  } catch (e) {
    // 流可能已经关闭，忽略
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { novelId, startChapter, endChapter, configId, chapterIndex, customPromptEnabled, customSystemPrompt } = body;

  if (!novelId) {
    return new Response(JSON.stringify({ error: '缺少小说ID' }), { status: 400 });
  }

  const novel = await novelManager.getById(novelId);
  if (!novel) {
    return new Response(JSON.stringify({ error: '小说不存在' }), { status: 404 });
  }

  // 解析小说结构获取章节数，用于确定默认范围
  const structure = typeof novel.structure === 'string' ? JSON.parse(novel.structure) : novel.structure;
  const idea = typeof novel.idea === 'string' ? JSON.parse(novel.idea) : novel.idea;
  
  // 解析小说已生成的章节内容，获取真实标题
  const novelChapters = Array.isArray(novel.chapters) ? novel.chapters : [];

  // 构建章节信息列表：优先使用 structure.chapters，否则从小说已有章节 + chapterHooks 推导
  let chaptersInfo: Array<{ title: string; summary?: string; keyEvents?: string }> = [];
  if (structure?.chapters && Array.isArray(structure.chapters) && structure.chapters.length > 0) {
    chaptersInfo = structure.chapters.map((ch: any, i: number) => ({
      title: novelChapters[i]?.title || ch.title || `第${i + 1}章`,
      summary: ch.summary || novelChapters[i]?.content?.substring(0, 200) || '',
      keyEvents: ch.keyEvents || '',
    }));
  } else {
    // 从小说已有章节获取真实标题，补充 chapterHooks 概要
    const chapterCount = novelChapters.length || structure?.chapterHooks?.length || novel.totalChapters || 0;
    for (let i = 0; i < chapterCount; i++) {
      const novelChapter = novelChapters[i];
      const hook = structure?.chapterHooks?.[i] || '';
      chaptersInfo.push({
        title: novelChapter?.title || `第${i + 1}章`,
        summary: novelChapter?.content?.substring(0, 200) || hook || structure?.mainPlot || '',
        keyEvents: hook,
      });
    }
  }

  const totalNovelChapters = chaptersInfo.length || novel.totalChapters || 0;

  // startChapter/endChapter 可选，默认生成所有章节
  const actualStart = startChapter !== undefined ? startChapter : 1;
  const actualEnd = endChapter !== undefined ? endChapter : totalNovelChapters;

  if (totalNovelChapters === 0) {
    return new Response(JSON.stringify({ error: '小说暂无结构分析，请先生成结构分析' }), { status: 400 });
  }

  let script = await scriptManager.getScriptByNovelId(novelId, novel.userId);

  const encoder = new TextEncoder();
  let controllerRef: ReadableStreamDefaultController | null = null;
  let isStreamClosed = false;

  const stream = new ReadableStream({
    async start(controller) {
      controllerRef = controller;

      try {
        // 如果没有剧本记录，先创建
        if (!script) {
          script = await scriptManager.createScript({
            novelId,
            userId: novel.userId,
            status: 'generating',
            chapters: [],
          });
        } else if (script.status !== 'generating') {
          await scriptManager.updateScript(script.id, { status: 'generating' });
        }

        const structureData = structure; // 已在外层解析
        const totalChapters = actualEnd - actualStart + 1;
        let completedCount = 0;

        // 发送开始事件
        if (!isStreamClosed) {
          safeEnqueue(
            controller,
            `data: ${JSON.stringify({
              type: 'start',
              totalChapters,
            })}\n\n`,
            'start'
          );
        }

        // 为每个章节初始化数据
        const currentScript = await scriptManager.getScriptById(script.id);
        const existingChapters = Array.isArray(currentScript?.chapters) ? [...currentScript.chapters] : [];

        for (let i = actualStart; i <= actualEnd; i++) {
          const chapterIndex = i - 1; // 0-based index

          // 确保章节数组有足够的空间
          while (existingChapters.length <= chapterIndex) {
            existingChapters.push({
              chapterIndex: existingChapters.length,
              chapterTitle: chaptersInfo[existingChapters.length]?.title || `第${existingChapters.length + 1}章`,
              screenplay: null,
              imagePrompts: null,
              videoPrompts: null,
            });
          }

          // 获取章节实际文本内容
          const chapterContent = getChapterContent(novel, chapterIndex);
          // 根据章节字数计算目标场景数
          const wordCount = chapterContent ? chapterContent.length : (chaptersInfo[chapterIndex]?.summary?.length || 100) * 5;
          const targetSceneCount = calcTargetSceneCount(wordCount);

          // 断点续生成：只要存在已生成的场景，就说明该章节的剧本已完整，直接跳过生成以保护其创作完整度
          const existingScenes = existingChapters[chapterIndex]?.screenplay?.scenes || [];
          const hasCompleteScreenplay = existingScenes.length > 0;
          
          if (hasCompleteScreenplay) {
            completedCount++;
            if (!isStreamClosed) {
              safeEnqueue(
                controller,
                `data: ${JSON.stringify({
                  type: 'skip',
                  chapterIndex,
                  title: existingChapters[chapterIndex].chapterTitle,
                  sceneCount: existingScenes.length,
                })}\n\n`,
                `skip chapter ${chapterIndex}`
              );
            }
            continue;
          }

          // 构建章节上下文（含实际文本）
          const chapterContext = buildChapterContext(chaptersInfo[chapterIndex], structureData, idea, novel, chapterContent ?? undefined);

          // 分批生成剧本 - 断点续生成：从已有场景数继续
          let accumulatedScenes = [...existingScenes]; // 继承已有场景
          const startSceneIndex = existingScenes.length; // 从断点继续

          if (startSceneIndex > 0 && !isStreamClosed) {
            safeEnqueue(
              controller,
              `data: ${JSON.stringify({
                type: 'resume',
                chapterIndex,
                title: existingChapters[chapterIndex].chapterTitle,
                existingScenes: startSceneIndex,
                targetScenes: targetSceneCount,
              })}\n\n`,
              `resume chapter ${chapterIndex}`
            );
          }

          let screenplay = null;
          let retryCount = 0;
          const maxRetries = 3;

          while (!screenplay && retryCount < maxRetries) {
            try {
              if (retryCount > 0 && !isStreamClosed) {
                safeEnqueue(
                  controller,
                  `data: ${JSON.stringify({
                    type: 'retry',
                    chapterIndex,
                    retry: retryCount,
                  })}\n\n`,
                  `retry chapter ${chapterIndex} attempt ${retryCount}`
                );
              }

              screenplay = await generateScreenplayBatched(
            chapterContext, chaptersInfo[chapterIndex].title, targetSceneCount, configId, controller, isStreamClosed,
            startSceneIndex, accumulatedScenes, script, scriptManager, chapterIndex, chaptersInfo,
            customPromptEnabled, customSystemPrompt
          );

              // 验证生成结果：合并后场景数必须大于已有场景数，且达到目标的80%
              if (!screenplay || !screenplay.scenes || screenplay.scenes.length <= startSceneIndex) {
                console.warn(`[generate] 第${chapterIndex + 1}章生成结果为空，重试 ${retryCount + 1}/${maxRetries}`);
                screenplay = null;
                retryCount++;
                continue;
              }
              
              // 检查是否需要补生：场景数未达到目标的85%，进行补生
              const sceneCount = screenplay.scenes.length;
              if (sceneCount < targetSceneCount * 0.85 && retryCount < maxRetries) {
                console.warn(`[generate] 第${chapterIndex + 1}章场景不足：${sceneCount}/${targetSceneCount}，进行补生`);
                accumulatedScenes = [...screenplay.scenes];
                
                // 补生：从当前场景数继续生成缺失的场景
        const supplementScenes = await generateScreenplayBatched(
          chapterContext, chaptersInfo[chapterIndex].title, targetSceneCount, configId, controller, isStreamClosed,
          sceneCount, accumulatedScenes, script, scriptManager, chapterIndex, chaptersInfo,
          customPromptEnabled, customSystemPrompt
        );
                
                if (supplementScenes && supplementScenes.scenes && supplementScenes.scenes.length > sceneCount) {
                  screenplay = supplementScenes;
                  console.log(`[generate] 第${chapterIndex + 1}章补生成功：${sceneCount} → ${supplementScenes.scenes.length}个场景`);
                } else {
                  console.warn(`[generate] 第${chapterIndex + 1}章补生未增加场景，保持原结果`);
                }
              }
            } catch (genError: any) {
              console.error(`[generate] 第${chapterIndex + 1}章生成失败 (尝试 ${retryCount + 1}/${maxRetries}):`, genError?.message);
              if (genError?.message?.includes('balance') || genError?.message?.includes('403')) {
                if (!isStreamClosed) {
                  safeEnqueue(
                    controller,
                    `data: ${JSON.stringify({
                      type: 'error',
                      chapterIndex,
                      error: 'API余额不足，请检查账户余额',
                    })}\n\n`,
                    `api balance error chapter ${chapterIndex}`
                  );
                }
                break;
              }
              retryCount++;
              screenplay = null;
            }
          }

          // 保存章节到数据库
          if (screenplay && screenplay.scenes.length > 0) {
            existingChapters[chapterIndex] = {
              ...existingChapters[chapterIndex],
              chapterTitle: chaptersInfo[chapterIndex].title,
              screenplay,
            };

            try {
              await scriptManager.updateScript(script.id, { chapters: existingChapters });
              console.log(`[generate] 第${chapterIndex + 1}章剧本保存成功，共${screenplay.scenes.length}个场景`);
            } catch (saveError) {
              console.error(`[generate] 第${chapterIndex + 1}章保存到数据库失败:`, saveError);
            }
          } else {
            existingChapters[chapterIndex] = {
              ...existingChapters[chapterIndex],
              chapterTitle: chaptersInfo[chapterIndex].title,
              screenplay: { scenes: [], status: 'failed' },
            };

            try {
              await scriptManager.updateScript(script.id, { chapters: existingChapters });
            } catch (saveError) {
              console.error(`[generate] 第${chapterIndex + 1}章(失败)保存到数据库失败:`, saveError);
            }

            if (!isStreamClosed) {
              safeEnqueue(
                controller,
                `data: ${JSON.stringify({
                  type: 'error',
                  chapterIndex,
                  error: `第${chapterIndex + 1}章生成失败`,
                })}\n\n`,
                `chapter ${chapterIndex} failed`
              );
            }
          }

          completedCount++;

          // 更新进度
          if (!isStreamClosed) {
            const progress = Math.round((completedCount / totalChapters) * 100);
            safeEnqueue(
              controller,
              `data: ${JSON.stringify({
                type: 'progress',
                chapterIndex,
                title: chaptersInfo[chapterIndex].title,
                completedCount,
                totalChapters,
                progress,
              })}\n\n`,
              `progress chapter ${chapterIndex}`
            );
          }
        }

        // 最终保存
        try {
          await scriptManager.updateScript(script.id, {
            chapters: existingChapters,
            status: 'completed',
          });
          console.log(`[generate] 剧本最终保存成功，共${existingChapters.length}章`);
        } catch (finalSaveError) {
          console.error('[generate] 剧本最终保存失败:', finalSaveError);
        }

        if (!isStreamClosed) {
          safeEnqueue(
            controller,
            `data: ${JSON.stringify({ type: 'complete' })}\n\n`,
            'complete'
          );
        }
      } catch (error: any) {
        console.error('[generate] 剧本生成异常:', error);

        try {
          if (script?.id) {
            await scriptManager.updateScript(script.id, { status: 'failed' });
          }
        } catch (e) {
          console.error('[generate] 更新剧本状态为failed也失败:', e);
        }

        if (!isStreamClosed) {
          safeEnqueue(
            controller,
            `data: ${JSON.stringify({
              type: 'error',
              error: error?.message || '剧本生成失败',
            })}\n\n`,
            'fatal error'
          );
        }
      } finally {
        isStreamClosed = true;
        safeClose(controller);
      }
    },

    cancel() {
      isStreamClosed = true;
      console.log('[generate] 客户端断开连接，流已取消');
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

// 根据字数计算目标场景数量：按照影视/短剧行业标准，每1000字改编为约 5 个场景，最少5个，最多18个，避免凑数导致AI重复演绎
function calcTargetSceneCount(wordCount: number): number {
  const base = Math.round(wordCount / 1000 * 5);
  const target = Math.max(5, Math.min(base, 18));
  return target;
}

// 从小说 chapters JSON 中获取指定章节的正文内容
function getChapterContent(novel: any, chapterIndex: number): string | null {
  const chapters = typeof novel.chapters === 'string' ? JSON.parse(novel.chapters) : novel.chapters;
  if (!Array.isArray(chapters) || chapterIndex >= chapters.length) return null;
  return chapters[chapterIndex]?.content || null;
}

// 构建章节上下文（含实际章节文本内容）
function buildChapterContext(chapterInfo: any, structure: any, idea: any, novel: any, chapterContent?: string): string {
  const context: string[] = [];

  if (novel.title) context.push(`小说标题：${novel.title}`);
  if (novel.description) context.push(`小说简介：${novel.description}`);
  if (novel.category) context.push(`分类：${novel.category}`);
  if (novel.genderTarget) context.push(`目标读者：${novel.genderTarget === 'male' ? '男频' : '女频'}`);

  if (novel.protagonist) context.push(`主角设定：${novel.protagonist}`);
  if (novel.supportingCharacterName) context.push(`配角：${novel.supportingCharacterName}`);

  if (idea?.coreConcept) context.push(`核心概念：${idea.coreConcept}`);
  if (idea?.theme) context.push(`主题：${idea.theme}`);

  if (structure?.mainPlot) context.push(`主线剧情：${structure.mainPlot}`);
  if (structure?.emotionalArc) context.push(`情感弧线：${structure.emotionalArc}`);

  context.push(`\n当前章节：${chapterInfo.title || ''}`);
  if (chapterInfo.summary) context.push(`章节概要：${chapterInfo.summary}`);
  if (chapterInfo.keyEvents) context.push(`关键事件：${chapterInfo.keyEvents}`);
  if (chapterInfo.emotionalBeat) context.push(`情感节奏：${chapterInfo.emotionalBeat}`);
  if (chapterInfo.hook) context.push(`悬念钩子：${chapterInfo.hook}`);

  // 传入章节实际文本内容
  if (chapterContent) {
    context.push(`\n章节正文内容：\n${chapterContent}`);
  }

  return context.join('\n');
}

// 分批生成剧本场景
async function generateScreenplayBatched(
  chapterContext: string,
  chapterTitle: string,
  targetSceneCount: number,
  configId: string | null,
  controller: ReadableStreamDefaultController,
  isStreamClosed: boolean,
  startSceneIndex: number = 0,
  existingScenes: any[] = [],
  script: any,
  scriptManager: any,
  chapterIndex: number,
  chaptersInfo: any[],
  customPromptEnabled?: boolean,
  customSystemPrompt?: string
): Promise<any> {
  const allScenes: any[] = [...existingScenes];
  // 如果有已有场景，从断点开始计算批次
  const remainingScenes = targetSceneCount - startSceneIndex;
  if (remainingScenes <= 0) {
    // 所有场景已生成完毕
    return { scenes: allScenes };
  }
  const totalBatches = Math.ceil(remainingScenes / SCENES_PER_BATCH);

  // 发送批次开始事件
  if (!isStreamClosed) {
    safeEnqueue(
      controller,
      `data: ${JSON.stringify({
        type: 'batch_start',
        totalBatches,
        totalScenes: targetSceneCount,
        existingScenes: startSceneIndex,
        scenesPerBatch: SCENES_PER_BATCH,
      })}\n\n`,
      'batch_start'
    );
  }

  for (let batch = 0; batch < totalBatches; batch++) {
    if (isStreamClosed) break;

    const batchStart = startSceneIndex + batch * SCENES_PER_BATCH;
    const batchEnd = Math.min(batchStart + SCENES_PER_BATCH, targetSceneCount);
    const batchSceneCount = batchEnd - batchStart;

    // 发送批次进度（开始生成）
    if (!isStreamClosed) {
      safeEnqueue(
        controller,
        `data: ${JSON.stringify({
          type: 'batch_progress',
          currentBatch: batch + 1,
          totalBatches,
          sceneRange: `${batchStart + 1}-${batchEnd}`,
          status: 'generating',
        })}\n\n`,
        `batch_progress ${batch + 1}`
      );
    }

    const batchScenes = await generateScreenplayBatch(
      chapterContext,
      chapterTitle,
      batchSceneCount,
      batchStart, // 起始 sceneIndex
      targetSceneCount, // 总场景数
      batch + 1,
      totalBatches,
      allScenes, // 已有场景（用于上下文衔接）
      configId,
      controller,
      isStreamClosed,
      customPromptEnabled,
      customSystemPrompt
    );

    if (batchScenes && batchScenes.length > 0) {
      allScenes.push(...batchScenes);
      console.log(`[generate] 批次${batch + 1}/${totalBatches}完成，本批${batchScenes.length}个场景，累计${allScenes.length}个`);
      
      // 重新编号场景，确保连续性
      allScenes.forEach((scene: any, index: number) => {
        scene.sceneIndex = index + 1;
      });

      // 逐个发送场景事件，让前端实时看到每个场景
      for (const scene of batchScenes) {
        if (isStreamClosed) break;
        safeEnqueue(
          controller,
          `data: ${JSON.stringify({
            type: 'scene_generated',
            scene: {
              sceneIndex: scene.sceneIndex,
              sceneTitle: scene.sceneTitle || '',
              description: scene.description || '',
              actions: scene.actions || '',
              dialogues: scene.dialogues || [],
              stageDirections: scene.stageDirections || '',
            },
            accumulatedScenes: allScenes.length,
            totalScenes: targetSceneCount,
          })}\n\n`,
          `scene ${scene.sceneIndex}`
        );
      }

      // 每批次完成后立即保存到数据库
      try {
        const currentScript = await scriptManager.getScriptById(script.id);
        const existingChapters = Array.isArray(currentScript?.chapters) ? [...currentScript.chapters] : [];
        
        while (existingChapters.length <= chapterIndex) {
          existingChapters.push({
            chapterIndex: existingChapters.length,
            chapterTitle: chaptersInfo[existingChapters.length]?.title || `第${existingChapters.length + 1}章`,
            screenplay: null,
            imagePrompts: null,
            videoPrompts: null,
          });
        }
        
        existingChapters[chapterIndex] = {
          ...existingChapters[chapterIndex],
          chapterTitle: chaptersInfo[chapterIndex].title,
          screenplay: {
            scenes: [...allScenes],
            status: 'generating'
          },
        };
        
        await scriptManager.updateScript(script.id, { chapters: existingChapters });
        console.log(`[generate] 批次${batch + 1}/${totalBatches}保存成功，已保存${allScenes.length}个场景`);
      } catch (saveError) {
        console.error(`[generate] 批次${batch + 1}/${totalBatches}保存失败:`, saveError);
      }

      // 发送批次完成事件
      if (!isStreamClosed) {
        safeEnqueue(
          controller,
          `data: ${JSON.stringify({
            type: 'batch_progress',
            currentBatch: batch + 1,
            totalBatches,
            sceneRange: `${batchStart + 1}-${batchEnd}`,
            status: 'completed',
            accumulatedScenes: allScenes.length,
            totalScenes: targetSceneCount,
          })}\n\n`,
          `batch_progress ${batch + 1} completed`
        );
      }
    } else {
      console.warn(`[generate] 批次${batch + 1}/${totalBatches}生成失败，跳过`);
    }
  }

  // 检查最后一个场景是否被截断（内容不完整），如果是则移除
  if (allScenes.length > 0) {
    const lastScene = allScenes[allScenes.length - 1];
    const isTrunc = isSceneTruncated(lastScene);
    if (isTrunc) {
      console.warn(`[generate] 最后一个场景疑似截断，移除：场景${lastScene.sceneIndex} ${lastScene.sceneTitle || ''}`);
      allScenes.pop();
      // 移除后重新编号最后一个
      if (allScenes.length > 0) {
        allScenes[allScenes.length - 1].sceneIndex = allScenes.length;
      }
    }
  }

  return { scenes: allScenes, targetSceneCount };
}

// 检测场景是否被截断（AI输出中断导致内容不完整）
function isSceneTruncated(scene: any): boolean {
  // description 或 actions 字段存在但明显过短（不到20字且没有句号结尾）
  const desc = scene.description || '';
  const actions = scene.actions || '';
  const stageDirections = scene.stageDirections || '';
  
  // 所有内容字段都为空 → 肯定被截断
  if (!desc && !actions && !stageDirections && (!scene.dialogues || scene.dialogues.length === 0)) {
    return true;
  }
  
  // description 截断检测：非空但末尾没有标点，且长度异常短
  if (desc && desc.length > 0 && desc.length < 30 && !/[。！？…」』"]$/.test(desc)) {
    return true;
  }
  
  // actions 截断检测：非空但末尾没有标点，且长度异常短
  if (actions && actions.length > 0 && actions.length < 20 && !/[。！？…」』"]$/.test(actions)) {
    return true;
  }
  
  return false;
}

// 生成单批场景
async function generateScreenplayBatch(
  chapterContext: string,
  chapterTitle: string,
  batchSceneCount: number,
  batchStartIndex: number,
  totalSceneCount: number,
  currentBatch: number,
  totalBatches: number,
  previousScenes: any[],
  configId: string | null,
  controller: ReadableStreamDefaultController,
  isStreamClosed: boolean,
  customPromptEnabled?: boolean,
  customSystemPrompt?: string
): Promise<any[]> {
  const model = await getModelName(configId);
  const temperature = await getTemperature(configId);

  const sceneRange = {
    min: Math.max(1, Math.round(batchSceneCount * 0.9)),
    max: Math.round(batchSceneCount * 1.1),
  };

  // 构建前文衔接信息与防重复清单
  let continuityContext = '';
  if (previousScenes.length > 0) {
    const lastScene = previousScenes[previousScenes.length - 1];
    
    // 生成全局已生成场景的简明清单
    const previousSceneSummaryList = previousScenes.map((s: any, idx: number) => 
      `- 场景 ${idx + 1}：${s.sceneTitle || '无标题'}（概要：${(s.actions || '').slice(0, 50)}...）`
    ).join('\n');

    continuityContext = `
## 已生成场景目录清单（⚠️绝对禁止重复以下已发生的任何场景与情节）
${previousSceneSummaryList}

## 上一批次最后一幕的详细衔接细节（您必须紧接此处继续创作新情节，切勿倒退）
- 场景标题：${lastScene.sceneTitle || ''}
- 场景描述：${lastScene.description || ''}
- 动作：${lastScene.actions || ''}
- 对白：${(lastScene.dialogues || []).map((d: any) => `${d.character}：${d.line}`).join('；') || '无'}
- 舞台指示：${lastScene.stageDirections || ''}

请从上述最末场景无缝自然过渡，严禁重复已生成目录清单中的任意场景及对白剧情。`;
  }

  const systemPrompt = await getScriptSystemPrompt(customPromptEnabled, customSystemPrompt);

  const progressPctStart = Math.round(((currentBatch - 1) / totalBatches) * 100);
  const progressPctEnd = Math.round((currentBatch / totalBatches) * 100);

  // 将所有动态上下文和防重复规则整合到 userPrompt 中，让 systemPrompt 保持对数据库模板的绝对纯净调用
  const userPrompt = `请将以下小说章节转化为影视剧本。

【当前章节标题】${chapterTitle}
【当前改编进度】本次改编对应章节内容的 ${progressPctStart}% - ${progressPctEnd}% 左右
【起始场景索引】sceneIndex 从 ${batchStartIndex} 开始

${continuityContext}

【待改编小说正文】
${chapterContext}

【生成指令】
1. 请完全根据【系统提示词 (System Prompt)】的角色设定、写作原则和 JSON 格式要求进行剧本创作。
2. 场景数量由您根据剧情和节奏自主决定（推荐生成 8-15 个高质量场景，不做硬性约束，质量第一）。
3. 必须确保故事时间线向后推进，严禁改编已处于前文部分的已生成情节。
4. 严格遵循输出格式，只返回合法纯 JSON，且绝不能包含 markdown 代码块标记（如 \`\`\`json）或任何前后解释文字。`;

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];

  let fullText = '';

  try {
    const { apiUrl, apiKey } = await getRawAIConfig(configId);
    const resp = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, stream: true, temperature, max_tokens: 8192 }),
    });
    if (!resp.ok || !resp.body) throw new Error(`AI 接口错误: ${resp.status}`);
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    outer: while (true) {
      if (isStreamClosed) break;
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') break outer;
        try {
          const j = JSON.parse(raw);
          const content = j.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            if (!isStreamClosed) {
              safeEnqueue(
                controller,
                `data: ${JSON.stringify({ type: 'content', chapterTitle, content })}\n\n`,
                `content for ${chapterTitle}`
              );
            }
          }
        } catch {}
      }
    }
  } catch (streamError: any) {
    console.error('[generate] 流式生成错误:', streamError?.message);
    if (!fullText) throw streamError;
  }

  if (!fullText.trim()) {
    console.warn('[generate] AI返回内容为空');
    return [];
  }

  console.log(`[generate] AI返回内容长度: ${fullText.length}, 前200字: ${fullText.substring(0, 200)}`);

  // 预处理：移除AI可能添加的思考标签
  let cleanedText = fullText;
  cleanedText = cleanedText.replace(/<think[\s\S]*?<\/think>/gi, '');
  cleanedText = cleanedText.replace(/<thinking[\s\S]*?<\/thinking>/gi, '');
  cleanedText = cleanedText.trim();

  // 解析JSON
  try {
    const parsed = extractJsonObject<any>(cleanedText, ['scenes']);

    if (!parsed) {
      console.warn('[generate] 批次JSON解析返回null, 原文前500字: ' + cleanedText.substring(0, 500));
      return extractScenesFromText(cleanedText);
    }

    let scenes: any[] = [];

    if (parsed.scenes && Array.isArray(parsed.scenes)) {
      scenes = parsed.scenes;
    } else if (parsed.screenplay?.scenes) {
      scenes = parsed.screenplay.scenes;
    } else {
      console.warn('[generate] 批次JSON解析成功但无scenes字段:', Object.keys(parsed));
      return extractScenesFromText(cleanedText);
    }

    // 兼容处理：sceneTitle / title 统一
    scenes = scenes.map((scene: any) => {
      const normalized = {
        ...scene,
        sceneTitle: scene.sceneTitle || scene.title || '',
      };
      delete normalized.title;
      return normalized;
    });

    return scenes;
  } catch (parseError) {
    console.warn('[generate] 批次JSON解析失败:', parseError);
    return extractScenesFromText(cleanedText);
  }
}

// 从纯文本中提取场景信息（JSON解析失败时的兜底方案）
function extractScenesFromText(text: string): any[] {
  const scenes: any[] = [];
  const patterns = [
    /(?:场景|Scene)\s*(\d+)[：:.\s]+([^\n]+)/gi,
    /(?:【场景|【Scene)(\d+)[】]\s*([^\n]+)/gi,
    /(\d+)[.、．]\s*([^\n]{2,40})/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const idx = parseInt(match[1]);
      if (idx >= 1 && idx <= 200) {
        scenes.push({
          sceneIndex: idx,
          sceneTitle: match[2].trim(),
          description: '',
          actions: '',
          dialogues: [],
          stageDirections: '',
        });
      }
    }
    if (scenes.length > 0) break;
  }

  return scenes;
}
