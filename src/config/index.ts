import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  // 环境
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  dataDir: process.env.DATA_DIR || path.join(process.cwd(), 'data'),
  // 视频生成结果额外输出目录（桌面等方便查看的位置）
  videoOutputDir: process.env.VIDEO_OUTPUT_DIR || '',

  // 数据库
  database: {
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306', 10),
    user: process.env.MYSQL_USER || 'clipai',
    password: process.env.MYSQL_PASSWORD || 'clipai_pass',
    database: process.env.MYSQL_DATABASE || 'clipai',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  // AI 服务
  ai: {
    replicateToken: process.env.REPLICATE_API_TOKEN || '',
    sdEndpoint: process.env.SD_ENDPOINT || '',
    sdApiKey: process.env.SD_API_KEY || '',
    insightfaceEndpoint: process.env.INSIGHTFACE_ENDPOINT || '',
    rembgEndpoint: process.env.REMBG_ENDPOINT || '',
    // Seedance 视频生成
    seedanceEndpoint: process.env.SEEDANCE_ENDPOINT || '',
    seedanceApiKey: process.env.SEEDANCE_API_KEY || '',
    seedanceModel: process.env.SEEDANCE_MODEL || 'seedance-1.0-pro',
    // Seedream 图片生成
    seedreamEndpoint: process.env.SEEDREAM_ENDPOINT || '',
    seedreamApiKey: process.env.SEEDREAM_API_KEY || '',
    seedreamModel: process.env.SEEDREAM_MODEL || 'doubao-seedream-5.0-lite',
  },

  // 对象存储
  oss: {
    endpoint: process.env.OSS_ENDPOINT || '',
    accessKey: process.env.OSS_ACCESS_KEY || '',
    secretKey: process.env.OSS_SECRET_KEY || '',
    bucket: process.env.OSS_BUCKET || 'clipai',
    publicUrl: process.env.OSS_PUBLIC_URL || '',
    region: process.env.OSS_REGION || 'auto',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // 短信
  sms: {
    provider: process.env.SMS_PROVIDER || '',
    accessKey: process.env.SMS_ACCESS_KEY || '',
    secretKey: process.env.SMS_SECRET_KEY || '',
    signName: process.env.SMS_SIGN_NAME || 'ClipAI',
    templateCode: process.env.SMS_TEMPLATE_CODE || '',
  },

  // 内容审核
  contentModeration: {
    endpoint: process.env.CONTENT_MODERATION_ENDPOINT || '',
    key: process.env.CONTENT_MODERATION_KEY || '',
  },

  // Apple 支付
  apple: {
    sharedSecret: process.env.APPLE_SHARED_SECRET || '',
    verifyReceiptUrl: process.env.APPLE_VERIFY_RECEIPT_URL || 'https://buy.itunes.apple.com/verifyReceipt',
    verifySandboxUrl: process.env.APPLE_VERIFY_SANDBOX_URL || 'https://sandbox.itunes.apple.com/verifyReceipt',
  },

  // 日志
  logLevel: process.env.LOG_LEVEL || 'info',

  // 限制
  limits: {
    maxImageSizeMb: parseInt(process.env.MAX_IMAGE_SIZE_MB || '20', 10),
    allowedImageTypes: (process.env.ALLOWED_IMAGE_TYPES || 'jpg,jpeg,png,webp,heic').split(','),
    rateLimitFree: parseInt(process.env.RATE_LIMIT_FREE || '5', 10),
    rateLimitPro: parseInt(process.env.RATE_LIMIT_PRO || '30', 10),
    freeDailyCredits: parseInt(process.env.FREE_DAILY_CREDITS || '5', 10),
    proMonthlyCredits: parseInt(process.env.PRO_MONTHLY_CREDITS || '200', 10),
  },
} as const;
