/**
 * AI 模型运行时配置管理器
 *
 * 从 DB 读取模型配置，支持热更新（无需重启服务）
 * 降级策略: DB 无配置时 fallback 到 .env
 */
import { db, schema } from '../db';
import { eq, desc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { AppError } from '../utils/errors';
import { ErrorCode } from '../utils/response';

export interface ModelConfig {
  id?: string;
  name: string;
  displayName: string;
  endpoint: string;
  apiKey: string;
  modelName: string;
  isActive: boolean;
  extra?: Record<string, unknown>;
}

// 内存缓存
const cache = new Map<string, ModelConfig>();

/**
 * 从数据库加载所有模型配置到内存
 */
export async function loadModelConfigs(): Promise<void> {
  const rows = await db.select().from(schema.aiModelConfigs);
  cache.clear();
  for (const row of rows) {
    cache.set(row.name, {
      id: row.id,
      name: row.name,
      displayName: row.displayName,
      endpoint: row.endpoint,
      apiKey: row.apiKey,
      modelName: row.modelName,
      isActive: row.isActive,
      extra: row.extra as Record<string, unknown> | undefined,
    });
  }
}

/**
 * 获取指定模型配置（优先 DB，fallback .env）
 */
export function getModelConfig(name: string): ModelConfig | null {
  const dbCfg = cache.get(name);

  const envMap: Record<string, { endpoint: string; apiKey: string; modelName: string }> = {
    seedance: {
      endpoint: config.ai.seedanceEndpoint,
      apiKey: config.ai.seedanceApiKey,
      modelName: config.ai.seedanceModel,
    },
    seedream: {
      endpoint: config.ai.seedreamEndpoint,
      apiKey: config.ai.seedreamApiKey,
      modelName: config.ai.seedreamModel,
    },
  };

  const env = envMap[name];

  // DB 有配置用 DB，否则用 env
  if (dbCfg) {
    return { ...dbCfg };
  }

  if (env && (env.apiKey || env.endpoint)) {
    return {
      name,
      displayName: name === 'seedance' ? 'Seedance 图生视频' : 'Seedream 图片生成',
      endpoint: env.endpoint,
      apiKey: env.apiKey,
      modelName: env.modelName,
      isActive: true,
    };
  }

  return null;
}

/**
 * 获取所有已配置的模型列表（只返回 DB 中有记录的）
 */
export function listModelConfigs(): ModelConfig[] {
  if (cache.size === 0) {
    // 从 env fallback
    const list: ModelConfig[] = [];
    const seedance = getModelConfig('seedance');
    const seedream = getModelConfig('seedream');
    if (seedance) list.push(seedance);
    if (seedream) list.push(seedream);
    return list;
  }
  return Array.from(cache.values());
}

/**
 * 创建新模型配置
 */
export async function createModelConfig(data: {
  name: string;
  displayName: string;
  endpoint: string;
  apiKey: string;
  modelName: string;
}): Promise<void> {
  // 检查是否已存在
  const existing = cache.get(data.name);
  if (existing) {
    throw new AppError(ErrorCode.RESOURCE_EXISTS, `模型标识 "${data.name}" 已存在`, 409);
  }

  await db.insert(schema.aiModelConfigs).values({
    id: uuidv4(),
    name: data.name,
    displayName: data.displayName,
    endpoint: data.endpoint,
    apiKey: data.apiKey,
    modelName: data.modelName,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await loadModelConfigs();
}

/**
 * 更新模型配置到 DB 并刷新缓存
 */
export async function updateModelConfig(
  name: string,
  data: { displayName?: string; endpoint?: string; apiKey?: string; modelName?: string; isActive?: boolean },
): Promise<void> {
  if (!cache.has(name)) {
    // 检查 DB 中是否存在（可能缓存未加载）
    const row = await db.select().from(schema.aiModelConfigs).where(eq(schema.aiModelConfigs.name, name)).limit(1);
    if (row.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, `模型 "${name}" 不存在`, 404);
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (data.displayName !== undefined) updates.displayName = data.displayName;
  if (data.endpoint !== undefined) updates.endpoint = data.endpoint;
  if (data.apiKey !== undefined) updates.apiKey = data.apiKey;
  if (data.modelName !== undefined) updates.modelName = data.modelName;
  if (data.isActive !== undefined) updates.isActive = data.isActive;

  await db.update(schema.aiModelConfigs).set(updates).where(eq(schema.aiModelConfigs.name, name));
  await loadModelConfigs();
}

/**
 * 删除模型配置
 */
export async function deleteModelConfig(name: string): Promise<void> {
  if (!cache.has(name)) {
    const row = await db.select().from(schema.aiModelConfigs).where(eq(schema.aiModelConfigs.name, name)).limit(1);
    if (row.length === 0) {
      throw new AppError(ErrorCode.NOT_FOUND, `模型 "${name}" 不存在`, 404);
    }
  }

  await db.delete(schema.aiModelConfigs).where(eq(schema.aiModelConfigs.name, name));
  await loadModelConfigs();
}

/**
 * 模型消耗统计
 */
export async function getModelUsageStats() {
  const rows = await db
    .select({
      modelUsed: schema.tasks.modelUsed,
      count: sql<number>`COUNT(*)`,
      totalCredits: sql<number>`COALESCE(SUM(${schema.tasks.creditsUsed}), 0)`,
    })
    .from(schema.tasks)
    .groupBy(schema.tasks.modelUsed)
    .orderBy(desc(sql`COUNT(*)`));

  const today = await db
    .select({
      count: sql<number>`COUNT(*)`,
      totalCredits: sql<number>`COALESCE(SUM(${schema.tasks.creditsUsed}), 0)`,
    })
    .from(schema.tasks)
    .where(sql`DATE(${schema.tasks.createdAt}) = CURDATE()`)
    .then((r) => r[0]);

  return {
    by_model: rows.map((r) => ({
      model: r.modelUsed || 'unknown',
      calls: r.count,
      credits: r.totalCredits,
    })),
    today_total_calls: today?.count || 0,
    today_total_credits: today?.totalCredits || 0,
  };
}

// 自动加载
loadModelConfigs().catch(() => {});
