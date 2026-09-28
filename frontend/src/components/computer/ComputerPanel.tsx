import {
  Activity,
  Box,
  Code2,
  FolderTree,
  Globe,
  Package,
  Power,
  RotateCw,
  Terminal as TerminalIcon,
  Crosshair,
  ChevronLeft,
  ListChecks,
  Bot,
} from "lucide-react";
import { useEffect } from "react";
import { ActivityFeed } from "@/components/computer/ActivityFeed";
import { ArtifactsView } from "@/components/computer/ArtifactsView";
import { BrowserView } from "@/components/computer/BrowserView";
import { EditorView } from "@/components/computer/EditorView";
import { FileTree } from "@/components/computer/FileTree";
import { TerminalView } from "@/components/computer/TerminalView";
import { PlanPanel } from "@/components/computer/PlanPanel";
import AgentsPanel from "@/components/computer/AgentsPanel";
import { Button } from "@/components/ui/button";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip } from "@/components/ui/primitives";
import { useTabDirection } from "@/hooks/useTabDirection";
import { api } from "@/lib/api";
import { useStore, type ComputerTab } from "@/lib/store";
import { cn } from "@/lib/utils";

const TABS: { value: ComputerTab; label: string; icon: typeof Activity }[] = [
  { value: "activity", label: "Activity", icon: Activity },
  { value: "plan", label: "Plan", icon: ListChecks },
  { value: "agents", label: "Agents", icon: Bot },
  { value: "terminal", label: "Terminal", icon: TerminalIcon },
  { value: "editor", label: "Editor", icon: Code2 },
  { value: "browser", label: "Browser", icon: Globe },
  { value: "files", label: "Files", icon: FolderTree },
  { value: "artifacts", label: "Artifacts", icon: Package },
];

const TAB_ORDER = TABS.map((t) => t.value);

export function ComputerPanel() {
  const tab = useStore((s) => s.computerTab);
  const setTab = useStore((s) => s.setComputerTab);
  const follow = useStore((s) => s.followAgent);
  const setFollow = useStore((s) => s.setFollowAgent);
  const sandbox = useStore((s) => s.sandbox);
  const threadId = useStore((s) => s.activeThreadId);
  const refreshSandbox = useStore((s) => s.refreshSandbox);
  const running = useStore((s) => s.running);
  const artifacts = useStore((s) => s.artifacts);
  const toggleComputer = useStore((s) => s.toggleComputer);
  const { dir, listRef } = useTabDirection(TAB_ORDER, tab);

  const status = sandbox?.status ?? "not_started";
  const isolated = sandbox?.backend === "celesto" || sandbox?.backend === "cloud";

  // Keep the sandbox alive while the panel is open, and show live status on
  // every open: views themselves (re)mount lazily, so each open/reopen starts
  // from the CURRENT backend state, not a stale snapshot. Ping touches only an
  // existing box — closing the panel still lets the idle reaper collect it.
  useEffect(() => {
    if (!threadId) return;
    let stopped = false;
    const beat = () => {
      if (stopped || document.hidden) return;
      void api
        .sandboxPing(threadId)
        .then(() => {
          if (!stopped) void refreshSandbox();
        })
        .catch(() => {
          /* backend asleep — next beat retries */
        });
    };
    void refreshSandbox();
    beat();
    const timer = window.setInterval(beat, 4 * 60 * 1000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [threadId, refreshSandbox]);

  return (
    <div className="flex h-full flex-col border-l border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-2.5 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          onClick={toggleComputer}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Box className={cn("size-4", running ? "animate-pulse text-primary" : "text-muted-foreground")} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-tight">Agent's Computer</p>
          <p className="truncate text-[10.5px] leading-tight text-muted-foreground">
            {isolated ? "Celesto computer" : "host process"} · {status}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-0.5">
          <Tooltip content={follow ? "Following the agent — click to pin the current tab" : "Follow the agent"}>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setFollow(!follow)}
              className={cn(follow && "text-primary")}
            >
              <Crosshair className="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="Restart the sandbox">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={async () => {
                if (!threadId) return;
                await api.sandboxRestart(threadId);
                await refreshSandbox();
              }}
            >
              <RotateCw className="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="Stop the sandbox">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={async () => {
                if (!threadId) return;
                await api.sandboxStop(threadId);
                await refreshSandbox();
              }}
            >
              <Power className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as ComputerTab)}
        data-tab-dir={dir}
        className="flex min-h-0 flex-1 flex-col"
      >
        <div ref={listRef} className="scrollbar-thin tabs-fade-x overflow-x-auto border-b border-border px-2 py-1.5">
          <TabsList className="bg-transparent p-0">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value}>
                <Icon className="size-3.5" />
                {label}
                {value === "artifacts" && artifacts.length > 0 ? (
                  <Badge tone="primary" className="ml-1">
                    {artifacts.length}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="min-h-0 flex-1">
          <TabsContent value="activity" className="h-full">
            <ActivityFeed />
          </TabsContent>
          <TabsContent value="plan" className="h-full scrollbar-thin overflow-y-auto">
            <PlanPanel />
          </TabsContent>
          <TabsContent value="agents" className="h-full">
            <AgentsPanel />
          </TabsContent>
          <TabsContent value="terminal" className="h-full">
            <TerminalView />
          </TabsContent>
          <TabsContent value="editor" className="h-full">
            <EditorView />
          </TabsContent>
          <TabsContent value="browser" className="h-full">
            <BrowserView />
          </TabsContent>
          <TabsContent value="files" className="h-full">
            <FileTree />
          </TabsContent>
          <TabsContent value="artifacts" className="h-full">
            <ArtifactsView />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
