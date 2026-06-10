/**
 * 对象存储服务
 *
 * 生产: Cloudflare R2 / AWS S3 兼容的对象存储
 * 开发: 本地文件系统 (当 OSS 未配置时自动切换)
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { InternalError } from '../utils/errors';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

// ==================== 判断存储模式 ====================
function isLocalStorage(): boolean {
  const ep = config.oss.endpoint;
  // OSS 端点为空或仍为占位符 → 本地存储
  return !ep || ep.includes('xxx');
}

// ==================== 目录初始化 ====================
async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch { /* 目录已存在 */ }
}

function localPath(key: string): string {
  return path.join(config.dataDir, key);
}

function localUrl(key: string): string {
  return `http://localhost:${config.port}/files/${key}`;
}

// ==================== S3 客户端（仅生产） ====================
let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: config.oss.region,
      endpoint: config.oss.endpoint,
      credentials: {
        accessKeyId: config.oss.accessKey,
        secretAccessKey: config.oss.secretKey,
      },
      forcePathStyle: true,
    });
  }
  return s3Client;
}

// ==================== 上传 ====================

/**
 * 将 Buffer 上传到存储（本地或 OSS）
 *
 * @param key   对象存储路径 (如 "uploads/user123/abc.png")
 * @param body  Buffer 内容
 * @param contentType MIME 类型
 * @returns 公开访问 URL
 */
export async function uploadToOSS(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  if (isLocalStorage()) {
    try {
      const fullPath = localPath(key);
      await ensureDir(path.dirname(fullPath));
      await fs.writeFile(fullPath, body);
      return localUrl(key);
    } catch (err) {
      console.error('[Storage] 本地写入失败:', err);
      throw new InternalError('文件上传失败，请稍后重试');
    }
  }

  try {
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: config.oss.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );

    return `${config.oss.publicUrl}/${key}`;
  } catch (err) {
    console.error('[Storage] OSS 上传失败:', err);
    throw new InternalError('文件上传失败，请稍后重试');
  }
}

/**
 * 上传本地文件到存储
 */
export async function uploadFileToOSS(
  key: string,
  filePath: string,
  contentType: string,
): Promise<string> {
  const buffer = await fs.readFile(filePath);
  return uploadToOSS(key, buffer, contentType);
}

// ==================== 下载 ====================

/**
 * 通过 URL 下载文件到 Buffer
 * 本地 URL 直接读文件，远程 URL 通过 HTTP 下载
 */
export async function downloadFileToBuffer(url: string): Promise<Buffer> {
  // 本地存储的 URL → 直接读文件
  if (url.startsWith(`http://localhost:${config.port}/files/`)) {
    const key = url.split('/files/')[1];
    const fullPath = localPath(key);
    try {
      return await fs.readFile(fullPath);
    } catch (err) {
      throw new InternalError('文件不存在');
    }
  }

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60_000,
    });
    return Buffer.from(response.data);
  } catch (err) {
    throw new InternalError('文件下载失败');
  }
}

/**
 * 从 OSS 下载文件
 */
export async function downloadFromOSS(key: string): Promise<Buffer> {
  if (isLocalStorage()) {
    try {
      return await fs.readFile(localPath(key));
    } catch (err) {
      throw new InternalError('文件不存在');
    }
  }

  try {
    const client = getS3Client();
    const response = await client.send(
      new GetObjectCommand({
        Bucket: config.oss.bucket,
        Key: key,
      }),
    );

    if (!response.Body) {
      throw new InternalError('文件不存在');
    }

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } catch (err) {
    throw new InternalError('文件下载失败');
  }
}

// ==================== 删除 ====================
export async function deleteFromOSS(key: string): Promise<void> {
  if (isLocalStorage()) {
    try {
      await fs.unlink(localPath(key));
    } catch (err) {
      // 文件可能不存在，忽略
    }
    return;
  }

  try {
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.oss.bucket,
        Key: key,
      }),
    );
  } catch (err) {
    console.error('[Storage] OSS 删除失败:', err);
  }
}

// ==================== 预签名 URL ====================

/**
 * 生成临时预签名下载 URL（有效期 1 小时）
 * 本地模式直接返回公开 URL
 */
export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
  if (isLocalStorage()) {
    return localUrl(key);
  }

  const client = getS3Client();
  const command = new GetObjectCommand({
    Bucket: config.oss.bucket,
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * 获取公开 URL
 */
export function getPublicUrl(key: string): string {
  if (isLocalStorage()) {
    return localUrl(key);
  }
  return `${config.oss.publicUrl}/${key}`;
}
