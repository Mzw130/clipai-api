// 统一响应格式
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T | null;
  request_id: string;
}

// 错误码
export enum ErrorCode {
  OK = 0,
  PARAM_ERROR = 1001,
  UNAUTHORIZED = 1002,
  INSUFFICIENT_CREDITS = 1003,
  PRO_REQUIRED = 1004,
  CONTENT_VIOLATION = 1005,
  FORMAT_NOT_SUPPORTED = 1006,
  FORBIDDEN = 1007,
  RESOURCE_EXISTS = 3001,
  NOT_FOUND = 3002,
  AI_TIMEOUT = 2001,
  AI_ERROR = 2002,
  INTERNAL_ERROR = 5000,
}

const ERROR_MESSAGES: Record<number, string> = {
  [ErrorCode.OK]: 'success',
  [ErrorCode.PARAM_ERROR]: '参数错误',
  [ErrorCode.UNAUTHORIZED]: '未登录或登录已过期',
  [ErrorCode.INSUFFICIENT_CREDITS]: '积分不足',
  [ErrorCode.PRO_REQUIRED]: '需要 Pro 会员',
  [ErrorCode.CONTENT_VIOLATION]: '图片内容违规',
  [ErrorCode.FORMAT_NOT_SUPPORTED]: '图片格式不支持',
  [ErrorCode.FORBIDDEN]: '无权限访问',
  [ErrorCode.RESOURCE_EXISTS]: '资源已存在',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.AI_TIMEOUT]: 'AI 服务超时',
  [ErrorCode.AI_ERROR]: 'AI 服务返回错误',
  [ErrorCode.INTERNAL_ERROR]: '服务器内部错误',
};

export function success<T>(data: T, message?: string): ApiResponse<T> {
  return {
    code: ErrorCode.OK,
    message: message || 'success',
    data,
    request_id: generateRequestId(),
  };
}

export function error(code: ErrorCode, message?: string, data: null = null): ApiResponse<null> {
  return {
    code,
    message: message || ERROR_MESSAGES[code] || '未知错误',
    data,
    request_id: generateRequestId(),
  };
}

function generateRequestId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'req_';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
