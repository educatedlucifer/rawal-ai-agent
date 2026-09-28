import type {
  Artifact,
  Capabilities,
  ChatMessage,
  ConnectorInfo,
  DirectoryServer,
  FileEntry,
  GithubSkill,
  MarketplaceSkill,
  McpServerInfo,
  ModelOption,
  Project,
  ProviderInfo,
  RegistryServer,
  SandboxConfig,
  SandboxInfo,
  ScheduledJob,
  SkillInfo,
  SubAgentInfo,
  SubAgentListItem,
  SwarmInfo,
  SwarmListItem,
  AgentTypeInfo,
  Thread,
} from "@/types";

const RAW_BASE = import.meta.env.VITE_API_URL ?? "";
export const API_BASE = RAW_BASE.replace(/\/$/, "");
const PREFIX = `${API_BASE}/api/v1`;

const TOKEN_KEY = "rawal.token";
const LEGACY_TOKEN_KEY = "bhati.token";

// One-time migration: rawal-ai-agent rebrand (v2). Preserve existing logins.
try {
  if (!localStorage.getItem(TOKEN_KEY) && localStorage.getItem(LEGACY_TOKEN_KEY)) {
    localStorage.setItem(TOKEN_KEY, localStorage.getItem(LEGACY_TOKEN_KEY) as string);
  }
} catch {
  /* storage unavailable */
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function networkTimeoutMs(method: string): number {
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string; rtt?: number; saveData?: boolean } }).connection;
  const slow = connection?.saveData || connection?.effectiveType === "slow-2g" || connection?.effectiveType === "2g" || (connection?.rtt ?? 0) > 900;
  if (method === "GET") return slow ? 60_000 : 30_000;
  return slow ? 90_000 : 45_000;
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/**
 * Race a promise against a timeout. Used by the boot sequence so the UI can
 * never get stuck forever on "Connecting" (Render free tier cold starts and
 * redeploys accept the connection but answer only after 30s+).
 * The underlying fetch is left alone — idempotent GETs resolving late are harmless.
 */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label = "Request"): Promise<T> {
  let timer = 0;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => reject(new ApiError(`${label} timed out`, 0, "timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (!(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const method = (init.method ?? "GET").toUpperCase();
  const attempts = method === "GET" ? 3 : 1;
  let response: Response | null = null;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), networkTimeoutMs(method));
    try {
      response = await fetch(`${PREFIX}${path}`, {
        ...init,
        headers,
        signal: controller.signal,
        cache: method === "GET" ? "no-store" : init.cache,
      });
      if (response.status >= 500 && attempt < attempts - 1) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
      break;
    } catch (err) {
      lastError = err;
      if (attempt < attempts - 1 && navigator.onLine) {
        await sleep(500 * 2 ** attempt);
        continue;
      }
    } finally {
      window.clearTimeout(timeout);
    }
  }
  if (!response) {
    const message = lastError instanceof DOMException && lastError.name === "AbortError"
      ? "Request timed out — the connection is slow. Your draft is safe; retry when ready."
      : "Network error — request queued when possible";
    throw new ApiError(message, 0, "network_error");
  }
  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new ApiError("Invalid server response", response.status, "parse_error");
    }
  }

  if (!response.ok) {
    const detail = (data as { error?: { message?: string; code?: string } })?.error ?? {};
    throw new ApiError(detail.message ?? response.statusText, response.status, detail.code);
  }
  return data as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PATCH", body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown) =>
  request<T>(path, { method: "PUT", body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

/** Authenticated blob download that never puts the token in the URL. */
async function downloadBlob(url: string, filename: string): Promise<void> {
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch {
    throw new ApiError("Network error", 0, "network_error");
  }
  if (!response.ok) throw new ApiError("Download failed", response.status);
  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export const api = {
  // ---- system ----
  health: () => get<{ status: string; version?: string; auth_required: boolean }>("/health"),
  capabilities: () => get<Capabilities>("/capabilities"),
  tools: () => get<{ count: number; groups: Record<string, number>; tools: unknown[] }>("/tools"),
  getTelegramStatus: () =>
    get<{ enabled: boolean; bot_username: string; token_masked: string; allowed_user_ids: string }>(
      "/telegram/status"
    ),
  updateTelegramConfig: (body: { bot_token: string; allowed_user_ids: string }) =>
    post<{ enabled: boolean; bot_username: string; allowed_user_ids: string }>(
      "/telegram/config",
      body
    ),

  // ---- auth ----
  authStatus: () => get<{ auth_required: boolean; username: string }>("/auth/status"),
  login: (password: string) => post<{ token: string; username: string }>("/auth/login", { password }),
  logout: () => post<{ logged_out: boolean }>("/auth/logout"),

  // ---- projects ----
  listProjects: () => get<Project[]>("/projects"),
  createProject: (body: { name: string; description?: string; instructions?: string; color?: string }) =>
    post<Project>("/projects", body),
  getProject: (id: string) => get<Project>(`/projects/${id}`),
  updateProject: (id: string, body: Partial<Project>) => patch<Project>(`/projects/${id}`, body),
  deleteProject: (id: string) => del<{ deleted: string }>(`/projects/${id}`),
  listMemories: (id: string) =>
    get<{ id: string; key: string; value: string; updated_at: string }[]>(`/projects/${id}/memories`),
  deleteMemory: (projectId: string, memoryId: string) =>
    del<{ deleted: string }>(`/projects/${projectId}/memories/${memoryId}`),

  // ---- threads ----
  listThreads: (projectId?: string) =>
    get<Thread[]>(`/threads${projectId ? `?project_id=${projectId}` : ""}`),
  createThread: (body: { project_id: string; title?: string; model?: string; provider_id?: string | null; mode?: string }) =>
    post<Thread>("/threads", body),
  getThread: (id: string) => get<Thread>(`/threads/${id}`),
  updateThread: (id: string, body: Partial<Thread>) => patch<Thread>(`/threads/${id}`, body),
  deleteThread: (id: string) => del<{ deleted: string }>(`/threads/${id}`),
  truncateThread: (id: string, fromMessageId: string) =>
    post<{ truncated_from: string }>(`/threads/${id}/truncate`, { from_message_id: fromMessageId }),
  forkThread: (id: string, body: { from_message_id?: string; title?: string }) =>
    post<Thread>(`/threads/${id}/fork`, body),
  listMessages: (id: string) => get<ChatMessage[]>(`/threads/${id}/messages`),
  clearMessages: (id: string) => del<{ cleared: string }>(`/threads/${id}/messages`),
  listArtifacts: (id: string) => get<Artifact[]>(`/threads/${id}/artifacts`),
  emailTranscript: (id: string, to: string) =>
    post<{ sent: string }>(`/threads/${id}/email-transcript`, { to }),

  // ---- chat ----
  sendMessage: (id: string, content: string, attachments: unknown[] = []) =>
    post<{ status: string }>(`/threads/${id}/messages`, { content, attachments }),
  interrupt: (id: string) => post<{ interrupted: boolean }>(`/threads/${id}/interrupt`),
  steer: (id: string, content: string) => post<{ accepted: boolean }>(`/threads/${id}/steer`, { content }),
  decidePermission: (id: string, requestId: string, decision: "allow" | "deny" | "allow_always") =>
    post<{ resolved: boolean }>(`/threads/${id}/permissions`, { request_id: requestId, decision }),
  runStatus: (id: string) =>
    get<{ running: boolean; pending_permissions: unknown[] }>(`/threads/${id}/status`),

  // ---- files ----
  listFiles: (threadId: string, path = "") =>
    get<{ path: string; entries: FileEntry[] }>(
      `/threads/${threadId}/files?path=${encodeURIComponent(path)}`,
    ),
  readFile: (threadId: string, path: string) =>
    get<{ path: string; content: string; size: number }>(
      `/threads/${threadId}/files/content?path=${encodeURIComponent(path)}`,
    ),
  writeFile: (threadId: string, path: string, content: string) =>
    put<{ path: string; size: number }>(`/threads/${threadId}/files/content`, { path, content }),
  deleteFile: (threadId: string, path: string) =>
    del<{ deleted: string }>(`/threads/${threadId}/files?path=${encodeURIComponent(path)}`),
  uploadFile: async (threadId: string, file: File, path = "uploads") => {
    const form = new FormData();
    form.append("file", file);
    const token = getToken();
    let response: Response;
    try {
      response = await fetch(
        `${PREFIX}/threads/${threadId}/files/upload?path=${encodeURIComponent(path)}`,
        { method: "POST", body: form, headers: token ? { Authorization: `Bearer ${token}` } : undefined },
      );
    } catch (err) {
      throw new ApiError("Network error", 0, "network_error");
    }
    if (!response.ok) throw new ApiError("Upload failed", response.status);
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new ApiError("Invalid server response", response.status, "parse_error");
      }
    }
    return data as { path: string; size: number; name: string };
  },
  downloadUrl: (threadId: string, path: string) =>
    `${PREFIX}/threads/${threadId}/files/download?path=${encodeURIComponent(path)}`,
  downloadFile: async (threadId: string, path: string, filename?: string) => {
    await downloadBlob(
      `${PREFIX}/threads/${threadId}/files/download?path=${encodeURIComponent(path)}`,
      filename || path.split("/").pop() || "download",
    );
  },
  downloadArchive: async (threadId: string, path = "", filename?: string) => {
    await downloadBlob(
      `${PREFIX}/threads/${threadId}/archive?path=${encodeURIComponent(path)}`,
      filename || `${path.split("/").filter(Boolean).pop() || "workspace"}.zip`,
    );
  },
  downloadProjectZip: async (projectId: string, filename?: string) => {
    await downloadBlob(
      `${PREFIX}/projects/${projectId}/archive`,
      filename || "project.zip",
    );
  },

  // ---- sandbox ----
  sandboxInfo: (threadId: string) => get<SandboxInfo>(`/threads/${threadId}/sandbox`),  sandboxStart: (threadId: string) => post<SandboxInfo>(`/threads/${threadId}/sandbox/start`),
  sandboxRestart: (threadId: string) => post<SandboxInfo>(`/threads/${threadId}/sandbox/restart`),
  sandboxStop: (threadId: string) => post<{ stopped: string }>(`/threads/${threadId}/sandbox/stop`),
  sandboxPing: (threadId: string) =>
    post<{ status: string; backend: string }>(`/threads/${threadId}/sandbox/ping`),
  sandboxExec: (threadId: string, command: string, cwd = "") =>
    post<{ exit_code: number; stdout: string; stderr: string }>(`/threads/${threadId}/sandbox/exec`, {
      command,
      cwd,
    }),
  // ---- live browser -----------------------------------------------------
  browserInfo: (threadId: string) => get<{ status: string; url: string; title: string; started_at: number | null }>(`/threads/${threadId}/browser`),
  browserStart: (threadId: string) => post<{ status: string; url: string; title: string }>(`/threads/${threadId}/browser/start`),
  browserNavigate: (threadId: string, url: string) => post<{ status: string; url: string; title: string; status_code?: number }>(`/threads/${threadId}/browser/navigate`, { url }),
  browserClick: (threadId: string, x: number, y: number, double = false) => post<{ url: string }>(`/threads/${threadId}/browser/click`, { x, y, double }),
  browserType: (threadId: string, text: string) => post<{ url: string }>(`/threads/${threadId}/browser/type`, { text }),
  browserPress: (threadId: string, key: string) => post<{ url: string }>(`/threads/${threadId}/browser/press`, { key }),
  browserScroll: (threadId: string, deltaY: number) => post<{ url: string }>(`/threads/${threadId}/browser/scroll`, { delta_y: deltaY }),
  browserScreenshot: (threadId: string, fullPage = false) => get<{ status: string; url: string; title: string; image_base64: string; width: number; height: number; captured_at: number }>(`/threads/${threadId}/browser/screenshot?full_page=${fullPage ? "true" : "false"}`),
  browserStop: (threadId: string) => del<{ stopped: string }>(`/threads/${threadId}/browser`),

  // ---- sandbox backend setting ----
  sandboxConfig: () => get<SandboxConfig>("/sandbox/config"),
  saveSandboxConfig: (body: {
    backend?: string;
    celesto_api_key?: string;
  }) => post<SandboxConfig>("/sandbox/config", body),

  // ---- providers ----
  listProviders: () => get<ProviderInfo[]>("/providers"),
  providerPresets: () =>
    get<{ name: string; kind: string; base_url: string; default_model: string }[]>("/providers/presets"),
  createProvider: (body: Record<string, unknown>) => post<ProviderInfo>("/providers", body),
  updateProvider: (id: string, body: Record<string, unknown>) => patch<ProviderInfo>(`/providers/${id}`, body),
  deleteProvider: (id: string) => del<{ deleted: string }>(`/providers/${id}`),
  refreshModels: (id: string) =>
    post<{ ok: boolean; models: string[]; error?: string }>(`/providers/${id}/refresh-models`),
  testProvider: (body: Record<string, unknown>) =>
    post<{ ok: boolean; error?: string; reply?: string; models?: string[] }>("/providers/test", body),
  listModels: () => get<ModelOption[]>("/providers/models"),

  // ---- integrations ----
  listConnectors: () => get<ConnectorInfo[]>("/connectors"),
  connect: (service: string, token: string, extra: Record<string, string> = {}) =>
    post<{ connected: boolean; account: Record<string, unknown> }>("/connectors", { service, token, extra }),
  disconnect: (service: string) => del<{ connected: boolean }>(`/connectors/${service}`),
  probeConnector: (service: string) =>
    get<{ ok: boolean; account?: Record<string, unknown>; error?: string }>(`/connectors/${service}/probe`),
  oauthUrl: (
    service: string,
    body: { client_id: string; client_secret?: string; redirect_uri: string; scopes?: string[] },
  ) => post<{ url: string; state: string }>(`/connectors/${service}/oauth/url`, body),
  oauthCallbackUrl: (service: string) =>
    `${API_BASE || window.location.origin}/api/v1/connectors/${service}/oauth/callback`,

  listMcp: () => get<McpServerInfo[]>("/mcp"),
  mcpPresets: () => get<Record<string, unknown>[]>("/mcp/presets"),
  addMcp: (body: Record<string, unknown>) => post<McpServerInfo>("/mcp", body),
  restartMcp: (name: string) => post<McpServerInfo>(`/mcp/${name}/restart`),
  removeMcp: (name: string) => del<{ deleted: string }>(`/mcp/${name}`),
  mcpRegistry: (search = "", limit = 30, offset = 0) =>
    get<{ servers: RegistryServer[]; count: number }>(
      `/mcp/registry?search=${encodeURIComponent(search)}&limit=${limit}&offset=${offset}`,
    ),
  mcpRegistryInstall: (name: string) =>
    post<McpServerInfo & { registry_notes?: string }>("/mcp/registry/install", { name }),
  mcpDirectory: (search = "", limit = 30) =>
    get<{ servers: DirectoryServer[]; count: number }>(
      `/mcp/directory?search=${encodeURIComponent(search)}&limit=${limit}`,
    ),
  mcpDirectoryInstall: (slug: string, name = "") =>
    post<McpServerInfo & { registry_notes?: string }>("/mcp/directory/install", { slug, name }),

  // ---- skills ----
  listSkills: (projectId: string) => get<SkillInfo[]>(`/projects/${projectId}/skills`),
  getSkill: (projectId: string, name: string) =>
    get<SkillInfo & { body: string }>(`/projects/${projectId}/skills/${name}`),
  toggleSkill: (projectId: string, name: string, enabled: boolean) =>
    patch<SkillInfo>(`/projects/${projectId}/skills/${name}`, { enabled }),
  deleteSkill: (projectId: string, name: string) =>
    del<{ deleted: string }>(`/projects/${projectId}/skills/${name}`),
  installSkillPaste: (projectId: string, body: { name: string; content: string; hint?: string }) =>
    post<SkillInfo>(`/projects/${projectId}/skills/paste`, body),
  installSkillUrl: (projectId: string, url: string) =>
    post<SkillInfo[]>(`/projects/${projectId}/skills/from-url`, { url }),
  scanGithubSkills: (projectId: string, repo: string) =>
    post<GithubSkill[]>(`/projects/${projectId}/skills/scan`, { repo }),
  installGithubSkills: (projectId: string, repo: string, only: string[] = []) =>
    post<SkillInfo[]>(`/projects/${projectId}/skills/from-github`, { repo, only }),
  skillMarketplace: (q = "") =>
    get<MarketplaceSkill[]>(`/skills/marketplace${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  installMarketplaceSkill: (projectId: string, skill_id: string) =>
    post<SkillInfo>("/skills/marketplace/install", { project_id: projectId, skill_id }),

  // ---- projects: clone / storage / snapshots / push ----
  cloneProject: (id: string, name: string) =>
    post<{ id: string; name: string; files_copied: number }>(`/projects/${id}/clone`, { name }),
  projectStorage: (id: string) => get<{ bytes: number; files: number }>(`/projects/${id}/storage`),
  pushProject: (id: string) => post<{ repo: string }>(`/projects/${id}/push`),
  listSnapshots: (id: string) =>
    get<{ name: string; size: number; created_at: string }[]>(`/projects/${id}/snapshots`),
  createSnapshot: (id: string, label = "") =>
    post<{ name: string; size: number }>(`/projects/${id}/snapshots`, { label }),
  restoreSnapshot: (id: string, name: string) =>
    post<{ restored: string; files: number }>(`/projects/${id}/snapshots/${name}/restore`),
  deleteSnapshot: (id: string, name: string) =>
    del<{ deleted: string }>(`/projects/${id}/snapshots/${name}`),

  // ---- share links ----
  listShares: (threadId: string) =>
    get<{ id: string; thread_id: string; token: string; role: string; views: number; created_at: string }[]>(
      `/threads/${threadId}/shares`,
    ),
  createShare: (threadId: string) =>
    post<{ id: string; thread_id: string; token: string; role: string; views: number }>(
      `/threads/${threadId}/share`,
      { role: "viewer" },
    ),
  revokeShare: (token: string) => del<{ revoked: boolean }>(`/share/${token}`),
  viewShare: (token: string) =>
    get<{ thread: Thread; messages: ChatMessage[] }>(`/share/${token}`),

  // ---- artifact comments ----
  listComments: (threadId: string, artifactId: string) =>
    get<{ id: string; author: string; content: string; created_at: string }[]>(
      `/threads/${threadId}/artifacts/${artifactId}/comments`,
    ),
  addComment: (threadId: string, artifactId: string, content: string, author = "you") =>
    post<{ id: string; author: string; content: string }>(
      `/threads/${threadId}/artifacts/${artifactId}/comments`,
      { content, author },
    ),

  // ---- scheduled jobs ----
  listJobs: (projectId?: string) =>
    get<ScheduledJob[]>(`/jobs${projectId ? `?project_id=${projectId}` : ""}`),
  createJob: (body: { name: string; project_id: string; thread_id?: string; prompt: string; interval_minutes: number }) =>
    post<ScheduledJob>("/jobs", body),
  patchJob: (id: string, body: Partial<ScheduledJob>) => patch<ScheduledJob>(`/jobs/${id}`, body),
  deleteJob: (id: string) => del<{ deleted: string }>(`/jobs/${id}`),
  runJobNow: (id: string) => post<{ started: string }>(`/jobs/${id}/run-now`),

  // ---- stats & audit ----
  statsOverview: () =>
    get<{ prompt_tokens: number; completion_tokens: number; total_tokens: number; runs: number; threads: number; projects: number }>(
      "/stats/overview",
    ),
  statsByModel: () =>
    get<{ model: string; prompt_tokens: number; completion_tokens: number; total_tokens: number; runs: number; avg_latency_ms: number }[]>(
      "/stats/by-model",
    ),
  statsDaily: (days = 14) =>
    get<{ day: string; prompt_tokens: number; completion_tokens: number; runs: number }[]>(
      `/stats/daily?days=${days}`,
    ),
  listAudit: (limit = 100) =>
    get<{ id: number; actor: string; action: string; detail: Record<string, unknown>; created_at: string }[]>(
      `/audit?limit=${limit}`,
    ),

  // ---- subagents & swarms ----
  listSubAgents: async (threadId: string, status?: string): Promise<SubAgentListItem[]> => {
    const params = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await get<{ agents: SubAgentListItem[] }>(`/agents/${encodeURIComponent(threadId)}${params}`);
    return data.agents;
  },
  getSubAgentStatus: (threadId: string, agentId: string) =>
    get<SubAgentInfo>(`/agents/${encodeURIComponent(threadId)}/${encodeURIComponent(agentId)}`),
  spawnSubAgent: (
    threadId: string,
    data: { agent_type: string; name: string; prompt: string; priority?: string; max_steps?: number },
  ) => post<{ id: string; status: string; name: string }>(`/agents/${encodeURIComponent(threadId)}/spawn`, data),
  killSubAgent: (threadId: string, agentId: string, force = false) =>
    post<{ status: string; agent_id: string }>(
      `/agents/${encodeURIComponent(threadId)}/${encodeURIComponent(agentId)}/kill`,
      { force },
    ),
  pauseSubAgent: (threadId: string, agentId: string) =>
    post<{ status: string; agent_id: string }>(
      `/agents/${encodeURIComponent(threadId)}/${encodeURIComponent(agentId)}/pause`,
      {},
    ),
  resumeSubAgent: (threadId: string, agentId: string) =>
    post<{ status: string; agent_id: string }>(
      `/agents/${encodeURIComponent(threadId)}/${encodeURIComponent(agentId)}/resume`,
      {},
    ),
  killAllSubAgents: (threadId: string) =>
    post<{ killed_count: number }>(`/agents/${encodeURIComponent(threadId)}/kill-all`, {}),
  listSwarms: async (threadId: string): Promise<SwarmListItem[]> => {
    const data = await get<{ swarms: SwarmListItem[] }>(`/agents/${encodeURIComponent(threadId)}/swarms`);
    return data.swarms;
  },
  getSwarmStatus: (threadId: string, swarmId: string) =>
    get<SwarmInfo>(`/agents/${encodeURIComponent(threadId)}/swarms/${encodeURIComponent(swarmId)}`),
  deploySwarm: (
    threadId: string,
    data: {
      name: string;
      prompt: string;
      strategy?: string;
      agent_count?: number;
      agent_type?: string;
      priority?: string;
      max_steps?: number;
    },
  ) =>
    post<{ id: string; status: string; name: string }>(
      `/agents/${encodeURIComponent(threadId)}/swarms/deploy`,
      data,
    ),
  killSwarm: (threadId: string, swarmId: string) =>
    post<{ status: string; swarm_id: string; killed_count: number }>(
      `/agents/${encodeURIComponent(threadId)}/swarms/${encodeURIComponent(swarmId)}/kill`,
      {},
    ),
  getAgentTypes: async (): Promise<Record<string, AgentTypeInfo>> => {
    const data = await get<{ agent_types: Record<string, AgentTypeInfo> }>("/agents/types/info");
    return data.agent_types;
  },
};

export function streamUrl(threadId: string, after = 0): string {
  const token = getToken();
  const query = new URLSearchParams({ after: String(after) });
  if (token) query.set("token", token);
  return `${PREFIX}/threads/${threadId}/stream?${query.toString()}`;
}

export function terminalUrl(threadId: string): string {
  const base = API_BASE || window.location.origin;
  const url = new URL(`${base}/api/v1/threads/${threadId}/terminal`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const token = getToken();
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export function browserStreamUrl(threadId: string): string {
  const base = API_BASE || window.location.origin;
  const url = new URL(`${base}/api/v1/threads/${threadId}/browser/stream`);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  const token = getToken();
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export function previewUrl(threadId: string, port: number, path = ""): string {
  return `${PREFIX}/preview/${threadId}/${port}/${path}`;
}

/**
 * Short display label for a model id (last path segment).
 */
export const MODEL_DISPLAY_NAMES: Record<string, string> = {};

export function displayModelName(modelId: string): string {
  return MODEL_DISPLAY_NAMES[modelId] ?? modelId.split("/").pop() ?? modelId;
}

/** Mint a short-lived preview ticket (iframe can't send auth headers). */
export async function fetchPreviewTicket(
  threadId: string,
  port: number
): Promise<{ ticket: string; cookie_name: string; expires_in: number }> {
  return get<{ ticket: string; cookie_name: string; expires_in: number }>(
    `/preview/ticket?thread_id=${encodeURIComponent(threadId)}&port=${encodeURIComponent(String(port))}`
  );
}

/**
 * Build an iframe-ready preview URL: fetches a ticket, stores it in a
 * per-preview cookie (so relative CSS/JS/img sub-resources validate too)
 * and appends ?ticket= for the first navigation / new-tab opens.
 * Falls back to the bare URL when the backend has no password (open mode)
 * or the ticket call fails.
 */
export async function previewUrlWithTicket(
  threadId: string,
  port: number,
  path = ""
): Promise<string> {
  const base = previewUrl(threadId, port, path);
  try {
    const { ticket, cookie_name, expires_in } = await fetchPreviewTicket(threadId, port);
    try {
      document.cookie = `${cookie_name}=${encodeURIComponent(ticket)}; Path=/; Max-Age=${expires_in}; SameSite=Lax`;
    } catch {
      /* cookies blocked — query param still covers the first load */
    }
    const sep = base.includes("?") ? "&" : "?";
    return `${base}${sep}ticket=${encodeURIComponent(ticket)}`;
  } catch {
    return base;
  }
}

// ── SubAgent & Swarm API ────────────────────────────────────────────────────
// Standalone re-exports kept for backwards compatibility; prefer `api.*`.

export async function listSubAgents(threadId: string, status?: string): Promise<SubAgentListItem[]> {
  return api.listSubAgents(threadId, status);
}

export async function getSubAgentStatus(threadId: string, agentId: string): Promise<SubAgentInfo> {
  return api.getSubAgentStatus(threadId, agentId);
}

export async function spawnSubAgent(threadId: string, data: {
  agent_type: string; name: string; prompt: string; priority?: string; max_steps?: number;
}): Promise<{ id: string; status: string; name: string }> {
  return api.spawnSubAgent(threadId, data);
}

export async function killSubAgent(threadId: string, agentId: string, force = false): Promise<{ status: string; agent_id: string }> {
  return api.killSubAgent(threadId, agentId, force);
}

export async function pauseSubAgent(threadId: string, agentId: string): Promise<{ status: string; agent_id: string }> {
  return api.pauseSubAgent(threadId, agentId);
}

export async function resumeSubAgent(threadId: string, agentId: string): Promise<{ status: string; agent_id: string }> {
  return api.resumeSubAgent(threadId, agentId);
}

export async function killAllSubAgents(threadId: string): Promise<{ killed_count: number }> {
  return api.killAllSubAgents(threadId);
}

export async function listSwarms(threadId: string): Promise<SwarmListItem[]> {
  return api.listSwarms(threadId);
}

export async function getSwarmStatus(threadId: string, swarmId: string): Promise<SwarmInfo> {
  return api.getSwarmStatus(threadId, swarmId);
}

export async function deploySwarm(threadId: string, data: {
  name: string; prompt: string; strategy?: string; agent_count?: number; agent_type?: string; priority?: string; max_steps?: number;
}): Promise<{ id: string; status: string; name: string }> {
  return api.deploySwarm(threadId, data);
}

export async function killSwarm(threadId: string, swarmId: string): Promise<{ status: string; swarm_id: string; killed_count: number }> {
  return api.killSwarm(threadId, swarmId);
}

export async function getAgentTypes(): Promise<Record<string, AgentTypeInfo>> {
  return api.getAgentTypes();
}
