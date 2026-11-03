import { createFileRoute, Link } from "@tanstack/react-router";
import { Bar, LotLink, PageTitle, PlantCard, PlantChip, PlantHeader, Stat, PLANT_CLS } from "@/components/bodega/ui";
import { daysBetween, transitLots } from "@/lib/bodega/engine";
import { PLANT_NAME, fmtDateTime, fmtL, fmtPct1 } from "@/lib/bodega/format";
import { today, useDerived } from "@/lib/bodega/store";
import type { PlantId } from "@/lib/bodega/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tablero · Bodega Miras" },
      { name: "description", content: "Ocupación por planta, alertas de capacidad y lotes en tránsito de Bodega Miras." },
      { property: "og:title", content: "Tablero · Bodega Miras" },
      { property: "og:description", content: "Ocupación por planta, alertas de capacidad y lotes en tránsito." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const d = useDerived();
  const now = today();
  const transit = transitLots(d);
  const alerts: { text: string; to?: string }[] = [];
  (["MQ", "FO"] as PlantId[]).forEach((p) => {
    if (d.plants[p].pct > 0.9) alerts.push({ text: `${PLANT_NAME[p]} supera el 90 % de su capacidad (${fmtPct1(d.plants[p].pct)}).`, to: "/recipientes" });
  });
  for (const vs of d.vessels.values()) {
    if (vs.occupancy >= vs.vessel.capacity - 0.05 && vs.vessel.kind !== "barrica") alerts.push({ text: `${vs.vessel.id} está lleno y no se ofrece como destino.`, to: "/recipientes" });
  }
  const dirty = [...d.vessels.values()].filter((v) => v.dirty);
  if (dirty.length) alerts.push({ text: `${dirty.length} recipientes vacíos esperan limpieza: ${dirty.map((v) => v.vessel.id).join(", ")}.`, to: "/recipientes" });
  for (const t of transit) {
    const days = daysBetween(t.date, now);
    alerts.push({ text: `Remito ${t.remito} en tránsito hace ${days} días, sin recepción registrada.`, to: "/remitos" });
  }
  const mermas = d.active.filter((m) => m.type === "recepcion" && m.merma > 0);
  const totalMermaViajes = mermas.reduce((s, m) => s + m.merma, 0);

  return (
    <div>
      <PageTitle title="Tablero" sub={`Vendimia 2025 · ${d.active.length} movimientos registrados`} />
      <div className="grid gap-3 md:grid-cols-2">
        {(["MQ", "FO"] as PlantId[]).map((p) => {
          const s = d.plants[p];
          const vs = [...d.vessels.values()].filter((v) => v.vessel.plant === p);
          return (
            <PlantCard key={p} plant={p}>
              <PlantHeader plant={p} right={<span className={cn("num text-sm font-semibold", s.pct > 0.9 ? "text-warn" : PLANT_CLS[p].text)}>{fmtPct1(s.pct)}</span>} />
              <Bar value={s.pct} plant={p} warn={s.pct > 0.9} />
              <div className="num mt-1 text-sm text-muted-foreground">
                {fmtL(s.occupancy)} de {fmtL(s.capacity)} · {vs.filter((v) => v.occupancy > 0).length} de {vs.length} recipientes con vino
              </div>
            </PlantCard>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Lotes en tránsito" value={transit.length} warn={transit.length > 0} />
        <Stat label="Lotes activos" value={d.lotList.filter((l) => l.status === "activo" && d.balance(l.id) > 0).length} />
        <Stat label="Lotes embotellados" value={d.lotList.filter((l) => l.status === "embotellado").length} />
        <Stat label="Merma en viajes" value={fmtL(totalMermaViajes)} warn={totalMermaViajes > 0} />
      </div>

      <section className="mt-5">
        <h2 className="mb-2 text-2xl">Alertas</h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin alertas.</p>
        ) : (
          <ul className="space-y-1.5">
            {alerts.map((a, i) => (
              <li key={i} className="rounded-md border border-warn bg-warn-soft px-3 py-2 text-sm">
                {a.to ? <Link to={a.to} className="hover:underline">{a.text}</Link> : a.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-2xl">En tránsito</h2>
        {transit.length === 0 && <p className="text-sm text-muted-foreground">Ningún camión en viaje.</p>}
        <div className="grid gap-2 md:grid-cols-2">
          {transit.map((t) => {
            const m = d.movements.get(t.movementId)!;
            const origin = d.lots.get(m.sources[0]!.lotId);
            return (
              <PlantCard key={t.id} plant={null}>
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Remito {t.remito}</span>
                  <LotLink lot={t} />
                </div>
                <div className="num text-sm">{t.name} · {fmtL(t.litersIn)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  {origin && <PlantChip plant={origin.plant} short />} → <PlantChip plant={m.data.destPlant ?? null} short /> · salió {fmtDateTime(m.date)}
                </div>
                <Link to="/remitos" className="mt-2 inline-block text-sm font-medium text-ink underline">Registrar recepción</Link>
              </PlantCard>
            );
          })}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="mb-2 text-2xl">Accesos rápidos</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { to: "/movimiento", search: { tipo: "ingreso" as const }, label: "Ingreso de uva" },
            { to: "/movimiento", search: { tipo: "traslado" as const }, label: "Nuevo traslado" },
            { to: "/movimiento", search: { tipo: "corte" as const }, label: "Registrar corte" },
            { to: "/movimiento", search: { tipo: "embotellado" as const }, label: "Embotellar" },
          ].map((q) => (
            <Link key={q.label} to="/movimiento" search={q.search} className="rounded-md border bg-card px-3 py-3 text-sm font-medium text-ink hover:bg-muted">
              {q.label}
            </Link>
          ))}
          <Link to="/validador" className="rounded-md border bg-card px-3 py-3 text-sm font-medium text-ink hover:bg-muted">Validar línea</Link>
          <Link to="/retiro" className="rounded-md border bg-card px-3 py-3 text-sm font-medium text-ink hover:bg-muted">Simular retiro</Link>
          <Link to="/remitos" className="rounded-md border bg-card px-3 py-3 text-sm font-medium text-ink hover:bg-muted">Bandeja de remitos</Link>
          <Link to="/lotes" className="rounded-md border bg-card px-3 py-3 text-sm font-medium text-ink hover:bg-muted">Buscar lote</Link>
        </div>
      </section>
    </div>
  );
}
