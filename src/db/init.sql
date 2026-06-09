-- ClipAI MySQL 初始化脚本
-- 此文件在 Docker 首次启动时自动执行

CREATE DATABASE IF NOT EXISTS clipai DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE clipai;

-- 用户表
CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  nickname VARCHAR(100),
  avatar_url VARCHAR(500),
  role ENUM('free', 'pro', 'admin') NOT NULL DEFAULT 'free',
  credits INT NOT NULL DEFAULT 0,
  free_daily_used INT NOT NULL DEFAULT 0,
  free_daily_date VARCHAR(10),
  pro_expires_at DATETIME,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_login_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE INDEX users_phone_idx (phone),
  INDEX users_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 验证码表
CREATE TABLE IF NOT EXISTS verification_codes (
  id CHAR(36) PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(10) NOT NULL,
  used BOOLEAN NOT NULL DEFAULT FALSE,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX verification_phone_code_idx (phone, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Prompt 模板表
CREATE TABLE IF NOT EXISTS prompt_templates (
  id CHAR(36) PRIMARY KEY,
  tool_type VARCHAR(50) NOT NULL UNIQUE,
  model_name VARCHAR(100) NOT NULL,
  base_prompt TEXT NOT NULL,
  negative_prompt TEXT,
  default_params JSON,
  max_intensity INT DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  replicate_version VARCHAR(100),
  estimated_seconds INT DEFAULT 5,
  credit_cost INT DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE INDEX prompt_tool_type_idx (tool_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- AI 任务表
CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  tool_type VARCHAR(50) NOT NULL,
  status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
  original_url VARCHAR(1000),
  mask_url VARCHAR(1000),
  params JSON,
  result_url VARCHAR(1000),
  error_message TEXT,
  processing_time_ms INT,
  credits_used INT DEFAULT 0,
  model_used VARCHAR(100),
  webhook_url VARCHAR(500),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  completed_at DATETIME,
  INDEX tasks_user_id_idx (user_id),
  INDEX tasks_status_idx (status),
  INDEX tasks_created_at_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 素材表
CREATE TABLE IF NOT EXISTS materials (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  type ENUM('image', 'video') NOT NULL,
  url VARCHAR(1000) NOT NULL,
  thumbnail_url VARCHAR(1000),
  width INT,
  height INT,
  size_bytes INT,
  tool_type VARCHAR(50),
  task_id CHAR(36),
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  tags JSON,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX materials_user_id_idx (user_id),
  INDEX materials_type_idx (type),
  INDEX materials_created_at_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订阅记录表
CREATE TABLE IF NOT EXISTS subscriptions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  plan_id VARCHAR(50) NOT NULL,
  status ENUM('active', 'expired', 'cancelled', 'grace_period') NOT NULL DEFAULT 'active',
  original_transaction_id VARCHAR(200),
  latest_receipt MEDIUMTEXT,
  expires_at DATETIME,
  auto_renew BOOLEAN DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  cancelled_at DATETIME,
  INDEX subscriptions_user_id_idx (user_id),
  INDEX subscriptions_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 模板表
CREATE TABLE IF NOT EXISTS templates (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  cover_url VARCHAR(500) NOT NULL,
  category VARCHAR(50) NOT NULL,
  tool_type VARCHAR(50),
  params JSON,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 探索页内容表
CREATE TABLE IF NOT EXISTS explore_contents (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  cover_url VARCHAR(500) NOT NULL,
  before_url VARCHAR(500),
  after_url VARCHAR(500),
  category VARCHAR(50) NOT NULL,
  tool_type VARCHAR(50),
  user_id CHAR(36),
  likes INT DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 订阅方案表
CREATE TABLE IF NOT EXISTS plans (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  product_id VARCHAR(100) NOT NULL UNIQUE,
  type VARCHAR(20) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  credits_per_period INT NOT NULL,
  features JSON,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==================== 初始数据 ====================

-- 默认订阅方案
INSERT INTO plans (id, name, product_id, type, price, currency, credits_per_period, features, is_active, sort_order) VALUES
(UUID(), 'Monthly Pro', 'com.clipai.pro.monthly', 'monthly', 9.99, 'USD', 200, '["无限次AI处理", "高清4K输出", "图生视频", "优先处理队列", "去水印"]', TRUE, 1),
(UUID(), 'Yearly Pro', 'com.clipai.pro.yearly', 'yearly', 49.99, 'USD', 3000, '["无限次AI处理", "高清4K输出", "图生视频", "优先处理队列", "去水印", "专属滤镜"]', TRUE, 2),
(UUID(), 'Lifetime Pro', 'com.clipai.pro.lifetime', 'lifetime', 99.99, 'USD', 99999, '["永久无限次AI处理", "最高画质输出", "全部功能解锁", "优先处理", "无广告"]', TRUE, 3);
