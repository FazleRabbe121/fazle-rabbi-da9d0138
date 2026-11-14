export class AgentError extends Error {
  constructor(message, { code = "AGENT_ERROR", status = 500, details = undefined } = {}) {
    super(message);
    this.name = "AgentError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ProviderUnavailableError extends AgentError {
  constructor(message = "The configured self-hosted model is unavailable.", details) {
    super(message, { code: "MODEL_UNAVAILABLE", status: 503, details });
    this.name = "ProviderUnavailableError";
  }
}

export class AuthorizationError extends AgentError {
  constructor(message = "You are not authorized to perform this action.") {
    super(message, { code: "FORBIDDEN", status: 403 });
    this.name = "AuthorizationError";
  }
}

export class NotFoundError extends AgentError {
  constructor(message = "The requested record was not found.") {
    super(message, { code: "NOT_FOUND", status: 404 });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AgentError {
  constructor(message = "The requested state change is not allowed.") {
    super(message, { code: "CONFLICT", status: 409 });
    this.name = "ConflictError";
  }
}

export class ValidationError extends AgentError {
  constructor(message = "Invalid request.", details) {
    super(message, { code: "VALIDATION_ERROR", status: 400, details });
    this.name = "ValidationError";
  }
}
