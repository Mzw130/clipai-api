/**
 * AI 模型调用封装
 *
 * 统一封装不同 AI 模型的调用方式:
 * - Replicate API (主力)
 * - Stable Diffusion WebUI (自建/RunPod)
 * - 专用模型 (rembg, InsightFace, Real-ESRGAN)
 */
import Replicate from 'replicate';
import axios, { AxiosError } from 'axios';
import { config } from '../../config';
import { AITimeoutError, AIError } from '../../utils/errors';

// ==================== Replicate 客户端 ====================
let replicateClient: Replicate | null = null;

function getReplicate(): Replicate {
  if (!replicateClient) {
    replicateClient = new Replicate({
      auth: config.ai.replicateToken,
    });
  }
  return replicateClient;
}

// ==================== 模型调用参数类型 ====================
export interface ImageGenerationInput {
  /** 正向提示词 */
  prompt: string;
  /** 负向提示词 */
  negativePrompt?: string;
  /** 输入图片 URL */
  imageUrl?: string;
  /** 蒙版图片 URL (inpainting) */
  maskUrl?: string;
  /** 引导系数 (1-20) */
  guidanceScale?: number;
  /** 推理步数 */
  numInferenceSteps?: number;
  /** 图片强度 (img2img, 0-1) */
  imageStrength?: number;
  /** 输出图片尺寸 */
  width?: number;
  height?: number;
  /** 随机种子 */
  seed?: number;
  /** 其他模型特定参数 */
  extra?: Record<string, unknown>;
}

export interface ImageGenerationOutput {
  /** 结果图片 URL 列表 */
  urls: string[];
  /** 原始响应 */
  raw?: unknown;
}

export interface VideoGenerationInput {
  imageUrl: string;
  prompt?: string;
  fps?: number;
  numFrames?: number;
  extra?: Record<string, unknown>;
}

export interface VideoGenerationOutput {
  videoUrl: string;
  raw?: unknown;
}

// ==================== Replicate 图片生成 ====================
export async function replicateGenerateImage(
  modelVersion: string,
  input: ImageGenerationInput,
): Promise<ImageGenerationOutput> {
  const replicate = getReplicate();

  try {
    // 构建 Replicate 标准输入
    const replicateInput: Record<string, unknown> = {
      prompt: input.prompt,
      negative_prompt: input.negativePrompt || '',
      num_inference_steps: input.numInferenceSteps || 30,
      guidance_scale: input.guidanceScale || 7.5,
      ...(input.imageUrl && { image: input.imageUrl }),
      ...(input.maskUrl && { mask: input.maskUrl }),
      ...(input.imageStrength !== undefined && { prompt_strength: 1 - input.imageStrength }),
      ...(input.seed !== undefined && { seed: input.seed }),
      ...(input.extra || {}),
    };

    const output = await replicate.run(modelVersion as `${string}/${string}:${string}`, {
      input: replicateInput,
      wait: { timeout: 120_000 }, // 2 分钟超时
    });

    // Replicate 返回的是 URL 字符串数组
    const urls = Array.isArray(output) ? output.filter((u): u is string => typeof u === 'string') : [];

    if (urls.length === 0) {
      throw new AIError('Replicate 未返回有效结果');
    }

    return { urls, raw: output };
  } catch (err: unknown) {
    if (err instanceof AIError) throw err;

    // 处理 Replicate 特定错误
    const errorMsg = err instanceof Error ? err.message : 'Replicate API 调用失败';
    if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
      throw new AITimeoutError(`Replicate 处理超时: ${errorMsg}`);
    }
    throw new AIError(`Replicate 调用失败: ${errorMsg}`);
  }
}

// ==================== Stable Diffusion WebUI 调用 ====================
export async function sdGenerateImage(
  input: ImageGenerationInput,
): Promise<ImageGenerationOutput> {
  if (!config.ai.sdEndpoint) {
    throw new AIError('Stable Diffusion 端点未配置');
  }

  try {
    const payload = {
      prompt: input.prompt,
      negative_prompt: input.negativePrompt || '',
      steps: input.numInferenceSteps || 30,
      cfg_scale: input.guidanceScale || 7.5,
      width: input.width || 512,
      height: input.height || 768,
      ...(input.imageUrl && {
        init_images: [input.imageUrl],
        denoising_strength: input.imageStrength || 0.75,
      }),
      ...(input.maskUrl && { mask: input.maskUrl }),
      ...(input.seed !== undefined && { seed: input.seed }),
      ...(input.extra || {}),
    };

    const response = await axios.post(
      `${config.ai.sdEndpoint}/sdapi/v1/txt2img`,
      payload,
      {
        timeout: 180_000,
        headers: config.ai.sdApiKey
          ? { Authorization: `Bearer ${config.ai.sdApiKey}` }
          : {},
      },
    );

    const images: string[] = response.data.images || [];
    if (images.length === 0) {
      throw new AIError('Stable Diffusion 未返回有效结果');
    }

    // SD WebUI 返回 base64 编码的图片
    // 这里返回 base64 字符串，由 pipeline 统一处理上传 OSS
    return {
      urls: images.map((img: string) => `data:image/png;base64,${img}`),
      raw: response.data,
    };
  } catch (err: unknown) {
    if (err instanceof AIError) throw err;
    const axiosErr = err as AxiosError;
    if (axiosErr.code === 'ECONNABORTED') {
      throw new AITimeoutError('Stable Diffusion 处理超时');
    }
    throw new AIError(`Stable Diffusion 调用失败: ${axiosErr.message}`);
  }
}

// ==================== 背景移除（rembg） ====================
export async function removeBackground(imageUrl: string): Promise<string> {
  try {
    const replicate = getReplicate();
    const output = await replicate.run(
      'cjwbw/rembg:fb8af171cfa1616dd4511240317722a9d6147cc6f8c88a3b27e7d3ad8fa6d383',
      {
        input: { image: imageUrl },
      },
    );

    const url = Array.isArray(output) ? output[0] : (output as string);
    if (typeof url !== 'string') {
      throw new AIError('rembg 未返回有效结果');
    }
    return url;
  } catch (err: unknown) {
    if (err instanceof AIError) throw err;
    throw new AIError(`背景移除失败: ${err instanceof Error ? err.message : '未知错误'}`);
  }
}

// ==================== 高清修复（Real-ESRGAN） ====================
export async function upscaleImage(
  imageUrl: string,
  scale: number = 2,
  faceEnhance: boolean = true,
): Promise<string> {
  try {
    const replicate = getReplicate();
    const output = await replicate.run(
      'nightmareai/real-esrgan:42fed1c4974146d4c24104e2be2ca5c5a8d2d9b4d8d9d9d9d9d9d9d9d9d9d9',
      {
        input: {
          image: imageUrl,
          scale: scale,
          face_enhance: faceEnhance,
        },
      },
    );

    const url = Array.isArray(output) ? output[0] : (output as string);
    if (typeof url !== 'string') {
      throw new AIError('Real-ESRGAN 未返回有效结果');
    }
    return url;
  } catch (err: unknown) {
    if (err instanceof AIError) throw err;
    throw new AIError(`高清修复失败: ${err instanceof Error ? err.message : '未知错误'}`);
  }
}

// ==================== 图生视频（Stable Video Diffusion） ====================
export async function generateVideo(
  input: VideoGenerationInput,
): Promise<VideoGenerationOutput> {
  try {
    const replicate = getReplicate();
    const output = await replicate.run(
      'stability-ai/stable-video-diffusion:3f0457e4619bcacd03a07ae4c2b4b7c4bd8b8b2b2b2b2b2b2b2b2b2b2b2b2',
      {
        input: {
          input_image: input.imageUrl,
          video_length: '14_frames_with_svd',
          sizing_strategy: 'maintain_aspect_ratio',
          frames_per_second: input.fps || 6,
          ...(input.extra || {}),
        },
        wait: { timeout: 300_000 }, // 5 分钟超时
      },
    );

    const videoUrl = typeof output === 'string' ? output : (Array.isArray(output) ? output[0] : null);
    if (typeof videoUrl !== 'string') {
      throw new AIError('Stable Video Diffusion 未返回有效结果');
    }
    return { videoUrl, raw: output };
  } catch (err: unknown) {
    if (err instanceof AIError) throw err;
    throw new AIError(`视频生成失败: ${err instanceof Error ? err.message : '未知错误'}`);
  }
}

// ==================== AI 模型统一调用入口 ====================
export interface ModelCallOptions {
  modelVersion?: string;
  input: ImageGenerationInput;
  isVideo?: boolean;
}

/**
 * 统一模型调用 —— 根据配置决定使用哪个模型后端
 *
 * 策略:
 * 1. 如果有 replicateModel，走 Replicate
 * 2. 如果配置了 SD WebUI 端点，走自建 SD
 * 3. 否则报错
 */
export async function callModel(options: ModelCallOptions): Promise<ImageGenerationOutput> {
  // 优先使用 Replicate
  if (options.modelVersion) {
    return replicateGenerateImage(options.modelVersion, options.input);
  }

  // 备选: 自建 SD WebUI
  if (config.ai.sdEndpoint) {
    return sdGenerateImage(options.input);
  }

  throw new AIError('未配置任何 AI 模型后端');
}

/**
 * 调用专用模型（背景移除 or 高清修复 or 视频生成）
 */
export async function callSpecialModel(
  modelType: 'bg_remove' | 'hd_repair' | 'video_generate',
  imageUrl: string,
  extra?: Record<string, unknown>,
): Promise<ImageGenerationOutput | VideoGenerationOutput> {
  switch (modelType) {
    case 'bg_remove':
      return { urls: [await removeBackground(imageUrl)] };
    case 'hd_repair': {
      const scale = (extra?.upscale_factor as number) || 2;
      const faceEnhance = (extra?.face_enhance as boolean) ?? true;
      return { urls: [await upscaleImage(imageUrl, scale, faceEnhance)] };
    }
    case 'video_generate':
      return generateVideo({ imageUrl, ...extra });
    default:
      throw new AIError(`未知的专用模型类型: ${modelType}`);
  }
}
