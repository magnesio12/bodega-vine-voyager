import { describe, expect, it } from "vitest";
import { annulMovement, applyMovement, conditions, derive, recall, recallCsv, validateLine } from "@/lib/bodega/engine";
import { buildSeed } from "@/lib/bodega/seed";
import type { Db } from "@/lib/bodega/types";

const lotBy = (db: Db, pred: (l: Db["lots"][number]) => boolean) => derive(db).lotList.find(pred)!;

/** Prepara 6.000 L disponibles en Fernández Oro (ingreso de M1 en PF2, previa limpieza). */
function withFoWine() {
  let db = buildSeed();
  db = applyMovement(db, { type: "limpieza", date: "2026-11-01T08:00", vesselId: "PF2" }).db;
  const r = applyMovement(db, { type: "ingreso", date: "2026-11-01T09:00", parcelId: "M1", kg: 7000, vesselId: "PF2" });
  return { db: r.db, lotId: r.lots[0]!.id };
}

describe("Reglas de trazabilidad", () => {
  it("1. un traslado de 6.000 L deja el lote en tránsito y no disponible", () => {
    const { db, lotId } = withFoWine();
    const t = applyMovement(db, { type: "traslado", date: "2026-11-03T08:00", sources: [{ lotId, liters: 6000 }] });
    const transit = t.lots[0]!;
    expect(transit.status).toBe("transito");
    expect(derive(t.db).balance(transit.id)).toBe(6000);
    expect(() =>
      applyMovement(t.db, { type: "embotellado", date: "2026-11-03T12:00", sources: [{ lotId: transit.id, liters: 1000 }], productId: "jov-mal" }),
    ).toThrow(/en tránsito/);
    const rec = applyMovement(t.db, { type: "recepcion", date: "2026-11-03T11:00", sources: [{ lotId: transit.id, liters: 6000 }], receivedLiters: 5990, vesselId: "T2" });
    expect(rec.lots[0]!.plant).toBe("MQ");
  });

  it("2. recepción con más de 0,3 % de diferencia se rechaza indicando la diferencia exacta", () => {
    const { db, lotId } = withFoWine();
    const t = applyMovement(db, { type: "traslado", date: "2026-11-03T08:00", sources: [{ lotId, liters: 6000 }] });
    expect(() =>
      applyMovement(t.db, { type: "recepcion", date: "2026-11-03T11:00", sources: [{ lotId: t.lots[0]!.id, liters: 6000 }], receivedLiters: 5980, vesselId: "T2" }),
    ).toThrow("Diferencia: 20 L (0,33 %)");
  });

  it("3. impide plantas distintas, superar capacidad y tomar más de lo disponible", () => {
    const { db, lotId } = withFoWine();
    expect(() => applyMovement(db, { type: "descube", date: "2026-11-02T08:00", sources: [{ lotId, liters: 1000 }], vesselId: "T2" })).toThrow(/plantas|Planta/);
    expect(() => applyMovement(db, { type: "descube", date: "2026-11-02T08:00", sources: [{ lotId, liters: 4000 }], vesselId: "TF1" })).toThrow(/capacidad/);
    expect(() => applyMovement(db, { type: "descube", date: "2026-11-02T08:00", sources: [{ lotId, liters: 5000 }], vesselId: "TF1" })).toThrow(/disponibles/);
    const fo = lotBy(db, (l) => l.vesselId === "TF2" && l.status === "activo" && derive(db).balance(l.id) > 0);
    const mq = lotBy(db, (l) => l.vesselId === "T1" && derive(db).balance(l.id) > 0);
    expect(() =>
      applyMovement(db, { type: "corte", date: "2026-11-02T08:00", sources: [{ lotId: fo.id, liters: 100 }, { lotId: mq.id, liters: 100 }], vesselId: "T2" }),
    ).toThrow(/plantas distintas/);
  });

  it("4. el corte de guarda con uva de Neuquén no es orgánico y se nombra el ancestro", () => {
    const db = buildSeed();
    const d = derive(db);
    const gua = d.lotList.find((l) => l.name === "Corte de guarda" && l.status === "activo")!;
    expect(conditions(d, gua.id).organic).toBe(false);
    const r = validateLine(d, gua.id, "crianza");
    expect(r.ok).toBe(false);
    const org = r.checks.find((c) => c.label === "Orgánico")!;
    expect(org.detail).toContain("parcela N1");
    expect(org.detail).toContain("R-0005");
  });

  it("5. 6 meses de barrica cortado 50/50 con vino sin barrica da 3 meses y no califica crianza", () => {
    const d = derive(buildSeed());
    const cfc = d.lotList.find((l) => l.name === "Cabernet Franc M6" && l.vesselId === "T5" && !l.parcelId)!;
    expect(conditions(d, cfc.id).months).toBeCloseTo(3, 6);
    expect(validateLine(d, cfc.id, "crianza").ok).toBe(false);
  });

  it("6. retiro del remito R-0005: lotes de botella, proporción y CSV idéntico a pantalla", () => {
    const db = buildSeed();
    const m = db.movements.find((x) => x.data.remito === "R-0005")!;
    const r = recall(db, m.id);
    expect(r.bottles.map((b) => b.cells[1])).toEqual(["Corte de guarda", "Corte de guarda"]);
    // BASE = 599 L de Neuquén + 401 L de Malbec M1 → 59,9 %; guarda = 675 (barricas) + 325 (tanque) + 60 CF ⇒ 1.000/1.060 de BASE
    const expected = (599 / 1000) * (1000 / 1060);
    expect(r.bottles[0]!.fraction).toBeCloseTo(expected, 9);
    expect(r.bottles[0]!.liters).toBeCloseTo(600 * expected, 6);
    const csv = recallCsv(r).split("\n");
    expect(csv.slice(1)).toEqual(r.bottles.map((b) => b.cells.join(";")));
  });

  it("7. no se anula un traslado con descendientes ni se embotella fuera de Mainqué", () => {
    const db = buildSeed();
    const m = db.movements.find((x) => x.data.remito === "R-0001")!;
    expect(() => annulMovement(db, m.id)).toThrow(/descendientes/);
    const fo = lotBy(db, (l) => l.vesselId === "TF2" && derive(db).balance(l.id) > 0);
    expect(() => applyMovement(db, { type: "embotellado", date: "2026-11-02T08:00", sources: [{ lotId: fo.id, liters: 100 }], productId: "jov-mal" })).toThrow(
      /Solo se embotella en Planta Mainqué/,
    );
  });

  it("la semilla es determinista y tiene 8 traslados, uno en tránsito", () => {
    const a = buildSeed();
    expect(JSON.stringify(a)).toBe(JSON.stringify(buildSeed()));
    expect(a.movements.filter((m) => m.type === "traslado")).toHaveLength(8);
    const d = derive(a);
    expect(d.lotList.filter((l) => l.status === "transito" && d.balance(l.id) > 0)).toHaveLength(1);
  });
});
