# ClipAI 项目部署指南

## 项目概述

ClipAI 是一个 AI 驱动的图片/视频编辑应用，包含两个仓库：

| 仓库 | 说明 | 技术栈 |
|------|------|--------|
| [alipai](https://github.com/Mzw130/alipai) | App 前端界面 | React Native (Expo) + TypeScript |
| [clipai-api](https://github.com/Mzw130/clipai-api) | 后端 API 服务 | Node.js Fastify + TypeScript + MySQL + Redis |

---

## 一、环境要求

### 通用
- **Node.js** >= 18.0.0
- **npm** >= 8.0.0
- **Git** >= 2.30

### 后端
- **MySQL** 8.0+ (或 Docker)
- **Redis** 7.0+ (或 Docker)
- **Docker & Docker Compose** (可选，推荐)

### 前端
- **Expo CLI** (`npm install -g expo-cli`)
- **iOS**: Xcode 15+ (macOS)
- **Android**: Android Studio + SDK

---

## 二、后端部署 (clipai-api)

### 快速启动（Docker 方式，推荐）

```bash
# 1. 克隆仓库
git clone https://github.com/Mzw130/clipai-api.git
cd clipai-api

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入实际的 API Key 和密钥

# 3. 启动 MySQL + Redis
docker-compose up -d

# 4. 安装依赖
npm install

# 5. 初始化数据库（表结构在 docker-compose 中自动创建）
# 或手动执行:
# docker exec -i clipai-mysql mysql -uclipai -pclipai_pass clipai < src/db/init.sql

# 6. 生成并执行 Drizzle 迁移（可选）
npm run db:generate
npm run db:migrate

# 7. 启动开发服务器
npm run dev

# 服务器启动在 http://localhost:3000
# 健康检查: http://localhost:3000/api/health
```

### 手动启动（无 Docker）

```bash
# 1. 确保 MySQL 和 Redis 已运行
# 2. 手动创建数据库
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS clipai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
mysql -u root -p clipai < src/db/init.sql

# 3. 配置 .env
cp .env.example .env
# 编辑 .env, 填入 MySQL/Redis 连接信息

# 4. 启动
npm install
npm run dev
```

### 生产构建

```bash
npm run build
npm start
```

---

## 三、前端部署 (alipai)

```bash
# 1. 克隆仓库
git clone https://github.com/Mzw130/alipai.git
cd alipai

# 2. 安装依赖
npm install

# 3. 配置 API 地址
# 编辑 src/api/index.ts 中的 API_BASE_URL

# 4. 启动 Expo
npx expo start

# iOS
npx expo start --ios

# Android
npx expo start --android
```

### 配置后端 API 地址

编辑 `src/api/index.ts`:

```typescript
const API_BASE_URL = __DEV__
  ? 'http://localhost:3000/api/v1'     // 开发环境
  : 'https://api.your-domain.com/api/v1';  // 生产环境
```

---

## 四、环境变量说明（后端）

| 变量 | 必填 | 说明 | 默认值 |
|------|------|------|--------|
| `NODE_ENV` | - | 环境: development/production | development |
| `PORT` | - | 服务端口 | 3000 |
| `MYSQL_HOST` | 是 | MySQL 主机 | localhost |
| `MYSQL_PORT` | - | MySQL 端口 | 3306 |
| `MYSQL_USER` | 是 | MySQL 用户 | clipai |
| `MYSQL_PASSWORD` | 是 | MySQL 密码 | - |
| `MYSQL_DATABASE` | 是 | 数据库名 | clipai |
| `REDIS_URL` | 是 | Redis 连接 | redis://localhost:6379 |
| `REPLICATE_API_TOKEN` | 是 | Replicate API Token | - |
| `SD_ENDPOINT` | - | 自建 SD WebUI 地址 | - |
| `OSS_ENDPOINT` | 是 | 对象存储端点 | - |
| `OSS_ACCESS_KEY` | 是 | 对象存储 AK | - |
| `OSS_SECRET_KEY` | 是 | 对象存储 SK | - |
| `OSS_BUCKET` | 是 | 存储桶名称 | clipai |
| `OSS_PUBLIC_URL` | 是 | CDN 公开访问 URL | - |
| `JWT_SECRET` | 是 | JWT 签名密钥 | - |
| `APPLE_SHARED_SECRET` | - | App Store 共享密钥 | - |

---

## 五、验证部署

```bash
# 1. 健康检查
curl http://localhost:3000/api/health

# 2. 发送验证码
curl -X POST http://localhost:3000/api/v1/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "13800138000"}'

# 3. 登录（用控制台输出的验证码）
curl -X POST http://localhost:3000/api/v1/auth/verify \
  -H "Content-Type: application/json" \
  -d '{"phone": "13800138000", "code": "123456"}'

# 4. 获取订阅方案
curl http://localhost:3000/api/v1/plans
```

---

## 六、项目结构

```
clipai-api/
├── src/
│   ├── index.ts              # 服务入口
│   ├── config/index.ts       # 环境配置
│   ├── db/
│   │   ├── schema.ts         # Drizzle ORM 表定义 (10 张表)
│   │   ├── index.ts          # 数据库连接 (MySQL)
│   │   └── init.sql          # MySQL 初始化脚本
│   ├── middleware/
│   │   ├── auth.ts           # JWT 鉴权
│   │   ├── ratelimit.ts      # Redis 限流
│   │   └── validator.ts      # Zod 参数校验
│   ├── routes/
│   │   ├── auth.ts           # 认证 (send-code/verify)
│   │   ├── user.ts           # 用户 (profile/credits)
│   │   ├── ai.ts             # AI 处理 (enhance/status/video)
│   │   ├── materials.ts      # 素材库 CRUD
│   │   ├── payment.ts        # 支付/订阅
│   │   └── content.ts        # 模板/探索
│   ├── services/
│   │   ├── ai/
│   │   │   ├── prompts.ts    # 18 套 AI Prompt 模板
│   │   │   ├── models.ts     # AI 模型封装 (Replicate/SD)
│   │   │   └── pipeline.ts   # 统一 AI Pipeline
│   │   ├── auth.ts           # 验证码登录/注册
│   │   ├── storage.ts        # S3/R2 对象存储
│   │   └── payment.ts        # Apple 票据验证
│   └── utils/
│       ├── response.ts       # 统一响应格式
│       └── errors.ts         # 业务异常
├── docker-compose.yml        # MySQL + Redis
└── .env.example              # 环境变量模板

alipai/
├── App.tsx                   # 应用入口
├── src/
│   ├── api/index.ts          # API 客户端 (含 18 个接口)
│   ├── components/           # 可复用组件
│   ├── screens/              # 页面 (18 个 AI 工具)
│   ├── navigation/           # 导航配置
│   └── theme/                # 主题常量
└── docs/DEVELOPMENT.md       # 开发规范
```
