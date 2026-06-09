/**
 * 模板 & 探索页路由
 *
 * GET /api/v1/templates  — 模板列表
 * GET /api/v1/explore    — 探索页内容
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db, schema } from '../db';
import { eq, desc } from 'drizzle-orm';
import { success, error, ErrorCode } from '../utils/response';

export default async function contentRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/templates
   * 获取模板列表
   */
  fastify.get('/api/v1/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { category?: string };
      const conditions = [eq(schema.templates.isActive, true)];

      const templates = await db
        .select()
        .from(schema.templates)
        .where(conditions.length > 0 ? conditions[0] : undefined)
        .orderBy(desc(schema.templates.sortOrder))
        .limit(50);

      return reply.send(success(templates));
    } catch (err) {
      return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
    }
  });

  /**
   * GET /api/v1/explore
   * 获取探索页内容
   */
  fastify.get('/api/v1/explore', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { category?: string };
      const conditions = [eq(schema.exploreContents.isActive, true)];

      const items = await db
        .select()
        .from(schema.exploreContents)
        .where(conditions.length > 0 ? conditions[0] : undefined)
        .orderBy(desc(schema.exploreContents.createdAt))
        .limit(20);

      return reply.send(success(items));
    } catch (err) {
      return reply.status(500).send(error(ErrorCode.INTERNAL_ERROR));
    }
  });
}
