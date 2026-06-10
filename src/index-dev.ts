/**
 * ClipAI API 开发模式入口
 *
 * 使用 SQLite (sql.js) + 内存限流，无需 MySQL/Redis
 * AI 调用使用 mock 返回，方便前端调试
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

// ==================== 内存数据库 ====================
const DB: Record<string, any[]> = {
  users: [],
  tasks: [],
  materials: [],
  subscriptions: [],
};

// ==================== 工具函数 ====================
function ok(data: any, msg = 'success') {
  return { code: 0, message: msg, data, request_id: uuidv4() };
}
function err(code: number, msg: string) {
  return { code, message: msg, data: null, request_id: uuidv4() };
}

// ==================== JWT ====================
const JWT_SECRET = 'clipai-dev-secret';
function signToken(user: any) {
  return jwt.sign({ userId: user.id, phone: user.phone, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(token: string): any {
  try { return jwt.verify(token, JWT_SECRET); } catch { return null; }
}

// ==================== 初始化 ====================
const fastify = Fastify({ logger: { level: 'info', transport: { target: 'pino-pretty', options: { colorize: true } } } });

async function start() {
  await fastify.register(cors, { origin: true });
  await fastify.register(multipart, { limits: { fileSize: 20 * 1024 * 1024, files: 2 } });

  // 健康检查
  fastify.get('/api/health', async () => ({ status: 'ok', mode: 'dev', version: '1.0.0' }));

  // ==================== 认证 ====================
  fastify.post('/api/v1/auth/send-code', async (req, reply) => {
    const { phone } = req.body as any;
    if (!phone || !/^1[3-9]\d{9}$/.test(phone)) return reply.status(400).send(err(1001, '手机号格式不正确'));
    console.log(`📱 [DEV] 验证码: 123456 → ${phone}`);
    return reply.send(ok({ expires_in: 300 }, '验证码已发送'));
  });

  fastify.post('/api/v1/auth/verify', async (req, reply) => {
    const { phone, code } = req.body as any;
    if (code !== '123456') return reply.status(400).send(err(1001, '验证码错误'));

    let user = DB.users.find(u => u.phone === phone);
    let isNew = false;
    if (!user) {
      isNew = true;
      user = { id: uuidv4(), phone, nickname: `用户${phone.slice(-4)}`, role: 'free', credits: 0, avatarUrl: null, proExpiresAt: null, createdAt: new Date().toISOString() };
      DB.users.push(user);
    }
    const token = signToken(user);
    return reply.send(ok({ token, user: { ...user, isNewUser: isNew } }, isNew ? '注册成功' : '登录成功'));
  });

  // ==================== Auth 中间件 ====================
  fastify.addHook('preHandler', async (req, reply) => {
    if (req.routeOptions.url === '/api/health' ||
        req.routeOptions.url === '/api/v1/auth/send-code' ||
        req.routeOptions.url === '/api/v1/auth/verify' ||
        req.routeOptions.url === '/api/v1/plans' ||
        req.routeOptions.url === '/api/v1/templates' ||
        req.routeOptions.url === '/api/v1/explore') return;

    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return reply.status(401).send(err(1002, '未登录'));

    const payload = verifyToken(auth.slice(7));
    if (!payload) return reply.status(401).send(err(1002, 'token 无效'));

    (req as any).userId = payload.userId;
    (req as any).userRole = payload.role;
  });

  // ==================== 用户 ====================
  fastify.get('/api/v1/user/profile', async (req, reply) => {
    const user = DB.users.find(u => u.id === (req as any).userId);
    if (!user) return reply.status(404).send(err(1002, '用户不存在'));
    return reply.send(ok({ id: user.id, phone: user.phone, nickname: user.nickname, avatarUrl: user.avatarUrl, role: user.role, credits: user.credits, proExpiresAt: user.proExpiresAt, createdAt: user.createdAt }));
  });

  fastify.get('/api/v1/user/credits', async (req, reply) => {
    const user = DB.users.find(u => u.id === (req as any).userId);
    const isPro = user?.role === 'pro' || user?.role === 'admin';
    return reply.send(ok({ credits: user?.credits || 0, is_pro: isPro, daily_quota: isPro ? { unlimited: true } : { used: 0, total: 5 } }));
  });

  // ==================== AI 处理 (核心) ====================
  fastify.post('/api/v1/ai/enhance', async (req, reply) => {
    try {
      const userId = (req as any).userId;
      const parts = req.parts();
      let toolType = '';
      let params: any = {};
      let imageBuffer: Buffer | null = null;

      for await (const part of parts) {
        if (part.type === 'file') {
          imageBuffer = await part.toBuffer();
        } else if (part.type === 'field') {
          if (part.fieldname === 'tool_type') toolType = String(part.value);
          if (part.fieldname === 'params') {
            try { params = JSON.parse(String(part.value)); } catch {}
          }
        }
      }

      const validTools = ['reshape','hd_repair','obj_remove','bg_remove','super_realistic','hair_dye','lip_plump','jawline','hair_smooth','hair_repair','proportion','leg_enhance','muscle','muscle_enhance','ai_edit','beauty','color_grade','filter','video_generate','seedance_video'];
      if (!toolType || !validTools.includes(toolType)) {
        return reply.status(400).send(err(1001, `无效的 tool_type: ${toolType}`));
      }
      if (!imageBuffer) return reply.status(400).send(err(1001, '请上传图片'));

      // Mock: 模拟 AI 处理
      const taskId = uuidv4();
      const task = {
        id: taskId, userId, toolType, status: 'completed',
        originalUrl: `https://cdn.clipai.com/uploads/${uuidv4()}.png`,
        resultUrl: `https://cdn.clipai.com/results/${taskId}.png`,
        processingTimeMs: 1200, creditsUsed: 1, createdAt: new Date().toISOString(),
      };
      DB.tasks.push(task);

      // 录入素材
      DB.materials.push({
        id: uuidv4(), userId, type: 'image', url: task.resultUrl,
        toolType, taskId, isFavorite: false, tags: [], createdAt: new Date().toISOString(),
      });

      return reply.send(ok({
        task_id: task.id, status: 'completed', result_url: task.resultUrl,
        original_url: task.originalUrl, processing_time_ms: task.processingTimeMs, credits_used: task.creditsUsed,
      }));
    } catch (e: any) {
      return reply.status(500).send(err(5000, e.message));
    }
  });

  fastify.get('/api/v1/ai/status/:taskId', async (req, reply) => {
    const task = DB.tasks.find(t => t.id === (req.params as any).taskId);
    if (!task) return reply.status(404).send(err(1001, '任务不存在'));
    return reply.send(ok({ task_id: task.id, status: task.status, result_url: task.resultUrl, error_message: null }));
  });

  // ==================== 视频生成 (Dev Mock) ====================
  fastify.post('/api/v1/ai/video', async (req, reply) => {
    try {
      const userId = (req as any).userId;
      const data = await req.file();
      if (!data) return reply.status(400).send(err(1001, '请上传图片'));

      const buffer = await data.toBuffer();
      const fields = req.body as any || {};
      const prompt = fields.prompt || '';
      const mode = fields.mode || 'super';

      // Mock: 模拟视频生成
      const taskId = uuidv4();
      const videoUrl = `http://localhost:3000/files/videos/${userId}/${taskId}.mp4`;

      const task = {
        id: taskId, userId, toolType: 'video_generate',
        status: 'completed', originalUrl: '',
        resultUrl: videoUrl, processingTimeMs: 8000,
        creditsUsed: 8, createdAt: new Date().toISOString(),
      };
      DB.tasks.push(task);

      // 录入素材
      DB.materials.push({
        id: uuidv4(), userId, type: 'video', url: videoUrl,
        toolType: 'video_generate', taskId, isFavorite: false,
        tags: [], createdAt: new Date().toISOString(),
      });

      return reply.send(ok({
        task_id: task.id, status: 'completed', result_url: task.resultUrl,
        processing_time_ms: task.processingTimeMs, credits_used: task.creditsUsed,
      }));
    } catch (e: any) {
      return reply.status(500).send(err(5000, e.message));
    }
  });

  // ==================== 素材库 ====================
  fastify.get('/api/v1/materials', async (req, reply) => {
    const userId = (req as any).userId;
    const query = req.query as any;
    const items = DB.materials.filter(m => m.userId === userId);
    return reply.send(ok({ items, pagination: { page: parseInt(query.page||'1'), page_size: parseInt(query.page_size||'20'), total: items.length, total_pages: 1 } }));
  });

  fastify.delete('/api/v1/materials/:id', async (req, reply) => {
    const userId = (req as any).userId;
    const idx = DB.materials.findIndex(m => m.id === (req.params as any).id && m.userId === userId);
    if (idx === -1) return reply.status(404).send(err(1001, '素材不存在'));
    DB.materials.splice(idx, 1);
    return reply.send(ok(null, '已删除'));
  });

  fastify.post('/api/v1/materials/:id/favorite', async (req, reply) => {
    const userId = (req as any).userId;
    const m = DB.materials.find(m => m.id === (req.params as any).id && m.userId === userId);
    if (!m) return reply.status(404).send(err(1001, '素材不存在'));
    m.isFavorite = !m.isFavorite;
    return reply.send(ok({ is_favorite: m.isFavorite }, m.isFavorite ? '已收藏' : '已取消'));
  });

  // ==================== 模板 & 探索 ====================
  fastify.get('/api/v1/templates', async (_req, reply) => {
    return reply.send(ok([
      { id: 't1', name: '赛博朋克', description: '未来科技感', coverUrl: 'https://picsum.photos/400/600?1', category: 'style', isActive: true },
      { id: 't2', name: '复古胶片', description: '80年代怀旧风', coverUrl: 'https://picsum.photos/400/600?2', category: 'style', isActive: true },
      { id: 't3', name: '日系清新', description: '透明感色调', coverUrl: 'https://picsum.photos/400/600?3', category: 'filter', isActive: true },
    ]));
  });

  fastify.get('/api/v1/explore', async (_req, reply) => {
    return reply.send(ok([
      { id: 'e1', title: '街拍大片', coverUrl: 'https://picsum.photos/400/600?4', afterUrl: 'https://picsum.photos/400/600?5', category: 'featured', likes: 234 },
      { id: 'e2', title: '人像精修', coverUrl: 'https://picsum.photos/400/600?6', afterUrl: 'https://picsum.photos/400/600?7', category: 'portrait', likes: 189 },
    ]));
  });

  // ==================== 支付 ====================
  fastify.get('/api/v1/plans', async (_req, reply) => {
    return reply.send(ok([
      { id: uuidv4(), name: 'Monthly Pro', productId: 'com.clipai.pro.monthly', type: 'monthly', price: '9.99', currency: 'USD', creditsPerPeriod: 200, features: ['无限次AI处理','高清4K','图生视频'], isActive: true, sortOrder: 1 },
      { id: uuidv4(), name: 'Yearly Pro', productId: 'com.clipai.pro.yearly', type: 'yearly', price: '49.99', currency: 'USD', creditsPerPeriod: 3000, features: ['无限次AI处理','高清4K','图生视频','专属滤镜'], isActive: true, sortOrder: 2 },
    ]));
  });

  fastify.post('/api/v1/purchase/verify', async (req, reply) => {
    const userId = (req as any).userId;
    const { receipt_data } = req.body as any;
    // Mock: 验证成功
    const user = DB.users.find(u => u.id === userId);
    if (user) { user.role = 'pro'; user.credits += 200; }
    return reply.send(ok({ verified: true, plan_id: 'com.clipai.pro.monthly', expires_at: new Date(Date.now() + 30*24*3600*1000).toISOString() }));
  });

  fastify.get('/api/v1/subscription/status', async (req, reply) => {
    const user = DB.users.find(u => u.id === (req as any).userId);
    return reply.send(ok({ isPro: user?.role === 'pro', credits: user?.credits || 0, subscription: null }));
  });

  // ==================== 启动 ====================
  await fastify.listen({ port: 3000, host: '0.0.0.0' });
  console.log('\n' + '='.repeat(50));
  console.log('🚀 ClipAI API Dev Server 已启动');
  console.log('   地址: http://localhost:3000');
  console.log('   健康: http://localhost:3000/api/health');
  console.log('   模式: DEV (内存数据库 + Mock AI)');
  console.log('   📱 验证码: 123456');
  console.log('='.repeat(50) + '\n');
}

start().catch(e => { console.error(e); process.exit(1); });
