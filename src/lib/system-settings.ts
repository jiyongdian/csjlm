import fs from "fs/promises";
import path from "path";

export interface SystemSettings {
  websiteTitle: string;     // 网站统一标题名称
  websiteUrl: string;       // 网站访问域名/网址，例如 http://localhost:5000
  mediaSavePath: string;    // 物理保存根路径，例如 F:/media 或 public
  mediaWebPath: string;     // 媒体虚拟访问路径，例如 /media 或 http://cdn.com/media
  novelSavePath: string;    // 小说媒体保存子目录（例如 novel）
  scriptSavePath: string;   // 剧本媒体保存子目录（例如 script）
  dramaSavePath: string;    // 短剧媒体保存子目录（例如 works）
}

const SETTINGS_FILE = path.join(process.cwd(), "storage", "system-settings.json");

const defaultSettings: SystemSettings = {
  websiteTitle: "创世纪联盟智能写作",
  websiteUrl: "",
  mediaSavePath: "public",
  mediaWebPath: "/media",
  novelSavePath: "novel",
  scriptSavePath: "script",
  dramaSavePath: "works",
};

export async function getSystemSettings(): Promise<SystemSettings> {
  try {
    const data = await fs.readFile(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(data);
    return {
      ...defaultSettings,
      ...parsed,
    };
  } catch (error) {
    // 确保 storage 目录存在并写入默认值
    try {
      await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
      await fs.writeFile(SETTINGS_FILE, JSON.stringify(defaultSettings, null, 2), "utf-8");
    } catch (e) {
      console.error("写入默认系统设置失败:", e);
    }
    return defaultSettings;
  }
}

export async function saveSystemSettings(settings: Partial<SystemSettings>): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const updated = {
    ...current,
    ...settings,
  };
  await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
  await fs.writeFile(SETTINGS_FILE, JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export async function deleteLocalFileByUrl(url: string | null | undefined) {
  if (!url) return;
  try {
    const settings = await getSystemSettings();
    const baseSavePath = settings.mediaSavePath || "public";
    const mediaWebPath = settings.mediaWebPath || "/media";
    const websiteUrl = settings.websiteUrl ? settings.websiteUrl.replace(/\/$/, "") : "";

    // 1. 如果 url 包含了 websiteUrl，去掉前缀
    let cleanUrl = url;
    if (websiteUrl && cleanUrl.startsWith(websiteUrl)) {
      cleanUrl = cleanUrl.slice(websiteUrl.length);
    }

    // 2. 检查是否是以 mediaWebPath 开头
    if (cleanUrl.startsWith(mediaWebPath)) {
      // 获取相对于 mediaWebPath 后的相对路径
      const subPath = cleanUrl.slice(mediaWebPath.length); // e.g. /works/裂印之怒_drama_.../images/...
      
      // 拼装实际磁盘的相对路径
      const relativeSavePath = path.join("media", subPath);

      // 拼装绝对物理保存路径
      const targetPath = path.join(
        path.isAbsolute(baseSavePath) ? baseSavePath : path.join(process.cwd(), baseSavePath),
        relativeSavePath
      );

      // 检查文件是否存在并物理删除
      await fs.unlink(targetPath);
      console.log(`[File Delete] 物理删除文件成功: ${targetPath}`);
    }
  } catch (error: any) {
    console.warn(`[File Delete] 物理删除文件失败 (可能不存在或无权限): ${url}`, error.message);
  }
}
