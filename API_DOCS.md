# AI小说创作系统 API 文档

## 基础信息

- **Base URL**: `https://demo.dev.coze.site` (替换为你实际的域名)
- **认证方式**: JWT Bearer Token
- **Content-Type**: `application/json`

---

## 认证接口

### 1. 用户注册

```
POST /api/auth/register
```

**请求体:**
```json
{
  "username": "string",    // 用户名，3-20字符
  "email": "string",       // 邮箱，唯一
  "password": "string"     // 密码，最少6字符
}
```

**响应:**
```json
{
  "success": true,
  "message": "注册成功",
  "data": {
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "nickname": null,
      "memberStatus": "active",
      "memberLevel": "免费用户"
    },
    "accessToken": "jwt_token",
    "refreshToken": "jwt_token"
  }
}
```

---

### 2. 用户登录

```
POST /api/auth/login
```

**请求体:**
```json
{
  "email": "string",
  "password": "string"
}
```

**响应:**
```json
{
  "success": true,
  "message": "登录成功",
  "data": {
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "nickname": "string|null",
      "avatar": "string|null",
      "memberStatus": "active|expired|inactive",
      "memberLevel": "免费用户|VIP会员|SVIP会员",
      "memberExpireAt": "date|null"
    },
    "accessToken": "jwt_token",
    "refreshToken": "jwt_token"
  }
}
```

---

### 3. 刷新Token

```
POST /api/auth/refresh
```

**请求体:**
```json
{
  "refreshToken": "string"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "accessToken": "new_jwt_token",
    "refreshToken": "new_refresh_token"
  }
}
```

---

### 4. 获取当前用户信息

```
GET /api/auth/me
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "nickname": "string|null",
    "avatar": "string|null",
    "memberStatus": "active",
    "memberLevel": "免费用户",
    "memberExpireAt": "date|null",
    "memberFeatures": null,
    "createdAt": "date"
  }
}
```

---

## 会员接口

### 5. 获取会员等级列表

```
GET /api/member/levels
```

**响应:**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "code": "free|vip|svip",
      "name": "免费用户|VIP会员|SVIP会员",
      "description": "string",
      "price": 0,
      "duration": 30,
      "features": ["feature1", "feature2"]
    }
  ]
}
```

---

### 6. 创建会员订单

```
POST /api/member/orders
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**请求体:**
```json
{
  "memberLevelId": "uuid"
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "orderNo": "string",
    "amount": 9900
  }
}
```

---

### 7. 获取会员状态

```
GET /api/member/status
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "isValid": true,
    "levelId": "uuid|null",
    "levelName": "VIP会员|null",
    "expireAt": "date|null",
    "features": ["feature1"]
  }
}
```

---

## 小说库接口（需登录）

### 8. 获取小说列表

```
GET /api/novels?page=1&limit=20
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "string",
        "description": "string",
        "category": "string",
        "genderTarget": "男频|女频",
        "totalChapters": 10,
        "currentChapters": 5,
        "status": "generating|completed|editing",
        "createdAt": "date",
        "updatedAt": "date"
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

---

### 9. 创建小说

```
POST /api/novels
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**请求体:**
```json
{
  "title": "string",
  "description": "string",
  "category": "都市现实",
  "genderTarget": "男频",
  "tone": ["热血", "悬疑"],
  "protagonist": "主角名",
  "totalChapters": 10,
  "idea": {
    "theme": "string",
    "description": "string",
    "concept": "string",
    "protagonistGoal": "string",
    "characters": "string",
    "setting": "string"
  },
  "structure": {
    "mainPlot": "string",
    "emotionalCurve": "string",
    "keyConflicts": "string",
    "keyScenes": "string",
    "keyItems": "string",
    "chapterHooks": ["hook1", "hook2"]
  },
  "chapters": [
    {
      "number": 1,
      "title": "第1章：标题",
      "content": "章节内容..."
    }
  ]
}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "string",
    "createdAt": "date"
  }
}
```

---

### 10. 获取小说详情

```
GET /api/novels/{id}
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**响应:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "string",
    "description": "string",
    "category": "string",
    "genderTarget": "男频",
    "tone": ["热血"],
    "protagonist": "string",
    "totalChapters": 10,
    "currentChapters": 5,
    "status": "generating",
    "idea": {},
    "structure": {},
    "chapters": [],
    "createdAt": "date",
    "updatedAt": "date"
  }
}
```

---

### 11. 更新小说

```
PUT /api/novels/{id}
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**请求体:**
```json
{
  "title": "string",
  "description": "string",
  "chapters": [],
  "status": "completed"
}
```

---

### 12. 删除小说

```
DELETE /api/novels/{id}
```

**Headers:**
```
Authorization: Bearer {accessToken}
```

**响应:**
```json
{
  "success": true,
  "message": "删除成功"
}
```

---

## 错误码

| 错误码 | 说明 |
|--------|------|
| 400 | 参数错误 |
| 401 | 未授权/Token无效 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

---

## 前端接入示例

### JavaScript SDK

```javascript
class NovelAPI {
  constructor(baseURL = '') {
    this.baseURL = baseURL;
    this.accessToken = localStorage.getItem('accessToken');
  }

  // 设置Token
  setToken(token) {
    this.accessToken = token;
    localStorage.setItem('accessToken', token);
  }

  // 清除Token
  clearToken() {
    this.accessToken = null;
    localStorage.removeItem('accessToken');
  }

  // HTTP请求封装
  async request(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    const response = await fetch(`${this.baseURL}${url}`, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '请求失败');
    }

    return data;
  }

  // 认证
  async register(username, email, password) {
    return this.request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, email, password })
    });
  }

  async login(email, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  }

  async getMe() {
    return this.request('/api/auth/me');
  }

  // 会员
  async getMemberLevels() {
    return this.request('/api/member/levels');
  }

  async getMemberStatus() {
    return this.request('/api/member/status');
  }

  // 小说
  async getNovels(page = 1, limit = 20) {
    return this.request(`/api/novels?page=${page}&limit=${limit}`);
  }

  async getNovel(id) {
    return this.request(`/api/novels/${id}`);
  }

  async createNovel(novelData) {
    return this.request('/api/novels', {
      method: 'POST',
      body: JSON.stringify(novelData)
    });
  }

  async updateNovel(id, novelData) {
    return this.request(`/api/novels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(novelData)
    });
  }

  async deleteNovel(id) {
    return this.request(`/api/novels/${id}`, {
      method: 'DELETE'
    });
  }
}

// 使用示例
const api = new NovelAPI('https://demo.dev.coze.site');

// 登录
const loginRes = await api.login('user@example.com', 'password123');
api.setToken(loginRes.data.accessToken);

// 获取用户信息
const user = await api.getMe();

// 创建小说
const novel = await api.createNovel({
  title: '我的小说',
  description: '简介',
  category: '都市现实',
  genderTarget: '男频',
  tone: ['热血'],
  protagonist: '张三',
  totalChapters: 10
});
```

---

## React Hook 示例

```javascript
import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'https://demo.dev.coze.site';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('accessToken'));
  const [loading, setLoading] = useState(true);

  const login = async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('accessToken', data.data.accessToken);
      setToken(data.data.accessToken);
      setUser(data.data.user);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    if (token) {
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) setUser(data.data);
        })
        .catch(() => logout())
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [token]);

  return { user, token, login, logout, loading };
}
```

---

## Python SDK 示例

```python
import requests
import json

class NovelAPIClient:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.token = None

    def set_token(self, token: str):
        self.token = token

    def _headers(self) -> dict:
        headers = {'Content-Type': 'application/json'}
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'
        return headers

    def login(self, email: str, password: str) -> dict:
        response = requests.post(
            f'{self.base_url}/api/auth/login',
            json={'email': email, 'password': password},
            headers=self._headers()
        )
        data = response.json()
        if data.get('success'):
            self.set_token(data['data']['accessToken'])
        return data

    def get_novels(self) -> dict:
        response = requests.get(
            f'{self.base_url}/api/novels',
            headers=self._headers()
        )
        return response.json()

    def create_novel(self, novel_data: dict) -> dict:
        response = requests.post(
            f'{self.base_url}/api/novels',
            json=novel_data,
            headers=self._headers()
        )
        return response.json()

# 使用
client = NovelAPIClient('https://demo.dev.coze.site')
client.login('user@example.com', 'password123')
novels = client.get_novels()
print(novels)
```
