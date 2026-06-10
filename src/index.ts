/**
 * ClipAI API Server 入口
 *
 * Fastify + TypeScript
 * 统一 AI 图片/视频编辑后端服务
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { config } from './config';
import { Redis } from 'ioredis';
import path from 'path';
import { existsSync, createReadStream } from 'fs';
import { mkdir, stat } from 'fs/promises';

// 路由
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import aiRoutes from './routes/ai';
import materialsRoutes from './routes/materials';
import paymentRoutes from './routes/payment';
import contentRoutes from './routes/content';

// ==================== 初始化 ====================
const fastify = Fastify({
  logger: {
    level: config.logLevel,
    transport: config.env === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  bodyLimit: 50 * 1024 * 1024, // 50MB
  requestTimeout: 300_000, // 5 分钟
});

// ==================== Redis ====================
let redis: Redis | null = null;

async function initRedis(): Promise<Redis | null> {
  try {
    const client = new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    await client.connect();
    fastify.log.info('✅ Redis 已连接');
    return client;
  } catch {
    fastify.log.warn('⚠️  Redis 未连接，部分功能受限 (限流/缓存)');
    return null;
  }
}

// ==================== 插件注册 ====================
async function buildApp() {
  // --- CORS ---
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // --- Multipart (文件上传) ---
  await fastify.register(multipart, {
    limits: {
      fileSize: config.limits.maxImageSizeMb * 1024 * 1024,
      files: 2, // 最多 2 个文件 (image + mask)
    },
  });

  // --- 静态文件服务 (本地开发存储) ---
  const dataDir = path.resolve(config.dataDir);
  await mkdir(dataDir, { recursive: true });

  // 自定义静态文件路由
  fastify.get('/files/*', async (request, reply) => {
    try {
      const filePath = path.join(dataDir, (request.params as any)['*']);
      // 安全检查：防止目录穿越
      if (!filePath.startsWith(dataDir)) {
        return reply.status(403).send('Forbidden');
      }
      if (!existsSync(filePath)) {
        return reply.status(404).send('File not found');
      }
      const fileStat = await stat(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4',
        '.mov': 'video/quicktime', '.webm': 'video/webm',
      };
      return reply
        .header('Content-Type', mimeTypes[ext] || 'application/octet-stream')
        .header('Content-Length', fileStat.size)
        .header('Cache-Control', 'public, max-age=31536000, immutable')
        .send(createReadStream(filePath));
    } catch {
      return reply.status(404).send('File not found');
    }
  });

  fastify.log.info(`📁 静态文件服务: ${dataDir}`);

  // --- Rate Limit ---
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => {
      return request.ip || 'unknown';
    },
  });

  // --- Redis ---
  redis = await initRedis();
  if (redis) {
    fastify.decorate('redis', redis);
  }

  // --- 健康检查 ---
  fastify.get('/api/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  });

  // --- 注册路由 ---
  await fastify.register(authRoutes);
  await fastify.register(userRoutes);
  await fastify.register(aiRoutes);
  await fastify.register(materialsRoutes);
  await fastify.register(paymentRoutes);
  await fastify.register(contentRoutes);

  // --- 全局错误处理 ---
  fastify.setErrorHandler((error, _request, reply) => {
    fastify.log.error(error);

    // Fastify 速率限制错误
    if (error.statusCode === 429) {
      return reply.status(429).send({
        code: 5000,
        message: '请求过于频繁，请稍后再试',
        data: null,
        request_id: 'rate_limited',
      });
    }

    // 请求体过大
    if (error.statusCode === 413) {
      return reply.status(413).send({
        code: 1001,
        message: `文件大小超过限制 ${config.limits.maxImageSizeMb}MB`,
        data: null,
        request_id: 'file_too_large',
      });
    }

    return reply.status(error.statusCode || 500).send({
      code: 5000,
      message: config.env === 'development' ? error.message : '服务器内部错误',
      data: null,
      request_id: 'internal_error',
    });
  });

  // --- 404 处理 ---
  fastify.setNotFoundHandler((_request, reply) => {
    return reply.status(404).send({
      code: 5000,
      message: '接口不存在',
      data: null,
      request_id: 'not_found',
    });
  });
}

// ==================== 启动 ====================
async function start() {
  try {
    await buildApp();

    await fastify.listen({
      port: config.port,
      host: config.host,
    });

    fastify.log.info('='.repeat(50));
    fastify.log.info(`🚀 ClipAI API Server 已启动`);
    fastify.log.info(`  环境: ${config.env}`);
    fastify.log.info(`  地址: http://${config.host}:${config.port}`);
    fastify.log.info(`  健康: http://${config.host}:${config.port}/api/health`);
    fastify.log.info('='.repeat(50));
  } catch (err) {
    fastify.log.error(err, '启动失败');
    process.exit(1);
  }
}

// ==================== 优雅退出 ====================
async function gracefulShutdown(signal: string) {
  fastify.log.info(`收到 ${signal} 信号，正在优雅退出...`);

  try {
    if (redis) {
      await redis.quit();
      fastify.log.info('Redis 已断开');
    }
    await fastify.close();
    fastify.log.info('服务器已关闭');
    process.exit(0);
  } catch (err) {
    fastify.log.error('退出时出错:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ==================== 启动！ ====================
start();

export { fastify };
