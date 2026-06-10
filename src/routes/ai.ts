/**
 * AI 处理路由
 *
 * POST /api/v1/ai/enhance         — 统一 AI 图片处理
 * GET  /api/v1/ai/status/:taskId  — 查询任务状态
 * POST /api/v1/ai/video           — 图生视频
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authGuard, proGuard } from '../middleware/auth';
import { validateBody } from '../middleware/validator';
import { enhanceImage, getTaskStatus, EnhanceRequest } from '../services/ai/pipeline';
import { getAllToolTypes } from '../services/ai/prompts';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { success, error, ErrorCode } from '../utils/response';
import { AppError } from '../utils/errors';
import { getSubscriptionStatus } from '../services/payment';
import { config } from '../config';

// ==================== Zod Schemas ====================
const enhanceBodySchema = z.object({
  tool_type: z.string().min(1, 'tool_type 不能为空'),
  params: z.record(z.unknown()).optional().default({}),
  webhook_url: z.string().url().optional(),
});

const videoBodySchema = z.object({
  prompt: z.string().optional(),
  mode: z.enum(['super', 'custom']).default('super'),
});

export default async function aiRoutes(fastify: FastifyInstance) {
  // 所有 AI 路由需要鉴权
  fastify.addHook('preHandler', authGuard);

  /**
   * POST /api/v1/ai/enhance
   * 统一 AI 图片处理接口
   *
   * Content-Type: multipart/form-data
   *
   * Fields:
   *   - tool_type: string (必填)
   *   - image: file (必填)
   *   - params: JSON string (可选)
   *   - mask: file (可选, 用于物体消除等)
   *   - mask_coordinates: JSON string (可选)
   *   - webhook_url: string (可选)
   */
  fastify.post('/api/v1/ai/enhance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      let imageBuffer: Buffer | undefined;
      let imageFileName = 'image.png';
      let imageMimeType = 'image/png';
      let toolType = '';
      let params: Record<string, unknown> = {};
      let webhookUrl: string | undefined;
      let maskBuffer: Buffer | undefined;
      let maskFileName: string | undefined;

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file') {
          const buf = await part.toBuffer();
          if (part.fieldname === 'image') {
            imageBuffer = buf;
            imageFileName = part.filename || 'image.png';
            imageMimeType = part.mimetype || 'image/png';
          } else if (part.fieldname === 'mask') {
            maskBuffer = buf;
            maskFileName = part.filename || 'mask.png';
          }
        } else if (part.type === 'field') {
          switch (part.fieldname) {
            case 'tool_type':
              toolType = String(part.value);
              break;
            case 'params': {
              try { params = JSON.parse(String(part.value)); } catch { params = {}; }
              break;
            }
            case 'mask_coordinates': {
              try { params.mask_coordinates = JSON.parse(String(part.value)); } catch {}
              break;
            }
            case 'webhook_url':
              webhookUrl = String(part.value);
              break;
          }
        }
      }

      if (!imageBuffer) {
        return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '请上传图片'));
      }

      // 校验 tool_type
      if (!toolType) {
        return reply.status(400).send(error(ErrorCode.PARAM_ERROR, 'tool_type 不能为空'));
      }

      const validTools = getAllToolTypes();
      if (!validTools.includes(toolType)) {
        return reply.status(400).send(
          error(ErrorCode.PARAM_ERROR, `无效的 tool_type: ${toolType}，有效值: ${validTools.join(', ')}`),
        );
      }

      // 校验图片大小
      const maxBytes = config.limits.maxImageSizeMb * 1024 * 1024;
      if (imageBuffer.length > maxBytes) {
        return reply.status(400).send(
          error(ErrorCode.PARAM_ERROR, `图片大小超过限制 ${config.limits.maxImageSizeMb}MB`),
        );
      }

      // 校验图片格式
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
      if (!allowedMimes.includes(imageMimeType)) {
        return reply.status(400).send(
          error(ErrorCode.FORMAT_NOT_SUPPORTED, `不支持的图片格式: ${imageMimeType}`),
        );
      }

      // 执行 AI Pipeline
      const request_: EnhanceRequest = {
        toolType,
        imageBuffer,
        imageFileName,
        imageMimeType,
        params,
        maskBuffer,
        maskFileName,
        webhookUrl,
      };

      const result = await enhanceImage(request.userId!, request_);

      if (result.status === 'processing') {
        return reply.send(
          success({
            task_id: result.taskId,
            status: result.status,
            estimated_seconds: result.estimatedSeconds,
          }),
        );
      }

      return reply.send(
        success({
          task_id: result.taskId,
          status: result.status,
          result_url: result.resultUrl,
          original_url: result.originalUrl,
          processing_time_ms: result.processingTimeMs,
          credits_used: result.creditsUsed,
        }),
      );
    } catch (err) {
      console.error('[AI Route] 处理失败:', err);
      if (err instanceof AppError) {
        return reply.status(err.httpStatus).send(error(err.code, err.message));
      }
      return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
    }
  });

  /**
   * GET /api/v1/ai/status/:taskId
   * 查询 AI 任务状态（基于素材库：有素材 = 已完成）
   */
  fastify.get(
    '/api/v1/ai/status/:taskId',
    async (
      request: FastifyRequest<{ Params: { taskId: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { taskId } = request.params;
        const userId = request.userId!;

        // 优先查素材库：有素材记录 = 生成成功
        const [material] = await db
          .select({
            id: schema.materials.id,
            url: schema.materials.url,
            type: schema.materials.type,
            createdAt: schema.materials.createdAt,
          })
          .from(schema.materials)
          .where(
            and(
              eq(schema.materials.taskId, taskId),
              eq(schema.materials.userId, userId),
            ),
          )
          .limit(1);

        if (material) {
          return reply.send(
            success({
              task_id: taskId,
              status: 'completed',
              result_url: material.url,
              type: material.type,
              error_message: null,
            }),
          );
        }

        // 素材库没有 → 查任务表看是否失败
        const [task] = await db
          .select({
            status: schema.tasks.status,
            errorMessage: schema.tasks.errorMessage,
          })
          .from(schema.tasks)
          .where(eq(schema.tasks.id, taskId))
          .limit(1);

        if (!task) {
          return reply.status(404).send(error(ErrorCode.PARAM_ERROR, '任务不存在'));
        }

        if (task.status === 'failed') {
          return reply.send(
            success({
              task_id: taskId,
              status: 'failed',
              result_url: null,
              error_message: task.errorMessage || '处理失败',
            }),
          );
        }

        // 仍在处理中
        return reply.send(
          success({
            task_id: taskId,
            status: 'processing',
            result_url: null,
            error_message: null,
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
   * POST /api/v1/ai/video
   * 图生视频（需要 Pro 会员）
   */
  fastify.post(
    '/api/v1/ai/video',
    { preHandler: [proGuard, validateBody(videoBodySchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // 检查 Pro 状态
        const subStatus = await getSubscriptionStatus(request.userId!);
        if (!subStatus.isPro) {
          return reply.status(403).send(error(ErrorCode.PRO_REQUIRED));
        }

        const data = await request.file();
        if (!data) {
          return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '请上传图片'));
        }

        const imageBuffer = await data.toBuffer();
        const { prompt, mode } = request.body as z.infer<typeof videoBodySchema>;

        const videoRequest: EnhanceRequest = {
          toolType: 'video_generate',
          imageBuffer,
          imageFileName: data.filename || 'image.png',
          imageMimeType: data.mimetype || 'image/png',
          params: {
            prompt,
            mode,
          },
        };

        const result = await enhanceImage(request.userId!, videoRequest);

        if (result.status === 'processing') {
          return reply.send(
            success({
              task_id: result.taskId,
              status: result.status,
              estimated_seconds: result.estimatedSeconds,
            }),
          );
        }

        return reply.send(
          success({
            task_id: result.taskId,
            status: result.status,
            result_url: result.resultUrl,
            processing_time_ms: result.processingTimeMs,
            credits_used: result.creditsUsed,
          }),
        );
      } catch (err) {
        console.error('[Video Route] 处理失败:', err);
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code, err.message));
        }
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );
}
