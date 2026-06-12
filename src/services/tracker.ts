/**
 * 事件追踪服务
 *
 * 记录业务事件到结构化日志文件，后续可升级为写入 analytics_events 表
 * 日志文件路径: data/events-YYYY-MM-DD.jsonl
 *
 * 异步执行，失败不影响主流程
 */
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');

async function ensureDataDir() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {
    // 目录已存在
  }
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 记录一个业务事件
 * @param userId 用户 ID
 * @param eventName 事件名称 (snake_case)
 * @param properties 事件属性
 */
export async function trackEvent(
  userId: string,
  eventName: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    await ensureDataDir();

    const entry = JSON.stringify({
      user_id: userId,
      event: eventName,
      properties,
      timestamp: new Date().toISOString(),
    });

    const filePath = path.join(DATA_DIR, `events-${todayStr()}.jsonl`);
    await fs.appendFile(filePath, entry + '\n', 'utf-8');
  } catch {
    // 静默失败：事件记录不应影响业务流程
  }
}

/**
 * 记录注册完成事件
 */
export function trackSignup(userId: string, phone?: string): void {
  trackEvent(userId, 'signup_complete', {
    signup_method: 'phone',
    phone_masked: phone ? phone.slice(0, 3) + '****' + phone.slice(-4) : undefined,
    is_new_user: true,
  }).catch(() => {});
}

/**
 * 记录登录事件
 */
export function trackLogin(userId: string): void {
  trackEvent(userId, 'login', { login_method: 'phone' }).catch(() => {});
}

/**
 * 记录 AI 任务完成事件
 */
export function trackAiTaskComplete(
  userId: string,
  toolType: string,
  creditsUsed: number,
  processingTimeMs: number,
): void {
  trackEvent(userId, 'ai_task_complete', {
    tool_type: toolType,
    credits_used: creditsUsed,
    processing_time_ms: processingTimeMs,
    status: 'completed',
  }).catch(() => {});
}

/**
 * 记录 AI 任务失败事件
 */
export function trackAiTaskFailed(
  userId: string,
  toolType: string,
  errorMessage?: string,
): void {
  trackEvent(userId, 'ai_task_failed', {
    tool_type: toolType,
    error_message: errorMessage || 'unknown',
  }).catch(() => {});
}

/**
 * 记录订阅开始事件
 */
export function trackSubscriptionStart(
  userId: string,
  planId: string,
): void {
  trackEvent(userId, 'subscription_start', {
    plan_id: planId,
  }).catch(() => {});
}

/**
 * 记录素材保存事件
 */
export function trackMaterialSave(
  userId: string,
  type: string,
  toolType?: string,
): void {
  trackEvent(userId, 'material_save', {
    type,
    tool_type: toolType || null,
  }).catch(() => {});
}
