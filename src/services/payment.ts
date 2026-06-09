/**
 * 支付服务
 *
 * Apple App Store 票据验证 + 订阅管理
 */
import { db, schema } from '../db';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { ParamError } from '../utils/errors';
import axios from 'axios';

// ==================== Apple 票据验证 ====================

interface AppleReceiptResponse {
  status: number;
  environment?: 'Sandbox' | 'Production';
  receipt?: {
    receipt_type: string;
    bundle_id: string;
    application_version: string;
    in_app: AppleInAppPurchase[];
    original_purchase_date_ms: string;
    request_date_ms: string;
  };
  latest_receipt_info?: AppleInAppPurchase[];
  pending_renewal_info?: ApplePendingRenewal[];
}

interface AppleInAppPurchase {
  product_id: string;
  transaction_id: string;
  original_transaction_id: string;
  purchase_date_ms: string;
  original_purchase_date_ms: string;
  expires_date_ms?: string;
  is_trial_period?: string;
  is_in_intro_offer_period?: string;
  cancellation_date_ms?: string;
  cancellation_reason?: string;
}

interface ApplePendingRenewal {
  auto_renew_product_id: string;
  auto_renew_status: string; // "0" = off, "1" = on
  expiration_intent: string;
  grace_period_expires_date_ms?: string;
}

/**
 * 验证 Apple App Store 收据
 *
 * 流程:
 * 1. 先验证生产环境
 * 2. 如果返回 21007，则验证沙盒环境
 */
export async function verifyAppleReceipt(
  userId: string,
  receiptData: string,
): Promise<{ success: boolean; planId?: string; expiresAt?: Date }> {
  // 先尝试生产环境
  let result = await verifyWithApple(config.apple.verifyReceiptUrl, receiptData);

  // 21007 = 沙盒收据，需要验证沙盒环境
  if (result.status === 21007) {
    result = await verifyWithApple(config.apple.verifySandboxUrl, receiptData);
  }

  if (result.status !== 0) {
    throw new ParamError(`票据验证失败 (code: ${result.status})`);
  }

  // 处理最新交易
  const purchases = result.latest_receipt_info || result.receipt?.in_app || [];
  if (purchases.length === 0) {
    return { success: false };
  }

  // 找到最新的有效订阅
  const now = Date.now();
  const validPurchase = purchases
    .filter((p) => {
      // 排除已取消的
      if (p.cancellation_date_ms) return false;
      // 检查过期时间
      if (!p.expires_date_ms) return false;
      return parseInt(p.expires_date_ms) > now;
    })
    .sort((a, b) => parseInt(b.purchase_date_ms) - parseInt(a.purchase_date_ms))[0];

  if (!validPurchase) {
    return { success: false };
  }

  const expiresAt = new Date(parseInt(validPurchase.expires_date_ms!));
  const planId = validPurchase.product_id;

  // 更新用户角色
  await db
    .update(schema.users)
    .set({
      role: 'pro',
      proExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(schema.users.id, userId));

  // 记录订阅
  const [existing] = await db
    .select()
    .from(schema.subscriptions)
    .where(
      eq(schema.subscriptions.originalTransactionId, validPurchase.original_transaction_id),
    )
    .limit(1);

  if (existing) {
    await db
      .update(schema.subscriptions)
      .set({
        status: 'active',
        latestReceipt: receiptData,
        expiresAt,
        autoRenew: true,
        updatedAt: new Date(),
      })
      .where(eq(schema.subscriptions.id, existing.id));
  } else {
    await db.insert(schema.subscriptions).values({
      id: uuidv4(),
      userId,
      planId,
      status: 'active',
      originalTransactionId: validPurchase.original_transaction_id,
      latestReceipt: receiptData,
      expiresAt,
      autoRenew: true,
    });
  }

  // 根据方案赠送积分
  const [plan] = await db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.productId, planId))
    .limit(1);

  if (plan) {
    await db
      .update(schema.users)
      .set({ credits: sql`credits + ${plan.creditsPerPeriod}` } as any)
      .where(eq(schema.users.id, userId));
  }

  return { success: true, planId, expiresAt };
}

async function verifyWithApple(
  url: string,
  receiptData: string,
): Promise<AppleReceiptResponse> {
  const response = await axios.post(
    url,
    {
      'receipt-data': receiptData,
      password: config.apple.sharedSecret,
      'exclude-old-transactions': true,
    },
    { timeout: 15_000 },
  );
  return response.data;
}

// ==================== 订阅状态查询 ====================
export async function getSubscriptionStatus(userId: string) {
  const [subscription] = await db
    .select()
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .orderBy(schema.subscriptions.createdAt)
    .limit(1);

  const [user] = await db
    .select({
      role: schema.users.role,
      credits: schema.users.credits,
      proExpiresAt: schema.users.proExpiresAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  // 检查 Pro 是否过期
  if (user?.role === 'pro' && user.proExpiresAt && user.proExpiresAt < new Date()) {
    await db
      .update(schema.users)
      .set({ role: 'free', updatedAt: new Date() })
      .where(eq(schema.users.id, userId));

    return {
      isPro: false,
      credits: user.credits,
      subscription: null,
    };
  }

  return {
    isPro: user?.role === 'pro' || user?.role === 'admin',
    credits: user?.credits || 0,
    subscription: subscription
      ? {
          planId: subscription.planId,
          status: subscription.status,
          expiresAt: subscription.expiresAt,
          autoRenew: subscription.autoRenew,
        }
      : null,
  };
}

// ==================== 订阅方案 ====================
export async function getPlans() {
  return db
    .select()
    .from(schema.plans)
    .where(eq(schema.plans.isActive, true))
    .orderBy(schema.plans.sortOrder);
}

// ==================== 恢复购买 ====================
export async function restorePurchases(userId: string, receiptData: string) {
  return verifyAppleReceipt(userId, receiptData);
}

