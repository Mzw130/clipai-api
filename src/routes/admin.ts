/**
 * Admin 管理后台路由
 *
 * 所有接口需要 authGuard + adminGuard
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authGuard, adminGuard } from '../middleware/auth';
import {
  getStats,
  getTaskDistribution,
  getDailyTrends,
  getUserGrowth,
  getRevenueBreakdown,
  getToolUsageRanking,
  listUsers,
  getUserDetail,
  updateUserRole,
  updateUserCredits,
  updateUserStatus,
  listSubscriptions,
  listTasks,
} from '../services/admin';
import { success, error, ErrorCode } from '../utils/response';
import { AppError } from '../utils/errors';
import { listModelConfigs, createModelConfig, updateModelConfig, deleteModelConfig, getModelUsageStats } from '../services/model-config';

// ==================== Zod 参数校验 ====================
const usersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  role: z.enum(['free', 'pro', 'admin']).optional(),
  status: z.enum(['active', 'banned']).optional(),
  sort_by: z.enum(['created_at', 'credits', 'last_login_at']).optional().default('created_at'),
  sort_order: z.enum(['asc', 'desc']).optional().default('desc'),
});

const updateRoleSchema = z.object({
  role: z.enum(['free', 'pro', 'admin']),
});

const updateCreditsSchema = z.object({
  credits: z.number().int().min(0),
});

const updateUserStatusSchema = z.object({
  status: z.enum(['active', 'banned']),
});

const subscriptionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().optional(),
  user_id: z.string().optional(),
});

const tasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.string().optional(),
  tool_type: z.string().optional(),
  user_id: z.string().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

const analyticsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).optional().default(30),
});

const revenueAnalyticsQuerySchema = z.object({
  months: z.coerce.number().int().min(1).max(36).optional().default(12),
});

export default async function adminRoutes(fastify: FastifyInstance) {
  // 全局需要登录
  fastify.addHook('preHandler', authGuard);

  // ==================== 统计 ====================
  fastify.get(
    '/api/v1/admin/stats',
    { preHandler: [adminGuard] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = await getStats();
        return reply.send(success(stats));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 获取统计失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 分析：任务分布 ====================
  fastify.get(
    '/api/v1/admin/analytics/task-distribution',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = analyticsQuerySchema.parse(request.query);
        const data = await getTaskDistribution(query.days);
        return reply.send(success(data));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        fastify.log.error('[Admin] 获取任务分布失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 分析：每日趋势 ====================
  fastify.get(
    '/api/v1/admin/analytics/daily-trends',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = analyticsQuerySchema.parse(request.query);
        const data = await getDailyTrends(query.days);
        return reply.send(success(data));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        fastify.log.error('[Admin] 获取每日趋势失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 分析：用户增长 ====================
  fastify.get(
    '/api/v1/admin/analytics/user-growth',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = analyticsQuerySchema.parse(request.query);
        const data = await getUserGrowth(query.days);
        return reply.send(success(data));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        fastify.log.error('[Admin] 获取用户增长失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 分析：收入细分 ====================
  fastify.get(
    '/api/v1/admin/analytics/revenue-breakdown',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = revenueAnalyticsQuerySchema.parse(request.query);
        const data = await getRevenueBreakdown(query.months);
        return reply.send(success(data));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        fastify.log.error('[Admin] 获取收入细分失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 分析：工具使用排名 ====================
  fastify.get(
    '/api/v1/admin/analytics/tool-usage-ranking',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = analyticsQuerySchema.parse(request.query);
        const data = await getToolUsageRanking(query.days);
        return reply.send(success(data));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        fastify.log.error('[Admin] 获取工具排名失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 用户列表 ====================
  fastify.get(
    '/api/v1/admin/users',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = usersQuerySchema.parse(request.query);
        const result = await listUsers({
          page: query.page,
          page_size: query.page_size,
          search: query.search,
          role: query.role,
          status: query.status,
          sort_by: query.sort_by,
          sort_order: query.sort_order,
        });
        return reply.send(success(result));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 获取用户列表失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 用户详情 ====================
  fastify.get(
    '/api/v1/admin/users/:userId',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const detail = await getUserDetail(request.params.userId);
        return reply.send(success(detail));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 获取用户详情失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 修改角色 ====================
  fastify.patch(
    '/api/v1/admin/users/:userId/role',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const body = updateRoleSchema.parse(request.body);
        const result = await updateUserRole(request.params.userId, body.role, request.userId!);
        return reply.send(success(result, '角色已更新'));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 修改角色失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 修改积分 ====================
  fastify.patch(
    '/api/v1/admin/users/:userId/credits',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const body = updateCreditsSchema.parse(request.body);
        const result = await updateUserCredits(request.params.userId, body.credits);
        return reply.send(success(result, '积分已更新'));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 修改积分失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 封禁/解封 ====================
  fastify.patch(
    '/api/v1/admin/users/:userId/status',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest<{ Params: { userId: string } }>, reply: FastifyReply) => {
      try {
        const body = updateUserStatusSchema.parse(request.body);
        const result = await updateUserStatus(request.params.userId, body.status, request.userId!);
        const msg = body.status === 'banned' ? '用户已封禁' : '用户已解封';
        return reply.send(success(result, msg));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 修改状态失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 订阅列表 ====================
  fastify.get(
    '/api/v1/admin/subscriptions',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = subscriptionsQuerySchema.parse(request.query);
        const result = await listSubscriptions({
          page: query.page,
          page_size: query.page_size,
          status: query.status,
          userId: query.user_id,
        });
        return reply.send(success(result));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 获取订阅列表失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 任务列表 ====================
  fastify.get(
    '/api/v1/admin/tasks',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = tasksQuerySchema.parse(request.query);
        const result = await listTasks({
          page: query.page,
          page_size: query.page_size,
          status: query.status,
          toolType: query.tool_type,
          userId: query.user_id,
          date_from: query.date_from,
          date_to: query.date_to,
        });
        return reply.send(success(result));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 获取任务列表失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  // ==================== 模型配置 ====================
  const modelUpdateSchema = z.object({
    display_name: z.string().optional(),
    endpoint: z.string().optional(),
    api_key: z.string().optional(),
    model_name: z.string().optional(),
    is_active: z.boolean().optional(),
  });

  const modelCreateSchema = z.object({
    name: z.string().min(1, '标识不能为空').regex(/^[a-z0-9_]+$/, '仅支持小写字母、数字、下划线'),
    display_name: z.string().min(1, '显示名称不能为空'),
    endpoint: z.string().min(1, 'API 端点不能为空'),
    api_key: z.string().min(1, 'API Key 不能为空'),
    model_name: z.string().min(1, '模型名称不能为空'),
  });

  fastify.get(
    '/api/v1/admin/models',
    { preHandler: [adminGuard] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const configs = listModelConfigs();
        const usage = await getModelUsageStats();
        return reply.send(success({ configs, usage }));
      } catch (err) {
        fastify.log.error('[Admin] 获取模型配置失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  fastify.post(
    '/api/v1/admin/models',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = modelCreateSchema.parse(request.body);
        await createModelConfig({
          name: body.name,
          displayName: body.display_name,
          endpoint: body.endpoint,
          apiKey: body.api_key,
          modelName: body.model_name,
        });
        return reply.send(success(null, '模型已添加，实时生效'));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, err.errors[0]?.message || '参数错误'));
        }
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 创建模型失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR, err instanceof Error ? err.message : '服务器内部错误'));
      }
    },
  );

  fastify.patch(
    '/api/v1/admin/models/:name',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      try {
        const body = modelUpdateSchema.parse(request.body);
        await updateModelConfig(request.params.name, {
          displayName: body.display_name,
          endpoint: body.endpoint,
          apiKey: body.api_key,
          modelName: body.model_name,
          isActive: body.is_active,
        });
        return reply.send(success(null, '配置已更新，实时生效'));
      } catch (err) {
        if (err instanceof z.ZodError) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '参数错误'));
        }
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 更新模型配置失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR, err instanceof Error ? err.message : '服务器内部错误'));
      }
    },
  );

  fastify.delete(
    '/api/v1/admin/models/:name',
    { preHandler: [adminGuard] },
    async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      try {
        await deleteModelConfig(request.params.name);
        return reply.send(success(null, '模型已删除'));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code as ErrorCode, err.message));
        }
        fastify.log.error('[Admin] 删除模型失败:', err);
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR, err instanceof Error ? err.message : '服务器内部错误'));
      }
    },
  );
}
