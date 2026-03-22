export const SYSTEM_PROMPT = `You are a senior software architect. Your job is to break down a software project description into a structured execution plan.

You MUST respond with ONLY a valid JSON object — no markdown, no explanation, no code fences.

The JSON must conform exactly to this structure:
{
  "tasks": [
    {
      "key": "string (short unique snake_case identifier, e.g. setup_repo)",
      "title": "string (concise task title, max 80 chars)",
      "description": "string (1-2 sentence explanation of what this task involves)",
      "order": number (execution order starting from 1),
      "dependsOn": ["key1", "key2"] (keys of tasks this task depends on, empty array if none)
    }
  ]
}

Rules:
- Generate between 4 and 12 tasks. Never fewer, never more.
- Every key must be unique, lowercase, snake_case, max 40 chars.
- dependsOn must only reference keys defined in the same tasks array.
- The dependency graph must be a valid DAG — no cycles.
- Tasks with no prerequisites must have dependsOn: [].
- Order tasks so that dependencies always have a lower order number than their dependents.
- Do not include any field other than the ones specified above.`;

export const FEW_SHOT_EXAMPLE = {
  input: "Build a simple REST API for a blog with posts and comments",
  output: JSON.stringify({
    tasks: [
      {
        key: "setup_project",
        title: "Initialise project and install dependencies",
        description: "Create the Node.js project, configure TypeScript, and install Express, Prisma, and other core dependencies.",
        order: 1,
        dependsOn: [],
      },
      {
        key: "design_schema",
        title: "Design database schema",
        description: "Define Prisma models for Post and Comment with appropriate fields and relations.",
        order: 2,
        dependsOn: ["setup_project"],
      },
      {
        key: "run_migrations",
        title: "Run database migrations",
        description: "Apply the Prisma schema to the PostgreSQL database and generate the client.",
        order: 3,
        dependsOn: ["design_schema"],
      },
      {
        key: "posts_api",
        title: "Implement Posts CRUD endpoints",
        description: "Build GET /posts, POST /posts, GET /posts/:id, PUT /posts/:id, DELETE /posts/:id.",
        order: 4,
        dependsOn: ["run_migrations"],
      },
      {
        key: "comments_api",
        title: "Implement Comments CRUD endpoints",
        description: "Build GET /posts/:id/comments and POST /posts/:id/comments endpoints.",
        order: 5,
        dependsOn: ["run_migrations"],
      },
      {
        key: "error_handling",
        title: "Add global error handling and input validation",
        description: "Implement Zod validation schemas and a centralised Express error handler middleware.",
        order: 6,
        dependsOn: ["posts_api", "comments_api"],
      },
      {
        key: "write_tests",
        title: "Write integration tests",
        description: "Cover all endpoints with integration tests using a test database.",
        order: 7,
        dependsOn: ["error_handling"],
      },
    ],
  }),
};

export function buildUserPrompt(projectDescription: string): string {
  return `Project description: ${projectDescription.trim()}`;
}
