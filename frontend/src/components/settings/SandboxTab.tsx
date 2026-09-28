import { Cloud, Cpu, Loader2, MonitorDown, Save, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SandboxConfig } from "@/types";

const BACKENDS = [
  {
    id: "auto",
    icon: Sparkles,
    title: "Auto",
    desc: "Celesto microVM when available, otherwise the deploy machine itself.",
  },
  {
    id: "celesto",
    icon: Cpu,
    title: "Celesto",
    desc: "Isolated local microVM per chat. Needs Celesto setup on the host (celesto doctor).",
  },
  {
    id: "cloud",
    icon: Cloud,
    title: "Celesto Cloud",
    desc: "Remote persistent computers. Needs your Celesto API key.",
  },
  {
    id: "local",
    icon: MonitorDown,
    title: "Local",
    desc: "Run on the machine where the agent is deployed. Fastest, no isolation. Tests only.",
  },
] as const;

export function SandboxTab() {
  const [config, setConfig] = useState<SandboxConfig | null>(null);
  const [backend, setBackend] = useState("auto");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = async () => {
    const current = await api.sandboxConfig().catch(() => null);
    if (!current) return;
    setConfig(current);
    setBackend(current.backend);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      const updated = await api.saveSandboxConfig({
        backend,
        celesto_api_key: apiKey.trim() || undefined,
      });
      setConfig(updated);
      setApiKey("");
      setSaved(true);
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  if (!config) return <p className="text-[13px] text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold tracking-tight">Computer</h3>
        <p className="text-[12.5px] text-muted-foreground">
          Where the agent runs code. Currently active:{" "}
          <Badge tone="primary">{config.effective_backend}</Badge>
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        {BACKENDS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setBackend(option.id)}
            className={cn(
              "rounded-xl border p-3 text-left transition-colors",
              backend === option.id
                ? "border-primary bg-primary/10"
                : "border-border bg-surface hover:border-primary/40",
            )}
          >
            <p className="flex items-center gap-2 text-[13px] font-medium">
              <option.icon className="size-4 text-primary" />
              {option.title}
              {config.effective_backend === option.id ? <Badge tone="success">active</Badge> : null}
              {config.effective_backend !== option.id && backend === option.id ? (
                <Badge tone="muted">selected</Badge>
              ) : null}
            </p>
            <p className="mt-1 text-[11.5px] leading-relaxed text-muted-foreground">{option.desc}</p>
          </button>
        ))}
      </div>

      {backend === "cloud" ? (
        <div className="space-y-3 rounded-xl border border-border bg-surface p-3.5">
          <Field
            label="Celesto API key"
            hint={
              config.celesto_configured
                ? `Saved (${config.celesto_key_masked}) — leave empty to keep it.`
                : "From celesto.ai → API keys. Stored encrypted."
            }
          >
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config.celesto_configured ? "••••••••" : "celesto_…"}
              className="h-9 font-mono text-xs"
            />
          </Field>
        </div>
      ) : null}

      {error ? <p className="text-[12.5px] text-danger animate-message-in">{error}</p> : null}

      <div className="flex items-center gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save computer settings
        </Button>
        {saved ? <span className="text-[12.5px] text-emerald-500">Saved — new chats use it.</span> : null}
      </div>
    </div>
  );
}
