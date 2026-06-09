# ClipAI 数据库文档

## 概述

- **数据库**: MySQL 8.0+
- **ORM**: Drizzle ORM
- **字符集**: utf8mb4 / utf8mb4_unicode_ci
- **引擎**: InnoDB
- **主键策略**: CHAR(36) UUID

---

## 连接信息

| 参数 | 默认值 |
|------|--------|
| Host | localhost |
| Port | 3306 |
| User | clipai |
| Password | clipai_pass |
| Database | clipai |

---

## ER 图

```
┌──────────┐     ┌───────────────┐     ┌──────────┐
│  users   │────→│   tasks       │────→│ materials│
└──────────┘     └───────────────┘     └──────────┘
      │                  │
      ▼                  ▼
┌──────────────┐  ┌──────────────────┐
│subscriptions │  │ prompt_templates │
└──────────────┘  └──────────────────┘

┌──────────┐     ┌──────────────────┐
│  plans   │     │ explore_contents │
└──────────┘     └──────────────────┘

┌───────────┐     ┌───────────────────┐
│ templates │     │ verification_codes│
└───────────┘     └───────────────────┘
```

---

## 表结构

### 1. users — 用户表

| 列名 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| id | CHAR(36) PK | - | UUID |
| phone | VARCHAR(20) UNIQUE | - | 手机号 |
| nickname | VARCHAR(100) | NULL | 昵称 |
| avatar_url | VARCHAR(500) | NULL | 头像 URL |
| role | ENUM('free','pro','admin') | 'free' | 用户角色 |
| credits | INT | 0 | 积分余额 |
| free_daily_used | INT | 0 | 当日已用免费次数 |
| free_daily_date | VARCHAR(10) | NULL | 免费次数日期 |
| pro_expires_at | DATETIME | NULL | Pro 过期时间 |
| status | VARCHAR(20) | 'active' | 账户状态 |
| created_at | DATETIME | NOW() | 创建时间 |
| updated_at | DATETIME | NOW() | 更新时间 |
| last_login_at | DATETIME | NOW() | 最后登录 |

### 2. verification_codes — 验证码表

| 列名 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| phone | VARCHAR(20) | 手机号 |
| code | VARCHAR(10) | 验证码 |
| used | BOOLEAN | 是否已使用 |
| expires_at | DATETIME | 过期时间 |
| created_at | DATETIME | 创建时间 |

### 3. prompt_templates — AI Prompt 模板表

| 列名 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| tool_type | VARCHAR(50) UNIQUE | 工具类型标识 |
| model_name | VARCHAR(100) | 使用的 AI 模型名 |
| base_prompt | TEXT | 正向 Prompt 模板 |
| negative_prompt | TEXT | 负向 Prompt |
| default_params | JSON | 默认参数 |
| max_intensity | INT | 最大强度 |
| is_active | BOOLEAN | 是否启用 |
| replicate_version | VARCHAR(100) | Replicate 模型版本 |
| estimated_seconds | INT | 预估处理时间 |
| credit_cost | INT | 消耗积分 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 4. tasks — AI 任务表

| 列名 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) PK | 任务 UUID |
| user_id | CHAR(36) FK | 用户 ID |
| tool_type | VARCHAR(50) | 工具类型 |
| status | ENUM('pending','processing','completed','failed') | 状态 |
| original_url | VARCHAR(1000) | 原图 URL |
| mask_url | VARCHAR(1000) | 蒙版 URL |
| params | JSON | 处理参数 |
| result_url | VARCHAR(1000) | 结果 URL |
| error_message | TEXT | 错误信息 |
| processing_time_ms | INT | 处理耗时 |
| credits_used | INT | 消耗积分 |
| model_used | VARCHAR(100) | 使用的模型 |
| webhook_url | VARCHAR(500) | 回调地址 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| completed_at | DATETIME | 完成时间 |

### 5. materials — 素材表

| 列名 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| user_id | CHAR(36) FK | 用户 ID |
| type | ENUM('image','video') | 素材类型 |
| url | VARCHAR(1000) | 素材 URL |
| thumbnail_url | VARCHAR(1000) | 缩略图 URL |
| width | INT | 宽度 |
| height | INT | 高度 |
| size_bytes | INT | 文件大小 |
| tool_type | VARCHAR(50) | 来源工具 |
| task_id | CHAR(36) FK | 来源任务 |
| is_favorite | BOOLEAN | 是否收藏 |
| tags | JSON | 标签 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 6. subscriptions — 订阅记录表

| 列名 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| user_id | CHAR(36) FK | 用户 ID |
| plan_id | VARCHAR(50) | 方案 ID |
| status | ENUM('active','expired','cancelled','grace_period') | 状态 |
| original_transaction_id | VARCHAR(200) | Apple 原始交易 ID |
| latest_receipt | MEDIUMTEXT | 最新收据 |
| expires_at | DATETIME | 过期时间 |
| auto_renew | BOOLEAN | 自动续费 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |
| cancelled_at | DATETIME | 取消时间 |

### 7. templates — 内容模板表

| 列名 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| name | VARCHAR(100) | 模板名 |
| description | TEXT | 描述 |
| cover_url | VARCHAR(500) | 封面图 |
| category | VARCHAR(50) | 分类 |
| tool_type | VARCHAR(50) | 关联工具 |
| params | JSON | 预设参数 |
| is_active | BOOLEAN | 是否启用 |
| sort_order | INT | 排序 |

### 8. explore_contents — 探索页内容表

| 列名 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| title | VARCHAR(200) | 标题 |
| description | TEXT | 描述 |
| cover_url | VARCHAR(500) | 封面图 |
| before_url | VARCHAR(500) | 处理前图 |
| after_url | VARCHAR(500) | 处理后图 |
| category | VARCHAR(50) | 分类 |
| tool_type | VARCHAR(50) | 工具类型 |
| user_id | CHAR(36) | 作者 ID |
| likes | INT | 点赞数 |
| is_active | BOOLEAN | 是否启用 |

### 9. plans — 订阅方案表

| 列名 | 类型 | 说明 |
|------|------|------|
| id | CHAR(36) PK | UUID |
| name | VARCHAR(100) | 方案名 |
| product_id | VARCHAR(100) UNIQUE | Apple 产品 ID |
| type | VARCHAR(20) | 类型 (monthly/yearly/lifetime) |
| price | DECIMAL(10,2) | 价格 |
| currency | VARCHAR(10) | 货币 (USD) |
| credits_per_period | INT | 每期赠送积分 |
| features | JSON | 功能列表 |
| is_active | BOOLEAN | 是否启用 |
| sort_order | INT | 排序 |

---

## 索引

| 表 | 索引名 | 列 | 类型 |
|----|--------|-----|------|
| users | users_phone_idx | phone | UNIQUE |
| users | users_status_idx | status | INDEX |
| verification_codes | verification_phone_code_idx | phone, code | INDEX |
| prompt_templates | prompt_tool_type_idx | tool_type | UNIQUE |
| tasks | tasks_user_id_idx | user_id | INDEX |
| tasks | tasks_status_idx | status | INDEX |
| tasks | tasks_created_at_idx | created_at | INDEX |
| materials | materials_user_id_idx | user_id | INDEX |
| materials | materials_type_idx | type | INDEX |
| materials | materials_created_at_idx | created_at | INDEX |
| subscriptions | subscriptions_user_id_idx | user_id | INDEX |
| subscriptions | subscriptions_status_idx | status | INDEX |

---

## 迁移

### 生成迁移

```bash
npm run db:generate
```

### 执行迁移

```bash
npm run db:migrate
```

### 查看数据库

```bash
npm run db:studio
```

---

## 初始数据

数据库初始化包含 3 个默认订阅方案:

| product_id | 类型 | 价格 | 积分 |
|------------|------|------|------|
| com.clipai.pro.monthly | monthly | $9.99 | 200 |
| com.clipai.pro.yearly | yearly | $49.99 | 3000 |
| com.clipai.pro.lifetime | lifetime | $99.99 | 99999 |
