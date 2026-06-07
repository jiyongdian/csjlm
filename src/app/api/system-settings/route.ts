import { NextRequest, NextResponse } from "next/server";
import { getSystemSettings } from "@/lib/system-settings";

export async function GET() {
  try {
    const settings = await getSystemSettings();
    return NextResponse.json({
      success: true,
      data: {
        websiteTitle: settings.websiteTitle || "创世纪联盟智能写作",
        websiteUrl: settings.websiteUrl,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
