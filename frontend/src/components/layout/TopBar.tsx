import {
  Bot,
  Check,
  ChevronDown,
  Columns2,
  Cpu,
  Eye,
  Globe,
  Hammer,
  Laptop,
  LogOut,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Share2,
  ShieldCheck,
  Smartphone,
  Sun,
  Trash,
  Wifi,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Badge, Tooltip } from "@/components/ui/primitives";
import { api, displayModelName, setToken } from "@/lib/api";
import { activeThread, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/useTheme";
import { CompareDialog } from "@/components/chat/CompareDialog";
import { ShareDialog } from "@/components/chat/ShareDialog";

const MODE_META = {
  agent: { label: "Agent", icon: Hammer, hint: "Full tools — reads, writes, runs commands" },
  plan: { label: "Plan", icon: Eye, hint: "Investigates read-only and proposes a plan" },
  chat: { label: "Chat", icon: Bot, hint: "No tools, just conversation" },
} as const;

const PERMISSION_META = {
  auto: "Run everything automatically",
  ask: "Ask before writes and commands",
  plan: "Ask before anything that changes state",
} as const;

export function TopBar() {
  const thread = useStore(activeThread);
  const models = useStore((s) => s.models);
  const setModel = useStore((s) => s.setThreadModel);
  const setMode = useStore((s) => s.setThreadMode);
  const setPermissionMode = useStore((s) => s.setPermissionMode);
  const computerOpen = useStore((s) => s.computerOpen);
  const toggleComputer = useStore((s) => s.toggleComputer);
  const capabilities = useStore((s) => s.capabilities);
  const usage = useStore((s) => s.usage);
  const running = useStore((s) => s.running);
  const threadId = useStore((s) => s.activeThreadId);
  const selectThread = useStore((s) => s.selectThread);
  const { theme, toggle } = useTheme();
  const [shareOpen, setShareOpen] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);

  const deviceMode = useStore((s) => s.deviceMode);
  const setDeviceMode = useStore((s) => s.setDeviceMode);
  const networkMode = useStore((s) => s.networkMode);
  const effectiveNetworkMode = useStore((s) => s.effectiveNetworkMode);
  const setNetworkMode = useStore((s) => s.setNetworkMode);
  const networkStats = useStore((s) => s.networkStats);

  if (!thread) {
    return <header className="liquid-bar h-12 shrink-0 border-b border-border" />;
  }

  const mode = MODE_META[thread.mode] ?? MODE_META.agent;
  const ModeIcon = mode.icon;
  const totalTokens = usage.prompt_tokens + usage.completion_tokens;
  const isUltraLow = effectiveNetworkMode === "ultra_low";

  return (
    <header className="liquid-bar flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
      <h1 className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{thread.title}</h1>

      {running ? (
        <Badge tone="primary" className="hidden sm:inline-flex">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" />
          working
        </Badge>
      ) : null}

      {/* Network Bandwidth Indicator & Selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={`h-7 gap-1 px-2 text-xs font-mono hidden sm:inline-flex ${
              isUltraLow ? "border-emerald-500/40 text-emerald-500 bg-emerald-500/10" : "text-sky-400 border-sky-500/30"
            }`}
            title="Network Speed & Performance Mode"
          >
            {isUltraLow ? <Zap className="size-3" /> : <Wifi className="size-3" />}
            <span>{isUltraLow ? "🪶 <40kbps Mode" : "⚡ High-Speed Pro"}</span>
            <ChevronDown className="size-2.5 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="flex items-center justify-between">
            <span>Network Performance</span>
            <span className="text-[10.5px] text-muted-foreground font-mono">
              {networkStats.effectiveSpeedKbps > 1000
                ? `${(networkStats.effectiveSpeedKbps / 1024).toFixed(1)} Mb/s`
                : `${networkStats.effectiveSpeedKbps} kbps`}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setNetworkMode("auto")}>
            <Globe className="size-4 text-primary" />
            <span className="flex-1">
              <span className="block font-medium">Auto Detect</span>
              <span className="block text-[11px] text-muted-foreground">Adapts automatically</span>
            </span>
            {networkMode === "auto" && <span className="text-xs text-primary">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setNetworkMode("ultra_low")}>
            <Zap className="size-4 text-emerald-500" />
            <span className="flex-1">
              <span className="block font-medium">Ultra-Low (&lt;40 kbps)</span>
              <span className="block text-[11px] text-muted-foreground">Zero lag, fast text stream</span>
            </span>
            {networkMode === "ultra_low" && <span className="text-xs text-emerald-500">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setNetworkMode("high_speed")}>
            <Wifi className="size-4 text-sky-400" />
            <span className="flex-1">
              <span className="block font-medium">High-Speed Pro UI</span>
              <span className="block text-[11px] text-muted-foreground">Monaco, rich animations & GPU</span>
            </span>
            {networkMode === "high_speed" && <span className="text-xs text-sky-400">✓</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Device View Mode Switcher (Desktop vs Mobile) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" title="Device Mode (PC / Mobile)">
            {deviceMode === "mobile" ? <Smartphone className="size-3.5 text-primary" /> : <Laptop className="size-3.5" />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Device View</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setDeviceMode("desktop")}>
            <Laptop className="size-4" />
            <span className="flex-1">Desktop (PC) Mode</span>
            {deviceMode === "desktop" && <span className="text-xs text-primary">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeviceMode("mobile")}>
            <Smartphone className="size-4" />
            <span className="flex-1">Mobile (Android) Mode</span>
            {deviceMode === "mobile" && <span className="text-xs text-primary">✓</span>}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDeviceMode("auto")}>
            <Globe className="size-4" />
            <span className="flex-1">Auto-Detect Device</span>
            {deviceMode === "auto" && <span className="text-xs text-primary">✓</span>}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {totalTokens > 0 ? (
        <Tooltip content={`${usage.prompt_tokens.toLocaleString()} in · ${usage.completion_tokens.toLocaleString()} out`}>
          <span className="hidden text-[11px] tabular-nums text-muted-foreground md:block">
            {totalTokens.toLocaleString()} tok
          </span>
        </Tooltip>
      ) : null}

      {/* mode */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1 px-1.5 sm:px-2.5">
            <ModeIcon className="size-3.5" />
            <span className="hidden sm:inline">{mode.label}</span>
            <ChevronDown className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>Mode</DropdownMenuLabel>
          {(Object.keys(MODE_META) as (keyof typeof MODE_META)[]).map((key) => {
            const meta = MODE_META[key];
            const Icon = meta.icon;
            return (
              <DropdownMenuItem key={key} onSelect={() => void setMode(key)}>
                <Icon className="size-4" />
                <span className="flex-1">
                  <span className="block">{meta.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{meta.hint}</span>
                </span>
                {thread.mode === key ? <Check className="size-3.5 text-primary" /> : null}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Permissions</DropdownMenuLabel>
          {(Object.keys(PERMISSION_META) as (keyof typeof PERMISSION_META)[]).map((key) => (
            <DropdownMenuCheckItem
              key={key}
              checked={thread.permission_mode === key}
              onSelect={() => void setPermissionMode(key)}
            >
              <span className="flex-1">
                <span className="block capitalize">{key}</span>
                <span className="block text-[11px] text-muted-foreground">{PERMISSION_META[key]}</span>
              </span>
            </DropdownMenuCheckItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* model */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="max-w-[110px] sm:max-w-[220px] gap-1 px-1.5 sm:px-2.5">
            <Cpu className="size-3.5 shrink-0" />
            <span className="truncate text-xs">{thread.model ? displayModelName(thread.model) : "Model"}</span>
            <ChevronDown className="size-3 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-96 w-72 overflow-y-auto">
          {models.length === 0 ? (
            <p className="px-2.5 py-3 text-[12.5px] text-muted-foreground">
              No models yet. Add a provider in Settings.
            </p>
          ) : (
            models.map((option) => (
              <DropdownMenuCheckItem
                key={`${option.provider_id}:${option.model}`}
                checked={thread.model === option.model && thread.provider_id === option.provider_id}
                onSelect={() => void setModel(option.provider_id, option.model)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{displayModelName(option.model)}</span>
                  <span className="block text-[11px] text-muted-foreground">{option.provider}</span>
                </span>
              </DropdownMenuCheckItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {capabilities ? (
        <Tooltip
          content={
            capabilities.sandbox_backend === "celesto" || capabilities.sandbox_backend === "cloud"
              ? "Each chat gets its own isolated Celesto computer"
              : "Celesto unavailable — the agent runs on the host process"
          }
        >
          <Badge
            tone={capabilities.sandbox_backend === "celesto" || capabilities.sandbox_backend === "cloud" ? "success" : "warning"}
            className="hidden lg:inline-flex"
          >
            <ShieldCheck className="size-3" />
            {capabilities.sandbox_backend}
          </Badge>
        </Tooltip>
      ) : null}

      <Tooltip content="Compare with another chat">
        <Button variant="ghost" size="icon-sm" onClick={() => setCompareOpen(true)}>
          <Columns2 className="size-3.5" />
        </Button>
      </Tooltip>

      <Tooltip content="Share / export">
        <Button variant="ghost" size="icon-sm" onClick={() => setShareOpen(true)}>
          <Share2 className="size-3.5" />
        </Button>
      </Tooltip>

      <Tooltip content="Clear this conversation">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={async () => {
            if (!threadId || !confirm("Clear every message in this chat?")) return;
            await api.clearMessages(threadId);
            await selectThread(threadId);
          }}
        >
          <Trash className="size-3.5" />
        </Button>
      </Tooltip>

      <Tooltip content={theme === "dark" ? "Light mode" : "Dark mode"}>
        <Button variant="ghost" size="icon-sm" onClick={toggle}>
          {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
        </Button>
      </Tooltip>

      <Tooltip content="Sign out (clears session and site data)">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={async () => {
            try {
              await api.logout();
            } catch {
              /* server unreachable — still wipe locally */
            } finally {
              setToken("");
              window.location.reload();
            }
          }}
        >
          <LogOut className="size-3.5" />
        </Button>
      </Tooltip>

      <Tooltip content={computerOpen ? "Hide the agent's computer" : "Show the agent's computer"}>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleComputer}
          className={cn(computerOpen && "text-primary")}
        >
          {computerOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
        </Button>
      </Tooltip>

      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} threadId={threadId} threadTitle={thread.title} />
      <CompareDialog open={compareOpen} onOpenChange={setCompareOpen} />
    </header>
  );
}
