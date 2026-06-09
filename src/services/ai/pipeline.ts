/**
 * ClipAI 统一 AI Pipeline
 *
 * 核心设计: 18 个 AI 工具 = 1 套 Pipeline + 18 套 Prompt/参数
 *
 * 流程:
 *   1. 接收请求 (toolType + image + params)
 *   2. 鉴权 + 积分检查 (middleware 已完成)
 *   3. 上传原图到 OSS
 *   4. 从 DB 查询 prompt_templates，获取 base_prompt + model
 *   5. 将 params 注入 prompt 模板
 *   6. 调用对应 AI 模型
 *   7. 下载结果 → 上传 OSS
 *   8. 入库 (materials 表) + 扣积分
 *   9. 返回结果 URL
 */
import { db, schema } from '../../db';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { getToolPromptConfig, renderPrompt } from './prompts';
import { callModel, callSpecialModel, ImageGenerationInput } from './models';
import { uploadToOSS, downloadFileToBuffer } from '../storage';
import { config } from '../../config';
import {
  AIError,
  AITimeoutError,
  ParamError,
  InsufficientCreditsError,
} from '../../utils/errors';
import { ErrorCode } from '../../utils/response';

// ==================== 类型定义 ====================
export interface EnhanceRequest {
  toolType: string;
  imageBuffer: Buffer;
  imageFileName: string;
  imageMimeType: string;
  params: Record<string, unknown>;
  maskBuffer?: Buffer;
  maskFileName?: string;
  webhookUrl?: string;
}

export interface EnhanceResult {
  taskId: string;
  status: 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  originalUrl?: string;
  processingTimeMs?: number;
  creditsUsed?: number;
  estimatedSeconds?: number;
  errorMessage?: string;
}

export interface TaskStatus {
  taskId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  resultUrl?: string;
  originalUrl?: string;
  errorMessage?: string;
  processingTimeMs?: number;
  creditsUsed?: number;
}

// ==================== 图片格式校验 ====================
function validateImageFormat(mimeType: string) {
  const allowedMap: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/heic': ['heic'],
    'image/heif': ['heic'],
  };
  if (!allowedMap[mimeType]) {
    throw new ParamError(
      `不支持的图片格式: ${mimeType}，仅支持 ${config.limits.allowedImageTypes.join(', ')}`,
    );
  }
}

function validateImageSize(sizeBytes: number) {
  const maxBytes = config.limits.maxImageSizeMb * 1024 * 1024;
  if (sizeBytes > maxBytes) {
    throw new ParamError(
      `图片大小 ${(sizeBytes / 1024 / 1024).toFixed(1)}MB 超过限制 ${config.limits.maxImageSizeMb}MB`,
    );
  }
}

// ==================== 积分检查与扣减 ====================
async function checkCredits(userId: string, required: number): Promise<void> {
  const [user] = await db
    .select({
      role: schema.users.role,
      credits: schema.users.credits,
      freeDailyUsed: schema.users.freeDailyUsed,
      freeDailyDate: schema.users.freeDailyDate,
      proExpiresAt: schema.users.proExpiresAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) throw new AIError('用户不存在');

  const now = new Date();
  if (user.role === 'pro' && user.proExpiresAt && user.proExpiresAt < now) {
    await db.update(schema.users).set({ role: 'free' as const }).where(eq(schema.users.id, userId));
  }

  const today = now.toISOString().slice(0, 10);

  if (user.role === 'pro' || user.role === 'admin') {
    if (user.credits < required) {
      throw new InsufficientCreditsError('积分不足，请购买更多积分');
    }
  } else {
    if (user.freeDailyDate === today && user.freeDailyUsed >= config.limits.freeDailyCredits) {
      throw new InsufficientCreditsError(
        `今日免费次数已用完 (${config.limits.freeDailyCredits}次/天)，请升级 Pro 会员`,
      );
    }
  }
}

async function deductCredits(userId: string, amount: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const [user] = await db
    .select({ role: schema.users.role, freeDailyDate: schema.users.freeDailyDate })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user) return;

  if (user.role === 'pro' || user.role === 'admin') {
    await db
      .update(schema.users)
      .set({ credits: sql`credits - ${amount}` })
      .where(eq(schema.users.id, userId));
  } else {
    const isNewDay = user.freeDailyDate !== today;
    await db
      .update(schema.users)
      .set({
        freeDailyDate: today,
        freeDailyUsed: isNewDay ? 1 : sql`free_daily_used + 1`,
      })
      .where(eq(schema.users.id, userId));
  }
}

// ==================== 核心 Pipeline ====================
export async function enhanceImage(
  userId: string,
  request: EnhanceRequest,
): Promise<EnhanceResult> {
  const startTime = Date.now();

  // Step 1: 参数校验
  validateImageFormat(request.imageMimeType);
  validateImageSize(request.imageBuffer.length);

  const toolConfig = getToolPromptConfig(request.toolType);
  if (!toolConfig) throw new ParamError(`未知的 tool_type: ${request.toolType}`);

  // Step 2: 积分检查
  await checkCredits(userId, toolConfig.creditCost);

  // Step 3: 上传原图到 OSS
  const fileExt = request.imageFileName.split('.').pop() || 'png';
  const uploadKey = `uploads/${userId}/${uuidv4()}.${fileExt}`;
  const originalUrl = await uploadToOSS(uploadKey, request.imageBuffer, request.imageMimeType);

  let maskUrl: string | undefined;
  if (request.maskBuffer && request.maskFileName) {
    const maskExt = request.maskFileName.split('.').pop() || 'png';
    const maskKey = `masks/${userId}/${uuidv4()}.${maskExt}`;
    maskUrl = await uploadToOSS(maskKey, request.maskBuffer, 'image/png');
  }

  // Step 4: 创建任务记录 (MySQL 不支持 RETURNING, 用 uuid 预生成)
  const taskId = uuidv4();
  await db.insert(schema.tasks).values({
    id: taskId,
    userId,
    toolType: request.toolType,
    status: 'processing',
    originalUrl,
    maskUrl: maskUrl || null,
    params: request.params,
    creditsUsed: toolConfig.creditCost,
    webhookUrl: request.webhookUrl || null,
  });

  // Step 5: 判断异步
  const isAsync = toolConfig.estimatedSeconds > 10;
  if (isAsync) {
    processTaskAsync(taskId, userId, request, toolConfig, originalUrl, maskUrl).catch((err) => {
      console.error(`[Pipeline] 异步任务 ${taskId} 失败:`, err);
    });
    return {
      taskId,
      status: 'processing',
      originalUrl,
      estimatedSeconds: toolConfig.estimatedSeconds,
      creditsUsed: toolConfig.creditCost,
    };
  }

  // Step 6: 同步处理
  try {
    const result = await executeAITask(toolConfig.toolType, toolConfig, request.params, originalUrl, maskUrl);

    // Step 7: 上传结果
    const resultExt = toolConfig.isVideo ? 'mp4' : 'png';
    const resultKey = `results/${userId}/${taskId}.${resultExt}`;
    const resultBuffer = await fetchResultAsBuffer(result.urls[0], toolConfig.isVideo);
    const resultUrl = await uploadToOSS(resultKey, resultBuffer, (result as any).contentType || 'image/png');

    // Step 8: 更新任务 + 扣积分
    const processingTimeMs = Date.now() - startTime;
    await db.update(schema.tasks).set({
      status: 'completed',
      resultUrl,
      processingTimeMs,
      completedAt: new Date(),
      modelUsed: toolConfig.modelName,
    }).where(eq(schema.tasks.id, taskId));

    await deductCredits(userId, toolConfig.creditCost);

    // Step 9: 录入素材库
    await db.insert(schema.materials).values({
      id: uuidv4(),
      userId,
      type: toolConfig.isVideo ? 'video' : 'image',
      url: resultUrl,
      toolType: request.toolType,
      taskId,
    });

    return { taskId, status: 'completed', resultUrl, originalUrl, processingTimeMs, creditsUsed: toolConfig.creditCost };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'AI 处理失败';
    await db.update(schema.tasks).set({
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
    }).where(eq(schema.tasks.id, taskId));

    throw error instanceof AIError ? error : new AIError(errorMessage);
  }
}

async function processTaskAsync(
  taskId: string,
  userId: string,
  request: EnhanceRequest,
  toolConfig: ReturnType<typeof getToolPromptConfig>,
  originalUrl: string,
  maskUrl?: string,
) {
  const startTime = Date.now();
  try {
    if (!toolConfig) throw new Error('Invalid tool config');

    const result = await executeAITask(toolConfig.toolType, toolConfig, request.params, originalUrl, maskUrl);

    const resultExt = toolConfig.isVideo ? 'mp4' : 'png';
    const resultKey = `results/${userId}/${taskId}.${resultExt}`;
    const resultBuffer = await fetchResultAsBuffer(result.urls[0], toolConfig.isVideo);
    const resultUrl = await uploadToOSS(resultKey, resultBuffer, 'image/png');

    await db.update(schema.tasks).set({
      status: 'completed',
      resultUrl,
      processingTimeMs: Date.now() - startTime,
      completedAt: new Date(),
      modelUsed: toolConfig.modelName,
    }).where(eq(schema.tasks.id, taskId));

    await deductCredits(userId, toolConfig.creditCost);

    await db.insert(schema.materials).values({
      id: uuidv4(),
      userId,
      type: toolConfig.isVideo ? 'video' : 'image',
      url: resultUrl,
      toolType: request.toolType,
      taskId,
    });

    if (request.webhookUrl) {
      sendWebhook(request.webhookUrl, { taskId, status: 'completed', resultUrl }).catch(() => {});
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'AI 处理失败';
    await db.update(schema.tasks).set({
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
    }).where(eq(schema.tasks.id, taskId));

    if (request.webhookUrl) {
      sendWebhook(request.webhookUrl, { taskId, status: 'failed', errorMessage }).catch(() => {});
    }
  }
}

async function executeAITask(
  toolType: string,
  toolConfig: NonNullable<ReturnType<typeof getToolPromptConfig>>,
  params: Record<string, unknown>,
  originalUrl: string,
  maskUrl?: string,
) {
  const mergedParams = { ...toolConfig.defaultParams, ...params };
  const renderedPrompt = renderPrompt(toolConfig.basePrompt, mergedParams);

  const specialModels = ['bg_remove', 'hd_repair'] as const;
  if ((specialModels as readonly string[]).includes(toolType)) {
    return callSpecialModel(toolType as 'bg_remove' | 'hd_repair', originalUrl, mergedParams) as Promise<{ urls: string[] }>;
  }

  const modelInput: ImageGenerationInput = {
    prompt: renderedPrompt,
    negativePrompt: toolConfig.negativePrompt,
    imageUrl: originalUrl,
    maskUrl,
    imageStrength: (mergedParams.intensity as number) ? (mergedParams.intensity as number) / 100 : 0.75,
    guidanceScale: 7.5,
    numInferenceSteps: 30,
    extra: mergedParams,
  };

  return callModel({ modelVersion: toolConfig.replicateModel, input: modelInput, isVideo: toolConfig.isVideo });
}

// ==================== 辅助函数 ====================
async function fetchResultAsBuffer(url: string, _isVideo: boolean): Promise<Buffer> {
  if (url.startsWith('data:')) {
    const base64 = url.split(',')[1];
    return Buffer.from(base64, 'base64');
  }
  return downloadFileToBuffer(url);
}

async function sendWebhook(url: string, data: Record<string, unknown>) {
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {
    console.error(`[Webhook] 发送失败: ${url}`);
  }
}

export async function getTaskStatus(taskId: string): Promise<TaskStatus | null> {
  const [task] = await db
    .select({
      id: schema.tasks.id,
      status: schema.tasks.status,
      resultUrl: schema.tasks.resultUrl,
      originalUrl: schema.tasks.originalUrl,
      errorMessage: schema.tasks.errorMessage,
      processingTimeMs: schema.tasks.processingTimeMs,
      creditsUsed: schema.tasks.creditsUsed,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.id, taskId))
    .limit(1);

  if (!task) return null;

  return {
    taskId: task.id,
    status: task.status,
    resultUrl: task.resultUrl || undefined,
    originalUrl: task.originalUrl || undefined,
    errorMessage: task.errorMessage || undefined,
    processingTimeMs: task.processingTimeMs || undefined,
    creditsUsed: task.creditsUsed,
  };
}
