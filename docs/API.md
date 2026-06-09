# ClipAI API 接口文档

## 基础信息

- **Base URL**: `http://localhost:3000/api/v1` (开发) / `https://api.clipai.com/api/v1` (生产)
- **认证方式**: Bearer Token (JWT)
- **Content-Type**: `application/json` (除文件上传外)
- **字符编码**: UTF-8

---

## 统一响应格式

```typescript
interface ApiResponse<T> {
  code: number;        // 0=成功, 非0=错误
  message: string;     // 人类可读消息
  data: T | null;      // 业务数据
  request_id: string;  // 请求追踪 ID
}
```

### 错误码

| code | 含义 |
|------|------|
| 0 | 成功 |
| 1001 | 参数错误 |
| 1002 | 未登录 / token 过期 |
| 1003 | 积分不足 |
| 1004 | Pro 会员专属 |
| 1005 | 图片内容违规 |
| 1006 | 图片格式不支持 |
| 2001 | AI 服务超时 |
| 2002 | AI 服务返回错误 |
| 5000 | 服务器内部错误 |

---

## 一、认证模块

### 1.1 发送验证码

```
POST /api/v1/auth/send-code
```

**请求体:**
```json
{
  "phone": "13800138000"
}
```

**响应:**
```json
{
  "code": 0,
  "message": "验证码已发送",
  "data": {
    "expires_in": 300
  },
  "request_id": "req_abc123"
}
```

### 1.2 验证码登录/注册

```
POST /api/v1/auth/verify
```

**请求体:**
```json
{
  "phone": "13800138000",
  "code": "123456"
}
```

**响应:**
```json
{
  "code": 0,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "uuid",
      "phone": "13800138000",
      "nickname": "用户8000",
      "avatarUrl": null,
      "role": "free",
      "credits": 0,
      "isNewUser": true
    }
  },
  "request_id": "req_xyz"
}
```

---

## 二、用户模块

### 2.1 获取用户信息

```
GET /api/v1/user/profile
Authorization: Bearer <token>
```

### 2.2 获取积分余额

```
GET /api/v1/user/credits
Authorization: Bearer <token>
```

**响应:**
```json
{
  "code": 0,
  "data": {
    "credits": 200,
    "is_pro": true,
    "daily_quota": { "unlimited": true }
  }
}
```

---

## 三、AI 处理模块（核心）

### 3.1 AI 图片增强

```
POST /api/v1/ai/enhance
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**表单字段:**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tool_type` | string | 是 | 工具类型 (见下方列表) |
| `image` | file | 是 | 原图片文件 |
| `params` | JSON string | 否 | 工具参数 |
| `mask` | file | 否 | 蒙版图片 (物体消除用) |
| `mask_coordinates` | JSON string | 否 | 蒙版坐标 |
| `webhook_url` | string | 否 | 异步回调地址 |

**tool_type 列表:**
```
reshape, hd_repair, obj_remove, bg_remove, super_realistic,
hair_dye, lip_plump, jawline, hair_smooth, hair_repair,
proportion, leg_enhance, muscle, muscle_enhance,
ai_edit, beauty, color_grade, filter
```

**同步响应 (快速任务):**
```json
{
  "code": 0,
  "data": {
    "task_id": "task_abc123",
    "status": "completed",
    "result_url": "https://cdn.clipai.com/results/abc123.png",
    "original_url": "https://cdn.clipai.com/uploads/abc123_orig.png",
    "processing_time_ms": 3200,
    "credits_used": 1
  }
}
```

**异步响应 (耗时任务):**
```json
{
  "code": 0,
  "data": {
    "task_id": "task_abc123",
    "status": "processing",
    "estimated_seconds": 15
  }
}
```

### 3.2 查询任务状态

```
GET /api/v1/ai/status/:taskId
Authorization: Bearer <token>
```

**响应:**
```json
{
  "code": 0,
  "data": {
    "task_id": "task_abc123",
    "status": "completed",
    "result_url": "https://cdn.clipai.com/results/abc123.png",
    "error_message": null
  }
}
```

### 3.3 图生视频 (Pro)

```
POST /api/v1/ai/video
Authorization: Bearer <token>
```

**请求体:**
```json
{
  "prompt": "smooth camera panning",
  "mode": "super"
}
```
+ `image` 文件 (multipart)

---

## 四、素材库模块

### 4.1 素材列表

```
GET /api/v1/materials?type=all&page=1&page_size=20
Authorization: Bearer <token>
```

### 4.2 删除素材

```
DELETE /api/v1/materials/:id
Authorization: Bearer <token>
```

### 4.3 收藏/取消收藏

```
POST /api/v1/materials/:id/favorite
Authorization: Bearer <token>
```

---

## 五、支付模块

### 5.1 订阅方案列表

```
GET /api/v1/plans
```
(公开接口，无需认证)

### 5.2 验证支付票据

```
POST /api/v1/purchase/verify
Authorization: Bearer <token>
```

**请求体:**
```json
{
  "receipt_data": "base64_encoded_receipt..."
}
```

### 5.3 恢复购买

```
POST /api/v1/purchase/restore
Authorization: Bearer <token>
```

### 5.4 订阅状态

```
GET /api/v1/subscription/status
Authorization: Bearer <token>
```

---

## 六、内容模块

### 6.1 模板列表

```
GET /api/v1/templates?category=portrait
```

### 6.2 探索页内容

```
GET /api/v1/explore?category=trending
```

---

## 完整接口索引

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/v1/auth/send-code` | 否 | 发送验证码 |
| POST | `/api/v1/auth/verify` | 否 | 验证码登录 |
| GET | `/api/v1/user/profile` | 是 | 用户信息 |
| GET | `/api/v1/user/credits` | 是 | 积分余额 |
| POST | `/api/v1/ai/enhance` | 是 | **AI 图片处理** |
| GET | `/api/v1/ai/status/:taskId` | 是 | 任务状态 |
| POST | `/api/v1/ai/video` | 是 | 图生视频 |
| GET | `/api/v1/materials` | 是 | 素材列表 |
| DELETE | `/api/v1/materials/:id` | 是 | 删除素材 |
| POST | `/api/v1/materials/:id/favorite` | 是 | 收藏切换 |
| GET | `/api/v1/templates` | 否 | 模板列表 |
| GET | `/api/v1/explore` | 否 | 探索页 |
| GET | `/api/v1/plans` | 否 | 订阅方案 |
| POST | `/api/v1/purchase/verify` | 是 | 验证支付 |
| POST | `/api/v1/purchase/restore` | 是 | 恢复购买 |
| GET | `/api/v1/subscription/status` | 是 | 订阅状态 |
