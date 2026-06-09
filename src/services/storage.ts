/**
 * 对象存储服务
 *
 * 支持 Cloudflare R2 / AWS S3 兼容的对象存储
 */
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config';
import { InternalError } from '../utils/errors';
import axios from 'axios';

// ==================== S3 客户端 ====================
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
      forcePathStyle: true, // R2 需要 path-style
    });
  }
  return s3Client;
}

// ==================== 上传 ====================

/**
 * 将 Buffer 上传到 OSS
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

    // 返回公开 URL
    return `${config.oss.publicUrl}/${key}`;
  } catch (err) {
    console.error('[Storage] 上传失败:', err);
    throw new InternalError('文件上传失败，请稍后重试');
  }
}

/**
 * 上传本地文件到 OSS
 */
export async function uploadFileToOSS(
  key: string,
  filePath: string,
  contentType: string,
): Promise<string> {
  const fs = await import('fs/promises');
  const buffer = await fs.readFile(filePath);
  return uploadToOSS(key, buffer, contentType);
}

// ==================== 下载 ====================

/**
 * 通过 URL 下载文件到 Buffer
 */
export async function downloadFileToBuffer(url: string): Promise<Buffer> {
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

    // 将 stream 转为 Buffer
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
  try {
    const client = getS3Client();
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.oss.bucket,
        Key: key,
      }),
    );
  } catch (err) {
    console.error('[Storage] 删除失败:', err);
  }
}

// ==================== 预签名 URL ====================

/**
 * 生成临时预签名下载 URL（有效期 1 小时）
 */
export async function getPresignedUrl(key: string, expiresIn = 3600): Promise<string> {
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
  return `${config.oss.publicUrl}/${key}`;
}
