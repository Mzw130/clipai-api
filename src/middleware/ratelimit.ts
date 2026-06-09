import { FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { config } from '../config';
import { error, ErrorCode } from '../utils/response';

/**
 * Redis 频率限制中间件
 * 免费用户每分钟 5 次，Pro 用户每分钟 30 次
 */
export function createRateLimiter(redis: Redis) {
  return async function rateLimiter(request: FastifyRequest, reply: FastifyReply) {
    const userId = request.userId;
    if (!userId) return; // 如果没有 userId（未鉴权），跳过限流

    try {
      const role = request.userRole || 'free';
      const limit = role === 'pro' || role === 'admin'
        ? config.limits.rateLimitPro
        : config.limits.rateLimitFree;

      const key = `ratelimit:${userId}`;
      const current = await redis.incr(key);

      if (current === 1) {
        // 首次请求，设置 60s 过期
        await redis.expire(key, 60);
      }

      // 设置响应头
      reply.header('X-RateLimit-Limit', limit);
      reply.header('X-RateLimit-Remaining', Math.max(0, limit - current));

      if (current > limit) {
        const ttl = await redis.ttl(key);
        reply.header('Retry-After', ttl > 0 ? ttl : 60);
        return reply.status(429).send(error(ErrorCode.INTERNAL_ERROR, '请求过于频繁，请稍后再试'));
      }
    } catch {
      // Redis 不可用时放行，避免影响正常业务
    }
  };
}
