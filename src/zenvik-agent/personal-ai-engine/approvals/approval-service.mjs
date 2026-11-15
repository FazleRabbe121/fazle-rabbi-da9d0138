import { AuthorizationError, ConflictError, NotFoundError } from "../core/errors.mjs";

/**
 * One-time approval gate for external actions. Production repositories must
 * implement claimAction atomically (UPDATE ... WHERE status='pending').
 */
export class ApprovalService {
  constructor(repository) {
    this.repository = repository;
  }

  async request({ userId, type, payload, summary }) {
    if (!userId || !type || !payload) throw new TypeError("userId, type and payload are required.");
    return this.repository.createAction(userId, {
      type,
      payload,
      summary: String(summary || "Review this external action before execution."),
      status: "pending",
    });
  }

  async listPending({ userId, limit = 50 }) {
    if (typeof this.repository.listActions !== "function") throw new TypeError("Repository must implement listActions().");
    return this.repository.listActions(userId, { status: "pending", limit });
  }

  async approve({ userId, actionId, execute }) {
    const current = await this.repository.getAction(userId, actionId);
    if (!current) throw new NotFoundError("Approval action was not found.");
    if (current.userId !== userId) throw new AuthorizationError();
    if (current.status !== "pending") throw new ConflictError(`Action has already moved to '${current.status}'.`);
    if (typeof execute !== "function") throw new TypeError("An execution handler is required.");

    // Atomic claim prevents double-clicks and concurrent duplicate sends.
    const claimed = await this.repository.claimAction(userId, actionId);
    try {
      const result = await execute(claimed.payload);
      return this.repository.updateAction(userId, actionId, {
        status: "executed",
        result,
        executedAt: new Date().toISOString(),
      });
    } catch (error) {
      // Do not auto-retry an external send with an uncertain outcome.
      return this.repository.updateAction(userId, actionId, {
        status: "needs_review",
        error: error instanceof Error ? error.message : String(error),
        failureAt: new Date().toISOString(),
      });
    }
  }

  async reject({ userId, actionId, reason = "Rejected by user." }) {
    const current = await this.repository.getAction(userId, actionId);
    if (!current) throw new NotFoundError("Approval action was not found.");
    if (current.status !== "pending") throw new ConflictError(`Action cannot be rejected from status '${current.status}'.`);
    return this.repository.updateAction(userId, actionId, { status: "rejected", rejectionReason: reason });
  }
}
