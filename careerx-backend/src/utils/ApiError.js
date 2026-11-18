// Custom error hierarchy so the global error middleware can respond
// with consistent shapes and correct HTTP status codes.

export class ApiError extends Error {
  constructor(statusCode, message, details = null, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'Validation failed', details = null) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found') {
    super(404, message);
  }
}

export class ConflictError extends ApiError {
  constructor(message = 'Conflict') {
    super(409, message);
  }
}

export class AIError extends ApiError {
  constructor(message = 'AI service error', details = null) {
    super(502, message, details);
  }
}

export class StorageError extends ApiError {
  constructor(message = 'Storage error', details = null) {
    super(502, message, details);
  }
}

export class DatabaseError extends ApiError {
  constructor(message = 'Database error', details = null) {
    super(500, message, details);
  }
}
