/**
 * 用户路由
 *
 * GET /api/v1/user/profile  — 用户信息
 * GET /api/v1/user/credits  — 积分余额
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authGuard } from '../middleware/auth';
import { getUserProfile } from '../services/auth';
import { getSubscriptionStatus } from '../services/payment';
import { success, error, ErrorCode } from '../utils/response';
import { AppError } from '../utils/errors';

export default async function userRoutes(fastify: FastifyInstance) {
  // 所有用户路由都需要鉴权
  fastify.addHook('preHandler', authGuard);

  /**
   * GET /api/v1/user/profile
   * 获取用户资料
   */
  fastify.get('/api/v1/user/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const profile = await getUserProfile(request.userId!);
      return reply.send(success(profile));
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send(error(err.code, err.message));
      }
      return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
    }
  });

  /**
   * GET /api/v1/user/credits
   * 获取用户积分余额
   */
  fastify.get('/api/v1/user/credits', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = await getSubscriptionStatus(request.userId!);
      return reply.send(
        success({
          credits: status.credits,
          is_pro: status.isPro,
          daily_quota: status.isPro
            ? { unlimited: true }
            : {
                used: 0, // TODO: 从用户表获取当日使用数
                total: 5,
              },
        }),
      );
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send(error(err.code, err.message));
      }
      return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
    }
  });
}
