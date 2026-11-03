import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { LotLink, PageTitle, PlantCard, PlantChip, Stat } from "@/components/bodega/ui";
import { conditions, type Derived, type Edge, validateLine } from "@/lib/bodega/engine";
import { LINE_LABEL, MOVEMENT_LABEL, fmtDate, fmtDateTime, fmtL, fmtMonths, fmtPct, fmtPct1 } from "@/lib/bodega/format";
import { today, useDerived } from "@/lib/bodega/store";
import type { LineId } from "@/lib/bodega/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/lotes/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Lote ${params.id} · Bodega Miras` },
      { name: "description", content: `Ficha de trazabilidad del lote ${params.id}: ancestros, descendientes y condiciones heredadas.` },
      { property: "og:title", content: `Lote ${params.id} · Bodega Miras` },
      { property: "og:description", content: "Ficha de trazabilidad del lote." },
    ],
  }),
  component: LotPage,
});

function LotPage() {
  const { id } = Route.useParams();
  const d = useDerived();
  const lot = d.lots.get(id);
  if (!lot)
    return (
      <div>
        <PageTitle title="Lote no encontrado" sub={`No existe el lote ${id} o su movimiento fue anulado.`} />
        <Link to="/lotes" className="underline">Volver a lotes</Link>
      </div>
    );
  const c = conditions(d, id, today());
  const m = d.movements.get(lot.movementId)!;
  const out = d.outflow.get(id) ?? 0;
  const bal = d.balance(id);
  const lines: LineId[] = ["joven", "liviana", "crianza", "icono"];
  const product = d.db.products.find((p) => p.id === lot.productId);
  return (
    <div>
      <PageTitle title={`${lot.code} · ${lot.name}`} sub={`${MOVEMENT_LABEL[m.type]} · ${fmtDateTime(m.date)}`}>
        <PlantChip plant={lot.plant} />
      </PageTitle>
      {lot.status === "transito" && bal > 0 && (
        <div className="mb-3 rounded-md border border-warn bg-warn-soft px-3 py-2 text-sm">
          En tránsito con remito {lot.remito}: no está disponible para ningún movimiento hasta registrar la recepción. <Link to="/remitos" className="font-medium underline">Ir a la bandeja</Link>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Recibido" value={fmtL(lot.litersIn)} />
        <Stat label="Salidas a hijos" value={fmtL(out)} />
        <Stat label="Merma al crearse" value={fmtL(m.merma)} warn={m.merma > 0} />
        <Stat label={lot.status === "embotellado" ? "Botellas" : "Saldo"} value={lot.status === "embotellado" ? `${lot.bottles}` : fmtL(bal)} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {lot.vesselId && <span className="rounded-md border bg-card px-2 py-1">Recipiente {lot.vesselId}</span>}
        {product && <span className="rounded-md border bg-card px-2 py-1">{product.name} · línea {LINE_LABEL[product.line]}</span>}
        {m.note && <span className="rounded-md border bg-card px-2 py-1">{m.note}</span>}
        {lot.status === "activo" && bal > 0 && (
          <>
            <Link to="/movimiento" search={{ origen: id, tipo: undefined }} className="rounded-md bg-primary px-2.5 py-1 text-primary-foreground">Usar como origen</Link>
            <Link to="/validador" search={{ lote: id }} className="rounded-md border bg-card px-2.5 py-1 text-ink">Validar línea</Link>
          </>
        )}
      </div>

      <section className="mt-5 grid gap-3 md:grid-cols-2">
        <div className="rounded-md border bg-card p-3">
          <h2 className="mb-2 text-xl">Condiciones heredadas</h2>
          <dl className="num grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Orgánico</dt><dd className={cn(!c.organic && "font-semibold text-destructive")}>{c.organic ? "Sí" : "No"}</dd>
            <dt className="text-muted-foreground">Viñedo 1958</dt><dd>{c.f1958 ? "Sí, 100 %" : `No (${fmtPct(c.share1958)})`}</dd>
            <dt className="text-muted-foreground">Meses de barrica</dt>
            <dd>{fmtMonths(c.months)}{c.monthsInProgress > 0 && ` · en barrica: +${fmtMonths(c.monthsInProgress)} en curso`}</dd>
            <dt className="text-muted-foreground">Vendimia</dt><dd>{c.latestHarvest ? `última uva ${fmtDate(c.latestHarvest)}${c.early ? " · temprana" : ""}` : "—"}</dd>
          </dl>
          <h3 className="mt-3 text-base">Composición varietal</h3>
          <ul className="num text-sm">
            {c.composition.map((x) => <li key={x.variety} className="flex justify-between"><span>{x.variety}</span><span>{fmtPct1(x.fraction)}</span></li>)}
          </ul>
          <h3 className="mt-3 text-base">Origen de la uva</h3>
          <ul className="num text-sm">
            {c.origins.map((o) => (
              <li key={o.lot.id} className="flex justify-between gap-2">
                <span><LotLink lot={o.lot} /> {o.parcel.id} {o.parcel.variety}{!o.parcel.organic && " · no orgánica"}</span>
                <span>{fmtPct(o.fraction)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border bg-card p-3">
          <h2 className="mb-2 text-xl">Líneas</h2>
          <ul className="space-y-2">
            {lines.map((ln) => {
              const r = validateLine(d, id, ln);
              return (
                <li key={ln} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{LINE_LABEL[ln]}</span>
                    <span className={cn("rounded-sm px-1.5 py-0.5 text-xs font-medium", r.ok ? "bg-mq-soft text-mq" : "bg-muted text-destructive")}>{r.ok ? "Califica" : "No califica"}</span>
                  </div>
                  {!r.ok && <p className="text-xs text-muted-foreground">{r.checks.filter((x) => !x.ok).map((x) => x.label).join(" · ")}</p>}
                </li>
              );
            })}
          </ul>
          <Link to="/validador" search={{ lote: id }} className="mt-2 inline-block text-sm underline">Ver explicación completa</Link>
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-1 text-2xl">Ancestros</h2>
        <Legend />
        <Tree d={d} id={id} dir="up" depth={0} />
      </section>
      <section className="mt-5">
        <h2 className="mb-1 text-2xl">Descendientes</h2>
        {(d.children.get(id) ?? []).length === 0 ? <p className="text-sm text-muted-foreground">Sin descendientes.</p> : <Tree d={d} id={id} dir="down" depth={0} />}
      </section>
    </div>
  );
}

function Legend() {
  return (
    <div className="mb-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><span className="h-3 w-0 border-l-2 border-mq" /> movimiento interno Mainqué</span>
      <span className="flex items-center gap-1"><span className="h-3 w-0 border-l-2 border-fo" /> movimiento interno Fernández Oro</span>
      <span className="flex items-center gap-1"><span className="h-3 w-0 border-l-2 border-dashed border-ink" /> traslado en camión</span>
    </div>
  );
}

function Tree({ d, id, dir, depth }: { d: Derived; id: string; dir: "up" | "down"; depth: number }) {
  const edges: Edge[] = (dir === "up" ? d.parents.get(id) : d.children.get(id)) ?? [];
  const [open, setOpen] = useState(depth < 4);
  if (!edges.length) return null;
  if (!open)
    return <button onClick={() => setOpen(true)} className="ml-3 text-xs underline">Mostrar {edges.length} más</button>;
  return (
    <ul className={cn("space-y-1", depth > 0 && "ml-3")}>
      {edges.map((e, i) => {
        const l = d.lots.get(e.lotId)!;
        const transfer = e.movement.type === "traslado" || e.movement.type === "recepcion";
        const plant = l.plant ?? (dir === "up" ? null : null);
        return (
          <li key={`${e.lotId}-${i}`} className={cn("border-l-2 pl-2", transfer ? "border-dashed border-ink" : plant === "FO" ? "border-fo" : "border-mq")}>
            <PlantCard plant={l.plant} className="p-2">
              <div className="flex flex-wrap items-center justify-between gap-1 text-sm">
                <span><LotLink lot={l} /> {l.name}</span>
                <span className="num text-xs text-muted-foreground">
                  {dir === "up" ? `aporta ${fmtPct1(e.share)} · ${fmtL(e.liters)}` : `recibe ${fmtL(e.liters)}`}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {transfer ? `Camión · remito ${e.movement.data.remito}` : MOVEMENT_LABEL[e.movement.type]} · {fmtDate(e.movement.date)}
                {l.vesselId && ` · ${l.vesselId}`}
              </div>
            </PlantCard>
            {depth < 12 && <Tree d={d} id={e.lotId} dir={dir} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}
