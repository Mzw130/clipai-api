import {
  mysqlTable,
  mysqlEnum,
  varchar,
  text,
  timestamp,
  int,
  boolean,
  json,
  decimal,
  index,
  uniqueIndex,
  char,
  datetime,
  mediumtext,
} from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

// ==================== 枚举类型 ====================
// MySQL 使用 mysqlEnum 内联定义，不需要单独的 pgEnum

// ==================== 用户表 ====================
export const users = mysqlTable('users', {
  id: char('id', { length: 36 }).primaryKey().notNull(), // UUID
  phone: varchar('phone', { length: 20 }).notNull(),
  nickname: varchar('nickname', { length: 100 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  role: mysqlEnum('role', ['free', 'pro', 'admin']).default('free').notNull(),
  credits: int('credits').default(0).notNull(),
  freeDailyUsed: int('free_daily_used').default(0).notNull(),
  freeDailyDate: varchar('free_daily_date', { length: 10 }),
  proExpiresAt: datetime('pro_expires_at'),
  status: varchar('status', { length: 20 }).default('active').notNull(),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastLoginAt: datetime('last_login_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  phoneIdx: uniqueIndex('users_phone_idx').on(table.phone),
  statusIdx: index('users_status_idx').on(table.status),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

// ==================== 验证码表 ====================
export const verificationCodes = mysqlTable('verification_codes', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  code: varchar('code', { length: 10 }).notNull(),
  used: boolean('used').default(false).notNull(),
  expiresAt: datetime('expires_at').notNull(),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  phoneCodeIdx: index('verification_phone_code_idx').on(table.phone, table.code),
}));

// ==================== Prompt 模板表 ====================
export const promptTemplates = mysqlTable('prompt_templates', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  toolType: varchar('tool_type', { length: 50 }).unique().notNull(),
  modelName: varchar('model_name', { length: 100 }).notNull(),
  basePrompt: text('base_prompt').notNull(),
  negativePrompt: text('negative_prompt'),
  defaultParams: json('default_params').$type<Record<string, unknown>>(),
  maxIntensity: int('max_intensity').default(100),
  isActive: boolean('is_active').default(true).notNull(),
  replicateVersion: varchar('replicate_version', { length: 100 }),
  estimatedSeconds: int('estimated_seconds').default(5),
  creditCost: int('credit_cost').default(1),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  toolTypeIdx: uniqueIndex('prompt_tool_type_idx').on(table.toolType),
}));

export type PromptTemplate = typeof promptTemplates.$inferSelect;

// ==================== AI 任务表 ====================
export const tasks = mysqlTable('tasks', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  userId: char('user_id', { length: 36 }).notNull(),
  toolType: varchar('tool_type', { length: 50 }).notNull(),
  status: mysqlEnum('status', ['pending', 'processing', 'completed', 'failed']).default('pending').notNull(),
  originalUrl: varchar('original_url', { length: 1000 }),
  maskUrl: varchar('mask_url', { length: 1000 }),
  params: json('params').$type<Record<string, unknown>>(),
  resultUrl: varchar('result_url', { length: 1000 }),
  errorMessage: text('error_message'),
  processingTimeMs: int('processing_time_ms'),
  creditsUsed: int('credits_used').default(0),
  modelUsed: varchar('model_used', { length: 100 }),
  webhookUrl: varchar('webhook_url', { length: 500 }),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: datetime('completed_at'),
}, (table) => ({
  userIdIdx: index('tasks_user_id_idx').on(table.userId),
  statusIdx: index('tasks_status_idx').on(table.status),
  createdAtIdx: index('tasks_created_at_idx').on(table.createdAt),
}));

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

// ==================== 素材表 ====================
export const materials = mysqlTable('materials', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  userId: char('user_id', { length: 36 }).notNull(),
  type: mysqlEnum('type', ['image', 'video']).notNull(),
  url: varchar('url', { length: 1000 }).notNull(),
  thumbnailUrl: varchar('thumbnail_url', { length: 1000 }),
  width: int('width'),
  height: int('height'),
  sizeBytes: int('size_bytes'),
  toolType: varchar('tool_type', { length: 50 }),
  taskId: char('task_id', { length: 36 }),
  isFavorite: boolean('is_favorite').default(false).notNull(),
  tags: json('tags').$type<string[]>(),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdIdx: index('materials_user_id_idx').on(table.userId),
  typeIdx: index('materials_type_idx').on(table.type),
  createdAtIdx: index('materials_created_at_idx').on(table.createdAt),
}));

export type Material = typeof materials.$inferSelect;

// ==================== 订阅/支付记录表 ====================
export const subscriptions = mysqlTable('subscriptions', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  userId: char('user_id', { length: 36 }).notNull(),
  planId: varchar('plan_id', { length: 50 }).notNull(),
  status: mysqlEnum('status', ['active', 'expired', 'cancelled', 'grace_period']).default('active').notNull(),
  originalTransactionId: varchar('original_transaction_id', { length: 200 }),
  latestReceipt: mediumtext('latest_receipt'),
  expiresAt: datetime('expires_at'),
  autoRenew: boolean('auto_renew').default(true),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  cancelledAt: datetime('cancelled_at'),
}, (table) => ({
  userIdIdx: index('subscriptions_user_id_idx').on(table.userId),
  statusIdx: index('subscriptions_status_idx').on(table.status),
}));

export type Subscription = typeof subscriptions.$inferSelect;

// ==================== 模板表 ====================
export const templates = mysqlTable('templates', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  coverUrl: varchar('cover_url', { length: 500 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  toolType: varchar('tool_type', { length: 50 }),
  params: json('params').$type<Record<string, unknown>>(),
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: int('sort_order').default(0),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type Template = typeof templates.$inferSelect;

// ==================== 探索页内容表 ====================
export const exploreContents = mysqlTable('explore_contents', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  coverUrl: varchar('cover_url', { length: 500 }).notNull(),
  beforeUrl: varchar('before_url', { length: 500 }),
  afterUrl: varchar('after_url', { length: 500 }),
  category: varchar('category', { length: 50 }).notNull(),
  toolType: varchar('tool_type', { length: 50 }),
  userId: char('user_id', { length: 36 }),
  likes: int('likes').default(0),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type ExploreContent = typeof exploreContents.$inferSelect;

// ==================== 订阅方案表 ====================
export const plans = mysqlTable('plans', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  productId: varchar('product_id', { length: 100 }).unique().notNull(),
  type: varchar('type', { length: 20 }).notNull(), // monthly, yearly, lifetime
  price: decimal('price', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).default('USD'),
  creditsPerPeriod: int('credits_per_period').notNull(),
  features: json('features').$type<string[]>(),
  isActive: boolean('is_active').default(true).notNull(),
  sortOrder: int('sort_order').default(0),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type Plan = typeof plans.$inferSelect;

// ==================== AI 模型配置表 ====================
export const aiModelConfigs = mysqlTable('ai_model_configs', {
  id: char('id', { length: 36 }).primaryKey().notNull(),
  name: varchar('name', { length: 50 }).unique().notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  endpoint: varchar('endpoint', { length: 500 }).notNull().default(''),
  apiKey: varchar('api_key', { length: 200 }).notNull().default(''),
  modelName: varchar('model_name', { length: 100 }).notNull().default(''),
  isActive: boolean('is_active').default(true).notNull(),
  extra: json('extra').$type<Record<string, unknown>>(),
  createdAt: datetime('created_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: datetime('updated_at').default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export type AiModelConfig = typeof aiModelConfigs.$inferSelect;
