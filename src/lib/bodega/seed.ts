import { applyMovement } from "./engine";
import type { Db, MovementInput, Parcel, Product, Vessel } from "./types";

export const SEED_VERSION = 3;

/** Generador pseudoaleatorio con semilla fija (mulberry32). Siempre produce la misma secuencia. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PARCELS: Parcel[] = [
  { id: "M1", variety: "Malbec", plantedYear: 1958, is1958: true, ha: 2.4, organic: true, color: "tinto", origin: "Mainqué" },
  { id: "M2", variety: "Pinot Noir", plantedYear: 1958, is1958: true, ha: 1.8, organic: true, color: "tinto", origin: "Mainqué" },
  { id: "M3", variety: "Semillón", plantedYear: 1958, is1958: true, ha: 1.6, organic: true, color: "blanco", origin: "Mainqué" },
  { id: "M4", variety: "Merlot", plantedYear: 1958, is1958: true, ha: 1.2, organic: true, color: "tinto", origin: "Mainqué" },
  { id: "M5", variety: "Trousseau", plantedYear: 2004, is1958: false, ha: 0.6, organic: true, color: "tinto", origin: "Mainqué" },
  { id: "M6", variety: "Cabernet Franc", plantedYear: 2008, is1958: false, ha: 1.1, organic: true, color: "tinto", origin: "Mainqué" },
  { id: "M7", variety: "Chardonnay", plantedYear: 2011, is1958: false, ha: 0.9, organic: true, color: "blanco", origin: "Mainqué" },
  { id: "N1", variety: "Malbec", plantedYear: 1999, is1958: false, ha: 0, organic: false, color: "tinto", origin: "uva comprada, productor de Neuquén" },
];

const barrels: Vessel[] = Array.from({ length: 16 }, (_, i) => ({
  id: `B${String(i + 1).padStart(2, "0")}`,
  plant: "MQ",
  kind: "barrica",
  capacity: 225,
  material: "Roble francés",
}));

export const VESSELS: Vessel[] = [
  ...["T1", "T2", "T3", "T4"].map((id) => ({ id, plant: "MQ" as const, kind: "tanque" as const, capacity: 4000, material: "Acero inoxidable" })),
  ...["T5", "T6"].map((id) => ({ id, plant: "MQ" as const, kind: "tanque" as const, capacity: 2000, material: "Acero inoxidable" })),
  ...barrels,
  { id: "PF1", plant: "FO", kind: "pileta", capacity: 5000, material: "Cemento" },
  { id: "PF2", plant: "FO", kind: "pileta", capacity: 5000, material: "Cemento" },
  { id: "TF1", plant: "FO", kind: "tanque", capacity: 3000, material: "Acero inoxidable" },
  { id: "TF2", plant: "FO", kind: "tanque", capacity: 3000, material: "Acero inoxidable" },
];

export const PRODUCTS: Product[] = [
  { id: "jov-pn", line: "joven", name: "Pinot Noir joven" },
  { id: "jov-mal", line: "joven", name: "Malbec joven" },
  { id: "jov-sem", line: "joven", name: "Semillón joven" },
  { id: "jov-nar", line: "joven", name: "Naranjo de Semillón" },
  { id: "jov-ros", line: "joven", name: "Rosado" },
  { id: "liv-mal", line: "liviana", name: "Malbec liviano" },
  { id: "liv-pn", line: "liviana", name: "Pinot Noir liviano" },
  { id: "cri-mal", line: "crianza", name: "Malbec crianza" },
  { id: "cri-mer", line: "crianza", name: "Merlot crianza" },
  { id: "cri-cf", line: "crianza", name: "Cabernet Franc crianza" },
  { id: "cri-pn", line: "crianza", name: "Pinot Noir crianza" },
  { id: "cri-gua", line: "crianza", name: "Corte de guarda" },
  { id: "ico-mal", line: "icono", name: "Malbec ícono 1958" },
  { id: "ico-pn", line: "icono", name: "Pinot Noir ícono 1958" },
  { id: "ico-sem", line: "icono", name: "Semillón ícono 1958" },
  { id: "ico-mer", line: "icono", name: "Merlot ícono 1958" },
];

const TRUCKS = ["AF 512 KQ", "AD 087 TR", "AE 331 PN"];
const DRIVERS = ["Chofer A. (Transportes del Valle)", "Chofer B. (Transportes del Valle)", "Chofer C. (Fletes Oro)"];

export function buildSeed(): Db {
  const rnd = mulberry32(1958);
  let db: Db = {
    version: SEED_VERSION,
    parcels: PARCELS,
    vessels: VESSELS,
    products: PRODUCTS,
    lots: [],
    movements: [],
    seq: 0,
    lotSeq: 0,
    remitoSeq: 0,
  };
  const L: Record<string, string> = {};
  const K = (k: string) => L[k]!;
  const lotIn = (key: string) => db.lots.find((l) => l.id === K(key))!.litersIn;
  const run = (input: MovementInput, keys: string[] = []) => {
    const r = applyMovement(db, input);
    db = r.db;
    keys.forEach((k, i) => (L[k] = r.lots[i]?.id ?? ""));
    return r;
  };
  const S = (key: string, liters?: number) => ({ lotId: K(key), liters: liters ?? lotIn(key) });
  const all = (key: string) => S(key);
  const clean = (date: string, vesselId: string) => run({ type: "limpieza", date, vesselId });
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)];
  const trip = (date: string, key: string, liters: number, recv: { at: string; liters: number; vessel: string } | null, outKey: string, note?: string) => {
    const hh = 8 + Math.floor(rnd() * 2);
    const mm = String(Math.floor(rnd() * 4) * 15).padStart(2, "0");
    run({ type: "traslado", date: `${date}T0${hh}:${mm}`, sources: [S(key, liters)], truck: pick(TRUCKS), driver: pick(DRIVERS), note }, [`${outKey}-T`]);
    if (recv)
      run({ type: "recepcion", date: recv.at, sources: [{ lotId: K(`${outKey}-T`), liters }], receivedLiters: recv.liters, vesselId: recv.vessel }, [outKey]);
  };

  // ---- Vendimia 2025: Mainqué ----
  run({ type: "ingreso", date: "2025-02-15T07:30", parcelId: "M2", kg: 2000, vesselId: "T5", name: "Pinot Noir M2 temprano" }, ["PNT"]);
  run({ type: "ingreso", date: "2025-02-20T07:30", parcelId: "M7", kg: 1600, vesselId: "T6" }, ["CH"]);
  run({ type: "descube", date: "2025-02-25T09:00", sources: [all("PNT")], merma: 35, vesselId: "T1" }, ["PNT2"]);
  run({ type: "ingreso", date: "2025-02-26T07:30", parcelId: "M3", kg: 2800, vesselId: "T2", name: "Semillón M3" }, ["SEMB"]);
  run({ type: "ingreso", date: "2025-02-26T10:00", parcelId: "M3", kg: 1200, vesselId: "T3", name: "Semillón M3 con pieles" }, ["SEMP"]);
  clean("2025-02-27T08:00", "T5");
  run({ type: "ingreso", date: "2025-03-05T07:30", parcelId: "M5", kg: 1200, vesselId: "T4", name: "Trousseau M5 prensa directa" }, ["TR"]);
  // ---- Vendimia 2025: Fernández Oro ----
  run({ type: "ingreso", date: "2025-03-03T08:00", parcelId: "M2", kg: 3000, vesselId: "TF1" }, ["PNF"]);
  run({ type: "ingreso", date: "2025-03-12T07:30", parcelId: "M1", kg: 6000, vesselId: "PF1" }, ["MALF"]);
  run({ type: "descube", date: "2025-03-13T09:00", sources: [all("PNF")], merma: 52, vesselId: "TF2" }, ["PNF2"]);
  clean("2025-03-14T08:00", "TF1");
  run({ type: "ingreso", date: "2025-03-16T07:30", parcelId: "M4", kg: 3000, vesselId: "TF1" }, ["MER"]);
  run({ type: "descube", date: "2025-03-22T09:00", sources: [all("MALF")], merma: 105, vesselId: "PF2" }, ["MAL2"]);
  clean("2025-03-23T08:00", "PF1");
  run({ type: "ingreso", date: "2025-03-24T07:30", parcelId: "M6", kg: 2500, vesselId: "T5" }, ["CF"]);
  run({ type: "descube", date: "2025-03-26T09:00", sources: [all("MER")], merma: 52, vesselId: "PF1" }, ["MER2"]);
  clean("2025-03-27T08:00", "TF1");
  run({ type: "ingreso", date: "2025-03-28T08:00", parcelId: "N1", kg: 1500, vesselId: "TF1", name: "Malbec Neuquén N1" }, ["NQ1"]);
  run({ type: "ingreso", date: "2025-03-29T08:00", parcelId: "N1", kg: 1500, vesselId: "TF1", name: "Malbec Neuquén N1" }, ["NQ2"]);
  run({ type: "maceracion", date: "2025-03-29T10:00", sources: [all("SEMP")], macStart: "2025-02-27", macEnd: "2025-03-29T10:00", vesselId: "T3" }, ["NAR"]);
  run({ type: "ingreso", date: "2025-03-30T08:00", parcelId: "N1", kg: 1000, vesselId: "TF1", name: "Malbec Neuquén N1" }, ["NQ3"]);

  // ---- Abril 2025: embotellado de jóvenes y primeros traslados ----
  run({ type: "embotellado", date: "2025-04-01T06:30", sources: [all("PNT2")], productId: "liv-pn" });
  clean("2025-04-01T07:00", "T1");
  trip("2025-04-01", "PNF2", 1000, { at: "2025-04-01T10:40", liters: 998, vessel: "T1" }, "PNR1");
  run({ type: "corte", date: "2025-04-02T08:00", sources: [all("TR"), all("CH")], vesselId: "T6", name: "Rosado Trousseau-Chardonnay" }, ["ROS"]);
  run({ type: "embotellado", date: "2025-04-02T11:00", sources: [all("ROS")], productId: "jov-ros" });
  clean("2025-04-02T14:00", "T4");
  clean("2025-04-02T15:00", "T6");
  trip("2025-04-03", "MAL2", 2000, { at: "2025-04-03T11:10", liters: 1995, vessel: "T4" }, "MALR1");
  run({ type: "descube", date: "2025-04-03T14:00", sources: [all("CF")], merma: 44, vesselId: "T6" }, ["CF2"]);
  clean("2025-04-04T08:00", "T5");
  trip("2025-04-08", "MER2", 461, { at: "2025-04-08T10:55", liters: 460, vessel: "T5" }, "MERR1");
  run({ type: "embotellado", date: "2025-04-09T08:00", sources: [all("NAR")], productId: "jov-nar" });
  clean("2025-04-10T07:00", "T3");
  trip("2025-04-10", "PNF2", 1048, { at: "2025-04-10T11:30", liters: 1046, vessel: "T1" }, "PNR2");
  clean("2025-04-10T15:00", "TF2");
  run({ type: "corte", date: "2025-04-11T09:00", sources: [all("NQ1"), all("NQ2"), all("NQ3")], merma: 70, vesselId: "TF2", name: "Malbec Neuquén N1" }, ["NQ"]);
  clean("2025-04-12T08:00", "TF1");
  run({ type: "corte", date: "2025-04-11T10:00", sources: [all("PNR1"), all("PNR2")], vesselId: "T1", name: "Pinot Noir M2" }, ["PN"]);
  trip("2025-04-15", "NQ", 600, { at: "2025-04-15T11:45", liters: 599, vessel: "T3" }, "NQR", "El remito de papel lo declaraba como «Malbec M1».");
  run({ type: "embotellado", date: "2025-04-16T08:00", sources: [all("SEMB")], productId: "jov-sem" });
  clean("2025-04-17T08:00", "T2");
  trip("2025-04-22", "MAL2", 1500, { at: "2025-04-22T10:50", liters: 1496, vessel: "T4" }, "MALR2");
  run({ type: "corte", date: "2025-04-23T09:00", sources: [all("MALR1"), all("MALR2")], vesselId: "T4", name: "Malbec M1" }, ["MAL"]);

  // ---- Crianza: mayo 2025 ----
  run({ type: "crianza_llenado", date: "2025-05-06T09:00", sources: [S("PN", 900)], vesselIds: ["B01", "B02", "B03", "B04"] });
  run({ type: "crianza_llenado", date: "2025-05-06T11:00", sources: [S("MAL", 900)], vesselIds: ["B05", "B06", "B07", "B08"] });
  run({ type: "crianza_llenado", date: "2025-05-08T09:00", sources: [all("MERR1")], merma: 10, vesselIds: ["B09", "B10"] });
  clean("2025-05-09T08:00", "T5");
  const cfb = run({ type: "crianza_llenado", date: "2025-05-13T09:00", sources: [S("CF2", 450)], vesselIds: ["B11", "B12"] });
  L["CFB1"] = cfb.lots[0]!.id;
  L["CFB2"] = cfb.lots[1]!.id;
  run({ type: "corte", date: "2025-05-20T09:00", sources: [all("NQR"), S("MAL", 401)], vesselId: "T3", name: "Base de guarda" }, ["BASE"]);
  const gb = run({ type: "crianza_llenado", date: "2025-05-20T11:00", sources: [S("BASE", 675)], vesselIds: ["B13", "B14", "B15"] });
  run({ type: "embotellado", date: "2025-05-27T08:00", sources: [S("PN", 1144)], productId: "jov-pn" });
  run({ type: "embotellado", date: "2025-05-27T13:00", sources: [S("MAL", 2190)], productId: "jov-mal" });
  clean("2025-05-28T08:00", "T1");
  clean("2025-05-28T09:00", "T4");
  trip("2025-06-10", "MER2", 1000, { at: "2025-06-10T11:20", liters: 997, vessel: "T1" }, "MERR2");
  trip("2025-06-26", "MAL2", 595, null, "MALT");

  // ---- Cabernet Franc: 6 meses de barrica cortado 50/50 con vino sin barrica ----
  run({ type: "corte", date: "2025-11-13T09:00", sources: [S("CFB1"), S("CFB2"), S("CF2", 450)], vesselId: "T5", name: "Cabernet Franc M6" }, ["CFC"]);
  clean("2025-11-14T08:00", "B11");
  clean("2025-11-14T08:30", "B12");

  // ---- Reunión y embotellado 2026 ----
  const pnBarrels = db.lots.filter((l) => ["B01", "B02", "B03", "B04"].includes(l.vesselId ?? "")).map((l) => ({ lotId: l.id, liters: l.litersIn }));
  run({ type: "crianza_reunion", date: "2026-03-10T09:00", sources: pnBarrels, merma: 18, vesselId: "T4", name: "Pinot Noir M2 viñas 1958" }, ["PNI"]);
  const malBarrels = db.lots.filter((l) => ["B05", "B06", "B07", "B08"].includes(l.vesselId ?? "")).map((l) => ({ lotId: l.id, liters: l.litersIn }));
  run({ type: "crianza_reunion", date: "2026-03-10T11:00", sources: malBarrels, merma: 18, vesselId: "T2", name: "Malbec M1 viñas 1958" }, ["MALI"]);
  run({
    type: "corte",
    date: "2026-03-17T09:00",
    sources: [...gb.lots.map((l) => ({ lotId: l.id, liters: l.litersIn })), S("BASE", 325), S("CF2", 60)],
    merma: 21,
    vesselId: "T3",
    name: "Corte de guarda",
  }, ["GUA"]);
  run({ type: "embotellado", date: "2026-04-07T08:00", sources: [all("PNI")], productId: "ico-pn" });
  clean("2026-04-07T14:00", "T4");
  const merBarrels = db.lots.filter((l) => ["B09", "B10"].includes(l.vesselId ?? "")).map((l) => ({ lotId: l.id, liters: l.litersIn }));
  run({ type: "crianza_reunion", date: "2026-04-08T09:00", sources: merBarrels, merma: 9, vesselId: "T4", name: "Merlot M4 viñas 1958" }, ["MERI"]);
  run({ type: "embotellado", date: "2026-04-14T08:00", sources: [all("MALI")], productId: "ico-mal" });
  run({ type: "embotellado", date: "2026-04-16T08:00", sources: [S("GUA", 600)], productId: "cri-gua" });
  run({ type: "embotellado", date: "2026-04-21T08:00", sources: [S("GUA", lotIn("GUA") - 600)], productId: "cri-gua" });
  run({ type: "embotellado", date: "2026-04-28T08:00", sources: [all("MERI")], productId: "ico-mer" });
  return db;
}
