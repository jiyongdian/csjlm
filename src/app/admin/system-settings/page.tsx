"use client";

import { useState, useEffect, useCallback } from "react";
import { getToken as getAuthToken } from "@/lib/get-token";

interface SystemSettings {
  websiteTitle: string;
  websiteUrl: string;
  mediaSavePath: string;
  mediaWebPath: string;
  novelSavePath: string;
  scriptSavePath: string;
  dramaSavePath: string;
}

export default function AdminSystemSettingsPage() {
  const [settings, setSettings] = useState<SystemSettings>({
    websiteTitle: "创世纪联盟智能写作",
    websiteUrl: "",
    mediaSavePath: "public",
    mediaWebPath: "/media",
    novelSavePath: "novel",
    scriptSavePath: "script",
    dramaSavePath: "works",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const getToken = useCallback(() => getAuthToken() || "", []);

  const fetchSettings = async () => {
    try {
      const token = getToken();
      if (!token) return;

      const res = await fetch("/api/admin/system-settings", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
      }
    } catch (error) {
      console.error("获取系统设置失败:", error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const token = getToken();
      const res = await fetch("/api/admin/system-settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(settings),
      });

      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        setMsg({ type: "success", text: "⚙️ 系统设置已成功保存！" });
      } else {
        setMsg({ type: "error", text: data.error || "保存失败，请检查网络" });
      }
    } catch (error: any) {
      setMsg({ type: "error", text: `保存异常: ${error.message}` });
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h2 className="text-2xl font-bold text-white">⚙️ 系统设置</h2>
        <p className="text-sm text-gray-500 mt-1">配置全站的基础网址与多媒体（图片和视频）的绝对或相对存储路径</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 主要设置表单 */}
        <div className="lg:col-span-2 space-y-6">
          <div className="backdrop-blur-xl rounded-2xl p-6 border border-white/10 space-y-6" style={{ background: "rgba(255,255,255,0.04)" }}>
            
            {/* 提示消息 */}
            {msg && (
              <div className={`p-4 rounded-xl text-sm border ${
                msg.type === "success"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                  : "bg-red-500/15 text-red-400 border-red-500/30"
              }`}>
                {msg.text}
              </div>
            )}

            {/* 0. 网站名称/标题统一设置 */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1.5 flex items-center gap-1.5">
                <span>📝 网站系统标题</span>
                <span className="text-xs text-gray-500 font-normal">（全局统一设置本平台的对外展示名称）</span>
              </label>
              <input
                type="text"
                value={settings.websiteTitle}
                onChange={(e) => setSettings({ ...settings, websiteTitle: e.target.value })}
                placeholder="例如：创世纪联盟智能写作 或 创世纪联盟写作平台"
                className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all text-white bg-white/5 placeholder:text-gray-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1.5">设置该平台的统一名称。可在系统、标题栏以及前端各展示模块自动统一渲染该标题。</p>
            </div>

            {/* 1. 网站访问网址 */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1.5 flex items-center gap-1.5">
                <span>🌐 网站访问网址</span>
                <span className="text-xs text-gray-500 font-normal">（影响前台多媒体图片/视频的完整访问域名路径）</span>
              </label>
              <input
                type="text"
                value={settings.websiteUrl}
                onChange={(e) => setSettings({ ...settings, websiteUrl: e.target.value })}
                placeholder="例如：http://localhost:5000 或 https://youdomain.com"
                className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all text-white bg-white/5 placeholder:text-gray-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1.5">若部署了 CDN 或使用了专属域名，配置此项可自动将前台所有生成的图片和视频路径添加此网址前缀。留空则返回相对路径。</p>
            </div>

            {/* 2. 媒体物理保存根路径 */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1.5 flex items-center gap-1.5">
                <span>📂 多媒体磁盘保存根路径</span>
                <span className="text-xs text-red-400 font-normal">*核心物理路径</span>
              </label>
              <input
                type="text"
                value={settings.mediaSavePath}
                onChange={(e) => setSettings({ ...settings, mediaSavePath: e.target.value })}
                placeholder="填写 相对路径 (如 public ) 或 绝对磁盘路径 (如 F:/media 或 /var/media)"
                className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all text-white bg-white/5 placeholder:text-gray-500 text-sm font-mono"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                决定上传或 AI 生成的图片/视频**真实落盘**的物理文件夹。
                <br />
                • 填 <code className="text-gray-300 font-mono">public</code> ➜ 默认保存在本项目的 <code className="text-gray-300 font-mono">public/media</code> 下（Next.js 原生静态解析）
                <br />
                • 填 物理磁盘绝对路径（如 <code className="text-gray-300 font-mono">F:/media</code>） ➜ 保存至指定的独立磁盘，完美解决系统因 C 盘空间不足或跨服迁移的多媒体资产丢失问题！
              </p>
            </div>

            {/* 3. 媒体前端访问虚拟路径 */}
            <div>
              <label className="block text-sm font-semibold text-gray-200 mb-1.5 flex items-center gap-1.5">
                <span>🔗 媒体前端访问虚拟路径</span>
                <span className="text-xs text-gray-500 font-normal">（关系前台多媒体读取的网络路由映射）</span>
              </label>
              <input
                type="text"
                value={settings.mediaWebPath}
                onChange={(e) => setSettings({ ...settings, mediaWebPath: e.target.value })}
                placeholder="例如 /media 或 http://static.domain.com"
                className="w-full px-4 py-2.5 border border-white/15 rounded-xl focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 outline-none transition-all text-white bg-white/5 placeholder:text-gray-500 text-sm"
              />
              <p className="text-xs text-gray-500 mt-1.5">
                前台浏览器或客户端请求多媒体资产时使用的虚拟网络前缀。
                <br />
                • 默认 <code className="text-gray-300 font-mono">/media</code>
              </p>
            </div>

            {/* 4. 各模块独立保存子目录设置 */}
            <div className="pt-4 border-t border-white/5 space-y-4">
              <h3 className="text-sm font-bold text-purple-400 flex items-center gap-2">
                <span>📂 模块存储子目录隔离设置</span>
                <span className="text-xs text-gray-500 font-normal">（自定义小說、剧本、短剧实体文件在落盘时的分类目录）</span>
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* 小说子目录 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">📚 小说媒体保存子目录</label>
                  <input
                    type="text"
                    value={settings.novelSavePath}
                    onChange={(e) => setSettings({ ...settings, novelSavePath: e.target.value })}
                    placeholder="默认 novel"
                    className="w-full px-3.5 py-2 border border-white/15 rounded-lg focus:border-purple-500 outline-none text-white bg-white/5 text-xs font-mono"
                  />
                </div>

                {/* 剧本子目录 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">🎬 剧本媒体保存子目录</label>
                  <input
                    type="text"
                    value={settings.scriptSavePath}
                    onChange={(e) => setSettings({ ...settings, scriptSavePath: e.target.value })}
                    placeholder="默认 script"
                    className="w-full px-3.5 py-2 border border-white/15 rounded-lg focus:border-purple-500 outline-none text-white bg-white/5 text-xs font-mono"
                  />
                </div>

                {/* 短剧子目录 */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">🎥 短剧媒体保存子目录</label>
                  <input
                    type="text"
                    value={settings.dramaSavePath}
                    onChange={(e) => setSettings({ ...settings, dramaSavePath: e.target.value })}
                    placeholder="默认 works"
                    className="w-full px-3.5 py-2 border border-white/15 rounded-lg focus:border-purple-500 outline-none text-white bg-white/5 text-xs font-mono"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                这些子目录会拼接在“多媒体磁盘保存根路径/media/”之下（如小说文件将物理落盘在: <code className="text-gray-400 font-mono">{settings.mediaSavePath}/media/{settings.novelSavePath}/...</code>）。
              </p>
            </div>

            {/* 保存按钮 */}
            <div className="pt-2 border-t border-white/5 flex justify-end">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-6 py-2.5 bg-gradient-to-r from-violet-600 to-indigo-600 text-white text-sm font-semibold rounded-xl hover:from-violet-500 hover:to-indigo-500 disabled:opacity-50 transition-all shadow-lg shadow-violet-500/20"
              >
                {saving ? "正在保存中..." : "💾 保存设置"}
              </button>
            </div>

          </div>
        </div>

        {/* 侧边说明面板 */}
        <div className="space-y-6">
          <div className="backdrop-blur-xl rounded-2xl p-6 border border-white/10 space-y-4" style={{ background: "rgba(255,255,255,0.02)" }}>
            <h3 className="text-sm font-bold text-purple-300">💡 路径工作机制与映射说明</h3>
            <div className="space-y-3 text-xs text-gray-400 leading-relaxed">
              <p>
                当用户在生成或上传短剧的媒体时，系统根据您的设置组合拼接：
              </p>
              <div className="p-3 bg-black/30 border border-white/5 rounded-xl space-y-2 font-mono">
                <div>
                  <span className="text-amber-400"># 物理落盘路径:</span>
                  <br />
                  <span className="text-gray-300">{settings.mediaSavePath || "public"}</span>
                  <span className="text-gray-500">/media/{settings.dramaSavePath || "works"}/剧名_剧ID/sub_dir/filename</span>
                </div>
                <div className="border-t border-white/5 pt-1.5">
                  <span className="text-green-400"># 数据库与前台访问:</span>
                  <br />
                  <span className="text-gray-500">{settings.websiteUrl || ""}</span>
                  <span className="text-gray-300">{settings.mediaWebPath || "/media"}</span>
                  <span className="text-gray-500">/{settings.dramaSavePath || "works"}/剧名_剧ID/sub_dir/filename</span>
                </div>
              </div>
              <p className="text-gray-500">
                <strong>温馨提示</strong>：
                如果您将保存根路径修改为外部磁盘，请确保 Node.js 进程对此磁盘具有完全的读写写入权限。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
