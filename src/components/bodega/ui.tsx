import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { PLANT_NAME, PLANT_SHORT, fmtL, fmtPct1 } from "@/lib/bodega/format";
import type { Lot, PlantId } from "@/lib/bodega/types";
import { cn } from "@/lib/utils";

export const PLANT_CLS = {
  MQ: { border: "border-l-mq", text: "text-mq", bg: "bg-mq", soft: "bg-mq-soft", ring: "ring-mq", stroke: "border-mq" },
  FO: { border: "border-l-fo", text: "text-fo", bg: "bg-fo", soft: "bg-fo-soft", ring: "ring-fo", stroke: "border-fo" },
} as const;

export function PageTitle({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h1 className="text-3xl leading-tight">{title}</h1>
        {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

export function PlantChip({ plant, short }: { plant: PlantId | null; short?: boolean }) {
  if (!plant)
    return <span className="inline-flex items-center gap-1 rounded-sm border border-dashed border-ink px-1.5 py-0.5 text-[11px] font-medium text-ink">En camión</span>;
  const c = PLANT_CLS[plant];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[11px] font-medium", c.soft, c.text)}>
      <span className={cn("size-2 rounded-full", c.bg)} />
      {short ? PLANT_SHORT[plant] : PLANT_NAME[plant]}
    </span>
  );
}

export function PlantCard({ plant, className, children }: { plant: PlantId | null; className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-md border border-l-4 bg-card p-3", plant ? PLANT_CLS[plant].border : "border-l-ink border-dashed", className)}>
      {children}
    </div>
  );
}

export function PlantHeader({ plant, right }: { plant: PlantId; right?: ReactNode }) {
  const c = PLANT_CLS[plant];
  return (
    <div className={cn("mb-2 flex items-center justify-between border-b-2 pb-1", c.stroke)}>
      <h2 className={cn("text-2xl", c.text)}>{PLANT_NAME[plant]}</h2>
      {right}
    </div>
  );
}

export function Bar({ value, plant, warn }: { value: number; plant: PlantId; warn?: boolean }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-sm bg-muted">
      <div className={cn("h-full", warn ? "bg-warn" : PLANT_CLS[plant].bg)} style={{ width: `${Math.min(100, value * 100)}%` }} />
    </div>
  );
}

export function LotLink({ lot, className }: { lot: Lot; className?: string }) {
  return (
    <Link to="/lotes/$id" params={{ id: lot.id }} className={cn("num font-medium text-ink underline decoration-border underline-offset-2 hover:decoration-ink", className)}>
      {lot.code}
    </Link>
  );
}

export function Stat({ label, value, warn }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div className={cn("rounded-md border bg-card px-3 py-2", warn && "border-warn bg-warn-soft")}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="num text-lg font-semibold">{value}</div>
    </div>
  );
}

export function Occ({ occ, cap }: { occ: number; cap: number }) {
  return (
    <span className="num">
      {fmtL(occ)} / {fmtL(cap)} · {fmtPct1(cap ? occ / cap : 0)}
    </span>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-ink">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export const inputCls =
  "num w-full rounded-md border border-input bg-card px-2.5 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";

export function Btn({ children, variant = "primary", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "warn" }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "ghost" && "border bg-card text-ink hover:bg-muted",
        variant === "warn" && "bg-warn text-warn-foreground hover:bg-warn/90",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Notice({ kind, children }: { kind: "error" | "ok" | "warn"; children: ReactNode }) {
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn(
        "rounded-md border px-3 py-2 text-sm",
        kind === "error" && "border-destructive bg-card text-destructive",
        kind === "ok" && "border-mq bg-mq-soft text-foreground",
        kind === "warn" && "border-warn bg-warn-soft text-foreground",
      )}
    >
      {children}
    </div>
  );
}

export function Hydrated({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
