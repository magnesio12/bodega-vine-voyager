import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, Btn, LotLink, Notice, PageTitle, PlantCard, PlantHeader } from "@/components/bodega/ui";
import { applyMovement, BodegaError } from "@/lib/bodega/engine";
import { fmtL, fmtPct1 } from "@/lib/bodega/format";
import { getDb, setDb, today, useDerived } from "@/lib/bodega/store";
import type { PlantId } from "@/lib/bodega/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/recipientes")({
  head: () => ({
    meta: [
      { title: "Recipientes · Bodega Miras" },
      { name: "description", content: "Mapa de tanques, piletas y barricas de las dos plantas con su ocupación." },
      { property: "og:title", content: "Recipientes · Bodega Miras" },
      { property: "og:description", content: "Mapa de recipientes por planta con su ocupación." },
    ],
  }),
  component: Vessels,
});

function Vessels() {
  const d = useDerived();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const clean = (id: string) => {
    try {
      setDb(applyMovement(getDb(), { type: "limpieza", date: today(), vesselId: id }).db);
      setMsg({ kind: "ok", text: `${id} limpio y disponible como destino.` });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof BodegaError ? e.message : String(e) });
    }
  };
  return (
    <div>
      <PageTitle title="Recipientes" sub="Cada recipiente se ofrece como destino mientras tenga lugar y esté limpio." />
      {msg && <div className="mb-3"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <div className="space-y-6">
        {(["MQ", "FO"] as PlantId[]).map((p) => {
          const vs = [...d.vessels.values()].filter((v) => v.vessel.plant === p);
          const tanks = vs.filter((v) => v.vessel.kind !== "barrica");
          const barrels = vs.filter((v) => v.vessel.kind === "barrica");
          return (
            <section key={p}>
              <PlantHeader plant={p} right={<span className="num text-sm">{fmtL(d.plants[p].occupancy)} / {fmtL(d.plants[p].capacity)}</span>} />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {tanks.map((v) => {
                  const pct = v.occupancy / v.vessel.capacity;
                  return (
                    <PlantCard key={v.vessel.id} plant={p}>
                      <div className="flex items-baseline justify-between">
                        <span className="font-display text-xl font-semibold text-ink">{v.vessel.id}</span>
                        <span className="text-xs text-muted-foreground">{v.vessel.kind === "pileta" ? "Pileta" : "Tanque"} · {v.vessel.material}</span>
                      </div>
                      <Bar value={pct} plant={p} warn={pct >= 0.999} />
                      <div className="num mt-1 flex justify-between text-sm">
                        <span>{fmtL(v.occupancy)} / {fmtL(v.vessel.capacity)}</span>
                        <span>{fmtPct1(pct)}</span>
                      </div>
                      <State v={v} onClean={clean} />
                      {v.lotIds.length > 0 && (
                        <ul className="mt-1 space-y-0.5 text-sm">
                          {v.lotIds.map((id) => {
                            const l = d.lots.get(id)!;
                            return (
                              <li key={id} className="flex justify-between gap-2">
                                <span className="truncate"><LotLink lot={l} /> {l.name}</span>
                                <span className="num shrink-0">{fmtL(d.balance(id))}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </PlantCard>
                  );
                })}
              </div>
              {barrels.length > 0 && (
                <>
                  <h3 className="mt-3 mb-1 text-lg">Barricas de roble francés · 225 L</h3>
                  <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
                    {barrels.map((v) => {
                      const lot = v.lotIds[0] ? d.lots.get(v.lotIds[0]) : undefined;
                      return (
                        <div key={v.vessel.id} className={cn("rounded-md border border-l-4 border-l-mq bg-card p-1.5 text-xs", v.dirty && "border-warn")}>
                          <div className="font-semibold text-ink">{v.vessel.id}</div>
                          <div className="num">{fmtL(v.occupancy)}</div>
                          {lot ? (
                            <Link to="/lotes/$id" params={{ id: lot.id }} className="num block truncate underline">{lot.code}</Link>
                          ) : v.dirty ? (
                            <button onClick={() => clean(v.vessel.id)} className="text-left font-medium underline">Limpiar</button>
                          ) : (
                            <span className="text-muted-foreground">Libre</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function State({ v, onClean }: { v: { vessel: { id: string; capacity: number }; occupancy: number; dirty: boolean }; onClean: (id: string) => void }) {
  if (v.dirty)
    return (
      <div className="mt-1 flex items-center justify-between rounded-sm bg-warn-soft px-2 py-1 text-xs">
        <span>Vacío · necesita limpieza</span>
        <Btn variant="ghost" className="px-2 py-1 text-xs" onClick={() => onClean(v.vessel.id)}>Registrar limpieza</Btn>
      </div>
    );
  if (v.occupancy >= v.vessel.capacity - 0.05) return <div className="mt-1 rounded-sm bg-warn-soft px-2 py-1 text-xs">Lleno · no se ofrece como destino</div>;
  if (v.occupancy === 0) return <div className="mt-1 text-xs text-muted-foreground">Limpio y disponible</div>;
  return <div className="mt-1 text-xs text-muted-foreground">Libres: <span className="num">{fmtL(v.vessel.capacity - v.occupancy)}</span></div>;
}
