/**
 * 认证服务
 *
 * 手机号 + 验证码登录，JWT Token 签发
 */
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { signToken } from '../middleware/auth';
import { config } from '../config';
import { ParamError, UnauthorizedError } from '../utils/errors';
import { Redis } from 'ioredis';

// ==================== 验证码管理 ====================

/**
 * 生成随机 6 位验证码
 */
function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * 发送短信验证码
 *
 * 使用阿里云短信服务（后续可扩展其他提供商）
 */
export async function sendVerificationCode(
  phone: string,
  redis?: Redis,
): Promise<{ success: boolean; expiresIn: number }> {
  // 校验手机号格式
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw new ParamError('手机号格式不正确');
  }

  const code = generateCode();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 分钟过期

  // 60 秒内不允许重复发送
  if (redis) {
    const cooldownKey = `sms:cooldown:${phone}`;
    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) {
      throw new ParamError('验证码发送过于频繁，请 60 秒后再试');
    }
    await redis.setex(cooldownKey, 60, '1');
  }

  // 将验证码存入数据库 (MySQL 需要显式提供 UUID)
  const verificationId = uuidv4();
  await db.insert(schema.verificationCodes).values({
    id: verificationId,
    phone,
    code,
    expiresAt,
    used: false,
  });

  // 发送短信（TODO: 对接实际短信服务商）
  await sendSMS(phone, code);

  // 存入 Redis 缓存（3 分钟有效，用于快速校验）
  if (redis) {
    await redis.setex(`sms:code:${phone}`, 300, code);
  }

  return { success: true, expiresIn: 300 };
}

/**
 * 调用短信服务商发送验证码
 */
async function sendSMS(phone: string, code: string): Promise<void> {
  const { provider } = config.sms;

  if (provider === 'aliyun') {
    // 阿里云短信
    // TODO: 对接阿里云 SMS SDK
    console.log(`[SMS] 发送验证码到 ${phone}: ${code}`);
    return;
  }

  if (provider === 'console' || config.env === 'development') {
    // 开发环境，仅打印到控制台
    console.log(`[SMS DEV] 📱 验证码发送到 ${phone}: ${code}`);
    return;
  }

  console.warn(`[SMS] 未知短信服务商: ${provider}`);
}

/**
 * 验证短信验证码
 */
async function verifyCode(phone: string, code: string, redis?: Redis): Promise<boolean> {
  // 先查 Redis 缓存
  if (redis) {
    const cached = await redis.get(`sms:code:${phone}`);
    if (cached && cached === code) {
      await redis.del(`sms:code:${phone}`);
      return true;
    }
  }

  // 查询数据库
  const [record] = await db
    .select()
    .from(schema.verificationCodes)
    .where(
      and(
        eq(schema.verificationCodes.phone, phone),
        eq(schema.verificationCodes.code, code),
        eq(schema.verificationCodes.used, false),
      ),
    )
    .orderBy(schema.verificationCodes.createdAt)
    .limit(1);

  if (!record) return false;

  // 检查是否过期
  if (new Date() > record.expiresAt) {
    return false;
  }

  // 标记为已使用
  await db
    .update(schema.verificationCodes)
    .set({ used: true })
    .where(eq(schema.verificationCodes.id, record.id));

  return true;
}

// ==================== 登录 / 注册 ====================

export interface LoginResult {
  token: string;
  user: {
    id: string;
    phone: string;
    nickname: string | null;
    avatarUrl: string | null;
    role: string;
    credits: number;
    isNewUser: boolean;
  };
}

/**
 * 验证码登录（含自动注册）
 */
export async function loginWithCode(
  phone: string,
  code: string,
  redis?: Redis,
): Promise<LoginResult> {
  // 校验手机号格式
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    throw new ParamError('手机号格式不正确');
  }

  // 校验验证码
  const isValid = await verifyCode(phone, code, redis);
  if (!isValid) {
    throw new ParamError('验证码错误或已过期');
  }

  // 查找或创建用户
  let [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.phone, phone))
    .limit(1);

  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    // 自动注册 (MySQL: 预生成 UUID)
    const newUserId = uuidv4();
    await db.insert(schema.users).values({
      id: newUserId,
      phone,
      nickname: `用户${phone.slice(-4)}`,
      role: 'free',
      credits: 0,
      freeDailyUsed: 0,
      freeDailyDate: new Date().toISOString().slice(0, 10),
      lastLoginAt: new Date(),
    });

    // 重新查询刚创建的用户
    const [createdUser] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, newUserId))
      .limit(1);
    user = createdUser;
  } else {
    // 更新登录时间
    await db
      .update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, user.id));
  }

  // 签发 JWT
  const token = signToken({
    userId: user.id,
    phone: user.phone,
    role: user.role,
  });

  return {
    token,
    user: {
      id: user.id,
      phone: user.phone,
      nickname: user.nickname,
      avatarUrl: user.avatarUrl,
      role: user.role,
      credits: user.credits,
      isNewUser,
    },
  };
}

/**
 * 获取用户资料
 */
export async function getUserProfile(userId: string) {
  const [user] = await db
    .select({
      id: schema.users.id,
      phone: schema.users.phone,
      nickname: schema.users.nickname,
      avatarUrl: schema.users.avatarUrl,
      role: schema.users.role,
      credits: schema.users.credits,
      proExpiresAt: schema.users.proExpiresAt,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) throw new UnauthorizedError('用户不存在');

  return user;
}

/**
 * 更新用户资料
 */
export async function updateProfile(
  userId: string,
  data: { nickname?: string; avatarUrl?: string },
) {
  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (data.nickname !== undefined) updateData.nickname = data.nickname;
  if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;

  await db.update(schema.users).set(updateData).where(eq(schema.users.id, userId));

  return getUserProfile(userId);
}
