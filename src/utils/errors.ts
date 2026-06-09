export class AppError extends Error {
  constructor(
    public code: number,
    message: string,
    public httpStatus: number = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ParamError extends AppError {
  constructor(message: string = '参数错误', details?: unknown) {
    super(1001, message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = '未登录或登录已过期') {
    super(1002, message, 401);
  }
}

export class InsufficientCreditsError extends AppError {
  constructor(message: string = '积分不足') {
    super(1003, message, 402);
  }
}

export class ProRequiredError extends AppError {
  constructor(message: string = '需要 Pro 会员') {
    super(1004, message, 403);
  }
}

export class ContentViolationError extends AppError {
  constructor(message: string = '图片内容违规') {
    super(1005, message, 400);
  }
}

export class FormatNotSupportedError extends AppError {
  constructor(message: string = '图片格式不支持') {
    super(1006, message, 400);
  }
}

export class AITimeoutError extends AppError {
  constructor(message: string = 'AI 服务超时') {
    super(2001, message, 504);
  }
}

export class AIError extends AppError {
  constructor(message: string = 'AI 服务返回错误') {
    super(2002, message, 502);
  }
}

export class InternalError extends AppError {
  constructor(message: string = '服务器内部错误') {
    super(5000, message, 500);
  }
}
