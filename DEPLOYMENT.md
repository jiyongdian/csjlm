# 创世纪联盟智能写作 - 部署文档

## 目录

- [环境要求](#环境要求)
- [快速开始](#快速开始)
- [环境变量配置](#环境变量配置)
- [数据库配置](#数据库配置)
- [部署方式](#部署方式)
  - [本地开发部署](#本地开发部署)
  - [生产环境部署](#生产环境部署)
  - [Docker部署](#docker部署)
  - [云平台部署](#云平台部署)
- [初始化配置](#初始化配置)
- [常见问题](#常见问题)

## 环境要求

- Node.js >= 18.x
- pnpm >= 8.x (推荐) 或 npm >= 9.x
- 内存 >= 2GB
- 存储空间 >= 1GB

## 快速开始

### 1. 克隆/复制项目

```bash
cd 创世纪联盟智能写作
```

### 2. 安装依赖

```bash
pnpm install
# 或使用 npm
npm install
```

### 3. 配置环境变量

复制环境变量模板并编辑：

```bash
cp .env.example .env.local
# 编辑 .env.local 填入你的配置
```

详细配置说明见下文 [环境变量配置](#环境变量配置)

### 4. 初始化数据库

```bash
# 第一次运行会自动创建 SQLite 数据库
pnpm dev
```

### 5. 启动开发服务器

```bash
pnpm dev
```

访问 http://localhost:5000

## 环境变量配置

完整的环境变量配置：

```env
# ==================== 核心配置 ====================
# JWT密钥（用于生成token，请保持安全，生产环境请修改！）
JWT_SECRET=your-very-secure-secret-key-change-this-in-production

# 服务端口
DEPLOY_RUN_PORT=5000

# 环境模式（development/production）
NODE_ENV=production

# ==================== 数据库配置 ====================
# 数据库类型（sqlite/postgresql）
DB_TYPE=sqlite

# PostgreSQL配置（仅 DB_TYPE=postgresql 时需要）
# PGDATABASE_URL=postgresql://user:pass@host:5432/novel_db

# ==================== AI API配置 ====================
# DeepSeek API配置（推荐）
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_BASE_URL=https://api.deepseek.com/v1

# OpenAI兼容配置
# OPENAI_API_KEY=your-openai-api-key
# OPENAI_BASE_URL=https://api.openai.com/v1
```

### 环境变量说明

| 变量名 | 说明 | 必填 | 默认值 |
|--------|------|------|--------|
| `JWT_SECRET` | JWT签名密钥，生产环境请务必修改 | 是 | - |
| `DEPLOY_RUN_PORT` | 服务运行端口 | 否 | 5000 |
| `NODE_ENV` | 运行环境，生产设为 `production` | 否 | development |
| `DB_TYPE` | 数据库类型，可选 `sqlite` 或 `postgresql` | 是 | sqlite |
| `DEEPSEEK_API_KEY` | DeepSeek API密钥 | 是 | - |
| `DEEPSEEK_BASE_URL` | DeepSeek API地址 | 否 | https://api.deepseek.com/v1 |

## 数据库配置

### SQLite（默认，推荐）

无需额外配置，项目会自动在 `.data/novel_db.sqlite` 创建数据库文件。

### PostgreSQL

如需使用 PostgreSQL：

1. 设置环境变量：
```env
DB_TYPE=postgresql
PGDATABASE_URL=postgresql://username:password@localhost:5432/novel_system
```

2. 确保 PostgreSQL 服务已启动并创建数据库：
```sql
CREATE DATABASE novel_system;
```

## 部署方式

### 本地开发部署

适用于本地开发测试：

```bash
# 1. 安装依赖
pnpm install

# 2. 配置环境变量
cp .env .env.local
# 编辑 .env.local

# 3. 启动开发服务器
pnpm dev
```

访问 http://localhost:5000

### 生产环境部署

#### 方式一：直接部署

```bash
# 1. 安装依赖
pnpm install

# 2. 构建项目
pnpm build

# 3. 启动生产服务器
pnpm start
```

#### 方式二：使用 PM2（推荐用于生产）

安装 PM2：
```bash
npm install -g pm2
```

创建 `ecosystem.config.js`：
```javascript
module.exports = {
  apps: [{
    name: 'novel-system',
    script: 'node_modules/.bin/next',
    args: 'start -p 5000',
    cwd: '/path/to/创世纪联盟智能写作',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss'
  }]
}
```

启动：
```bash
# 创建日志目录
mkdir -p logs

# 启动应用
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs novel-system

# 开机自启动
pm2 startup
pm2 save
```

### Docker部署

创建 `Dockerfile`：
```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# 安装依赖
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# 复制源码并构建
COPY . .
RUN pnpm build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV production

# 复制必要文件
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# 数据持久化目录
RUN mkdir -p .data

EXPOSE 5000

ENV PORT 5000

CMD ["node", "server.js"]
```

创建 `docker-compose.yml`：
```yaml
version: '3.8'
services:
  novel-system:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - JWT_SECRET=your-jwt-secret-here
      - DEEPSEEK_API_KEY=your-api-key-here
    volumes:
      - ./data:/app/.data
    restart: unless-stopped
```

构建并启动：
```bash
docker-compose up -d
```

### 云平台部署

#### Vercel 部署

1. 确保项目有 `vercel.json`：
```json
{
  "buildCommand": "pnpm build",
  "outputDirectory": ".next",
  "framework": "nextjs",
  "devCommand": "pnpm dev",
  "env": {
    "JWT_SECRET": "@jwt-secret",
    "DEEPSEEK_API_KEY": "@deepseek-api-key"
  }
}
```

2. 导入项目到 Vercel
3. 在 Vercel Dashboard 中配置环境变量
4. 部署

**注意**：Vercel Serverless Functions 可能不适合长期运行的 AI 生成任务。

#### 阿里云/腾讯云部署

1. 购买云服务器（推荐 2核4G以上）
2. 按照 [生产环境部署](#生产环境部署) 步骤部署
3. 配置 Nginx 反向代理：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

4. 配置 SSL（使用 Let's Encrypt）

## 初始化配置

### 首次启动配置

1. **注册管理员账号**
   - 访问 `/auth/register`
   - 注册账号后，通过数据库手动设置角色为 `admin`
   - 或使用默认管理员（如已初始化）：`admin@example.com / Admin@123456`

2. **配置会员等级**
   - 登录管理员账号
   - 进入 `/admin/members`
   - 配置会员等级和价格

3. **配置 AI 模型**
   - 进入 `/admin/model-prompts`
   - 检查和调整各模块的提示词
   - 在 `/admin/api-settings` 配置 API

4. **生成邀请码**
   - 在管理后台生成邀请码
   - 用于新用户注册或会员激活

### 数据备份

#### SQLite 备份

```bash
# 备份数据库文件
cp .data/novel_db.sqlite backups/novel_db_$(date +%Y%m%d).sqlite

# 定期备份 cron 示例（每天凌晨2点）
0 2 * * * cp /path/to/.data/novel_db.sqlite /path/to/backups/novel_db_$(date +\%Y\%m\%d).sqlite
```

#### PostgreSQL 备份

```bash
pg_dump -U username novel_system > backup_$(date +%Y%m%d).sql
```

## 常见问题

### Q: 启动时提示端口被占用

A: 修改 `.env` 中的 `DEPLOY_RUN_PORT` 或停止占用端口的进程：
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <进程ID> /F

# Linux/Mac
lsof -ti:5000 | xargs kill -9
```

### Q: AI 生成功能不工作

A: 检查：
1. API Key 是否正确配置
2. API Base URL 是否可访问
3. 账户余额是否充足
4. 网络连接是否正常

### Q: 数据库报错

A:
1. SQLite：检查 `.data` 目录权限
2. PostgreSQL：检查连接字符串和数据库状态
3. 尝试重新初始化：删除 `.data` 目录后重启

### Q: 如何更新项目？

A:
```bash
# 1. 拉取/复制新版本
# 2. 安装依赖
pnpm install
# 3. 构建
pnpm build
# 4. 重启服务
# PM2: pm2 restart novel-system
# 或直接重启进程
```

### Q: 会员到期日期显示异常

A: 使用管理后台的修复功能，或直接重新激活邀请码。

## 技术支持

如有问题，请查看：
- [API文档](./API_DOCS.md)
- [项目说明](./AGENTS.md)
- 日志文件：`.next/dev/next-development.log`
