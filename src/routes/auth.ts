/**
 * 认证路由
 *
 * POST /api/v1/auth/send-code  — 发送验证码
 * POST /api/v1/auth/verify     — 验证码登录
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { validateBody } from '../middleware/validator';
import { sendVerificationCode, loginWithCode } from '../services/auth';
import { success, error, ErrorCode } from '../utils/response';
import { AppError } from '../utils/errors';

// ==================== Zod Schemas ====================
const sendCodeSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
});

const verifySchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, '手机号格式不正确'),
  code: z.string().length(6, '验证码为 6 位数字'),
});

export default async function authRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/auth/send-code
   * 发送短信验证码
   */
  fastify.post(
    '/api/v1/auth/send-code',
    { preHandler: [validateBody(sendCodeSchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { phone } = request.body as z.infer<typeof sendCodeSchema>;

        // 从 fastify 实例获取 redis（在 index.ts 中 decorate）
        const redis = (fastify as any).redis;
        const result = await sendVerificationCode(phone, redis);

        return reply.send(success({ expires_in: result.expiresIn }, '验证码已发送'));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code, err.message));
        }
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  /**
   * POST /api/v1/auth/verify
   * 验证码登录 / 注册
   */
  fastify.post(
    '/api/v1/auth/verify',
    { preHandler: [validateBody(verifySchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { phone, code } = request.body as z.infer<typeof verifySchema>;
        const redis = (fastify as any).redis;

        const result = await loginWithCode(phone, code, redis);

        return reply.send(
          success(
            {
              token: result.token,
              user: result.user,
            },
            result.user.isNewUser ? '注册成功' : '登录成功',
          ),
        );
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code, err.message));
        }
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );
}
