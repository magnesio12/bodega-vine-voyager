import type {
  Db,
  LineId,
  Lot,
  Movement,
  MovementInput,
  Parcel,
  PlantId,
  SourceRef,
  Vessel,
} from "./types";
import { LINE_LABEL, PLANT_NAME, fmtDate, fmtInt, fmtL, fmtMonths, fmtPct, round1 } from "./format";

export class BodegaError extends Error {}
const fail = (msg: string): never => {
  throw new BodegaError(msg);
};

export const TRUCK_MAX = 8000;
export const BARREL_L = 225;
export const RECEPTION_TOLERANCE = 0.003;
export const MACERATION_LOSS = 0.08;
export const BOTTLE_L = 0.75;
export const EPS = 0.05;

export interface Edge {
  lotId: string;
  liters: number;
  share: number;
  movement: Movement;
}

export interface VesselState {
  vessel: Vessel;
  occupancy: number;
  free: number;
  dirty: boolean;
  lotIds: string[];
}

export interface Derived {
  db: Db;
  lots: Map<string, Lot>;
  lotList: Lot[];
  active: Movement[];
  movements: Map<string, Movement>;
  outflow: Map<string, number>;
  parents: Map<string, Edge[]>;
  children: Map<string, Edge[]>;
  vessels: Map<string, VesselState>;
  plants: Record<PlantId, { capacity: number; occupancy: number; pct: number }>;
  balance: (id: string) => number;
  parcel: (id: string) => Parcel | undefined;
}

export function monthsBetween(a: string, b: string) {
  const [y1, m1, d1] = a.slice(0, 10).split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = b.slice(0, 10).split("-").map(Number) as [number, number, number];
  return (y2 - y1) * 12 + (m2 - m1) + (d2 - d1) / 30;
}
export function daysBetween(a: string, b: string) {
  const fix = (s: string) => {
    const [y, m, d] = s.slice(0, 10).split("-").map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((fix(b) - fix(a)) / 86400000);
}

export function derive(db: Db): Derived {
  const active = db.movements.filter((m) => !m.annulled).sort((a, b) => a.seq - b.seq);
  const movements = new Map(db.movements.map((m) => [m.id, m]));
  const activeIds = new Set(active.map((m) => m.id));
  const lotList = db.lots.filter((l) => activeIds.has(l.movementId));
  const lots = new Map(lotList.map((l) => [l.id, l]));
  const outflow = new Map<string, number>();
  const parents = new Map<string, Edge[]>();
  const children = new Map<string, Edge[]>();
  const vesselById = new Map(db.vessels.map((v) => [v.id, v]));
  const occ = new Map<string, number>(db.vessels.map((v) => [v.id, 0]));
  const dirty = new Map<string, boolean>(db.vessels.map((v) => [v.id, false]));

  for (const m of active) {
    const total = m.sources.reduce((s, x) => s + x.liters, 0);
    for (const s of m.sources) {
      outflow.set(s.lotId, (outflow.get(s.lotId) ?? 0) + s.liters);
      const lot = lots.get(s.lotId);
      if (lot?.vesselId) {
        const v = (occ.get(lot.vesselId) ?? 0) - s.liters;
        if (v <= EPS) {
          occ.set(lot.vesselId, 0);
          dirty.set(lot.vesselId, true);
        } else occ.set(lot.vesselId, v);
      }
      for (const o of m.outputs) {
        const share = total > 0 ? s.liters / total : 0;
        const pe = parents.get(o) ?? [];
        pe.push({ lotId: s.lotId, liters: s.liters, share, movement: m });
        parents.set(o, pe);
        const ce = children.get(s.lotId) ?? [];
        ce.push({ lotId: o, liters: s.liters, share, movement: m });
        children.set(s.lotId, ce);
      }
    }
    for (const o of m.outputs) {
      const lot = lots.get(o);
      if (lot?.vesselId) {
        occ.set(lot.vesselId, (occ.get(lot.vesselId) ?? 0) + lot.litersIn);
        dirty.set(lot.vesselId, false);
      }
    }
    if (m.type === "limpieza" && m.data.vesselId) dirty.set(m.data.vesselId, false);
  }

  const balance = (id: string) => {
    const l = lots.get(id);
    if (!l) return 0;
    if (l.status === "embotellado") return 0;
    const b = l.litersIn - (outflow.get(id) ?? 0);
    return b < EPS ? 0 : b;
  };

  const vessels = new Map<string, VesselState>();
  for (const v of db.vessels) {
    const o = occ.get(v.id) ?? 0;
    vessels.set(v.id, {
      vessel: v,
      occupancy: o,
      free: Math.max(0, v.capacity - o),
      dirty: o <= EPS && (dirty.get(v.id) ?? false),
      lotIds: lotList.filter((l) => l.vesselId === v.id && l.status === "activo" && balance(l.id) > 0).map((l) => l.id),
    });
  }
  const plants = { MQ: { capacity: 0, occupancy: 0, pct: 0 }, FO: { capacity: 0, occupancy: 0, pct: 0 } };
  for (const s of vessels.values()) {
    plants[s.vessel.plant].capacity += s.vessel.capacity;
    plants[s.vessel.plant].occupancy += s.occupancy;
  }
  for (const p of Object.values(plants)) p.pct = p.capacity ? p.occupancy / p.capacity : 0;
  const parcelMap = new Map(db.parcels.map((p) => [p.id, p]));
  void vesselById;
  return {
    db,
    lots,
    lotList,
    active,
    movements,
    outflow,
    parents,
    children,
    vessels,
    plants,
    balance,
    parcel: (id) => parcelMap.get(id),
  };
}

// ---------- Condiciones heredadas ----------

interface Inh {
  origins: Map<string, number>; // grape lot id -> fraction of liters
  months: number;
}

const inhCache = new WeakMap<Derived, Map<string, Inh>>();

function inherit(d: Derived, id: string): Inh {
  let memo = inhCache.get(d);
  if (!memo) {
    memo = new Map();
    inhCache.set(d, memo);
  }
  const hit = memo.get(id);
  if (hit) return hit;
  const lot = d.lots.get(id);
  let res: Inh;
  if (!lot || lot.parcelId) {
    res = { origins: new Map([[id, 1]]), months: 0 };
  } else {
    const pe = d.parents.get(id) ?? [];
    const origins = new Map<string, number>();
    let months = 0;
    for (const e of pe) {
      const p = inherit(d, e.lotId);
      for (const [k, f] of p.origins) origins.set(k, (origins.get(k) ?? 0) + f * e.share);
      months += e.share * (p.months + barrelTime(d, e.lotId, e.movement.date));
    }
    res = { origins, months };
  }
  memo.set(id, res);
  return res;
}

function barrelTime(d: Derived, lotId: string, until: string) {
  const l = d.lots.get(lotId);
  if (!l?.vesselId) return 0;
  const v = d.vessels.get(l.vesselId)?.vessel;
  return v?.kind === "barrica" ? Math.max(0, monthsBetween(l.date, until)) : 0;
}

export interface OriginInfo {
  lot: Lot;
  parcel: Parcel;
  fraction: number;
}

export interface Conditions {
  organic: boolean;
  f1958: boolean;
  share1958: number;
  months: number;
  monthsInProgress: number;
  composition: { variety: string; fraction: number }[];
  origins: OriginInfo[];
  latestHarvest: string | null;
  early: boolean;
}

export function earlyCutoff(harvest: string) {
  return `${harvest.slice(0, 4)}-02-25`;
}

export function conditions(d: Derived, id: string, today?: string): Conditions {
  const inh = inherit(d, id);
  const origins: OriginInfo[] = [];
  for (const [lid, f] of inh.origins) {
    const lot = d.lots.get(lid);
    const parcel = lot?.parcelId ? d.parcel(lot.parcelId) : undefined;
    if (lot && parcel) origins.push({ lot, parcel, fraction: f });
  }
  origins.sort((a, b) => b.fraction - a.fraction);
  const comp = new Map<string, number>();
  for (const o of origins) comp.set(o.parcel.variety, (comp.get(o.parcel.variety) ?? 0) + o.fraction);
  const share1958 = origins.filter((o) => o.parcel.is1958).reduce((s, o) => s + o.fraction, 0);
  const harvests = origins.map((o) => o.lot.harvestDate ?? o.lot.date).sort();
  const latest = harvests.length ? harvests[harvests.length - 1]! : null;
  const lot = d.lots.get(id);
  let inProgress = 0;
  if (lot && today && lot.status === "activo" && d.balance(id) > 0) inProgress = barrelTime(d, id, today);
  return {
    organic: origins.length > 0 && origins.every((o) => o.parcel.organic),
    share1958,
    f1958: share1958 >= 0.9999,
    months: inh.months,
    monthsInProgress: inProgress,
    composition: [...comp.entries()].map(([variety, fraction]) => ({ variety, fraction })).sort((a, b) => b.fraction - a.fraction),
    origins,
    latestHarvest: latest,
    early: origins.length > 0 && origins.every((o) => (o.lot.harvestDate ?? o.lot.date).slice(0, 10) < earlyCutoff(o.lot.harvestDate ?? o.lot.date)),
  };
}

/** Camino de códigos desde el lote hasta un ancestro, pasando por remitos si los hay. */
export function pathTo(d: Derived, from: string, to: string): string[] {
  const seen = new Set<string>();
  const dfs = (id: string): string[] | null => {
    if (id === to) return [id];
    if (seen.has(id)) return null;
    seen.add(id);
    for (const e of d.parents.get(id) ?? []) {
      const r = dfs(e.lotId);
      if (r) return [id, ...r];
    }
    return null;
  };
  return dfs(from) ?? [];
}

export function describePath(d: Derived, ids: string[]) {
  return ids
    .map((id) => {
      const l = d.lots.get(id);
      if (!l) return id;
      return l.status === "transito" ? `${l.code} (camión, remito ${l.remito})` : l.code;
    })
    .join(" ← ");
}

export interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export interface LineResult {
  line: LineId;
  ok: boolean;
  checks: Check[];
}

function organicCheck(d: Derived, id: string, c: Conditions): Check {
  if (c.organic) return { label: "Orgánico", ok: true, detail: `Todos sus ancestros de uva son orgánicos (${c.origins.map((o) => o.parcel.id).join(", ")}).` };
  const bad = c.origins.filter((o) => !o.parcel.organic);
  const fr = bad.reduce((s, o) => s + o.fraction, 0);
  const byParcel = new Map<string, OriginInfo[]>();
  for (const o of bad) byParcel.set(o.parcel.id, [...(byParcel.get(o.parcel.id) ?? []), o]);
  const detail = [...byParcel.values()]
    .map((os) => {
      const p = os[0]!.parcel;
      const f = os.reduce((s, o) => s + o.fraction, 0);
      return `El ancestro que rompe la regla es la parcela ${p.id} (${p.variety}, ${p.origin}, no orgánica): aporta ${fmtPct(f)} a través de ${os.map((o) => `${o.lot.code} ${fmtPct(o.fraction)}`).join(", ")}. Camino: ${describePath(d, pathTo(d, id, os[0]!.lot.id))}.`;
    })
    .join(" ");
  return { label: "Orgánico", ok: false, detail: `No es orgánico: ${fmtPct(fr)} de sus litros viene de uva no orgánica. ${detail}` };
}

function monthsCheck(d: Derived, id: string, c: Conditions, min: number): Check {
  const ok = c.months + 1e-9 >= min;
  const contrib = (d.parents.get(id) ?? [])
    .map((e) => {
      const pm = inherit(d, e.lotId).months + barrelTime(d, e.lotId, e.movement.date);
      return `${d.lots.get(e.lotId)?.code} ${fmtPct(e.share)} con ${fmtMonths(pm)}`;
    })
    .join("; ");
  return {
    label: `Al menos ${min} meses de barrica`,
    ok,
    detail: `${ok ? "Cumple" : "No cumple"}: tiene ${fmtMonths(c.months)} ponderados por litros${contrib ? ` (${contrib})` : ""}; requiere ${min}.`,
  };
}

export function validateLine(d: Derived, id: string, line: LineId): LineResult {
  const c = conditions(d, id);
  const checks: Check[] = [organicCheck(d, id, c)];
  if (line === "liviana") {
    const late = c.origins.filter((o) => (o.lot.harvestDate ?? o.lot.date).slice(0, 10) >= earlyCutoff(o.lot.harvestDate ?? o.lot.date));
    checks.push({
      label: "Vendimia temprana (antes del 25/02)",
      ok: late.length === 0,
      detail: late.length
        ? `Ancestros cosechados el 25/02 o después: ${late.map((o) => `${o.lot.code} ${o.parcel.variety} ${o.parcel.id} cosechado ${fmtDate(o.lot.harvestDate ?? o.lot.date)} (${fmtPct(o.fraction)})`).join("; ")}.`
        : `Toda la uva se cosechó antes del 25/02 (última: ${c.latestHarvest ? fmtDate(c.latestHarvest) : "—"}).`,
    });
  }
  if (line === "crianza") checks.push(monthsCheck(d, id, c, 6));
  if (line === "icono") {
    const non = c.origins.filter((o) => !o.parcel.is1958);
    checks.push({
      label: "100 % viñedo 1958",
      ok: c.f1958,
      detail: c.f1958
        ? "Todos sus litros provienen de parcelas plantadas en 1958."
        : `Solo ${fmtPct(c.share1958)} viene de viñas de 1958. Ancestros fuera de 1958: ${non.map((o) => `${o.lot.code} parcela ${o.parcel.id} (${o.parcel.variety}, plantada ${o.parcel.plantedYear}) ${fmtPct(o.fraction)}`).join("; ")}.`,
    });
    checks.push(monthsCheck(d, id, c, 10));
  }
  return { line, ok: checks.every((x) => x.ok), checks };
}

// ---------- Movimientos ----------

function clone(db: Db): Db {
  return { ...db, lots: [...db.lots], movements: [...db.movements] };
}

export function otherPlant(p: PlantId): PlantId {
  return p === "MQ" ? "FO" : "MQ";
}

function baseName(n: string) {
  return n.replace(/ · B\d+$/, "").replace(/ \(en tránsito\)$/, "");
}

export function applyMovement(db: Db, input: MovementInput): { db: Db; movement: Movement; lots: Lot[] } {
  const d = derive(db);
  const next = clone(db);
  const t = input.type;
  const date = input.date;
  if (!date) fail("Falta la fecha del movimiento.");
  const merma = Math.max(0, input.merma ?? 0);
  const sources: SourceRef[] = (input.sources ?? []).filter((s) => s.lotId).map((s) => ({ lotId: s.lotId, liters: round1(Number(s.liters)) }));
  const vesselOf = (id?: string) => (id ? d.vessels.get(id) : undefined);
  const newLots: Lot[] = [];
  const mid = `M-${String(next.seq + 1).padStart(4, "0")}`;

  const mkLot = (p: Partial<Lot> & Pick<Lot, "name" | "litersIn" | "status">): Lot => {
    next.lotSeq += 1;
    const code = `L-${String(next.lotSeq).padStart(4, "0")}`;
    const lot: Lot = { id: code, code, plant: null, vesselId: null, movementId: mid, date, ...p, litersIn: round1(p.litersIn) };
    newLots.push(lot);
    return lot;
  };

  // --- validaciones de orígenes ---
  const srcLots = sources.map((s) => {
    const l = d.lots.get(s.lotId) ?? fail(`No existe el lote ${s.lotId}.`);
    if (!(s.liters > 0)) fail(`Indicá litros mayores a cero para ${l.code}.`);
    return l;
  });
  const dupes = new Set(sources.map((s) => s.lotId));
  if (dupes.size !== sources.length) fail("Un mismo lote figura dos veces como origen.");
  if (t !== "recepcion") {
    srcLots.forEach((l, i) => {
      if (l.status === "transito") fail(`El lote ${l.code} está en tránsito (remito ${l.remito}) y no está disponible hasta registrar la recepción.`);
      if (l.status === "embotellado") fail(`El lote ${l.code} ya está embotellado.`);
      const bal = d.balance(l.id);
      if (sources[i]!.liters > bal + EPS) fail(`El lote ${l.code} tiene ${fmtL(bal)} disponibles y se pidieron ${fmtL(sources[i]!.liters)}.`);
    });
  }
  const srcPlants = new Set(srcLots.map((l) => l.plant));
  if (t !== "recepcion" && srcPlants.size > 1) fail("Los orígenes están en plantas distintas: un movimiento interno no puede mezclar Mainqué y Fernández Oro.");
  const srcPlant = srcLots[0]!?.plant as PlantId | undefined;
  const totalIn = sources.reduce((s, x) => s + x.liters, 0);
  if (merma >= totalIn && totalIn > 0) fail("La merma no puede ser igual o mayor que los litros movidos.");

  const leaving = (vesselId: string) =>
    sources.reduce((s, x, i) => (srcLots[i]!.vesselId === vesselId ? s + x.liters : s), 0);

  const checkDest = (vesselId: string | undefined, plant: PlantId | undefined, incoming: number, opts: { barrel?: boolean } = {}) => {
    const vs = vesselOf(vesselId) ?? fail("Elegí un recipiente de destino.");
    const v = vs.vessel;
    if (plant && v.plant !== plant)
      fail(`El destino ${v.id} está en ${PLANT_NAME[v.plant]} y los orígenes en ${PLANT_NAME[plant]}. Para cambiar de planta registrá un traslado.`);
    if (opts.barrel && v.kind !== "barrica") fail(`${v.id} no es una barrica.`);
    if (!opts.barrel && v.kind === "barrica") fail(`${v.id} es una barrica: usá «Crianza: llenado de barricas».`);
    if (vs.dirty) fail(`${v.id} quedó vacío y necesita una limpieza antes de volver a usarse.`);
    const free = v.capacity - (vs.occupancy - leaving(v.id));
    if (incoming > free + EPS) fail(`Supera la capacidad de ${v.id}: tiene ${fmtL(Math.max(0, free))} libres y entrarían ${fmtL(incoming)}.`);
    return v;
  };

  const movement: Movement = { id: mid, seq: next.seq + 1, type: t, date, sources, outputs: [], merma: round1(merma), note: input.note, data: {} };

  switch (t) {
    case "ingreso": {
      const parcel = d.parcel(input.parcelId ?? "") ?? fail("Elegí la parcela.");
      const kg = Number(input.kg);
      if (!(kg > 0)) fail("Indicá los kilos ingresados.");
      const factor = input.factor ?? 0.7;
      if (!(factor > 0.4 && factor < 0.9)) fail("El factor de conversión debe estar entre 0,40 y 0,90 L/kg.");
      const liters = round1(kg * factor);
      const v = checkDest(input.vesselId, undefined, liters);
      const lot = mkLot({ name: input.name ?? `${parcel.variety} ${parcel.id}`, litersIn: liters, status: "activo", plant: v.plant, vesselId: v.id, parcelId: parcel.id, harvestDate: date });
      movement.data = { parcelId: parcel.id, kg, factor, vesselId: v.id };
      movement.merma = 0;
      movement.outputs = [lot.id];
      break;
    }
    case "descube":
    case "corte":
    case "crianza_reunion": {
      if (t === "descube" && sources.length !== 1) fail("El descube tiene un solo origen.");
      if (t === "corte" && (sources.length < 2 || sources.length > 5)) fail("Un corte lleva de 2 a 5 orígenes.");
      if (t === "crianza_reunion") {
        if (sources.length < 1) fail("Elegí las barricas a reunir.");
        srcLots.forEach((l) => {
          if (vesselOf(l.vesselId ?? "")?.vessel.kind !== "barrica") fail(`${l.code} no está en barrica.`);
        });
      }
      const out = totalIn - merma;
      const v = checkDest(input.vesselId, srcPlant, out);
      if (t === "descube" && srcLots[0]!.vesselId === v.id) fail("El descube se hace hacia otro recipiente.");
      const names = [...new Set(srcLots.map((l) => baseName(l.name)))];
      const name =
        input.name ??
        (names.length === 1 ? names[0]! : `Corte ${[...new Set(srcLots.flatMap((l) => conditions(d, l.id).composition.map((c) => c.variety)))].join("/")}`);
      const lot = mkLot({ name, litersIn: out, status: "activo", plant: v.plant, vesselId: v.id });
      movement.data = { vesselId: v.id };
      movement.outputs = [lot.id];
      break;
    }
    case "maceracion": {
      if (sources.length !== 1) fail("La maceración tiene un solo origen.");
      const c = conditions(d, srcLots[0]!.id);
      const red = c.origins.find((o) => o.parcel.color !== "blanco");
      if (red) fail(`La maceración con pieles es para blancos: ${srcLots[0]!.code} contiene ${red.parcel.variety} (${red.parcel.id}).`);
      if (!input.macStart || !input.macEnd) fail("Indicá fecha de inicio y de prensado.");
      const days = daysBetween(input.macStart!, input.macEnd!);
      if (days < 20 || days > 40) fail(`La maceración debe durar entre 20 y 40 días; registrada: ${days} días.`);
      const loss = round1(totalIn * MACERATION_LOSS);
      const out = totalIn - loss;
      const v = checkDest(input.vesselId, srcPlant, out);
      const lot = mkLot({ name: input.name ?? `Naranjo de ${c.composition[0]?.variety ?? "blanco"}`, litersIn: out, status: "activo", plant: v.plant, vesselId: v.id, date: input.macEnd! });
      movement.date = input.macEnd!;
      movement.merma = loss;
      movement.data = { vesselId: v.id, macStart: input.macStart, macEnd: input.macEnd };
      movement.outputs = [lot.id];
      break;
    }
    case "crianza_llenado": {
      if (sources.length !== 1) fail("El llenado de barricas parte de un solo tanque.");
      const ids = input.vesselIds ?? [];
      if (!ids.length) fail("Elegí al menos una barrica.");
      const per = (totalIn - merma) / ids.length;
      const outs: string[] = [];
      for (const vid of ids) {
        const v = checkDest(vid, srcPlant, per, { barrel: true });
        const lot = mkLot({ name: `${baseName(srcLots[0]!.name)} · ${v.id}`, litersIn: per, status: "activo", plant: v.plant, vesselId: v.id });
        outs.push(lot.id);
      }
      movement.data = { vesselIds: ids };
      movement.outputs = outs;
      break;
    }
    case "traslado": {
      if (sources.length < 1 || sources.length > 5) fail("Un traslado carga de 1 a 5 lotes de la misma planta.");
      const l = srcLots[0]!;
      if (totalIn > TRUCK_MAX) fail(`Un camión lleva hasta ${fmtL(TRUCK_MAX)} por viaje; se pidieron ${fmtL(totalIn)}.`);
      next.remitoSeq += 1;
      const remito = `R-${String(next.remitoSeq).padStart(4, "0")}`;
      const tnames = [...new Set(srcLots.map((x) => baseName(x.name)))];
      const lot = mkLot({ name: `${tnames.length === 1 ? tnames[0] : tnames.join(" + ")} (en tránsito)`, litersIn: totalIn, status: "transito", remito });
      movement.merma = 0;
      movement.data = { remito, truck: input.truck || "AF 512 KQ", driver: input.driver || "Chofer de turno", destPlant: otherPlant(l.plant!), sentLiters: totalIn };
      movement.outputs = [lot.id];
      break;
    }
    case "recepcion": {
      if (sources.length !== 1) fail("Elegí el lote en tránsito a recibir.");
      const tl = srcLots[0]!;
      if (tl.status !== "transito") fail(`${tl.code} no es un lote en tránsito.`);
      const bal = d.balance(tl.id);
      if (bal <= 0) fail(`El remito ${tl.remito} ya fue recibido.`);
      const tm = d.movements.get(tl.movementId)!;
      const sent = tl.litersIn;
      const rec = round1(Number(input.receivedLiters));
      if (!(rec > 0)) fail("Indicá los litros recibidos.");
      const diff = round1(sent - rec);
      const pct = Math.abs(diff) / sent;
      if (pct > RECEPTION_TOLERANCE + 1e-9)
        fail(
          `Recepción rechazada: se enviaron ${fmtL(sent)} y se recibieron ${fmtL(rec)}. Diferencia: ${fmtL(Math.abs(diff))} (${fmtPct(pct)}), supera el 0,3 % admitido.`,
        );
      const v = checkDest(input.vesselId, tm.data.destPlant, rec);
      movement.sources = [{ lotId: tl.id, liters: sent }];
      const lot = mkLot({ name: baseName(tl.name), litersIn: rec, status: "activo", plant: v.plant, vesselId: v.id, remito: tl.remito });
      movement.merma = Math.max(0, diff);
      movement.data = { vesselId: v.id, remito: tl.remito, sentLiters: sent, receivedLiters: rec };
      movement.outputs = [lot.id];
      break;
    }
    case "embotellado": {
      if (sources.length !== 1) fail("El embotellado parte de un solo lote.");
      const l = srcLots[0]!;
      if (l.plant !== "MQ") fail(`Solo se embotella en Planta Mainqué; ${l.code} está en ${PLANT_NAME[l.plant ?? "FO"]}.`);
      const product = db.products.find((p) => p.id === input.productId) ?? fail("Elegí el producto.");
      const out = totalIn - merma;
      const bottles = Math.floor(out / BOTTLE_L + 1e-9);
      const lot = mkLot({ name: product.name, litersIn: out, status: "embotellado", productId: product.id, bottles, plant: "MQ" });
      movement.data = { productId: product.id, bottles };
      movement.outputs = [lot.id];
      break;
    }
    case "limpieza": {
      const vs = vesselOf(input.vesselId) ?? fail("Elegí el recipiente a limpiar.");
      if (vs.occupancy > EPS) fail(`${vs.vessel.id} tiene ${fmtL(vs.occupancy)}; vacialo antes de limpiarlo.`);
      if (!vs.dirty) fail(`${vs.vessel.id} ya está limpio y disponible.`);
      movement.sources = [];
      movement.merma = 0;
      movement.data = { vesselId: vs.vessel.id };
      break;
    }
    default:
      fail("Tipo de movimiento desconocido.");
  }

  next.seq += 1;
  next.movements.push(movement);
  next.lots.push(...newLots);
  return { db: next, movement, lots: newLots };
}

export function annulMovement(db: Db, movementId: string): Db {
  const d = derive(db);
  const m = d.movements.get(movementId) ?? fail("No existe el movimiento.");
  if (m.annulled) fail("El movimiento ya está anulado.");
  for (const o of m.outputs) {
    const ch = d.children.get(o) ?? [];
    if (ch.length) {
      const l = d.lots.get(o)!;
      if (m.type === "traslado")
        fail(`No se puede anular el traslado ${m.data.remito}: tiene descendientes (${ch.map((c) => d.lots.get(c.lotId)?.code).join(", ")}).`);
      fail(`No se puede anular: el lote ${l.code} ya tiene descendientes (${ch.map((c) => d.lots.get(c.lotId)?.code).join(", ")}).`);
    }
  }
  const next = { ...db, movements: db.movements.map((x) => (x.id === movementId ? { ...x, annulled: true } : x)) };
  const nd = derive(next);
  for (const vs of nd.vessels.values()) {
    if (vs.occupancy > vs.vessel.capacity + EPS) fail(`No se puede anular: ${vs.vessel.id} quedaría por encima de su capacidad.`);
  }
  return next;
}

// ---------- Simulación de retiro ----------

export interface RecallRow {
  lotId: string;
  cells: string[];
  fraction: number;
  liters: number;
  bottles: number;
}

export const RECALL_HEADERS = [
  "Lote",
  "Producto",
  "Línea",
  "Embotellado",
  "Botellas del lote",
  "Litros del lote",
  "Proporción del remito",
  "Litros afectados",
  "Botellas afectadas",
  "Caminos",
];

export interface RecallResult {
  remito: string;
  movement: Movement;
  bottles: RecallRow[];
  stock: { lot: Lot; fraction: number; liters: number }[];
  totalLiters: number;
  totalBottles: number;
}

export function recall(db: Db, trasladoId: string): RecallResult {
  const d = derive(db);
  const m = d.movements.get(trasladoId) ?? fail("No existe el remito.");
  if (m.type !== "traslado") fail("Elegí un traslado.");
  const impact = new Map<string, number>([[m.outputs[0]!, 1]]);
  const paths = new Map<string, number>([[m.outputs[0]!, 1]]);
  for (const mv of d.active) {
    if (mv.seq <= m.seq) continue;
    const total = mv.sources.reduce((s, x) => s + x.liters, 0);
    if (!total) continue;
    let f = 0;
    let p = 0;
    for (const s of mv.sources) {
      const i = impact.get(s.lotId);
      if (i) {
        f += (i * s.liters) / total;
        p += paths.get(s.lotId) ?? 0;
      }
    }
    if (f > 0) for (const o of mv.outputs) {
      impact.set(o, f);
      paths.set(o, p);
    }
  }
  const bottles: RecallRow[] = [];
  const stock: RecallResult["stock"] = [];
  for (const [id, f] of impact) {
    const l = d.lots.get(id);
    if (!l) continue;
    if (l.status === "embotellado") {
      const product = db.products.find((p) => p.id === l.productId);
      const liters = l.litersIn * f;
      const bots = (l.bottles ?? 0) * f;
      bottles.push({
        lotId: id,
        fraction: f,
        liters,
        bottles: bots,
        cells: [
          l.code,
          product?.name ?? l.name,
          product ? LINE_LABEL[product.line] : "",
          fmtDate(l.date),
          fmtInt(l.bottles ?? 0),
          fmtL(l.litersIn),
          fmtPct(f),
          fmtL(liters),
          fmtInt(Math.round(bots)),
          String(paths.get(id) ?? 0),
        ],
      });
    } else if (l.status === "activo" && d.balance(id) > 0) {
      stock.push({ lot: l, fraction: f, liters: d.balance(id) * f });
    }
  }
  bottles.sort((a, b) => a.lotId.localeCompare(b.lotId));
  return {
    remito: m.data.remito ?? "",
    movement: m,
    bottles,
    stock,
    totalLiters: bottles.reduce((s, r) => s + r.liters, 0),
    totalBottles: bottles.reduce((s, r) => s + Math.round(r.bottles), 0),
  };
}

export function recallCsv(r: RecallResult) {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return [RECALL_HEADERS, ...r.bottles.map((b) => b.cells)].map((row) => row.map(esc).join(";")).join("\n");
}

export function transitLots(d: Derived) {
  return d.lotList.filter((l) => l.status === "transito" && d.balance(l.id) > 0);
}
