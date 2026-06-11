/**
 * Admin 服务层
 *
 * 管理员后台的业务逻辑：统计、用户管理、订阅管理、任务管理
 */
import { db, schema } from '../db';
import { eq, like, and, desc, asc, gte, lte, sql, count, or } from 'drizzle-orm';
import { AppError, ForbiddenError } from '../utils/errors';

// ==================== 类型定义 ====================
export interface AdminStats {
  total_users: number;
  active_users_today: number;
  total_pro_users: number;
  total_tasks: number;
  tasks_today: number;
  total_revenue: string;
  revenue_this_month: string;
}

export interface UserFilters {
  page: number;
  page_size: number;
  search?: string;
  role?: 'free' | 'pro' | 'admin';
  status?: 'active' | 'banned';
  sort_by?: 'created_at' | 'credits' | 'last_login_at';
  sort_order?: 'asc' | 'desc';
}

export interface SubscriptionFilters {
  page: number;
  page_size: number;
  status?: string;
  userId?: string;
}

export interface TaskFilters {
  page: number;
  page_size: number;
  status?: string;
  toolType?: string;
  userId?: string;
  date_from?: string;
  date_to?: string;
}

// ==================== 统计 ====================
export async function getStats(): Promise<AdminStats> {
  const [totalUsers, activeToday, totalPro, totalTasks, tasksToday, revenue, revenueMonth] =
    await Promise.all([
      // 总用户数
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.users)
        .then((r) => r[0]?.count || 0),

      // 今日活跃
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.users)
        .where(sql`DATE(${schema.users.lastLoginAt}) = CURDATE()`)
        .then((r) => r[0]?.count || 0),

      // Pro 用户数
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.users)
        .where(eq(schema.users.role, 'pro'))
        .then((r) => r[0]?.count || 0),

      // 总任务数
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.tasks)
        .then((r) => r[0]?.count || 0),

      // 今日任务数
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(schema.tasks)
        .where(sql`DATE(${schema.tasks.createdAt}) = CURDATE()`)
        .then((r) => r[0]?.count || 0),

      // 总收入
      db
        .select({ total: sql<string>`COALESCE(SUM(${schema.plans.price}), 0)` })
        .from(schema.subscriptions)
        .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.productId))
        .where(eq(schema.subscriptions.status, 'active'))
        .then((r) => String(r[0]?.total || '0')),

      // 本月收入
      db
        .select({ total: sql<string>`COALESCE(SUM(${schema.plans.price}), 0)` })
        .from(schema.subscriptions)
        .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.productId))
        .where(
          and(
            eq(schema.subscriptions.status, 'active'),
            sql`MONTH(${schema.subscriptions.createdAt}) = MONTH(CURDATE())`,
            sql`YEAR(${schema.subscriptions.createdAt}) = YEAR(CURDATE())`,
          ),
        )
        .then((r) => String(r[0]?.total || '0')),
    ]);

  return {
    total_users: totalUsers,
    active_users_today: activeToday,
    total_pro_users: totalPro,
    total_tasks: totalTasks,
    tasks_today: tasksToday,
    total_revenue: revenue,
    revenue_this_month: revenueMonth,
  };
}

// ==================== 用户管理 ====================
function maskPhone(phone: string): string {
  if (phone.length >= 7) {
    return phone.slice(0, 3) + '****' + phone.slice(-4);
  }
  return phone;
}

function mapUser(row: any) {
  return {
    id: row.id,
    phone: maskPhone(row.phone),
    nickname: row.nickname,
    avatarUrl: row.avatar_url || row.avatarUrl,
    role: row.role,
    credits: row.credits,
    freeDailyUsed: row.free_daily_used || row.freeDailyUsed || 0,
    freeDailyDate: row.free_daily_date || row.freeDailyDate,
    proExpiresAt: row.pro_expires_at || row.proExpiresAt,
    status: row.status,
    createdAt: row.created_at || row.createdAt,
    lastLoginAt: row.last_login_at || row.lastLoginAt,
  };
}

export async function listUsers(filters: UserFilters) {
  const conditions: any[] = [];

  if (filters.search) {
    const searchTerm = `%${filters.search}%`;
    conditions.push(
      or(
        like(schema.users.phone, searchTerm),
        like(schema.users.nickname, searchTerm),
      )!,
    );
  }
  if (filters.role) {
    conditions.push(eq(schema.users.role, filters.role));
  }
  if (filters.status) {
    conditions.push(eq(schema.users.status, filters.status));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  // 排序
  const sortColumn =
    filters.sort_by === 'credits'
      ? schema.users.credits
      : filters.sort_by === 'last_login_at'
        ? schema.users.lastLoginAt
        : schema.users.createdAt;
  const orderBy = filters.sort_order === 'asc' ? asc(sortColumn) : desc(sortColumn);

  // 计数
  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.users)
    .where(whereClause);
  const total = countResult?.count || 0;

  // 分页查询
  const offset = (filters.page - 1) * filters.page_size;
  const rows = await db
    .select()
    .from(schema.users)
    .where(whereClause)
    .orderBy(orderBy)
    .limit(filters.page_size)
    .offset(offset);

  return {
    items: rows.map(mapUser),
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.ceil(total / filters.page_size),
    },
  };
}

export async function getUserDetail(userId: string) {
  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) throw new AppError(1001, '用户不存在', 404);

  // 最新订阅
  const [subscription] = await db
    .select({
      id: schema.subscriptions.id,
      planId: schema.subscriptions.planId,
      status: schema.subscriptions.status,
      expiresAt: schema.subscriptions.expiresAt,
      autoRenew: schema.subscriptions.autoRenew,
      createdAt: schema.subscriptions.createdAt,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(1);

  // 最近5个任务
  const recentTasks = await db
    .select({
      id: schema.tasks.id,
      toolType: schema.tasks.toolType,
      status: schema.tasks.status,
      creditsUsed: schema.tasks.creditsUsed,
      createdAt: schema.tasks.createdAt,
    })
    .from(schema.tasks)
    .where(eq(schema.tasks.userId, userId))
    .orderBy(desc(schema.tasks.createdAt))
    .limit(5);

  return {
    ...mapUser(user),
    phone: user.phone, // 管理员可见完整手机号
    subscription: subscription || null,
    recent_tasks: recentTasks,
  };
}

export async function updateUserRole(userId: string, role: string, operatorId: string) {
  if (userId === operatorId) {
    throw new ForbiddenError('不能修改自己的角色');
  }

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) throw new AppError(1001, '用户不存在', 404);

  await db
    .update(schema.users)
    .set({ role: role as any, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  return { success: true };
}

export async function updateUserCredits(userId: string, credits: number) {
  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) throw new AppError(1001, '用户不存在', 404);

  await db
    .update(schema.users)
    .set({ credits, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  return { success: true, credits };
}

export async function updateUserStatus(userId: string, status: string, operatorId: string) {
  if (userId === operatorId) {
    throw new ForbiddenError('不能修改自己的状态');
  }

  const [user] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);

  if (!user) throw new AppError(1001, '用户不存在', 404);

  await db
    .update(schema.users)
    .set({ status, updatedAt: new Date() })
    .where(eq(schema.users.id, userId));

  return { success: true, status };
}

// ==================== 订阅管理 ====================
export async function listSubscriptions(filters: SubscriptionFilters) {
  const conditions: any[] = [];

  if (filters.status) {
    conditions.push(eq(schema.subscriptions.status, filters.status));
  }
  if (filters.userId) {
    conditions.push(eq(schema.subscriptions.userId, filters.userId));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.subscriptions)
    .where(whereClause);
  const total = countResult?.count || 0;

  const offset = (filters.page - 1) * filters.page_size;
  const rows = await db
    .select({
      id: schema.subscriptions.id,
      userId: schema.subscriptions.userId,
      planId: schema.subscriptions.planId,
      status: schema.subscriptions.status,
      originalTransactionId: schema.subscriptions.originalTransactionId,
      expiresAt: schema.subscriptions.expiresAt,
      autoRenew: schema.subscriptions.autoRenew,
      createdAt: schema.subscriptions.createdAt,
      cancelledAt: schema.subscriptions.cancelledAt,
      userPhone: schema.users.phone,
      userNickname: schema.users.nickname,
      planName: schema.plans.name,
      planPrice: schema.plans.price,
    })
    .from(schema.subscriptions)
    .innerJoin(schema.users, eq(schema.subscriptions.userId, schema.users.id))
    .innerJoin(schema.plans, eq(schema.subscriptions.planId, schema.plans.productId))
    .where(whereClause)
    .orderBy(desc(schema.subscriptions.createdAt))
    .limit(filters.page_size)
    .offset(offset);

  return {
    items: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      planId: r.planId,
      status: r.status,
      originalTransactionId: r.originalTransactionId,
      expiresAt: r.expiresAt,
      autoRenew: r.autoRenew,
      createdAt: r.createdAt,
      cancelledAt: r.cancelledAt,
      user: {
        phone: maskPhone(r.userPhone),
        nickname: r.userNickname,
      },
      plan: {
        name: r.planName,
        price: r.planPrice,
      },
    })),
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.ceil(total / filters.page_size),
    },
  };
}

// ==================== 任务管理 ====================
export async function listTasks(filters: TaskFilters) {
  const conditions: any[] = [];

  if (filters.status) {
    conditions.push(eq(schema.tasks.status, filters.status));
  }
  if (filters.toolType) {
    conditions.push(eq(schema.tasks.toolType, filters.toolType));
  }
  if (filters.userId) {
    conditions.push(eq(schema.tasks.userId, filters.userId));
  }
  if (filters.date_from) {
    conditions.push(gte(schema.tasks.createdAt, new Date(filters.date_from)));
  }
  if (filters.date_to) {
    conditions.push(lte(schema.tasks.createdAt, new Date(filters.date_to)));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [countResult] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(schema.tasks)
    .where(whereClause);
  const total = countResult?.count || 0;

  const offset = (filters.page - 1) * filters.page_size;
  const rows = await db
    .select({
      id: schema.tasks.id,
      userId: schema.tasks.userId,
      toolType: schema.tasks.toolType,
      status: schema.tasks.status,
      creditsUsed: schema.tasks.creditsUsed,
      processingTimeMs: schema.tasks.processingTimeMs,
      modelUsed: schema.tasks.modelUsed,
      createdAt: schema.tasks.createdAt,
      completedAt: schema.tasks.completedAt,
      userPhone: schema.users.phone,
      userNickname: schema.users.nickname,
    })
    .from(schema.tasks)
    .innerJoin(schema.users, eq(schema.tasks.userId, schema.users.id))
    .where(whereClause)
    .orderBy(desc(schema.tasks.createdAt))
    .limit(filters.page_size)
    .offset(offset);

  return {
    items: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      toolType: r.toolType,
      status: r.status,
      creditsUsed: r.creditsUsed,
      processingTimeMs: r.processingTimeMs,
      modelUsed: r.modelUsed,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      user: {
        phone: maskPhone(r.userPhone),
        nickname: r.userNickname,
      },
    })),
    pagination: {
      page: filters.page,
      page_size: filters.page_size,
      total,
      total_pages: Math.ceil(total / filters.page_size),
    },
  };
}
