import { NextRequest, NextResponse } from "next/server";
import { getUserFromToken } from "@/lib/auth";
import { getSystemSettings, saveSystemSettings } from "@/lib/system-settings";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const payload = getUserFromToken(authHeader || "");
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const settings = await getSystemSettings();
    return NextResponse.json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    console.error("获取系统设置异常:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const payload = getUserFromToken(authHeader || "");
    if (!payload || payload.role !== "admin") {
      return NextResponse.json({ success: false, error: "无权限" }, { status: 403 });
    }

    const body = await request.json();
    const updated = await saveSystemSettings(body);

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    console.error("更新系统设置异常:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
