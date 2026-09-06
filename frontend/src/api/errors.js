export class ApiError extends Error {
  constructor(message, { status = null, code = null, kind = 'unknown', details = null, cause = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.kind = kind;
    this.details = details;
    this.cause = cause;
  }
}

export function normalizeApiError(error) {
  if (error instanceof ApiError) return error;

  const response = error?.response;
  const status = response?.status ?? null;
  const payload = response?.data;
  const serverMessage = typeof payload === 'string'
    ? payload
    : payload?.error || payload?.message || null;

  if (status === 401) {
    return new ApiError(serverMessage || 'Your session has expired. Please sign in again.', {
      status,
      code: payload?.code || 'AUTH_REQUIRED',
      kind: 'authentication',
      details: payload,
      cause: error,
    });
  }

  if (status === 403) {
    return new ApiError(serverMessage || 'You do not have permission to perform this action.', {
      status,
      code: payload?.code || 'FORBIDDEN',
      kind: 'authorization',
      details: payload,
      cause: error,
    });
  }

  if (status === 404) {
    return new ApiError(serverMessage || 'The requested resource was not found.', {
      status,
      code: payload?.code || 'NOT_FOUND',
      kind: 'not_found',
      details: payload,
      cause: error,
    });
  }

  if (status >= 400 && status < 500) {
    return new ApiError(serverMessage || 'The request could not be completed.', {
      status,
      code: payload?.code || 'CLIENT_ERROR',
      kind: 'client',
      details: payload,
      cause: error,
    });
  }

  if (status >= 500) {
    return new ApiError('The CasterlyCare service is temporarily unavailable. Please try again.', {
      status,
      code: payload?.code || 'SERVER_ERROR',
      kind: 'server',
      details: payload,
      cause: error,
    });
  }

  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return new ApiError('The request timed out. Please check your connection and try again.', {
      code: 'REQUEST_TIMEOUT',
      kind: 'timeout',
      cause: error,
    });
  }

  if (error?.request) {
    return new ApiError('Unable to reach CasterlyCare right now. Please check your connection and try again.', {
      code: 'NETWORK_ERROR',
      kind: 'network',
      cause: error,
    });
  }

  return new ApiError(error?.message || 'Something went wrong. Please try again.', {
    code: 'UNKNOWN_ERROR',
    kind: 'unknown',
    cause: error,
  });
}

export function apiErrorMessage(error) {
  return normalizeApiError(error).message;
}

export function isAuthError(error) {
  return normalizeApiError(error).kind === 'authentication';
}

export function multipartConfig() {
  // Browser Axios must set the multipart boundary itself.
  return {};
}
