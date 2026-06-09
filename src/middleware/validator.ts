import { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { error, ErrorCode } from '../utils/response';

/**
 * 请求体参数校验中间件工厂
 * 使用 Zod schema 校验 JSON body
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      const parsed = schema.parse(request.body);
      request.body = parsed;
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return reply.status(400).send(
          error(ErrorCode.PARAM_ERROR, '参数校验失败', details as unknown as null),
        );
      }
      return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '无效的请求参数'));
    }
  };
}

/**
 * 查询参数校验中间件工厂
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return async function (request: FastifyRequest, reply: FastifyReply) {
    try {
      const parsed = schema.parse(request.query);
      request.query = parsed;
    } catch (err) {
      if (err instanceof ZodError) {
        const details = err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return reply.status(400).send(
          error(ErrorCode.PARAM_ERROR, '查询参数校验失败', details as unknown as null),
        );
      }
      return reply.status(400).send(error(ErrorCode.PARAM_ERROR, '无效的查询参数'));
    }
  };
}
