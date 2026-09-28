import { Archive, BarChart3, Blocks, CalendarClock, ChevronLeft, ChevronRight, Container, Cpu, FolderCog, MessageCircle, Mic, Palette, ScrollText, Share2, Wrench } from "lucide-react";
import { useEffect, useState } from "react";
import { AppearanceTab } from "@/components/settings/AppearanceTab";
import { AuditTab } from "@/components/settings/AuditTab";
import { BackupsTab } from "@/components/settings/BackupsTab";
import { InsightsTab } from "@/components/settings/InsightsTab";
import { JobsTab } from "@/components/settings/JobsTab";
import { MarketplaceTab } from "@/components/settings/MarketplaceTab";
import { ProjectTab } from "@/components/settings/ProjectTab";
import { ProvidersTab } from "@/components/settings/ProvidersTab";
import { SandboxTab } from "@/components/settings/SandboxTab";
import { SocialTab } from "@/components/settings/SocialTab";
import { VoiceTab } from "@/components/settings/VoiceTab";
import { TelegramTab } from "@/components/settings/TelegramTab";
import { DataTab } from "@/components/settings/DataTab";
import { useTabDirection } from "@/hooks/useTabDirection";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge, Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";

const SETTINGS_ORDER = [
  "providers",
  "marketplace",
  "social",
  "sandbox",
  "voice",
  "telegram",
  "project",
  "agent",
  "backups",
  "insights",
  "appearance",
  "audit",
  "tools",
  "data",
];

function ToolsTab() {

  const [data, setData] = useState<{
    count: number;
    groups: Record<string, number>;
    tools: { name: string; description: string; group: string; permission: string }[];
  } | null>(null);

  useEffect(() => {
    void api.tools().then((result) => setData(result as never));
  }, []);

  if (!data) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  const byGroup = new Map<string, typeof data.tools>();
  for (const tool of data.tools) {
    byGroup.set(tool.group, [...(byGroup.get(tool.group) ?? []), tool]);
  }

  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-muted-foreground">
        {data.count} tools available to the agent right now.
      </p>
      {[...byGroup.entries()].map(([group, tools]) => (
        <div key={group}>
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {group}
          </p>
          <ul className="space-y-1">
            {tools.map((tool) => (
              <li key={tool.name} className="rounded-lg border border-border bg-surface px-3 py-2">
                <p className="flex items-center gap-2 font-mono text-[12.5px]">
                  {tool.name}
                  {tool.permission !== "safe" ? (
                    <Badge tone={tool.permission === "dangerous" ? "danger" : "warning"}>
                      {tool.permission}
                    </Badge>
                  ) : null}
                </p>
                <p className="text-[11.5px] text-muted-foreground">{tool.description}</p>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const capabilities = useStore((s) => s.capabilities);
  const [tab, setTab] = useState<string>("marketplace");
  const { dir, listRef, scrollStrip } = useTabDirection(SETTINGS_ORDER, tab);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[86vh] w-[min(880px,94vw)] max-w-none flex-col gap-4 overflow-hidden p-0">
        <DialogHeader className="border-b border-border px-5 pb-3 pt-5">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Rawal AI v{capabilities?.version ?? "—"} · sandbox: {capabilities?.sandbox_backend ?? "—"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab} data-tab-dir={dir} className="flex min-h-0 flex-1 flex-col">
          <div className="relative px-3 sm:px-5">
            <div ref={listRef} className="scrollbar-thin tabs-fade-x overflow-x-auto">
              <TabsList className="inline-flex w-auto min-w-full sm:min-w-0 justify-start sm:justify-center">
              <TabsTrigger value="providers" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <Cpu className="size-3.5" />
                Models
              </TabsTrigger>
              <TabsTrigger value="marketplace" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <Blocks className="size-3.5" />
                Marketplace
              </TabsTrigger>
              <TabsTrigger value="social" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <Share2 className="size-3.5" />
                Social
              </TabsTrigger>
              <TabsTrigger value="sandbox" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <Container className="size-3.5" />
                Computer
              </TabsTrigger>
              <TabsTrigger value="voice" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <Mic className="size-3.5" />
                Voice
              </TabsTrigger>
              <TabsTrigger value="telegram" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <MessageCircle className="size-3.5" />
                Telegram Bot
              </TabsTrigger>
              <TabsTrigger value="project" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <FolderCog className="size-3.5" />
                Project
              </TabsTrigger>
              <TabsTrigger value="agent" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <CalendarClock className="size-3.5" />
                Schedules
              </TabsTrigger>
              <TabsTrigger value="backups" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <Archive className="size-3.5" />
                Backups
              </TabsTrigger>
              <TabsTrigger value="insights" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <BarChart3 className="size-3.5" />
                Insights
              </TabsTrigger>
              <TabsTrigger value="appearance" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <Palette className="size-3.5" />
                Appearance
              </TabsTrigger>
              <TabsTrigger value="audit" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <ScrollText className="size-3.5" />
                Audit
              </TabsTrigger>
              <TabsTrigger value="tools" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <Wrench className="size-3.5" />
                Tools
              </TabsTrigger>
              <TabsTrigger value="data" className="text-xs sm:text-sm px-2.5 py-1.5 whitespace-nowrap">
                <FolderCog className="size-3.5" />
                Cache & Storage
              </TabsTrigger>
            </TabsList>
            </div>
            {/* strip scroll buttons — the active tab is also auto-centered */}
            <button
              type="button"
              aria-label="Scroll tabs left"
              onClick={() => scrollStrip(-220)}
              className="absolute left-1 top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-elevated p-1 text-muted-foreground shadow-md transition-colors hover:text-foreground md:block"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Scroll tabs right"
              onClick={() => scrollStrip(220)}
              className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-full border border-border bg-elevated p-1 text-muted-foreground shadow-md transition-colors hover:text-foreground md:block"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-3 sm:px-5 pb-5 pt-4">
            <TabsContent value="providers">
              <ProvidersTab />
            </TabsContent>
            <TabsContent value="marketplace">
              <MarketplaceTab />
            </TabsContent>
            <TabsContent value="social">
              <SocialTab />
            </TabsContent>
            <TabsContent value="sandbox">
              <SandboxTab />
            </TabsContent>
            <TabsContent value="voice">
              <VoiceTab />
            </TabsContent>
            <TabsContent value="telegram">
              <TelegramTab />
            </TabsContent>
            <TabsContent value="project">
              <ProjectTab />
            </TabsContent>
            <TabsContent value="agent">
              <JobsTab />
            </TabsContent>
            <TabsContent value="backups">
              <BackupsTab />
            </TabsContent>
            <TabsContent value="insights">
              <InsightsTab />
            </TabsContent>
            <TabsContent value="appearance">
              <AppearanceTab />
            </TabsContent>
            <TabsContent value="audit">
              <AuditTab />
            </TabsContent>
            <TabsContent value="tools">
              <ToolsTab />
            </TabsContent>
            <TabsContent value="data">
              <DataTab />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
