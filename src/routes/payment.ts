/**
 * 支付 / 订阅路由
 *
 * GET  /api/v1/plans               — 订阅方案列表
 * POST /api/v1/purchase/verify     — 验证 Apple 支付票据
 * POST /api/v1/purchase/restore     — 恢复购买
 * GET  /api/v1/subscription/status — 订阅状态
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authGuard } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import {
  verifyAppleReceipt,
  restorePurchases,
  getSubscriptionStatus,
  getPlans,
} from '../services/payment';
import { success, error, ErrorCode } from '../utils/response';
import { AppError } from '../utils/errors';
import { trackSubscriptionStart } from '../services/tracker';

const verifyReceiptSchema = z.object({
  receipt_data: z.string().min(1, 'receipt_data 不能为空'),
});

export default async function paymentRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/plans
   * 获取订阅方案列表 (公开接口)
   */
  fastify.get('/api/v1/plans', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const plans = await getPlans();
      return reply.send(success(plans));
    } catch (err) {
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send(error(err.code, err.message));
      }
      return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
    }
  });

  // 以下路由需要鉴权
  fastify.addHook('preHandler', authGuard);

  /**
   * POST /api/v1/purchase/verify
   * 验证 Apple 支付票据
   */
  fastify.post(
    '/api/v1/purchase/verify',
    { preHandler: [validateBody(verifyReceiptSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { receipt_data } = request.body as z.infer<typeof verifyReceiptSchema>;
        const userId = request.userId!;

        const result = await verifyAppleReceipt(userId, receipt_data);

        // 服务端埋点：订阅开始
        if (result.success && result.planId) {
          trackSubscriptionStart(userId, result.planId);
        }

        return reply.send(
          success({
            verified: result.success,
            plan_id: result.planId,
            expires_at: result.expiresAt?.toISOString(),
          }),
        );
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code, err.message));
        }
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  /**
   * POST /api/v1/purchase/restore
   * 恢复购买
   */
  fastify.post(
    '/api/v1/purchase/restore',
    { preHandler: [validateBody(verifyReceiptSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { receipt_data } = request.body as z.infer<typeof verifyReceiptSchema>;
        const userId = request.userId!;

        const result = await restorePurchases(userId, receipt_data);

        return reply.send(
          success({
            restored: result.success,
            plan_id: result.planId,
            expires_at: result.expiresAt?.toISOString(),
          }),
        );
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code, err.message));
        }
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  /**
   * GET /api/v1/subscription/status
   * 查询订阅状态
   */
  fastify.get(
    '/api/v1/subscription/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const status = await getSubscriptionStatus(request.userId!);
        return reply.send(success(status));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code, err.message));
        }
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );
}
