import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Btn, Field, Notice, PageTitle, PlantChip, PLANT_CLS, inputCls } from "@/components/bodega/ui";
import { applyMovement, BodegaError, BARREL_L, MACERATION_LOSS, TRUCK_MAX, daysBetween } from "@/lib/bodega/engine";
import { MOVEMENT_LABEL, PLANT_NAME, fmtL } from "@/lib/bodega/format";
import { getDb, setDb, today, useDerived } from "@/lib/bodega/store";
import type { Lot, MovementType, PlantId, SourceRef } from "@/lib/bodega/types";
import { cn } from "@/lib/utils";

const TYPES: MovementType[] = ["ingreso", "descube", "corte", "maceracion", "crianza_llenado", "crianza_reunion", "traslado", "embotellado", "limpieza"];

export const Route = createFileRoute("/movimiento")({
  validateSearch: (s: Record<string, unknown>): { tipo?: MovementType; origen?: string } => ({
    tipo: (TYPES.includes(s.tipo as MovementType) ? s.tipo : undefined) as MovementType | undefined,
    origen: typeof s.origen === "string" ? s.origen : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Registrar movimiento · Bodega Miras" },
      { name: "description", content: "Ingresos, descubes, cortes, crianza, traslados y embotellado con validación de capacidad." },
      { property: "og:title", content: "Registrar movimiento · Bodega Miras" },
      { property: "og:description", content: "Formulario de movimiento que se adapta al tipo elegido." },
    ],
  }),
  component: MovementForm,
});

const MAX_SOURCES: Partial<Record<MovementType, number>> = { descube: 1, corte: 5, maceracion: 1, crianza_llenado: 1, crianza_reunion: 16, traslado: 1, embotellado: 1 };

function MovementForm() {
  const search = Route.useSearch();
  const d = useDerived();
  const [type, setType] = useState<MovementType>(search.tipo ?? "ingreso");
  const originLot = search.origen ? d.lots.get(search.origen) : undefined;
  const [plant, setPlant] = useState<PlantId>((originLot?.plant as PlantId) ?? "MQ");
  const [date, setDate] = useState("");
  const [sources, setSources] = useState<SourceRef[]>(originLot ? [{ lotId: originLot.id, liters: 0 }] : [{ lotId: "", liters: 0 }]);
  const [vesselId, setVesselId] = useState("");
  const [vesselIds, setVesselIds] = useState<string[]>([]);
  const [merma, setMerma] = useState("0");
  const [parcelId, setParcelId] = useState("M1");
  const [kg, setKg] = useState("");
  const [factor, setFactor] = useState("0.70");
  const [macStart, setMacStart] = useState("");
  const [macEnd, setMacEnd] = useState("");
  const [truck, setTruck] = useState("AF 512 KQ");
  const [driver, setDriver] = useState("");
  const [productId, setProductId] = useState("");
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string; lots?: Lot[] } | null>(null);

  useEffect(() => {
    if (!date) setDate(today());
  }, [date]);
  useEffect(() => {
    if (search.tipo) setType(search.tipo);
  }, [search.tipo]);
  useEffect(() => {
    if (type === "embotellado") setPlant("MQ");
  }, [type]);

  const maxSrc = MAX_SOURCES[type] ?? 0;
  const sourceOptions = useMemo(
    () =>
      d.lotList.filter((l) => {
        if (l.status !== "activo" || d.balance(l.id) <= 0 || l.plant !== plant) return false;
        const inBarrel = d.vessels.get(l.vesselId ?? "")?.vessel.kind === "barrica";
        if (type === "crianza_reunion") return inBarrel;
        if (type === "crianza_llenado" || type === "descube" || type === "maceracion") return !inBarrel;
        return true;
      }),
    [d, plant, type],
  );
  const transitOptions = d.lotList.filter((l) => l.status === "transito" && d.balance(l.id) > 0);
  const effSources = sources.filter((s) => s.lotId).slice(0, maxSrc || undefined);
  const totalIn = effSources.reduce((s, x) => s + (Number(x.liters) || 0), 0);
  const leaving = (vid: string) => effSources.reduce((s, x) => (d.lots.get(x.lotId)?.vesselId === vid ? s + (Number(x.liters) || 0) : s), 0);
  const destVessels = [...d.vessels.values()].filter((v) => {
    if (v.vessel.plant !== plant || v.dirty) return false;
    if (type === "crianza_llenado") return v.vessel.kind === "barrica" && v.free > 0.5;
    if (v.vessel.kind === "barrica") return false;
    return v.free + leaving(v.vessel.id) > 0.5;
  });
  const dirtyVessels = [...d.vessels.values()].filter((v) => v.dirty && v.vessel.plant === plant);

  const out =
    type === "ingreso"
      ? (Number(kg) || 0) * (Number(factor) || 0)
      : type === "maceracion"
        ? totalIn * (1 - MACERATION_LOSS)
        : type === "traslado"
          ? totalIn
          : totalIn - (Number(merma) || 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const r = applyMovement(getDb(), {
        type,
        date,
        sources: effSources.map((s) => ({ lotId: s.lotId, liters: Number(s.liters) })),
        vesselId: vesselId || undefined,
        vesselIds,
        merma: Number(merma) || 0,
        parcelId,
        kg: Number(kg),
        factor: Number(factor),
        macStart,
        macEnd: macEnd || undefined,
        truck,
        driver,
        productId,
        name: name || undefined,
        note: note || undefined,
      });
      setDb(r.db);
      setResult({ kind: "ok", text: `${MOVEMENT_LABEL[type]} registrado (${r.movement.id}).${r.movement.data.remito ? ` Remito ${r.movement.data.remito}: el lote queda en tránsito hasta registrar la recepción.` : ""}`, lots: r.lots });
      setSources([{ lotId: "", liters: 0 }]);
      setVesselId("");
      setVesselIds([]);
      setName("");
      setNote("");
    } catch (err) {
      setResult({ kind: "error", text: err instanceof BodegaError ? err.message : String(err) });
    }
  };

  const setSrc = (i: number, patch: Partial<SourceRef>) => setSources((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <div className="max-w-2xl">
      <PageTitle title="Registrar movimiento" />
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tipo de movimiento">
          <select className={inputCls} value={type} onChange={(e) => { setType(e.target.value as MovementType); setResult(null); setVesselId(""); setVesselIds([]); }}>
            {TYPES.map((t) => <option key={t} value={t}>{MOVEMENT_LABEL[t]}</option>)}
          </select>
        </Field>
        <p className="text-xs text-muted-foreground">
          Las recepciones de traslados se registran en la <Link to="/remitos" className="underline">bandeja de remitos</Link>
          {transitOptions.length > 0 && ` (${transitOptions.length} pendientes)`}.
        </p>

        <div>
          <span className="mb-1 block text-sm font-medium text-ink">Planta {type === "traslado" ? "de origen" : ""}</span>
          <div className="grid grid-cols-2 gap-2">
            {(["MQ", "FO"] as PlantId[]).map((p) => (
              <button
                type="button"
                key={p}
                disabled={type === "embotellado" && p === "FO"}
                onClick={() => { setPlant(p); setSources([{ lotId: "", liters: 0 }]); setVesselId(""); setVesselIds([]); }}
                className={cn("rounded-md border border-l-4 px-3 py-2 text-left text-sm disabled:opacity-40", PLANT_CLS[p].border, plant === p ? cn(PLANT_CLS[p].soft, "font-semibold") : "bg-card")}
              >
                {PLANT_NAME[p]}
              </button>
            ))}
          </div>
          {type === "embotellado" && <p className="mt-1 text-xs text-muted-foreground">Solo se embotella en Planta Mainqué.</p>}
          {type === "traslado" && <p className="mt-1 text-xs text-muted-foreground">Destino: {PLANT_NAME[plant === "MQ" ? "FO" : "MQ"]}. Máximo {fmtL(TRUCK_MAX)} por camión.</p>}
        </div>

        <Field label={type === "maceracion" ? "Fecha de registro" : "Fecha y hora"}>
          <input type="datetime-local" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>

        {type === "ingreso" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Parcela">
              <select className={inputCls} value={parcelId} onChange={(e) => setParcelId(e.target.value)}>
                {d.db.parcels.map((p) => <option key={p.id} value={p.id}>{p.id} · {p.variety}{p.is1958 ? " 1958" : ""}{p.organic ? "" : " (no orgánica)"}</option>)}
              </select>
            </Field>
            <Field label="Kilos"><input inputMode="decimal" className={inputCls} value={kg} onChange={(e) => setKg(e.target.value)} placeholder="0" /></Field>
            <Field label="Factor L/kg"><input inputMode="decimal" className={inputCls} value={factor} onChange={(e) => setFactor(e.target.value)} /></Field>
          </div>
        )}

        {maxSrc > 0 && (
          <div>
            <span className="mb-1 block text-sm font-medium text-ink">Orígenes {maxSrc > 1 && <span className="font-normal text-muted-foreground">({type === "corte" ? "2 a 5" : `hasta ${maxSrc}`})</span>}</span>
            <div className="space-y-2">
              {sources.slice(0, maxSrc).map((s, i) => {
                const l = d.lots.get(s.lotId);
                return (
                  <div key={i} className="grid grid-cols-[1fr_6.5rem_auto] gap-2">
                    <select className={inputCls} value={s.lotId} onChange={(e) => setSrc(i, { lotId: e.target.value, liters: d.balance(e.target.value) })}>
                      <option value="">Elegí un lote…</option>
                      {l && !sourceOptions.includes(l) && <option value={l.id}>{l.code} · {l.name} (no disponible)</option>}
                      {sourceOptions.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.vesselId} · {o.name} · {fmtL(d.balance(o.id))}</option>)}
                    </select>
                    <input inputMode="decimal" aria-label="Litros" className={inputCls} value={s.liters || ""} onChange={(e) => setSrc(i, { liters: Number(e.target.value.replace(",", ".")) })} placeholder="L" />
                    <Btn type="button" variant="ghost" className="px-2" disabled={sources.length === 1} onClick={() => setSources((x) => x.filter((_, j) => j !== i))} aria-label="Quitar">×</Btn>
                  </div>
                );
              })}
            </div>
            {sources.length < maxSrc && <Btn type="button" variant="ghost" className="mt-2" onClick={() => setSources((x) => [...x, { lotId: "", liters: 0 }])}>Agregar origen</Btn>}
            {sourceOptions.length === 0 && <p className="mt-1 text-xs text-muted-foreground">No hay lotes disponibles en {PLANT_NAME[plant]} para este movimiento.</p>}
          </div>
        )}

        {type === "maceracion" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Inicio con hollejos"><input type="date" className={inputCls} value={macStart} onChange={(e) => setMacStart(e.target.value)} /></Field>
            <Field label="Prensado" hint={macStart && macEnd ? `${daysBetween(macStart, macEnd)} días (20 a 40)` : "Entre 20 y 40 días"}>
              <input type="date" className={inputCls} value={macEnd} onChange={(e) => setMacEnd(e.target.value)} />
            </Field>
          </div>
        )}

        {type === "traslado" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Patente del camión cisterna"><input className={inputCls} value={truck} onChange={(e) => setTruck(e.target.value)} /></Field>
            <Field label="Chofer"><input className={inputCls} value={driver} onChange={(e) => setDriver(e.target.value)} placeholder="Chofer de turno" /></Field>
          </div>
        )}

        {type === "embotellado" && (
          <Field label="Producto">
            <select className={inputCls} value={productId} onChange={(e) => setProductId(e.target.value)}>
              <option value="">Elegí el producto…</option>
              {d.db.products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}

        {type === "crianza_llenado" ? (
          <div>
            <span className="mb-1 block text-sm font-medium text-ink">Barricas de destino ({BARREL_L} L c/u)</span>
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-8">
              {[...d.vessels.values()].filter((v) => v.vessel.kind === "barrica" && v.vessel.plant === plant).map((v) => {
                const ok = destVessels.includes(v);
                const on = vesselIds.includes(v.vessel.id);
                return (
                  <button type="button" key={v.vessel.id} disabled={!ok} onClick={() => setVesselIds((x) => (on ? x.filter((y) => y !== v.vessel.id) : [...x, v.vessel.id]))}
                    className={cn("rounded-md border px-1 py-1.5 text-xs disabled:opacity-40", on ? "border-mq bg-mq-soft font-semibold" : "bg-card")}>
                    {v.vessel.id}
                    <span className="num block text-[10px]">{v.dirty ? "sucia" : `${fmtL(v.free)} lib.`}</span>
                  </button>
                );
              })}
            </div>
            {vesselIds.length > 0 && <p className="num mt-1 text-xs text-muted-foreground">{fmtL(out / vesselIds.length)} por barrica</p>}
          </div>
        ) : type === "limpieza" ? (
          <Field label="Recipiente a limpiar">
            <select className={inputCls} value={vesselId} onChange={(e) => setVesselId(e.target.value)}>
              <option value="">Elegí…</option>
              {dirtyVessels.map((v) => <option key={v.vessel.id} value={v.vessel.id}>{v.vessel.id}</option>)}
            </select>
            {dirtyVessels.length === 0 && <span className="text-xs text-muted-foreground">No hay recipientes esperando limpieza en esta planta.</span>}
          </Field>
        ) : type !== "traslado" && type !== "embotellado" ? (
          <Field label="Recipiente de destino" hint="Solo se ofrecen recipientes limpios con lugar libre.">
            <select className={inputCls} value={vesselId} onChange={(e) => setVesselId(e.target.value)}>
              <option value="">Elegí…</option>
              {destVessels.map((v) => <option key={v.vessel.id} value={v.vessel.id}>{v.vessel.id} · libres {fmtL(v.free + leaving(v.vessel.id))} de {fmtL(v.vessel.capacity)}</option>)}
            </select>
          </Field>
        ) : null}

        {["descube", "corte", "crianza_llenado", "crianza_reunion", "embotellado"].includes(type) && (
          <Field label="Merma (L)"><input inputMode="decimal" className={inputCls} value={merma} onChange={(e) => setMerma(e.target.value)} /></Field>
        )}

        {["ingreso", "descube", "corte", "crianza_reunion", "maceracion"].includes(type) && (
          <Field label="Nombre del lote nuevo (opcional)"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        )}
        <Field label="Observaciones (opcional)"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>

        {type !== "limpieza" && (
          <div className="num rounded-md border bg-card px-3 py-2 text-sm">
            {maxSrc > 0 && <>Salen {fmtL(totalIn)} · </>}
            {type === "maceracion" && <>merma de prensado {fmtL(totalIn * MACERATION_LOSS)} · </>}
            Lote nuevo: <strong>{fmtL(Math.max(0, out))}</strong>
            {type === "embotellado" && <> · {Math.floor(Math.max(0, out) / 0.75)} botellas de 750 ml</>}
            {type === "traslado" && <> · queda en tránsito</>}
          </div>
        )}

        {result && (
          <Notice kind={result.kind}>
            {result.text}
            {result.lots && result.lots.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-2">
                {result.lots.map((l) => <Link key={l.id} to="/lotes/$id" params={{ id: l.id }} className="num font-medium underline">{l.code}</Link>)}
              </span>
            )}
          </Notice>
        )}
        <div className="flex items-center gap-2">
          <Btn type="submit">Registrar</Btn>
          <PlantChip plant={plant} />
        </div>
      </form>
    </div>
  );
}
