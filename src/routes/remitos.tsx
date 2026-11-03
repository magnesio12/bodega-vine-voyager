import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Btn, Field, Notice, PageTitle, PlantCard, PlantChip, inputCls } from "@/components/bodega/ui";
import { annulMovement, applyMovement, BodegaError, RECEPTION_TOLERANCE, transitLots } from "@/lib/bodega/engine";
import { fmtDateTime, fmtL, fmtPct } from "@/lib/bodega/format";
import { getDb, setDb, today, useDerived } from "@/lib/bodega/store";
import type { Lot } from "@/lib/bodega/types";

export const Route = createFileRoute("/remitos")({
  head: () => ({
    meta: [
      { title: "Remitos · Bodega Miras" },
      { name: "description", content: "Bandeja de remitos de traslado entre plantas con registro de recepción." },
      { property: "og:title", content: "Remitos · Bodega Miras" },
      { property: "og:description", content: "Remitos de traslado y recepción con control de mermas." },
    ],
  }),
  component: Remitos,
});

function Remitos() {
  const d = useDerived();
  const pending = transitLots(d);
  const trips = d.active.filter((m) => m.type === "traslado").reverse();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const annul = (id: string) => {
    try {
      setDb(annulMovement(getDb(), id));
      setMsg({ kind: "ok", text: "Traslado anulado: el vino vuelve al lote de origen." });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof BodegaError ? e.message : String(e) });
    }
  };
  return (
    <div>
      <PageTitle title="Remitos" sub={`Tolerancia de recepción: ${fmtPct(RECEPTION_TOLERANCE)} entre litros enviados y recibidos.`} />
      {msg && <div className="mb-3"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <h2 className="mb-2 text-2xl">Pendientes de recepción</h2>
      {pending.length === 0 && <p className="text-sm text-muted-foreground">No hay camiones en viaje.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {pending.map((l) => <Reception key={l.id} lot={l} onAnnul={annul} />)}
      </div>
      <h2 className="mt-6 mb-2 text-2xl">Historial</h2>
      <ul className="space-y-2">
        {trips.map((m) => {
          const t = d.lots.get(m.outputs[0])!;
          const origin = d.lots.get(m.sources[0].lotId)!;
          const rec = d.children.get(t.id)?.[0];
          const recMov = rec?.movement;
          const recLot = rec ? d.lots.get(rec.lotId) : undefined;
          return (
            <li key={m.id}>
              <PlantCard plant={recLot?.plant ?? null} className="text-sm">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span className="font-semibold">{m.data.remito}</span>
                  <span className="num text-xs text-muted-foreground">{m.data.truck} · {m.data.driver}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1 text-xs">
                  <PlantChip plant={origin.plant} short /> <Link to="/lotes/$id" params={{ id: origin.id }} className="num underline">{origin.code}</Link> →
                  <Link to="/lotes/$id" params={{ id: t.id }} className="num underline">{t.code}</Link> (camión) →
                  {recLot ? <><PlantChip plant={recLot.plant} short /> <Link to="/lotes/$id" params={{ id: recLot.id }} className="num underline">{recLot.code}</Link></> : <span className="font-medium">sin recepción</span>}
                </div>
                <div className="num mt-1 text-xs text-muted-foreground">
                  Salida {fmtDateTime(m.date)} · {fmtL(m.data.sentLiters ?? 0)}
                  {recMov && <> · llegada {fmtDateTime(recMov.date)} · {fmtL(recMov.data.receivedLiters ?? 0)} · merma <span className={recMov.merma > 0 ? "text-foreground font-medium" : ""}>{fmtL(recMov.merma)} ({fmtPct(recMov.merma / (m.data.sentLiters || 1))})</span></>}
                </div>
                {m.note && <div className="mt-1 rounded-sm bg-warn-soft px-2 py-0.5 text-xs">{m.note}</div>}
                <div className="mt-1 flex gap-3 text-xs">
                  <Link to="/retiro" className="underline">Simular retiro</Link>
                  <button onClick={() => annul(m.id)} className="underline">Anular traslado</button>
                </div>
              </PlantCard>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Reception({ lot, onAnnul }: { lot: Lot; onAnnul: (id: string) => void }) {
  const d = useDerived();
  const m = d.movements.get(lot.movementId)!;
  const dest = m.data.destPlant!;
  const [liters, setLiters] = useState(String(lot.litersIn));
  const [vesselId, setVesselId] = useState("");
  const [date, setDate] = useState(() => today());
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const vessels = [...d.vessels.values()].filter((v) => v.vessel.plant === dest && v.vessel.kind !== "barrica" && !v.dirty && v.free > 0.5);
  const rec = Number(liters.replace(",", "."));
  const diff = lot.litersIn - rec;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = applyMovement(getDb(), { type: "recepcion", date, sources: [{ lotId: lot.id, liters: lot.litersIn }], receivedLiters: rec, vesselId });
      setDb(r.db);
      setErr(null);
      setOk(`Recibido en ${vesselId}: lote ${r.lots[0].code}.`);
    } catch (e2) {
      setErr(e2 instanceof BodegaError ? e2.message : String(e2));
    }
  };
  return (
    <PlantCard plant={null}>
      <div className="flex items-center justify-between">
        <span className="font-semibold">Remito {lot.remito}</span>
        <Link to="/lotes/$id" params={{ id: lot.id }} className="num text-sm underline">{lot.code}</Link>
      </div>
      <div className="num text-sm">{lot.name} · enviados {fmtL(lot.litersIn)}</div>
      <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">Salió {fmtDateTime(m.date)} hacia <PlantChip plant={dest} short /></div>
      {ok ? <Notice kind="ok">{ok}</Notice> : (
        <form onSubmit={submit} className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Litros recibidos" hint={Number.isFinite(rec) ? `Diferencia ${fmtL(diff)} (${fmtPct(Math.abs(diff) / lot.litersIn)})` : undefined}>
              <input inputMode="decimal" className={inputCls} value={liters} onChange={(e) => setLiters(e.target.value)} />
            </Field>
            <Field label="Llegada"><input type="datetime-local" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          </div>
          <Field label="Recipiente de destino">
            <select className={inputCls} value={vesselId} onChange={(e) => setVesselId(e.target.value)}>
              <option value="">Elegí…</option>
              {vessels.map((v) => <option key={v.vessel.id} value={v.vessel.id}>{v.vessel.id} · libres {fmtL(v.free)}</option>)}
            </select>
          </Field>
          {err && <Notice kind="error">{err}</Notice>}
          <div className="flex gap-2">
            <Btn type="submit">Registrar recepción</Btn>
            <Btn type="button" variant="ghost" onClick={() => onAnnul(m.id)}>Anular traslado</Btn>
          </div>
        </form>
      )}
    </PlantCard>
  );
}
