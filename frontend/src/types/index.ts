export type Role = "user" | "assistant" | "tool" | "system";
export type ThreadMode = "agent" | "chat" | "plan";
export type PermissionMode = "auto" | "ask" | "plan";
export type ToolStatus = "ok" | "error" | "denied" | "running";

export interface ScheduledJob {
  id: string;
  name: string;
  project_id: string;
  thread_id: string | null;
  prompt: string;
  interval_minutes: number;
  enabled: boolean;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  slug: string;
  instructions: string;
  icon: string;
  color: string;
  archived: boolean;
  workspace_path: string;
  thread_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface Thread {
  id: string;
  project_id: string;
  title: string;
  model: string;
  provider_id: string | null;
  mode: ThreadMode;
  permission_mode: PermissionMode;
  system_prompt: string;
  status: "idle" | "running" | "error";
  pinned: boolean;
  archived: boolean;
  source?: string;
  todos: Todo[];
  token_usage: { prompt_tokens?: number; completion_tokens?: number };
  created_at: string | null;
  updated_at: string | null;
  last_message_at: string | null;
}

export interface Todo {
  id: string;
  title: string;
  status: "pending" | "in_progress" | "completed" | "blocked";
  note?: string;
}

export interface ToolDisplay {
  kind:
    | "file"
    | "diff"
    | "tree"
    | "terminal"
    | "list"
    | "search"
    | "web"
    | "todos"
    | "thinking"
    | "artifact"
    | "subagent"
    | "preview"
    | "browser"
    | "link"
    | "text"
    | "git_status";
  [key: string]: unknown;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  display?: ToolDisplay | null;
  status: ToolStatus;
  duration_ms?: number;
  streamingOutput?: string;
}

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  reasoning?: string;
  attachments?: { name: string; path: string; size?: number }[];
  meta?: Record<string, unknown>;
  error?: string;
  created_at?: string | null;
  tool_calls: ToolCall[];
  streaming?: boolean;
  /** Optimistic local echo — replaced by the server message on SSE echo. */
  pending?: boolean;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: number;
}

export interface ProviderInfo {
  id: string;
  name: string;
  kind: "openai" | "anthropic";
  base_url: string;
  api_key_masked: string;
  has_key: boolean;
  models: string[];
  default_model: string;
  enabled: boolean;
  headers: Record<string, string>;
  readonly?: boolean;
}

export interface ModelOption {
  provider_id: string;
  provider: string;
  kind: string;
  model: string;
}

export interface ConnectorField {
  key: string;
  label: string;
  secret: boolean;
}

export interface ConnectorOAuth {
  scopes: string[];
  docs: string;
}

export interface ConnectorInfo {
  service: string;
  label: string;
  kind: string;
  help: string;
  docs: string;
  fields: ConnectorField[];
  oauth: ConnectorOAuth | null;
  connected: boolean;
  account: Record<string, unknown>;
  token_masked: string;
  updated_at: string | null;
}

export interface McpServerInfo {
  id: string;
  name: string;
  transport: "stdio" | "sse" | "http";
  command: string;
  args: string[];
  url: string;
  enabled: boolean;
  status: string;
  error: string;
  tools: { name: string; original: string; description: string }[];
}

export interface RegistryServer {
  name: string;
  description: string;
  version: string;
  repository: string;
  transports: string[];
  package_count: number;
  remote_count: number;
}

export interface DirectoryServer {
  slug: string;
  name: string;
  description: string;
  url: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  author: string;
  tags: string[];
  source: string;
  path: string;
  files: string[];
  enabled: boolean;
  origin_url: string;
}

export interface GithubSkill {
  path: string;
  size: number;
  repo: string;
  ref: string;
  name?: string;
  description?: string;
}

export interface MarketplaceSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  repo_url: string;
  license: string;
  live?: boolean;
}

export interface SandboxInfo {
  id?: string;
  status: string;
  backend: string;
  workspace: string;
  image?: string;
  started_at?: number;
  detail?: Record<string, unknown>;
}

export interface SandboxPoolStatus {
  active: boolean;
  warm?: number;
  size?: number;
  quota_exhausted?: boolean;
  last_error?: string;
}

export interface SandboxConfig {
  backend: string;
  effective_backend: string;
  celesto_configured: boolean;
  celesto_key_masked: string;
  pool: SandboxPoolStatus;
}

export interface Artifact {
  id: string;
  title: string;
  kind: string;
  path: string;
  content: string;
  size: number;
  created_at: string | null;
}

export interface PermissionRequest {
  request_id: string;
  tool_call_id: string;
  tool: string;
  arguments: Record<string, unknown>;
  reason: string;
}

export interface Capabilities {
  version: string;
  auth_required: boolean;
  sandbox_backend: string;
  sandbox_image: string;
  tools: number;
  mcp_servers: { name: string; status: string; tools: number; error: string }[];
  limits: Record<string, number>;
}

// ── SubAgent & Swarm types ──────────────────────────────────────────────────

export type AgentType = "explorer" | "coder" | "reviewer" | "researcher" | "planner" | "tester" | "deployer" | "monitor" | "coordinator";
export type AgentStatus = "queued" | "spawning" | "running" | "paused" | "completed" | "failed" | "killed";
export type AgentPriority = "critical" | "high" | "normal" | "low" | "background";
export type SwarmStrategy = "parallel" | "sequential" | "map_reduce" | "hierarchical";
export type SwarmStatus = "deploying" | "running" | "completed" | "failed" | "killed";

export interface SubAgentInfo {
  id: string;
  thread_id: string;
  parent_agent_id: string | null;
  swarm_id: string | null;
  name: string;
  agent_type: AgentType;
  status: AgentStatus;
  priority: AgentPriority;
  prompt: string;
  result: string;
  result_summary: string;
  error: string;
  max_steps: number;
  steps_completed: number;
  tools_allowed: string[];
  tools_blocked: string[];
  token_usage: Record<string, number>;
  duration_ms: number;
  started_at: string | null;
  finished_at: string | null;
  meta: Record<string, unknown>;
  is_live: boolean;
}

export interface SubAgentListItem {
  id: string;
  name: string;
  agent_type: AgentType;
  status: AgentStatus;
  priority: AgentPriority;
  result_summary: string;
  error: string;
  duration_ms: number;
  started_at: string | null;
  finished_at: string | null;
  swarm_id: string | null;
  is_live: boolean;
}

export interface SwarmInfo {
  id: string;
  thread_id: string;
  name: string;
  strategy: SwarmStrategy;
  status: SwarmStatus;
  prompt: string;
  agent_count: number;
  completed_count: number;
  failed_count: number;
  result: string;
  meta: Record<string, unknown>;
  agents: SubAgentListItem[];
}

export interface SwarmListItem {
  id: string;
  name: string;
  strategy: SwarmStrategy;
  status: SwarmStatus;
  agent_count: number;
  completed_count: number;
  failed_count: number;
  result: string;
}

export interface AgentTypeInfo {
  system_prompt: string;
  priority_default: AgentPriority;
  max_steps_default: number;
  icon: string;
  color: string;
}
