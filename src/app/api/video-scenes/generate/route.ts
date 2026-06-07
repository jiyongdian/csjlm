import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { createLLMClient, getModelName, getTemperature } from "@/lib/ai-config";
import { modelPromptManager } from "@/storage/database";
import { videoProjects } from "@/storage/database/videoProjectStore";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const payload = getUserFromToken(authHeader);
    
    if (!payload) {
      return NextResponse.json({ success: false, error: "请先登录" }, { status: 401 });
    }

    const body = await request.json();
    const { sceneId, configId } = body;

    if (!sceneId) {
      return NextResponse.json({ success: false, error: "缺少场景ID" }, { status: 400 });
    }

    let foundProject: any = null;
    let foundScene: any = null;
    
    for (const [_, project] of videoProjects) {
      const scene = project.scenes.find((s: any) => s.id === sceneId);
      if (scene) {
        foundProject = project;
        foundScene = scene;
        break;
      }
    }

    if (!foundProject || !foundScene) {
      return NextResponse.json({ success: false, error: "场景不存在" }, { status: 404 });
    }

    if (foundProject.userId !== payload.userId) {
      return NextResponse.json({ success: false, error: "无权访问" }, { status: 403 });
    }

    if (!foundScene.prompt.trim()) {
      return NextResponse.json({ success: false, error: "请先设置提示词" }, { status: 400 });
    }

    foundScene.status = "generating";
    videoProjects.set(foundProject.id, foundProject);

    const prompts = await modelPromptManager.getByCode("image-prompts-system");
    const systemPrompt = prompts?.systemPrompt || "你是一个专业的AI视频提示词生成专家。";
    
    const userPrompt = `根据以下场景描述生成详细的AI图片生成提示词：

场景描述：${foundScene.prompt}

请生成一个适合AI图片生成的英文提示词，包含画面构图、光线、氛围等细节。`;

    const client = await createLLMClient(configId);
    const model = await getModelName(configId, "deepseek-v4-flash");
    const temperature = await getTemperature(configId, 0.7);

    let fullText = '';
    const llmStream = client.stream([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ], {
      model,
      temperature,
    });

    for await (const chunk of llmStream) {
      if (chunk.content) {
        const text = typeof chunk.content === 'string' ? chunk.content : JSON.stringify(chunk.content);
        fullText += text;
      }
    }

    foundScene.status = "completed";
    foundScene.prompt = fullText.trim() || foundScene.prompt;
    foundScene.imageUrl = `https://picsum.photos/seed/${sceneId}/1920/1080`;
    
    videoProjects.set(foundProject.id, foundProject);

    return NextResponse.json({ 
      success: true, 
      data: { 
        sceneId,
        prompt: foundScene.prompt,
        imageUrl: foundScene.imageUrl,
        status: "completed",
      } 
    });
  } catch (error: any) {
    console.error("生成场景失败:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}