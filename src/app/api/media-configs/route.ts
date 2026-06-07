import { NextRequest, NextResponse } from "next/server";
import { aiConfigManager } from "@/storage/database/aiConfigManager";

/** GET /api/media-configs?type=image|video  — 获取系统公用媒体API配置（供前端使用） */
export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type") || "";
    let configs;
    if (type === "image" || type === "video") {
      configs = await aiConfigManager.getSystemConfigsByModelType(type);
    } else {
      configs = await aiConfigManager.getAllMediaConfigs();
    }
    // 不返回 apiKey（安全考虑，前端只需知道有哪些配置，实际 key 由后端使用）
    const safeConfigs = configs.filter(c => c.isActive).map(c => ({
      id: c.id,
      name: c.name,
      provider: c.provider,
      model: c.model,
      apiUrl: c.apiUrl,
      modelType: c.modelType,
      isDefault: c.isDefault,
      hasKey: !!c.apiKey,
    }));
    return NextResponse.json({ success: true, data: safeConfigs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
