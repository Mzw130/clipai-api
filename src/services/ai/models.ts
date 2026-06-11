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
import { getModelConfig } from '../model-config';
import { AITimeoutError, AIError } from '../../utils/errors';
import { downloadFileToBuffer } from '../storage';

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

// ==================== Seedance 图生视频（火山引擎 Ark API） ====================
// 参考官方文档: https://www.volcengine.com/docs/6791/1397048
//
// API 端点: POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks
// 查询端点: GET  https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}
//
// 模型 ID:
//   Seedance 2.0:      doubao-seedance-2-0-260128
//   Seedance 2.0 Fast: doubao-seedance-2-0-fast-260128
//   Seedance 1.5 Pro:  doubao-seedance-1-5-pro-251215
//
// 首帧图生视频: content 中 image_url 不需要 role 字段
// 多模态参考:   content 中 image_url/video_url/audio_url 需要 role: "reference_image" 等
//
// 支持参数:
//   generate_audio: boolean   - 是否生成有声视频 (1.5 Pro+ 支持)
//   ratio: string             - 宽高比: 21:9, 16:9, 4:3, 1:1, 3:4, 9:16, adaptive
//   duration: number          - 视频时长(秒): 1.5 Pro 支持 4~12
//   resolution: string        - 分辨率: 480p, 720p, 1080p
//   watermark: boolean        - 是否添加水印
//   service_tier: string      - "default" 在线推理 / "flex" 离线推理
//   seed: number              - 随机种子
//   return_last_frame: boolean - 是否返回尾帧图
export async function seedanceGenerateVideo(
  input: VideoGenerationInput,
): Promise<VideoGenerationOutput> {
  const cfg = getModelConfig('seedance');
  const endpoint = cfg?.endpoint || config.ai.seedanceEndpoint;
  const apiKey = cfg?.apiKey || config.ai.seedanceApiKey;
  const model = cfg?.modelName || config.ai.seedanceModel;

  if (!endpoint || !apiKey) {
    throw new AIError('Seedance 未配置，请在管理后台设置 API Key');
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // 本地 URL → base64 data URL (火山引擎无法访问 localhost)
    // 官方文档支持 Base64: data:image/<格式>;base64,<编码>（格式需小写）
    // 注意: 请求体不超过 64 MB，大文件请勿使用 Base64
    let imageUrl = input.imageUrl;
    if (imageUrl.includes('localhost') || imageUrl.includes('127.0.0.1')) {
      const imgBuffer = await downloadFileToBuffer(imageUrl);
      const mime = imageUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const b64 = imgBuffer.toString('base64');
      imageUrl = `data:${mime};base64,${b64}`;

      // 请求体大小警告（Base64 编码后约膨胀 33%）
      const estimatedBodySize = b64.length + 2048; // image base64 + JSON overhead
      const maxBodySize = 64 * 1024 * 1024; // 64 MB
      if (estimatedBodySize > maxBodySize) {
        throw new AIError(
          `图片过大，Base64 编码后请求体约 ${(estimatedBodySize / 1024 / 1024).toFixed(1)}MB，` +
          `超过 API 限制 64MB。请使用更小的图片。`,
        );
      }
      if (estimatedBodySize > maxBodySize * 0.75) {
        console.warn(
          `[Seedance] 请求体较大 (约 ${(estimatedBodySize / 1024 / 1024).toFixed(1)}MB)，` +
          `接近 64MB 限制，建议压缩图片`,
        );
      }
    }

    // 从 extra 中提取视频参数
    const extra = (input.extra || {}) as Record<string, unknown>;
    const generateAudio = extra.generate_audio !== undefined ? extra.generate_audio : true;
    // 官方文档: 1.5 Pro 图生视频默认 ratio 为 adaptive，根据首帧图片自动适配
    const videoRatio = (extra.ratio as string) || 'adaptive';
    // duration: 用户传入则使用，否则 -1 (智能: 模型自主选择 4~12s)
    // 1.5 Pro 有效范围: [4, 12] 或 -1
    const rawDuration = extra.duration as number | undefined;
    const videoDuration = rawDuration !== undefined ? Math.max(4, Math.min(12, rawDuration)) : -1;
    const showWatermark = extra.watermark !== undefined ? extra.watermark : false;

    // 构建请求体 — 匹配官方 API 格式
    // 首帧图生视频: text 在前, image_url 在后, image_url 不需要 role
    const requestBody: Record<string, unknown> = {
      model,
      content: [
        {
          type: 'text',
          text: input.prompt || '镜头缓缓推进，画面自然流畅，光线柔和，高质量视频。',
        },
        {
          type: 'image_url',
          image_url: { url: imageUrl },
        },
      ],
      generate_audio: generateAudio,
      ratio: videoRatio,
      duration: videoDuration,
      watermark: showWatermark,
    };

    // 透传其他参数: resolution, service_tier, seed, return_last_frame 等
    for (const key of ['resolution', 'service_tier', 'seed', 'return_last_frame']) {
      if (extra[key] !== undefined) {
        requestBody[key] = extra[key];
      }
    }

    // Step 1: 提交视频生成任务
    console.log('[Seedance] 创建任务:', { model, ratio: videoRatio, duration: videoDuration, generateAudio });
    const createRes = await axios.post(endpoint, requestBody, { timeout: 30_000, headers });

    // 官方响应格式: { "id": "cgt-2025******-****" }
    const taskId: string = createRes.data?.id || '';
    if (!taskId) {
      console.error('[Seedance] 创建任务返回异常:', JSON.stringify(createRes.data));
      throw new AIError(`Seedance 创建任务失败: ${JSON.stringify(createRes.data)}`);
    }
    console.log(`[Seedance] 任务已创建: ${taskId}`);

    // Step 2: 轮询任务状态（每 10 秒查询一次，最多 5 分钟）
    const maxAttempts = 30;          // 30 × 10s = 5 min
    const pollIntervalMs = 10_000;   // 官方示例使用 10 秒间隔

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));

      const pollRes = await axios.get(`${endpoint}/${taskId}`, { timeout: 15_000, headers });
      const status: string = pollRes.data?.status || '';

      console.log(`[Seedance] 轮询 ${i + 1}/${maxAttempts}: status=${status}`);

      if (status === 'succeeded') {
        // 官方成功响应格式: content.video_url
        const videoUrl: string = pollRes.data?.content?.video_url || '';

        if (!videoUrl) {
          throw new AIError(
            `Seedance 任务完成但未返回视频: ${JSON.stringify(pollRes.data)}`,
          );
        }

        console.log(`[Seedance] 视频生成成功: ${videoUrl}`);
        return { videoUrl, raw: pollRes.data };
      }

      if (status === 'failed') {
        // 官方错误格式: error.code + error.message
        const errCode = pollRes.data?.error?.code || '';
        const errMsg = pollRes.data?.error?.message || '未知错误';
        throw new AIError(`Seedance 任务失败 [${errCode}]: ${errMsg}`);
      }

      // 状态为 queued / running → 继续轮询
    }

    throw new AITimeoutError('Seedance 视频生成超时（超过 5 分钟）');
  } catch (err: unknown) {
    if (err instanceof AIError) throw err;
    const axiosErr = err as AxiosError;
    if (axiosErr.code === 'ECONNABORTED') {
      throw new AITimeoutError('Seedance 请求超时');
    }
    // 尝试解析火山引擎的错误响应
    const respData = axiosErr.response?.data as any;
    console.error('[Seedance] API 错误:', JSON.stringify(respData || axiosErr.message, null, 2));
    if (respData?.error?.message) {
      const code = respData.error.code ? `[${respData.error.code}] ` : '';
      throw new AIError(`Seedance 调用失败: ${code}${respData.error.message}`);
    }
    // 如果有 HTTP 状态码但无法解析 body，也打印状态
    if (axiosErr.response?.status) {
      throw new AIError(`Seedance 调用失败: HTTP ${axiosErr.response.status} - ${axiosErr.message}`);
    }
    throw new AIError(`Seedance 调用失败: ${axiosErr.message}`);
  }
}

// ==================== Seedream 图片生成（火山引擎 Ark API） ====================
// 参考文档: https://www.volcengine.com/docs/6791/1397048
//
// API 端点: POST https://ark.cn-beijing.volces.com/api/v3/images/generations
//
// 模型 ID:
//   Seedream 5.0 Lite: doubao-seedream-5.0-lite
//   Seedream 4.5:      doubao-seedream-4.5
//   Seedream 4.0:      doubao-seedream-4.0
//
// 支持参数:
//   size: string              — "2K"/"3K"/"4K" 或 "WxH"像素 (默认 2048x2048)
//   sequential_image_generation: "auto"|"disabled" (默认 disabled, 组图功能)
//   stream: boolean           — SSE 流式输出 (默认 false)
//   response_format: "url"|"b64_json" (默认 url)
//   watermark: boolean        — 是否加水印 (默认 true)
//   output_format: "png"|"jpeg" (仅 5.0-lite, 默认 jpeg)
//   guidance_scale: float     — 1~10 (仅 3.0)
//   optimize_prompt_options: { mode: "standard"|"fast" }
//   tools: [{ type: "web_search" }]
export async function seedreamGenerateImage(
  input: ImageGenerationInput,
): Promise<ImageGenerationOutput> {
  const cfg = getModelConfig('seedream');
  const endpoint = cfg?.endpoint || config.ai.seedreamEndpoint;
  const apiKey = cfg?.apiKey || config.ai.seedreamApiKey;
  const model = cfg?.modelName || config.ai.seedreamModel;

  if (!endpoint || !apiKey) {
    throw new AIError('Seedream 未配置，请在管理后台设置 API Key');
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // 本地 URL → base64 (火山引擎无法访问 localhost)
    let imageParam: string | undefined;
    if (input.imageUrl) {
      let imgUrl = input.imageUrl;
      if (imgUrl.includes('localhost') || imgUrl.includes('127.0.0.1')) {
        const imgBuffer = await downloadFileToBuffer(imgUrl);
        const mime = imgUrl.endsWith('.png') ? 'image/png' : 'image/jpeg';
        imgUrl = `data:${mime};base64,${imgBuffer.toString('base64')}`;
      }
      imageParam = imgUrl;
    }

    const extra = (input.extra || {}) as Record<string, unknown>;

    // 构建请求体 — 匹配官方 API
    const requestBody: Record<string, unknown> = {
      model,
      prompt: input.prompt || '高质量图片，细节丰富，光线自然',
      size: (extra.size as string) || '2048x2048',
      sequential_image_generation: 'disabled',  // 单图模式
      stream: false,                             // 非流式
      response_format: 'url',                    // 返回 URL
      watermark: extra.watermark !== undefined ? extra.watermark : false,
    };

    // 可选: 参考图
    if (imageParam) {
      requestBody.image = imageParam;
    }

    // 可选: 输出格式 (仅 5.0-lite)
    if (extra.output_format) {
      requestBody.output_format = extra.output_format;
    }

    console.log('[Seedream] 请求生成:', { model, size: requestBody.size, hasImage: !!imageParam });

    const res = await axios.post(endpoint, requestBody, {
      timeout: 120_000,
      headers,
    });

    // 解析响应: { data: [{ url: "..." }] }
    const urls: string[] = (res.data?.data || [])
      .filter((item: any) => item.url)
      .map((item: any) => item.url as string);

    if (urls.length === 0) {
      // 检查是否有错误
      const errMsg = res.data?.error?.message || '未知错误';
      throw new AIError(`Seedream 生成失败: ${errMsg}`);
    }

    console.log(`[Seedream] 生成成功，${urls.length} 张图片`);
    return { urls, raw: res.data };
  } catch (err: unknown) {
    if (err instanceof AIError) throw err;
    const axiosErr = err as AxiosError;
    if (axiosErr.code === 'ECONNABORTED') {
      throw new AITimeoutError('Seedream 请求超时');
    }
    const respData = axiosErr.response?.data as any;
    console.error('[Seedream] API 错误:', JSON.stringify(respData || axiosErr.message, null, 2));
    if (respData?.error?.message) {
      throw new AIError(`Seedream 调用失败: ${respData.error.message}`);
    }
    throw new AIError(`Seedream 调用失败: ${axiosErr.message}`);
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
 * 调用专用模型（背景移除 / 高清修复 / 视频生成 / 图片生成）
 */
export async function callSpecialModel(
  modelType: 'bg_remove' | 'hd_repair' | 'video_generate' | 'seedance_video' | 'seedream_image' | 'super_realistic' | 'ai_edit' | 'color_grade' | 'filter',
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
    case 'seedance_video': {
      const result = await seedanceGenerateVideo({ imageUrl, ...extra });
      return { urls: [result.videoUrl], raw: result.raw } as ImageGenerationOutput;
    }
    // Seedream 图片生成（文生图 / 图生图）
    case 'seedream_image':
    case 'super_realistic':
    case 'ai_edit':
    case 'color_grade':
    case 'filter': {
      const prompt = (extra?.prompt as string) || '';
      const genInput: ImageGenerationInput = {
        prompt,
        imageUrl,
        extra,
      };
      return seedreamGenerateImage(genInput);
    }
    default:
      throw new AIError(`未知的专用模型类型: ${modelType}`);
  }
}
