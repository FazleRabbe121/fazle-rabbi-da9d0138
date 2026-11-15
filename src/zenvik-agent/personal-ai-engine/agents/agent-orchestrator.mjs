import { AgentError, ValidationError } from "../core/errors.mjs";

/**
 * Bounded multi-agent coordinator. The model may propose a plan, but it cannot
 * invent executable tools: every step must refer to an explicitly registered
 * agent and pass the allow-list and step-budget checks.
 */
export class AgentOrchestrator {
  constructor({ agents, model = null, policy = {} }) {
    this.agents = new Map(Object.entries(agents || {}));
    this.model = model;
    this.maxSteps = policy.maxStepsPerRun ?? 18;
    this.maxDurationMs = policy.maxRunDurationMs ?? 300_000;
  }

  async plan({ goal, context, fallbackPlan = [] }) {
    if (!this.model?.generateJSON) return fallbackPlan;
    const result = await this.model.generateJSON({
      system: `You are a task planner. Return JSON {steps:[{agent:string, task:string, input:object}]}. Only use agent names from the supplied allow-list. Do not request code execution, credential access, external messages, or any unlisted tool. Keep the plan within ${this.maxSteps} steps.`,
      user: { goal, context, allowedAgents: [...this.agents.keys()] },
      temperature: 0.1,
    });
    if (!Array.isArray(result?.steps)) throw new ValidationError("Planner did not return a steps array.");
    return result.steps;
  }

  async execute({ goal, context = {}, fallbackPlan = [], onStep = async () => {} }) {
    const startedAt = Date.now();
    const steps = await this.plan({ goal, context, fallbackPlan });
    if (!steps.length) throw new ValidationError("The plan is empty.");
    if (steps.length > this.maxSteps) throw new AgentError("Plan exceeds the allowed step budget.", { code: "STEP_BUDGET_EXCEEDED", status: 400 });
    const trace = [];
    let currentContext = structuredClone(context);

    for (let index = 0; index < steps.length; index += 1) {
      if (Date.now() - startedAt > this.maxDurationMs) throw new AgentError("Agent run exceeded its time budget.", { code: "TIME_BUDGET_EXCEEDED", status: 408, details: { trace } });
      if (index >= this.maxSteps) throw new AgentError("Agent run exceeded its step budget.", { code: "STEP_BUDGET_EXCEEDED", status: 408, details: { trace } });
      const step = steps[index];
      const agent = this.agents.get(step?.agent);
      if (!agent || typeof agent.execute !== "function") {
        throw new ValidationError(`Plan requested an unregistered agent: ${String(step?.agent)}.`);
      }
      if (step?.input != null && (typeof step.input !== "object" || Array.isArray(step.input))) throw new ValidationError("Agent step input must be a JSON object.");
      if (String(step?.task || "").length > 2_000) throw new ValidationError("Agent step task is too long.");
      const event = { index: index + 1, agent: step.agent, task: String(step.task || ""), status: "running", startedAt: new Date().toISOString() };
      await onStep(event);
      try {
        const output = await agent.execute({ userId: context.userId, task: step.task, input: step.input || {}, context: currentContext });
        event.status = "completed";
        event.outputSummary = agent.summarize ? agent.summarize(output) : "Agent step completed.";
        currentContext = { ...currentContext, [step.agent.replace(/[^a-z0-9_]/gi, "_")]: output };
        trace.push(event);
      } catch (error) {
        event.status = "failed";
        event.error = error instanceof Error ? error.message : String(error);
        trace.push(event);
        throw new AgentError("A multi-agent step failed; later steps were not executed.", { code: "AGENT_STEP_FAILED", status: 500, details: { trace } });
      }
    }
    return { goal, status: "completed", trace, result: currentContext, durationMs: Date.now() - startedAt };
  }
}
