/**
 * Model Prices extension
 *
 * Reads the LOCAL catalog cache at ~/.pi/agent/models-store.json (no network)
 * and prints a per-provider price table, cheapest-first.
 *
 * Commands:
 *   /prices                          # all providers, sorted by input price
 *   /prices fireworks                # just one provider
 *   /prices --sort output            # sort by output price
 *   /prices fireworks --sort cache   # sort by cached-input price
 *   /prices --sort context           # largest context window first
 *
 * Tool:
 *   model_prices(provider?, sort_by?) -> markdown table (agent-callable)
 *
 * Each model row shows: model, context window, $/1M input, $/1M cache-read,
 * $/1M output. The header shows the last time the catalog was synced.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
const STORE_PATH = join(AGENT_DIR, "models-store.json");

type Cost = { input: number; output: number; cacheRead: number; cacheWrite: number };
type StoreModel = {
  id: string;
  name?: string;
  provider?: string;
  cost?: Partial<Cost>;
  contextWindow?: number;
  reasoning?: boolean;
  input?: string[];
};
type ProviderBucket = { models: StoreModel[]; checkedAt?: number };

function loadStore(): Record<string, ProviderBucket> {
  if (!existsSync(STORE_PATH)) {
    throw new Error(
      `No model catalog found at ${STORE_PATH}. Run \`pi update\` (or /login a provider) to fetch the model store.`,
    );
  }
  return JSON.parse(readFileSync(STORE_PATH, "utf8"));
}

/** 1000000 -> "1M", 1048576 -> "1M", 131072 -> "128K", 384000 -> "375K", 512000 -> "500K" */
export function formatContext(n?: number): string {
  if (!n || n <= 0) return "-";
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  return `${Math.round(n / 1024)}K`;
}

function formatPrice(v: number | undefined): string {
  if (v === undefined) return "-";
  if (v === 0) return "0";
  if (v < 0.01) return v.toFixed(3);
  return v >= 100 ? v.toFixed(0) : v.toFixed(2);
}

function shortId(id: string): string {
  return id.replace(/^(accounts\/)?[^/]+\/(models|routers)\//, "");
}

function linkCost(m: StoreModel): Cost {
  const c = m.cost ?? {};
  return {
    input: c.input ?? 0,
    output: c.output ?? 0,
    cacheRead: c.cacheRead ?? 0,
    cacheWrite: c.cacheWrite ?? 0,
  };
}

const SORT_KEYS = ["input", "output", "cacheRead", "cache"] as const;
type SortKey = (typeof SORT_KEYS)[number] | "context";

function resolveSortKey(raw: string): SortKey {
  const key = (raw || "input").toLowerCase();
  return (SORT_KEYS as readonly string[]).includes(key) ? (key as SortKey) : "input";
}

function renderTable(
  models: StoreModel[],
  sortBy: SortKey,
): { rows: string[]; header: string } {
  const sorted = [...models].sort((a, b) => {
    if (sortBy === "context") return (b.contextWindow ?? 0) - (a.contextWindow ?? 0);
    const k = sortBy === "cache" ? "cacheRead" : sortBy;
    const ca = linkCost(a)[k as keyof Cost];
    const cb = linkCost(b)[k as keyof Cost];
    return ca - cb || linkCost(a).output - linkCost(b).output;
  });

  const header = `${"model".padEnd(42)}${"ctx".padStart(7)}${"$in".padStart(8)}${"cache".padStart(9)}${"$out".padStart(9)}`;
  const rows = sorted.map((m) => {
    const c = linkCost(m);
    return (
      m.id.padEnd(42) +
      formatContext(m.contextWindow).padStart(7) +
      formatPrice(c.input).padStart(8) +
      formatPrice(c.cacheRead).padStart(9) +
      formatPrice(c.output).padStart(9)
    );
  });
  return { rows, header };
}

function tableText(
  bucket: ProviderBucket,
  sortBy: SortKey,
  active: boolean,
): string {
  const { rows, header } = renderTable(bucket.models ?? [], sortBy);
  const checked = bucket.checkedAt
    ? new Date(bucket.checkedAt).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "unknown";
  const title = `${active ? "* " : ""}checked ${checked} · sorted by ${sortBy} price`;
  return [title, header, `---${"-".repeat(header.length - 3)}`, ...rows].join("\n");
}

function findActiveProvider(
  store: Record<string, ProviderBucket>,
  currentModelId: string | undefined,
): string | undefined {
  if (!currentModelId) return undefined;
  for (const [name, bucket] of Object.entries(store)) {
    if ((bucket.models ?? []).some((m) => m.id === currentModelId)) return name;
  }
  return undefined;
}

export default function modelPricesExtension(pi: ExtensionAPI) {
  // ---------- /prices command ----------
  pi.registerCommand("prices", {
    description: "List model prices from the local catalog, cheapest first",
    getArgumentCompletions: (prefix) => {
      let store: Record<string, ProviderBucket>;
      let providerNames: string[];
      try {
        store = loadStore();
        providerNames = Object.keys(store);
      } catch {
        return null;
      }
      const words = prefix.trim().split(/\s+/);
      const last = words[words.length - 1] ?? "";
      return providerNames.filter((p) => p.startsWith(last)).map((p) => ({ value: p, label: p }));
    },
    handler: async (args, ctx) => {
      let store: Record<string, ProviderBucket>;
      try {
        store = loadStore();
      } catch (err) {
        ctx.ui.notify((err as Error).message, "error");
        return;
      }

      // Parse: /prices [provider] [--sort key]
      let providerFilter: string | undefined;
      let sortBy: SortKey = "input";
      for (const word of args.trim().split(/\s+/).filter(Boolean)) {
        if (word === "--sort") continue; // handled with next token
        if (word.startsWith("--")) continue;
        if (word === "input" || word === "output" || word === "cache" || word === "context") {
          if (args.includes("--sort")) sortBy = resolveSortKey(word);
          else providerFilter = providerFilter ?? word;
        } else {
          providerFilter = providerFilter ?? word;
        }
      }

      const active = findActiveProvider(store, ctx.model?.id);
      const providers = providerFilter
        ? Object.keys(store).filter((p) => p === providerFilter)
        : Object.keys(store);

      if (providers.length === 0) {
        ctx.ui.notify(`Unknown provider "${providerFilter}". Known: ${Object.keys(store).join(", ")}`, "warning");
        return;
      }

      for (const name of providers) {
        const bucket = store[name];
        if (!bucket) continue;
        const text = tableText(bucket, sortBy, name === active);
        if (ctx.hasUI) {
          const lines = text.split("\n");
          const picked = await ctx.ui.select(`${name} · ${lines[0]}`, lines.slice(1));
          if (picked === undefined) continue; // user closed the viewer
        } else {
          // Print/JSON mode fallback: hand off to the agent as a message.
          ctx.ui.notify(text, "info");
        }
      }
    },
  });

  // ---------- model_prices tool ----------
  pi.registerTool({
    name: "model_prices",
    label: "Model Prices",
    description:
      "List LLM model prices from the local pi catalog (~/.pi/agent/models-store.json), cheapest first. Returns provider, model, context window, and $/1M input/cache-read/output prices plus last-sync time.",
    promptSnippet: "List model prices from the local catalog",
    parameters: Type.Object({
      provider: Type.Optional(
        Type.String({ description: "Provider to list (e.g. fireworks, anthropic, openai-codex). Omit for all." }),
      ),
      sortBy: Type.Optional(
        StringEnum(["input", "output", "cache", "context"] as const, {
          description: "Sort key. Default: input (cheapest input first); context = largest window first.",
        }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      let store: Record<string, ProviderBucket>;
      try {
        store = loadStore();
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${(err as Error).message}` }],
          details: { ok: false },
        };
      }
      const sortBy = resolveSortKey(params.sortBy ?? "input");
      const active = findActiveProvider(store, ctx.model?.id);
      const providers = params.provider
        ? Object.keys(store).filter((p) => p === params.provider)
        : Object.keys(store);

      const sections = providers.map((name) => {
        const bucket = store[name];
        if (!bucket) return "";
        return `## ${name}${name === active ? " (active)" : ""}\n` + tableText(bucket, sortBy, name === active);
      });

      return {
        content: [
          {
            type: "text",
            text: sections.join("\n\n") || `No provider "${params.provider}". Known: ${Object.keys(store).join(", ")}`,
          },
        ],
        details: {
          ok: true,
          source: STORE_PATH,
          providers: providers.length === 0 ? Object.keys(store).length : providers.map((p) => ({ provider: p, checkedAt: store[p]?.checkedAt })),
          sortedBy: sortBy,
        },
      };
    },
  });
}
