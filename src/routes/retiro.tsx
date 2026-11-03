import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Btn, Field, PageTitle, Stat, inputCls } from "@/components/bodega/ui";
import { RECALL_HEADERS, recall, recallCsv } from "@/lib/bodega/engine";
import { fmtDate, fmtInt, fmtL, fmtPct } from "@/lib/bodega/format";
import { useDb, useDerived } from "@/lib/bodega/store";

export const Route = createFileRoute("/retiro")({
  head: () => ({
    meta: [
      { title: "Simulación de retiro · Bodega Miras" },
      { name: "description", content: "Dado un remito de traslado, qué lotes de botella están afectados y en qué proporción." },
      { property: "og:title", content: "Simulación de retiro · Bodega Miras" },
      { property: "og:description", content: "Lotes de botella afectados por un remito, exportable a CSV." },
    ],
  }),
  component: Recall,
});

function Recall() {
  const db = useDb();
  const d = useDerived();
  const trips = d.active.filter((m) => m.type === "traslado");
  const [mid, setMid] = useState(trips.find((m) => m.data.remito === "R-0005")?.id ?? trips[0]?.id ?? "");
  const r = mid && d.movements.get(mid) ? recall(db, mid) : null;
  const download = () => {
    if (!r) return;
    const blob = new Blob(["\ufeff" + recallCsv(r)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `retiro-${r.remito}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const origin = r ? d.lots.get(r.movement.sources[0].lotId) : undefined;
  return (
    <div>
      <PageTitle title="Simulación de retiro" sub="Recorre el grafo hacia adelante multiplicando las proporciones de cada arista y sumando caminos alternativos." />
      <Field label="Remito de traslado">
        <select className={inputCls} value={mid} onChange={(e) => setMid(e.target.value)}>
          {trips.map((m) => {
            const l = d.lots.get(m.sources[0].lotId);
            return <option key={m.id} value={m.id}>{m.data.remito} · {fmtDate(m.date)} · {l?.name} · {fmtL(m.data.sentLiters ?? 0)}</option>;
          })}
        </select>
      </Field>
      {r && (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            Origen: {origin && <Link to="/lotes/$id" params={{ id: origin.id }} className="num underline">{origin.code}</Link>} {origin?.name}{r.movement.note && ` · ${r.movement.note}`}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Stat label="Lotes de botella" value={r.bottles.length} warn={r.bottles.length > 0} />
            <Stat label="Litros afectados" value={fmtL(r.totalLiters)} />
            <Stat label="Botellas afectadas" value={fmtInt(r.totalBottles)} />
          </div>
          <div className="mt-4 flex items-center justify-between">
            <h2 className="text-2xl">Lotes de botella afectados</h2>
            <Btn onClick={download} disabled={!r.bottles.length}>Exportar CSV</Btn>
          </div>
          {r.bottles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún lote embotellado contiene vino de este remito.</p>
          ) : (
            <>
              <div className="mt-2 hidden overflow-x-auto rounded-md border bg-card md:block">
                <table className="num w-full text-sm">
                  <thead className="bg-muted text-left text-xs text-ink">
                    <tr>{RECALL_HEADERS.map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {r.bottles.map((b) => (
                      <tr key={b.lotId} className="border-t">
                        {b.cells.map((c, i) => <td key={i} className="px-2 py-1.5">{i === 0 ? <Link to="/lotes/$id" params={{ id: b.lotId }} className="underline">{c}</Link> : c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="mt-2 space-y-2 md:hidden">
                {r.bottles.map((b) => (
                  <li key={b.lotId} className="rounded-md border border-l-4 border-l-mq bg-card p-2">
                    <dl className="num grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                      {b.cells.map((c, i) => (
                        <div key={i} className="contents">
                          <dt className="text-muted-foreground">{RECALL_HEADERS[i]}</dt>
                          <dd>{i === 0 ? <Link to="/lotes/$id" params={{ id: b.lotId }} className="underline">{c}</Link> : c}</dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}
          {r.stock.length > 0 && (
            <>
              <h2 className="mt-5 text-2xl">Vino afectado todavía en bodega</h2>
              <ul className="num mt-1 divide-y rounded-md border bg-card text-sm">
                {r.stock.map((s) => (
                  <li key={s.lot.id} className="flex justify-between gap-2 px-3 py-1.5">
                    <span><Link to="/lotes/$id" params={{ id: s.lot.id }} className="underline">{s.lot.code}</Link> {s.lot.name} · {s.lot.vesselId}</span>
                    <span>{fmtPct(s.fraction)} · {fmtL(s.liters)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
