import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Field, PageTitle, PlantCard, inputCls } from "@/components/bodega/ui";
import { conditions, validateLine } from "@/lib/bodega/engine";
import { LINE_LABEL, fmtL, fmtMonths, fmtPct } from "@/lib/bodega/format";
import { useDerived } from "@/lib/bodega/store";
import type { LineId } from "@/lib/bodega/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/validador")({
  validateSearch: (s: Record<string, unknown>) => ({ lote: typeof s.lote === "string" ? s.lote : undefined }),
  head: () => ({
    meta: [
      { title: "Validador de línea · Bodega Miras" },
      { name: "description", content: "Verificá si un lote cumple las reglas de Joven, Liviana, Crianza o Ícono y por qué." },
      { property: "og:title", content: "Validador de línea · Bodega Miras" },
      { property: "og:description", content: "Reglas de línea con la condición y el ancestro que fallan." },
    ],
  }),
  component: Validator,
});

const RULES: Record<LineId, string> = {
  joven: "Cualquier lote orgánico.",
  liviana: "Orgánico y vendimia temprana (cosecha anterior al 25 de febrero).",
  crianza: "Orgánico con al menos 6 meses de barrica ponderados.",
  icono: "Orgánico, 100 % viñedo 1958 y al menos 10 meses de barrica.",
};

function Validator() {
  const search = Route.useSearch();
  const d = useDerived();
  const lots = d.lotList.filter((l) => l.status !== "transito").reverse();
  const [lotId, setLotId] = useState(search.lote ?? lots.find((l) => l.name === "Corte de guarda")?.id ?? lots[0]?.id ?? "");
  const [line, setLine] = useState<LineId>(() => {
    const l = d.lots.get(search.lote ?? "");
    return (d.db.products.find((p) => p.id === l?.productId)?.line as LineId) ?? "crianza";
  });
  const lot = d.lots.get(lotId);
  const r = lot ? validateLine(d, lot.id, line) : null;
  const c = lot ? conditions(d, lot.id) : null;
  return (
    <div className="max-w-3xl">
      <PageTitle title="Validador de línea" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Lote">
          <select className={inputCls} value={lotId} onChange={(e) => setLotId(e.target.value)}>
            {lots.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}{l.status === "embotellado" ? " (embotellado)" : ` · ${fmtL(d.balance(l.id))}`}</option>)}
          </select>
        </Field>
        <Field label="Línea de destino">
          <div className="grid grid-cols-4 gap-1">
            {(Object.keys(LINE_LABEL) as LineId[]).map((ln) => (
              <button key={ln} onClick={() => setLine(ln)} className={cn("rounded-md border px-1 py-2 text-sm", line === ln ? "bg-primary text-primary-foreground" : "bg-card")}>{LINE_LABEL[ln]}</button>
            ))}
          </div>
        </Field>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">Regla {LINE_LABEL[line]}: {RULES[line]}</p>
      {lot && r && c && (
        <PlantCard plant={lot.plant} className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link to="/lotes/$id" params={{ id: lot.id }} className="font-display text-xl font-semibold text-ink underline">{lot.code} · {lot.name}</Link>
            <span className={cn("rounded-md px-2 py-1 text-sm font-semibold", r.ok ? "bg-mq-soft text-mq" : "bg-warn-soft text-foreground")}>
              {r.ok ? `Califica para ${LINE_LABEL[line]}` : `No califica para ${LINE_LABEL[line]}`}
            </span>
          </div>
          <p className="num mt-1 text-xs text-muted-foreground">
            Orgánico: {c.organic ? "sí" : "no"} · Viñedo 1958: {fmtPct(c.share1958)} · Barrica: {fmtMonths(c.months)}
          </p>
          <ul className="mt-3 space-y-2">
            {r.checks.map((x) => (
              <li key={x.label} className={cn("rounded-md border px-3 py-2 text-sm", x.ok ? "border-mq" : "border-destructive")}>
                <div className="font-medium">{x.ok ? "✓" : "✗"} {x.label}</div>
                <p className="num mt-0.5 text-muted-foreground">{x.detail}</p>
              </li>
            ))}
          </ul>
        </PlantCard>
      )}
    </div>
  );
}
