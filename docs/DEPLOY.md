# ClipAI 生产部署指南

## 部署架构

```
                    ┌──────────────┐
                    │   CDN / OSS  │  (Cloudflare R2 / AWS S3)
                    │  静态资源    │
                    └──────┬───────┘
                           │
   ┌─────────┐     ┌───────┴───────┐     ┌──────────┐
   │  iOS    │────▶│  clipai-api   │────▶│  MySQL   │
   │  App    │     │  (Fastify)    │     │  8.0     │
   └─────────┘     └───────┬───────┘     └──────────┘
                           │
                    ┌──────┴───────┐
                    │    Redis     │  (缓存/限流)
                    │    7.0       │
                    └──────────────┘
```

---

## 推荐部署平台

| 平台 | 用途 | 说明 |
|------|------|------|
| **Railway / Render** | API 服务 | 一键部署 Node.js，自带 PostgreSQL 变体 |
| **PlanetScale** | MySQL 数据库 | 兼容 MySQL 的 Serverless 数据库 |
| **Upstash** | Redis | Serverless Redis |
| **Cloudflare R2** | 对象存储 | S3 兼容，零出站费用 |
| **Replicate** | AI 推理 | 按量计费 GPU |

---

## 一、Railway 部署

```bash
# 1. 安装 Railway CLI
npm i -g @railway/cli

# 2. 登录
railway login

# 3. 初始化
railway init

# 4. 添加 MySQL 服务
railway add mysql

# 5. 添加 Redis 服务
railway add redis

# 6. 设置环境变量
railway variables set \
  REPLICATE_API_TOKEN=r8_xxx \
  OSS_ENDPOINT=xxx \
  OSS_ACCESS_KEY=xxx \
  OSS_SECRET_KEY=xxx \
  OSS_BUCKET=clipai \
  OSS_PUBLIC_URL=https://cdn.clipai.com \
  JWT_SECRET=your-super-secret-key

# 7. 部署
railway up
```

---

## 二、Docker 部署

```bash
# 构建镜像
docker build -t clipai-api .

# 运行
docker run -d \
  --name clipai-api \
  -p 3000:3000 \
  -e MYSQL_HOST=host.docker.internal \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e REPLICATE_API_TOKEN=r8_xxx \
  clipai-api
```

---

## 三、传统 VPS 部署 (Ubuntu)

```bash
# 1. 安装 Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# 2. 安装 MySQL 8.0
sudo apt install -y mysql-server
sudo mysql_secure_installation

# 3. 安装 Redis
sudo apt install -y redis-server

# 4. 创建数据库
sudo mysql -u root -e "
  CREATE DATABASE clipai CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'clipai'@'localhost' IDENTIFIED BY 'your_password';
  GRANT ALL PRIVILEGES ON clipai.* TO 'clipai'@'localhost';
  FLUSH PRIVILEGES;
"

# 5. 克隆项目
git clone https://github.com/Mzw130/clipai-api.git
cd clipai-api

# 6. 安装 PM2
npm install -g pm2

# 7. 配置并启动
cp .env.example .env
# 编辑 .env
npm install
npm run build
pm2 start dist/index.js --name clipai-api

# 8. Nginx 反向代理
sudo tee /etc/nginx/sites-available/clipai << 'EOF'
server {
    listen 80;
    server_name api.clipai.com;
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/clipai /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# 9. 配置 SSL (Certbot)
sudo certbot --nginx -d api.clipai.com
```

---

## 四、数据库备份

```bash
# 手动备份
mysqldump -u clipai -p clipai > backup_$(date +%Y%m%d).sql

# 定时备份 (crontab)
0 3 * * * mysqldump -u clipai -p'password' clipai | gzip > /backups/clipai_$(date +\%Y\%m\%d).sql.gz

# 恢复
mysql -u clipai -p clipai < backup_20260101.sql
```

---

## 五、监控与日志

```bash
# PM2 日志
pm2 logs clipai-api

# PM2 状态面板
pm2 monit

# 健康检查
curl https://api.clipai.com/api/health

# 设置自动重启
pm2 startup
pm2 save
```

---

## 六、安全清单

- [ ] `.env` 文件不提交到 Git (已在 .gitignore)
- [ ] `JWT_SECRET` 使用强随机字符串
- [ ] 所有 AI API Key 使用环境变量
- [ ] 数据库密码使用强密码
- [ ] 启用 HTTPS / SSL
- [ ] 配置 Nginx `client_max_body_size` (50MB)
- [ ] 配置 Nginx `proxy_read_timeout` (300s, 适配 AI 长任务)
- [ ] 设置防火墙规则 (仅开放 80/443)
- [ ] 定期更新依赖 `npm audit`
- [ ] 配置内容审核 API
