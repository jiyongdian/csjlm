'use client';

import type { Metadata } from "next";
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AIConfigModal from '@/components/AIConfigModal';
import MatrixRain from '@/components/MatrixRain';

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

export default function Home() {
  const router = useRouter();
  const [showAIConfig, setShowAIConfig] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.success) {
        setUser(data.data);
      }
    } catch (error) {
      console.error('检查登录状态失败:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('auth-storage');
    setUser(null);
    router.push('/auth/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center relative overflow-hidden bg-black">
      {/* Matrix 字符雨背景 */}
      <MatrixRain />
      {/* 半透明遮罩让内容更清晰 */}
      <div className="absolute inset-0 bg-black/40 z-[1]" />

      {/* AI配置按钮 */}
      <button
        onClick={() => setShowAIConfig(true)}
        className="absolute top-4 right-4 z-20 flex items-center gap-2 px-4 py-2 bg-green-500/10 backdrop-blur-xl rounded-full text-green-400 hover:bg-green-500/20 transition-all duration-300 border border-green-500/30"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="font-medium text-sm">API设置</span>
      </button>

      {/* 主容器 */}
      <main className="relative z-10 flex min-h-screen w-full max-w-4xl flex-col items-center justify-center px-6 py-16" style={{ zIndex: 2 }}>
        {/* 中间内容区 */}
        <div className="flex flex-col items-center gap-8 text-center">
          {/* 图标 */}
          <div className="inline-flex items-center justify-center w-28 h-28 bg-gradient-to-br from-green-500/20 to-emerald-500/10 rounded-3xl mb-6 backdrop-blur-xl shadow-[0_0_40px_rgba(0,255,0,0.15)] animate-float border border-green-500/20">
            <svg className="w-14 h-14 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>

          {/* 主标题 */}
          <h1 className="max-w-2xl text-3xl md:text-4xl font-bold leading-tight tracking-tight text-green-400 mb-4" style={{ textShadow: '0 0 20px rgba(0,255,0,0.3), 0 0 40px rgba(0,255,0,0.1)' }}>
            创世纪联盟AI智能体
          </h1>
          <p className="max-w-xl text-green-300/80 text-xs md:text-sm leading-relaxed mb-2">
            智能生成主题创意、结构分析、章节内容，让创作更轻松
          </p>
          <p className="max-w-xl text-amber-300/80 text-xs md:text-sm leading-relaxed mb-2">
            智能剧本创作、分镜图片提示词、分镜视频提示词，一键创作剧本
          </p>
          <p className="max-w-xl text-purple-300/80 text-xs md:text-sm leading-relaxed mb-6">
            智能创作短剧、漫剧带离新手村，走向皇城巅峰
          </p>

          {/* 特性标签 */}
          <div className="flex flex-wrap justify-center gap-3 mb-8">
            <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 backdrop-blur-xl rounded-full border border-green-500/20">
              <span className="text-xl">🎯</span>
              <span className="text-green-300 font-bold text-sm">智能创作</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-green-500/10 backdrop-blur-xl rounded-full border border-green-500/20">
              <span className="text-xl">⚡</span>
              <span className="text-green-300 font-bold text-sm">流式生成</span>
            </div>
          </div>

          {/* 开始创作按钮 */}
          <a
            className="group flex h-16 w-full min-w-[200px] items-center justify-center gap-4 rounded-2xl bg-gradient-to-r from-green-500 to-emerald-600 px-12 text-black font-bold text-lg transition-all duration-300 hover:scale-105 hover:shadow-[0_20px_60px_rgba(0,255,0,0.3)] md:w-auto"
            href="/novel-generator"
          >
            <span className="text-2xl group-hover:scale-110 transition-transform duration-300">🚀</span>
            <span>开始智能创作</span>
          </a>

          {/* 登录入口 */}
          <div className="flex items-center gap-4 mt-4 flex-wrap justify-center">
            {user ? (
              <>
                {user.role === 'admin' && (
                  <Link
                    className="flex items-center gap-2 px-6 py-3 bg-red-500/20 backdrop-blur-xl rounded-xl text-red-400 hover:bg-red-500/30 transition-all duration-300 border border-red-500/30"
                    href="/admin/members"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.149-.894z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="font-medium">管理后台</span>
                  </Link>
                )}
                <Link
                  className="flex items-center gap-2 px-6 py-3 bg-amber-500/10 backdrop-blur-xl rounded-xl text-amber-400 hover:bg-amber-500/20 transition-all duration-300 border border-amber-500/20"
                  href="/scripts"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                  </svg>
                  <span className="font-medium">我的剧本</span>
                </Link>
                <Link
                  className="flex items-center gap-2 px-6 py-3 bg-purple-500/10 backdrop-blur-xl rounded-xl text-purple-400 hover:bg-purple-500/20 transition-all duration-300 border border-purple-500/20"
                  href="/short-dramas"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="font-medium">短剧制作</span>
                </Link>
                <Link
                  className="flex items-center gap-2 px-6 py-3 bg-green-500/10 backdrop-blur-xl rounded-xl text-green-400 hover:bg-green-500/20 transition-all duration-300 border border-green-500/20"
                  href="/my-novels"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                  <span className="font-medium">我的小说</span>
                </Link>
                <Link
                  className="flex items-center gap-2 px-6 py-3 bg-green-500/10 backdrop-blur-xl rounded-xl text-green-400 hover:bg-green-500/20 transition-all duration-300 border border-green-500/20"
                  href="/member"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  <span className="font-medium">会员中心</span>
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-6 py-3 bg-green-500/10 backdrop-blur-xl rounded-xl text-green-400 hover:bg-green-500/20 transition-all duration-300 border border-green-500/20"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="font-medium">退出</span>
                </button>
              </>
            ) : (
              <>
                <a
                  className="flex items-center gap-2 px-6 py-3 bg-green-500/10 backdrop-blur-xl rounded-xl text-green-400 hover:bg-green-500/20 transition-all duration-300 border border-green-500/20"
                  href="/auth/login"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="font-medium">登录 / 注册</span>
                </a>
                <a
                  className="flex items-center gap-2 px-6 py-3 bg-green-500/10 backdrop-blur-xl rounded-xl text-green-400 hover:bg-green-500/20 transition-all duration-300 border border-green-500/20"
                  href="/member"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                  <span className="font-medium">会员中心</span>
                </a>
              </>
            )}
          </div>
        </div>
      </main>

      {/* AI配置弹窗 */}
      {showAIConfig && (
        <AIConfigModal isOpen={showAIConfig} onClose={() => setShowAIConfig(false)} />
      )}
    </div>
  );
}
