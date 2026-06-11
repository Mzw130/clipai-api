import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { error, ErrorCode } from '../utils/response';

export interface JwtPayload {
  userId: string;
  phone: string;
  role: string;
  iat?: number;
  exp?: number;
}

// 扩展 Fastify Request 类型
declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    userRole?: string;
    userPhone?: string;
  }
}

/**
 * JWT 鉴权中间件 —— 验证 Bearer Token
 */
export async function authGuard(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send(error(ErrorCode.UNAUTHORIZED));
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;

    // 检查用户是否存在且状态正常
    const [user] = await db
      .select({ id: schema.users.id, role: schema.users.role, status: schema.users.status })
      .from(schema.users)
      .where(eq(schema.users.id, payload.userId))
      .limit(1);

    if (!user || user.status !== 'active') {
      return reply.status(401).send(error(ErrorCode.UNAUTHORIZED));
    }

    request.userId = payload.userId;
    request.userRole = payload.role;
    request.userPhone = payload.phone;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return reply.status(401).send(error(ErrorCode.UNAUTHORIZED, 'token 已过期'));
    }
    return reply.status(401).send(error(ErrorCode.UNAUTHORIZED));
  }
}

/**
 * Pro 会员鉴权中间件 —— 要求 Pro 或 Admin 角色
 */
export async function proGuard(request: FastifyRequest, reply: FastifyReply) {
  if (request.userRole !== 'pro' && request.userRole !== 'admin') {
    return reply.status(403).send(error(ErrorCode.PRO_REQUIRED));
  }
}

/**
 * Admin 鉴权中间件 —— 仅限 Admin 角色
 */
export async function adminGuard(request: FastifyRequest, reply: FastifyReply) {
  if (request.userRole !== 'admin') {
    return reply.status(403).send(error(ErrorCode.FORBIDDEN, '无权限访问，仅限管理员'));
  }
}

/**
 * 生成 JWT Token
 */
export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

/**
 * 从 Bearer Token 中解析 userId（可选鉴权，不强制）
 */
export async function optionalAuth(request: FastifyRequest) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  try {
    const token = authHeader.slice(7);
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload;
    request.userId = payload.userId;
    request.userRole = payload.role;
    return payload;
  } catch {
    return null;
  }
}
