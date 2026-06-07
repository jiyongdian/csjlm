import { http } from "./client";

// ========== 类型定义 ==========

export interface NovelListItem {
  id: string;
  title: string;
  description: string;
  category: string;
  genderTarget: string;
  totalChapters: number;
  currentChapters: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminNovelListItem extends NovelListItem {
  ownerName: string;
  ownerEmail: string;
}

export interface NovelListResponse {
  novels: NovelListItem[] | AdminNovelListItem[];
  total: number;
}

// ========== API ==========

export const novelApi = {
  /** 获取当前用户的小说列表 */
  getList: (params: { status?: string; limit?: number }) =>
    http.get<never, NovelListResponse>("/api/novels", { params }),

  /** 获取小说详情 */
  getDetail: (id: string) => http.get<never, any>(`/api/novels/${id}`),

  /** 获取小说详情（兼容旧代码） */
  getById: (id: string) => http.get<never, any>(`/api/novels/${id}`),

  /** 创建小说 */
  create: (data: any) => http.post<never, any>("/api/novels", data),

  /** 更新小说 */
  update: (id: string, data: any) => http.put<never, any>(`/api/novels/${id}`, data),

  /** 删除小说 */
  delete: (id: string) => http.delete<never, boolean>(`/api/novels/${id}`),
};

export const adminNovelApi = {
  /** 获取所有用户的小说列表（管理员） */
  getList: (params: { limit?: number; search?: string }) =>
    http.get<never, NovelListResponse>("/api/admin/novels", { params }),

  /** 获取小说详情（管理员） */
  getDetail: (id: string) => http.get<never, any>(`/api/admin/novels/${id}`),

  /** 获取小说详情（管理员，兼容旧代码） */
  getById: (id: string) => http.get<never, any>(`/api/admin/novels/${id}`),

  /** 更新小说（管理员） */
  update: (id: string, data: any) => http.put<never, any>(`/api/admin/novels/${id}`, data),

  /** 删除小说（管理员） */
  delete: (id: string) => http.delete<never, boolean>(`/api/admin/novels/${id}`),
};
