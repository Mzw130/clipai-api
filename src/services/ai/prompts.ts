/**
 * ClipAI Prompt 模板管理
 *
 * 18 个 AI 工具 = 1 套 Pipeline + 18 套 Prompt/参数
 * 每个 tool_type 对应一个 PromptTemplate 配置
 *
 * Prompt 设计参考美区 ClipAI 应用的实际效果，
 * 目标: 自然、高质量、可调参的 AI 图片编辑
 */

export interface ToolPromptConfig {
  toolType: string;
  modelName: string;
  /** Replicate 模型版本标识 */
  replicateModel?: string;
  /** 正向 Prompt 模板，使用 {paramName} 作为变量占位符 */
  basePrompt: string;
  /** 负向 Prompt，排除不需要的效果 */
  negativePrompt: string;
  /** 默认参数 */
  defaultParams: Record<string, unknown>;
  /** 预估处理时间 (秒) */
  estimatedSeconds: number;
  /** 消耗积分数 */
  creditCost: number;
  /** 是否需要蒙版 */
  requiresMask?: boolean;
  /** 是否为视频工具 */
  isVideo?: boolean;
}

/**
 * 全局负向 Prompt（所有人体/面部工具共享）
 */
const BODY_NEGATIVE = [
  'deformed body',
  'disfigured',
  'bad anatomy',
  'blurry',
  'low quality',
  'worst quality',
  'extra limbs',
  'missing limbs',
  'fused fingers',
  'too many fingers',
  'unnatural body proportions',
  'cartoonish',
  '3d render',
  'plastic skin',
  'unrealistic lighting',
  'watermark',
  'text',
  'signature',
].join(', ');

const FACE_NEGATIVE = [
  'deformed face',
  'disfigured',
  'bad anatomy',
  'blurry',
  'low quality',
  'worst quality',
  'asymmetric eyes',
  'unnatural skin texture',
  'cartoonish',
  '3d render',
  'plastic skin',
  'watermark',
].join(', ');

/**
 * ============================
 * 18 套 Prompt 模板配置
 * ============================
 */
export const TOOL_PROMPTS: Record<string, ToolPromptConfig> = {
  // ==================== 1. 重塑 (reshape) ====================
  reshape: {
    toolType: 'reshape',
    modelName: 'Stable Diffusion + ControlNet (OpenPose)',
    replicateModel: 'stability-ai/stable-diffusion:img2img',
    basePrompt: `Professional full-body photo editing. {action_instruction}.
Maintain natural skin tone, original clothing details, and background unchanged.
Photorealistic result with natural lighting. High resolution 8K output.`,
    negativePrompt: BODY_NEGATIVE + ', clothing change, background change, face change',
    defaultParams: {
      sub_tool: 'leg_enhance',
      intensity: 50,
    },
    estimatedSeconds: 8,
    creditCost: 2,
  },

  // ==================== 2. 高清修复 (hd_repair) ====================
  hd_repair: {
    toolType: 'hd_repair',
    modelName: 'Real-ESRGAN + GFPGAN',
    replicateModel: 'nightmareai/real-esrgan:42fed1c4974146d4c24104e2be2ca5c5a8d2d9b4d8d9d9d9d9d9d9d9d9d9d9',
    basePrompt: `Upscale this image by {upscale_factor}x. Enhance facial details with GFPGAN.
Remove noise, artifacts, and compression blur. Sharpen edges naturally.
Restore fine details in hair, eyes, skin texture. Maintain original color profile.
Output: crystal clear high-definition image with natural skin texture.`,
    negativePrompt: 'blurry, noise, artifacts, oversharpened, unnatural skin smoothing, plastic skin',
    defaultParams: {
      upscale_factor: 2,
      face_enhance: true,
    },
    estimatedSeconds: 5,
    creditCost: 1,
  },

  // ==================== 3. 物体消除 (obj_remove) ====================
  obj_remove: {
    toolType: 'obj_remove',
    modelName: 'LaMa Inpainting / SD Inpainting',
    replicateModel: 'stability-ai/stable-diffusion-inpainting',
    basePrompt: `Remove the masked object from this image. Fill the removed area seamlessly
with natural background continuation. Match surrounding textures, lighting, and perspective.
The inpainted area should be completely indistinguishable from the rest of the image.
No traces of the original object, no blur, no seams. Photorealistic completion.`,
    negativePrompt: 'seams, blur, artifacts, traces, ghosting, inconsistent lighting, watermark',
    defaultParams: {},
    estimatedSeconds: 6,
    creditCost: 2,
    requiresMask: true,
  },

  // ==================== 4. 背景移除 (bg_remove) ====================
  bg_remove: {
    toolType: 'bg_remove',
    modelName: 'BRIA-RMBG / rembg',
    replicateModel: 'cjwbw/rembg:fb8af171cfa1616dd4511240317722a9d6147cc6f8c88a3b27e7d3ad8fa6d383',
    basePrompt: `Remove the background from this image completely. Keep only the main subject(s)
with precise edge detection. Output must have a true transparent background (alpha channel).
Clean edges around hair, clothing, and fine details. No background residue, no halo effect.
Subject must remain fully intact with original colors and lighting.`,
    negativePrompt: 'background residue, halo, jagged edges, cut off subject, color shift',
    defaultParams: {},
    estimatedSeconds: 3,
    creditCost: 1,
  },

  // ==================== 5. 超级写实 (super_realistic → Seedream) ====================
  super_realistic: {
    toolType: 'super_realistic',
    modelName: 'Seedream 5.0 Lite (火山引擎)',
    basePrompt: `{prompt_instruction}`,
    negativePrompt: '低质量, 模糊, 变形, 失真, 水印, 卡通, 插画',
    defaultParams: {
      prompt: '将这张图片转化为超写实风格，皮肤纹理清晰可见，自然光线和阴影，专业级摄影品质',
      size: '2048x2048',
    },
    estimatedSeconds: 15,
    creditCost: 3,
  },
    defaultParams: {},
    estimatedSeconds: 10,
    creditCost: 2,
  },

  // ==================== 6. 染发 (hair_dye) ====================
  hair_dye: {
    toolType: 'hair_dye',
    modelName: 'Stable Diffusion Inpainting + ControlNet',
    replicateModel: 'stability-ai/stable-diffusion-inpainting',
    basePrompt: `Change the hair color in this portrait photo to {hair_color}.
Only modify the hair area precisely — do NOT change the face, skin, eyes, clothing, or background.
Maintain the original hair texture, volume, shine, and natural lighting.
The new color should blend naturally with the existing hair highlights and shadows.
Result must look like the person naturally has this hair color. Photorealistic.`,
    negativePrompt: FACE_NEGATIVE + ', skin color change, background change, unnatural hair texture, color bleeding',
    defaultParams: {
      hair_color: 'pink',
    },
    estimatedSeconds: 7,
    creditCost: 2,
  },

  // ==================== 7. 丰唇 (lip_plump) ====================
  lip_plump: {
    toolType: 'lip_plump',
    modelName: 'InsightFace + FaceFusion',
    basePrompt: `Subtly enhance the lips in this portrait. Increase lip fullness by {intensity}%.
Keep the lips looking natural and proportional to the face.
Maintain original lip color tone and texture. Do NOT change any other facial features.
The result should look like a natural, subtle enhancement — not overdone or artificial.
Preserve natural lip lines and moisture.`,
    negativePrompt: FACE_NEGATIVE + ', overfilled lips, unnatural lip shape, duck lips, changed lip color, skin change',
    defaultParams: {
      intensity: 0.3,
    },
    estimatedSeconds: 4,
    creditCost: 1,
  },

  // ==================== 8. 下颌轮廓 (jawline) ====================
  jawline: {
    toolType: 'jawline',
    modelName: 'InsightFace + FaceFusion',
    basePrompt: `Refine the jawline contour in this portrait. Adjust jaw definition by {intensity}%.
Natural-looking facial contouring that enhances the jaw structure.
Maintain facial identity, skin texture, and all other features EXACTLY as original.
The enhancement should be subtle and natural — not distorting or unnatural.
Preserve original lighting, skin tone, and expression.`,
    negativePrompt: FACE_NEGATIVE + ', face shape change, distorted jaw, unnatural contour, different person',
    defaultParams: {
      intensity: 0.5,
    },
    estimatedSeconds: 4,
    creditCost: 1,
  },

  // ==================== 9. 发质顺滑 (hair_smooth) ====================
  hair_smooth: {
    toolType: 'hair_smooth',
    modelName: 'Stable Diffusion + ControlNet',
    basePrompt: `Smooth and straighten the hair in this photo. Eliminate frizz, flyaways, and rough texture.
Make hair appear silky, glossy, and well-conditioned with natural shine.
Maintain the exact original hair color, length, and overall style.
Do NOT change face, skin, clothing, or background.
Natural hair flow with healthy, smooth appearance. Photo-realistic result.`,
    negativePrompt: BODY_NEGATIVE + ', hair color change, hair style change, face change, plastic hair, flat hair',
    defaultParams: {},
    estimatedSeconds: 6,
    creditCost: 1,
  },

  // ==================== 10. 发质修复 (hair_repair) ====================
  hair_repair: {
    toolType: 'hair_repair',
    modelName: 'Stable Diffusion + ControlNet',
    basePrompt: `Repair and restore damaged hair appearance in this photo. Fix split ends, dry patches,
and uneven hair texture. Add natural volume, healthy shine, and smooth texture.
Keep the exact original hair color, style, and length completely unchanged.
Do NOT modify face, skin, clothing, or background.
The hair should look healthy, vibrant, and well-nourished. Photorealistic.`,
    negativePrompt: BODY_NEGATIVE + ', hair color change, hair style change, face change, too much volume',
    defaultParams: {},
    estimatedSeconds: 6,
    creditCost: 1,
  },

  // ==================== 11. 比例调整 (proportion) ====================
  proportion: {
    toolType: 'proportion',
    modelName: 'Stable Diffusion + ControlNet (OpenPose/Depth)',
    basePrompt: `Adjust the body proportion in this full-body photo. Focus on {ratio_type} adjustment.
Intensity level: {intensity}%. Maintain a completely natural, realistic look.
Preserve clothing details, background, lighting, and facial features EXACTLY as original.
The proportions should look natural and physically plausible.
Professional photo editing quality. 8K photorealistic output.`,
    negativePrompt: BODY_NEGATIVE + ', unnatural proportions, distorted body, clothing change, background change',
    defaultParams: {
      ratio_type: 'leg_body',
      intensity: 50,
    },
    estimatedSeconds: 8,
    creditCost: 2,
  },

  // ==================== 12. 丰腿 (leg_enhance) ====================
  leg_enhance: {
    toolType: 'leg_enhance',
    modelName: 'Stable Diffusion + ControlNet (OpenPose)',
    basePrompt: `Modify the legs in this photo according to: {mode}. Intensity: {intensity}%.
Maintain natural skin tone, texture, and lighting. Keep clothing and shoes unchanged.
The result should look completely natural and proportional to the body.
Preserve all other body parts, background, and image quality. Photorealistic.`,
    negativePrompt: BODY_NEGATIVE + ', unnatural legs, distorted limbs, different skin tone, clothing change',
    defaultParams: {
      mode: 'slim_leg',
      intensity: 50,
    },
    estimatedSeconds: 7,
    creditCost: 2,
  },

  // ==================== 13. 肌肉 (muscle) ====================
  muscle: {
    toolType: 'muscle',
    modelName: 'Stable Diffusion + ControlNet (OpenPose)',
    basePrompt: `Enhance muscle definition in the {body_part} area. Intensity: {intensity}%.
Maintain natural skin tone and body proportions. The muscles should look defined
but realistic — not cartoonish or exaggerated.
Keep face, clothing, background, and non-target body parts completely unchanged.
Natural lighting and skin texture preserved. Photorealistic output.`,
    negativePrompt: BODY_NEGATIVE + ', overdone muscles, cartoon muscles, skin color change, face change',
    defaultParams: {
      body_part: 'abs',
      intensity: 50,
    },
    estimatedSeconds: 7,
    creditCost: 2,
  },

  // ==================== 14. 肌肉增强 (muscle_enhance) ====================
  muscle_enhance: {
    toolType: 'muscle_enhance',
    modelName: 'Stable Diffusion + ControlNet (OpenPose/Depth)',
    basePrompt: `Enhance the overall muscle definition of this person's body in a {style} style.
Intensity: {intensity}%. Create a naturally athletic and fit appearance.
Maintain natural skin tone, realistic lighting, and body proportions.
Keep face, background, and clothing completely unchanged.
The result should look like a natural fitness transformation — realistic and believable.
Professional fitness photography quality. 8K photorealistic.`,
    negativePrompt: BODY_NEGATIVE + ', deformed, unnatural proportions, overly muscular, cartoonish, bodybuilder extremes on non-bodybuilder settings',
    defaultParams: {
      style: 'athletic',
      intensity: 70,
    },
    estimatedSeconds: 8,
    creditCost: 2,
  },

  // ==================== 15. AI 编辑 (ai_edit → Seedream) ====================
  ai_edit: {
    toolType: 'ai_edit',
    modelName: 'Seedream 5.0 Lite (火山引擎)',
    basePrompt: `{prompt_instruction}`,
    negativePrompt: '低质量, 模糊, 变形, 失真, 水印, 拼接痕迹',
    defaultParams: {
      prompt: '编辑这张图片，保持自然光线和风格一致性',
      size: '2048x2048',
    },
    estimatedSeconds: 15,
    creditCost: 3,
  },
    defaultParams: {
      prompt: '',
    },
    estimatedSeconds: 10,
    creditCost: 2,
  },

  // ==================== 16. 美颜 (beauty) ====================
  beauty: {
    toolType: 'beauty',
    modelName: 'InsightFace + FaceFusion',
    basePrompt: `Apply natural beauty enhancement to this portrait. Subtly smooth skin texture,
even out skin tone, reduce minor blemishes while keeping natural skin pores visible.
Slightly brighten eyes and enhance natural facial features.
IMPORTANT: Keep the person completely recognizable. Do NOT change face shape,
facial features, or identity. The result must look like the same person with
natural, subtle makeup and good lighting — NOT a different person or heavy filter.
Professional beauty photography retouching quality. Natural skin texture preserved.`,
    negativePrompt: FACE_NEGATIVE + ', different person, heavy makeup, plastic skin, face shape change, big eyes, whitening, unnatural beauty filter',
    defaultParams: {},
    estimatedSeconds: 4,
    creditCost: 1,
  },

  // ==================== 17. 调色 (color_grade) ====================
  color_grade: {
    toolType: 'color_grade',
    modelName: 'Stable Diffusion img2img',
    basePrompt: `Apply professional cinematic color grading to this image.
Enhance color harmony, adjust white balance, and improve contrast.
Apply a tasteful, modern color grade that enhances the mood.
Maintain all subject details, textures, and sharpness.
The result should look like professionally color-graded photography.
Natural skin tones preserved. Cinematic, polished look.`,
    negativePrompt: 'color distortion, oversaturated, washed out, unnatural skin tones, loss of detail',
    defaultParams: {},
    estimatedSeconds: 5,
    creditCost: 1,
  },

  // ==================== 18. 滤镜 (filter) ====================
  filter: {
    toolType: 'filter',
    modelName: 'Stable Diffusion img2img + Style Transfer',
    basePrompt: `Apply a {filter_style} style filter to this image.
Transform the aesthetic while preserving the core subject and composition.
The filter should enhance the image's artistic quality without degrading details.
Maintain subject identity and overall image structure.
Artistic, visually appealing result with consistent style application.`,
    negativePrompt: 'distortion, loss of detail, unrecognizable subject, overdone, unnatural',
    defaultParams: {
      filter_style: 'vintage',
    },
    estimatedSeconds: 5,
    creditCost: 1,
  },

  // ==================== 图片: AI 生图 (seedream_image → Seedream) ====================
  seedream_image: {
    toolType: 'seedream_image',
    modelName: 'Seedream 5.0 Lite (火山引擎)',
    basePrompt: `{prompt_instruction}`,
    negativePrompt: '低质量, 模糊, 变形, 失真, 水印',
    defaultParams: {
      prompt: '',
      size: '2048x2048',
    },
    estimatedSeconds: 15,
    creditCost: 3,
  },

  // ==================== 视频: 图生视频 (video_generate → Seedance) ====================
  video_generate: {
    toolType: 'video_generate',
    modelName: 'Seedance 1.5 Pro (火山引擎)',
    basePrompt: `{prompt_instruction}`,
    negativePrompt: '闪烁, 画面跳变, 变形, 失真, 低质量, 抖动',
    defaultParams: {
      mode: 'super',
      prompt: '',
    },
    estimatedSeconds: 90,
    creditCost: 8,
    isVideo: true,
  },

  // ==================== 视频: Seedance 图生视频（火山引擎/豆包） ====================
  seedance_video: {
    toolType: 'seedance_video',
    modelName: 'Seedance 1.5 Pro (ByteDance/火山引擎)',
    basePrompt: `{prompt_instruction}`,
    negativePrompt: '闪烁, 画面跳变, 变形, 失真, 低质量, 抖动, 不自然的运动',
    defaultParams: {
      mode: 'super',
      prompt: '',
      ratio: 'adaptive',
      generate_audio: true,
    },
    estimatedSeconds: 90,
    creditCost: 8,
    isVideo: true,
  },
};

/**
 * 根据 toolType 获取 Prompt 配置
 */
export function getToolPromptConfig(toolType: string): ToolPromptConfig | undefined {
  return TOOL_PROMPTS[toolType];
}

/**
 * 获取所有可用的 toolType
 */
export function getAllToolTypes(): string[] {
  return Object.keys(TOOL_PROMPTS);
}

/**
 * 将 params 注入 prompt 模板
 *
 * @example
 *   renderPrompt("Change hair to {hair_color}", { hair_color: "pink" })
 *   // => "Change hair to pink"
 */
export function renderPrompt(template: string, params: Record<string, unknown>): string {
  let result = template;
  for (const [key, value] of Object.entries(params)) {
    const placeholder = `{${key}}`;
    if (result.includes(placeholder)) {
      result = result.replaceAll(placeholder, String(value));
    }
  }
  // 处理特殊的 {action_instruction} 等动态占位符
  result = resolveSpecialPlaceholders(result, params);
  return result;
}

/**
 * 解析特殊占位符 —— 根据子工具类型生成对应的动作描述
 */
function resolveSpecialPlaceholders(template: string, params: Record<string, unknown>): string {
  // {action_instruction} — reshape 工具的动态指令
  if (template.includes('{action_instruction}')) {
    const subTool = params.sub_tool as string;
    const intensity = params.intensity as number;
    const pct = intensity ? `${intensity}% intensity` : '';

    const actionMap: Record<string, string> = {
      leg_enhance: `Enhance and beautify the legs. Make them look longer and more toned. ${pct}`,
      muscle_adjust: `Refine muscle definition with natural, athletic proportions. ${pct}`,
      muscle_enhance: `Increase muscle size and definition for a more athletic physique. ${pct}`,
      arm_slim: `Subtly slim and tone the arms. Natural and proportional look. ${pct}`,
    };

    const action = actionMap[subTool] || 'Apply natural body enhancement';
    template = template.replace('{action_instruction}', action);
  }

  // {prompt_instruction} — video_generate / seedance_video 的动态指令
  if (template.includes('{prompt_instruction}')) {
    const prompt = params.prompt as string;
    template = template.replace(
      '{prompt_instruction}',
      prompt ? prompt : '镜头缓缓推进，画面自然流畅，光线柔和，高质量视频。',
    );
  }

  return template;
}

/**
 * 数据库 Prompt 模板 Seed 数据
 * 用于初始化 prompt_templates 表
 */
export function getPromptTemplateSeeds() {
  return Object.values(TOOL_PROMPTS).map((config) => ({
    toolType: config.toolType,
    modelName: config.modelName,
    basePrompt: config.basePrompt,
    negativePrompt: config.negativePrompt,
    defaultParams: config.defaultParams,
    replicateVersion: config.replicateModel || null,
    estimatedSeconds: config.estimatedSeconds,
    creditCost: config.creditCost,
    isActive: true,
  }));
}
