import { createFileRoute, Outlet, useMatchRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LotLink, PageTitle, PlantChip, inputCls } from "@/components/bodega/ui";
import { fmtDate, fmtL } from "@/lib/bodega/format";
import { useDerived } from "@/lib/bodega/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lotes")({
  head: () => ({
    meta: [
      { title: "Lotes · Bodega Miras" },
      { name: "description", content: "Todos los lotes de ambas plantas con saldo, recipiente y estado." },
      { property: "og:title", content: "Lotes · Bodega Miras" },
      { property: "og:description", content: "Listado de lotes de ambas plantas." },
    ],
  }),
  component: LotsLayout,
});

function LotsLayout() {
  const match = useMatchRoute();
  if (match({ to: "/lotes/$id" })) return <Outlet />;
  return <LotList />;
}

const FILTERS = [
  { id: "stock", label: "Con saldo" },
  { id: "transito", label: "En tránsito" },
  { id: "embotellado", label: "Embotellados" },
  { id: "todos", label: "Todos" },
] as const;

function LotList() {
  const d = useDerived();
  const [q, setQ] = useState("");
  const [f, setF] = useState<(typeof FILTERS)[number]["id"]>("stock");
  const [plant, setPlant] = useState<"" | "MQ" | "FO">("");
  const rows = d.lotList
    .filter((l) => {
      const bal = d.balance(l.id);
      if (f === "stock" && !(l.status === "activo" && bal > 0)) return false;
      if (f === "transito" && !(l.status === "transito" && bal > 0)) return false;
      if (f === "embotellado" && l.status !== "embotellado") return false;
      if (plant && l.plant !== plant) return false;
      const s = q.trim().toLowerCase();
      return !s || `${l.code} ${l.name} ${l.vesselId ?? ""} ${l.remito ?? ""}`.toLowerCase().includes(s);
    })
    .reverse();
  return (
    <div>
      <PageTitle title="Lotes" sub={`${rows.length} lotes`} />
      <div className="mb-3 space-y-2">
        <input className={inputCls} placeholder="Buscar por código, nombre, recipiente o remito" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((x) => (
            <button key={x.id} onClick={() => setF(x.id)} className={cn("rounded-md border px-2.5 py-1 text-sm", f === x.id ? "bg-primary text-primary-foreground" : "bg-card")}>{x.label}</button>
          ))}
          <select className="rounded-md border bg-card px-2 py-1 text-sm" value={plant} onChange={(e) => setPlant(e.target.value as "" | "MQ" | "FO")}>
            <option value="">Ambas plantas</option>
            <option value="MQ">Mainqué</option>
            <option value="FO">Fernández Oro</option>
          </select>
        </div>
      </div>
      <ul className="divide-y rounded-md border bg-card">
        {rows.map((l) => (
          <li key={l.id} className={cn("flex items-center justify-between gap-2 border-l-4 px-3 py-2", l.plant === "MQ" ? "border-l-mq" : l.plant === "FO" ? "border-l-fo" : "border-l-ink")}>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><LotLink lot={l} /><span className="truncate text-sm">{l.name}</span></div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <PlantChip plant={l.plant} short />
                {l.vesselId && <span>{l.vesselId}</span>}
                {l.remito && <span>Remito {l.remito}</span>}
                <span>{fmtDate(l.date)}</span>
              </div>
            </div>
            <div className="num shrink-0 text-right text-sm">
              {l.status === "embotellado" ? <>{l.bottles} bot.<div className="text-xs text-muted-foreground">{fmtL(l.litersIn)}</div></> : fmtL(d.balance(l.id))}
            </div>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-4 text-sm text-muted-foreground">Ningún lote coincide.</li>}
      </ul>
    </div>
  );
}
