from enum import Enum
from dataclasses import dataclass, field


class AgentType(str, Enum):
    CODE_GENERATOR = "CODE_GENERATOR"
    TEST_GENERATOR = "TEST_GENERATOR"
    CODE_REVIEWER = "CODE_REVIEWER"
    SCAFFOLD = "SCAFFOLD"


class AgentRunStatus(str, Enum):
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class TaskStatus(str, Enum):
    PENDING = "PENDING"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


@dataclass
class Artifact:
    type: str  # "code" | "test" | "review" | "markdown"
    filename: str
    content: str
    language: str = "plaintext"


@dataclass
class AgentResult:
    agentType: AgentType
    summary: str
    artifacts: list[Artifact]
    rawLlmOutput: str
    tokensUsed: int = 0


@dataclass
class AgentContext:
    taskId: str
    projectId: str
    projectName: str
    projectDescription: str
    language: str
    framework: str
    taskTitle: str
    taskDescription: str
    previousOutputs: dict[AgentType, AgentResult] = field(default_factory=dict)
