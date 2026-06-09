/**
 * 素材库路由
 *
 * GET    /api/v1/materials      — 素材列表
 * DELETE /api/v1/materials/:id  — 删除素材
 * POST   /api/v1/materials/:id/favorite — 收藏/取消
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { db, schema } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import { authGuard } from '../middleware/auth';
import { validateQuery } from '../middleware/validator';
import { deleteFromOSS } from '../services/storage';
import { success, error, ErrorCode } from '../utils/response';
import { AppError } from '../utils/errors';

const listQuerySchema = z.object({
  type: z.enum(['image', 'video', 'all']).optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  page_size: z.coerce.number().int().min(1).max(50).optional().default(20),
});

export default async function materialsRoutes(fastify: FastifyInstance) {
  fastify.addHook('preHandler', authGuard);

  /**
   * GET /api/v1/materials
   * 获取用户素材列表
   */
  fastify.get(
    '/api/v1/materials',
    { preHandler: [validateQuery(listQuerySchema)] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { type, page, page_size } = request.query as z.infer<typeof listQuerySchema>;
        const userId = request.userId!;

        const conditions = [eq(schema.materials.userId, userId)];
        if (type !== 'all') {
          conditions.push(eq(schema.materials.type, type));
        }

        const [items, totalCount] = await Promise.all([
          db
            .select()
            .from(schema.materials)
            .where(and(...conditions))
            .orderBy(desc(schema.materials.createdAt))
            .limit(page_size)
            .offset((page - 1) * page_size),
          db.$count(schema.materials, and(...conditions)),
        ]);

        return reply.send(
          success({
            items,
            pagination: {
              page,
              page_size,
              total: totalCount,
              total_pages: Math.ceil(totalCount / page_size),
            },
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
   * DELETE /api/v1/materials/:id
   * 删除素材
   */
  fastify.delete(
    '/api/v1/materials/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;
        const userId = request.userId!;

        // 检查素材是否属于当前用户
        const [material] = await db
          .select()
          .from(schema.materials)
          .where(and(eq(schema.materials.id, id), eq(schema.materials.userId, userId)))
          .limit(1);

        if (!material) {
          return reply.status(404).send(error(ErrorCode.PARAM_ERROR, '素材不存在'));
        }

        // 从 OSS 删除文件
        try {
          const urlKey = material.url.replace(/^https?:\/\/[^/]+\//, '');
          await deleteFromOSS(urlKey);
          if (material.thumbnailUrl) {
            const thumbKey = material.thumbnailUrl.replace(/^https?:\/\/[^/]+\//, '');
            await deleteFromOSS(thumbKey);
          }
        } catch {
          // OSS 删除失败不阻塞数据库操作
        }

        // 从数据库删除
        await db.delete(schema.materials).where(eq(schema.materials.id, id));

        return reply.send(success(null, '素材已删除'));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code, err.message));
        }
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );

  /**
   * POST /api/v1/materials/:id/favorite
   * 收藏 / 取消收藏素材
   */
  fastify.post(
    '/api/v1/materials/:id/favorite',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        const { id } = request.params;
        const userId = request.userId!;

        const [material] = await db
          .select({ id: schema.materials.id, isFavorite: schema.materials.isFavorite })
          .from(schema.materials)
          .where(and(eq(schema.materials.id, id), eq(schema.materials.userId, userId)))
          .limit(1);

        if (!material) {
          return reply.status(404).send(error(ErrorCode.PARAM_ERROR, '素材不存在'));
        }

        const newFav = !material.isFavorite;
        await db
          .update(schema.materials)
          .set({ isFavorite: newFav, updatedAt: new Date() })
          .where(eq(schema.materials.id, id));

        return reply.send(success({ is_favorite: newFav }, newFav ? '已收藏' : '已取消收藏'));
      } catch (err) {
        if (err instanceof AppError) {
          return reply.status(err.httpStatus).send(error(err.code, err.message));
        }
        return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
      }
    },
  );
}
