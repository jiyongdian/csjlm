import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { aiConfigManager } from "@/storage/database/aiConfigManager";

/**
 * POST /api/admin/media-configs/[id]/test
 * 测试媒体API配置连通性，对图片配置发起最小化生成请求
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const payload = getUserFromToken(request.headers.get("Authorization") || "");
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const { id } = await params;
    const cfg = await aiConfigManager.getConfigByIdAdmin(id);
    if (!cfg) return NextResponse.json({ error: "配置不存在" }, { status: 404 });
    if (!cfg.apiKey) return NextResponse.json({ success: false, error: "未配置 API Key" });

    const baseUrl = (cfg.apiUrl || "").replace(/\/$/, "");

    // ── Step 1: try GET /models (lightweight connectivity check) ──
    try {
      const modelsUrl = `${baseUrl}/models`;
      const modelsRes = await fetch(modelsUrl, {
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(8000),
      });
      if (modelsRes.status === 401 || modelsRes.status === 403) {
        return NextResponse.json({ success: false, error: `API Key 无效 (${modelsRes.status})` });
      }
      if (modelsRes.ok) {
        return NextResponse.json({ success: true, message: `连接成功 (GET /models → ${modelsRes.status})` });
      }
    } catch (_) {
      // /models not supported, fall through to image test
    }

    // ── Step 2: for image configs, send a minimal generation ──
    if (cfg.modelType === "image") {

      // Gemini generateContent API (gemini-banana 本地代理 / gemini-image 直连)
      if (cfg.provider === "gemini-banana" || cfg.provider === "gemini-image") {
        const rawBase = baseUrl;
        const geminiBase = cfg.provider === "gemini-banana"
          ? (rawBase.endsWith("/v1beta") ? rawBase : `${rawBase}/v1beta`)
          : rawBase;
        const geminiUrl = `${geminiBase}/models/${cfg.model}:generateContent`;
        const geminiBody = {
          contents: [{ role: "user", parts: [{ text: "a red circle, simple test image" }] }],
          generationConfig: {
            responseModalities: ["IMAGE", "TEXT"],
            temperature: 1.0,
            topP: 0.95,
            maxOutputTokens: 512,
            imageConfig: { aspectRatio: "1:1" },
          },
        };
        const gRes = await fetch(geminiUrl, {
          method: "POST",
          headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
          signal: AbortSignal.timeout(60000),
        });
        if (gRes.status === 401 || gRes.status === 403) {
          return NextResponse.json({ success: false, error: `API Key 无效 (${gRes.status})` });
        }
        if (gRes.ok) {
          return NextResponse.json({ success: true, message: `Gemini 图片API 连接正常 (${cfg.provider})` });
        }
        const gErr = await gRes.json().catch(() => ({}));
        return NextResponse.json({
          success: false,
          error: gErr?.error?.message || gErr?.message || `请求失败 (${gRes.status})`,
        });
      }

      const imgUrl = `${baseUrl}/images/generations`;
      let body: Record<string, any> = {
        model: cfg.model,
        prompt: "a red circle",
        n: 1,
        size: "256x256",
        response_format: "url",
      };

      // SiliconFlow / flux style
      if (cfg.provider === "siliconflow") {
        body = { model: cfg.model, prompt: "a red circle", image_size: "256x256", num_inference_steps: 1 };
      }
      // Stability AI
      if (cfg.provider === "stability-ai") {
        body = { text_prompts: [{ text: "a red circle" }], cfg_scale: 7, width: 256, height: 256, samples: 1 };
      }

      const imgRes = await fetch(imgUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      if (imgRes.status === 401 || imgRes.status === 403) {
        return NextResponse.json({ success: false, error: `API Key 无效 (${imgRes.status})` });
      }
      if (imgRes.ok) {
        const data = await imgRes.json().catch(() => ({}));
        const imgUrlResult = data?.data?.[0]?.url || data?.images?.[0]?.url || data?.artifacts?.[0]?.base64 || null;
        return NextResponse.json({
          success: true,
          message: "图片生成成功！API 连接正常",
          imageUrl: imgUrlResult,
        });
      }
      const errData = await imgRes.json().catch(() => ({}));
      return NextResponse.json({
        success: false,
        error: errData?.error?.message || errData?.message || `请求失败 (${imgRes.status})`,
      });
    }

    // ── Step 3: for video configs, just check if base URL responds ──
    if (cfg.modelType === "video") {
      const pingUrl = `${baseUrl}/video/generations`;
      const pingRes = await fetch(pingUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.model, prompt: "test" }),
        signal: AbortSignal.timeout(10000),
      });
      if (pingRes.status === 401 || pingRes.status === 403) {
        return NextResponse.json({ success: false, error: `API Key 无效 (${pingRes.status})` });
      }
      // 400/422 means auth passed but params wrong — still counts as connected
      if (pingRes.status < 500) {
        return NextResponse.json({ success: true, message: `视频API 连接正常 (${pingRes.status})` });
      }
      return NextResponse.json({ success: false, error: `服务器错误 (${pingRes.status})` });
    }

    return NextResponse.json({ success: false, error: "未知配置类型" });
  } catch (e: any) {
    const isTimeout = e?.name === "TimeoutError" || e?.message?.includes("timeout");
    return NextResponse.json({
      success: false,
      error: isTimeout ? "连接超时，请检查 API URL 是否正确" : (e.message || "测试失败"),
    });
  }
}
