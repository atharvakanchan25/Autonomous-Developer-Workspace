import { AgentType, IAgent } from "./agent.types";
import { logger } from "../lib/logger";

// simple in-memory registry — agents are registered once at startup
const registry = new Map<AgentType, IAgent>();

export function registerAgent(agent: IAgent): void {
  if (registry.has(agent.type)) {
    logger.warn("Agent already registered — overwriting", { type: agent.type });
  }
  registry.set(agent.type, agent);
  logger.info("Agent registered", { type: agent.type, name: agent.displayName });
}

export function getAgent(type: AgentType): IAgent {
  const agent = registry.get(type);
  if (!agent) {
    throw new Error(
      `No agent registered for type "${type}". Registered: [${[...registry.keys()].join(", ")}]`,
    );
  }
  return agent;
}

export function listAgents(): IAgent[] {
  return [...registry.values()];
}
