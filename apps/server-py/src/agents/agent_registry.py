from src.agents.agent_types import AgentType
from src.lib.logger import logger

_registry: dict[AgentType, object] = {}


def register_agent(agent: object) -> None:
    if agent.type in _registry:  # type: ignore[attr-defined]
        logger.warning(f"Agent already registered — overwriting: {agent.type}")  # type: ignore[attr-defined]
    _registry[agent.type] = agent  # type: ignore[attr-defined]
    logger.info(f"Agent registered: {agent.type} ({agent.display_name})")  # type: ignore[attr-defined]


def get_agent(agent_type: AgentType) -> object:
    agent = _registry.get(agent_type)
    if not agent:
        raise ValueError(
            f'No agent registered for type "{agent_type}". '
            f"Registered: {list(_registry.keys())}"
        )
    return agent


def list_agents() -> list[object]:
    return list(_registry.values())
