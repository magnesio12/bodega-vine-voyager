import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Btn, Field, Notice, PageTitle, inputCls } from "@/components/bodega/ui";
import { annulMovement, BodegaError } from "@/lib/bodega/engine";
import { MOVEMENT_LABEL, fmtDateTime, fmtL } from "@/lib/bodega/format";
import { getAdminKey, getDb, resetSeed, setAdminKey, setDb, useDb, useDerived } from "@/lib/bodega/store";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administración · Bodega Miras" },
      { name: "description", content: "Panel protegido por clave: reiniciar datos semilla, anular movimientos y cambiar la clave." },
      { property: "og:title", content: "Administración · Bodega Miras" },
      { property: "og:description", content: "Panel de administración protegido por clave." },
    ],
  }),
  component: Admin,
});

const SESSION = "bodega-miras:admin-ok";

function Admin() {
  const [ok, setOk] = useState(false);
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    setOk(window.sessionStorage.getItem(SESSION) === "1");
  }, []);
  if (!ok)
    return (
      <div className="max-w-sm">
        <PageTitle title="Administración" sub="Ingresá la clave del panel." />
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (key === getAdminKey()) {
              window.sessionStorage.setItem(SESSION, "1");
              setOk(true);
            } else setErr("Clave incorrecta.");
          }}
        >
          <Field label="Clave"><input type="password" className={inputCls} value={key} onChange={(e) => setKey(e.target.value)} autoFocus /></Field>
          {err && <Notice kind="error">{err}</Notice>}
          <Btn type="submit">Entrar</Btn>
        </form>
      </div>
    );
  return <Panel onLogout={() => { window.sessionStorage.removeItem(SESSION); setOk(false); }} />;
}

function Panel({ onLogout }: { onLogout: () => void }) {
  const db = useDb();
  const d = useDerived();
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [newKey, setNewKey] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const recent = [...d.active].reverse().slice(0, 40);
  const annul = (id: string) => {
    try {
      setDb(annulMovement(getDb(), id));
      setMsg({ kind: "ok", text: `Movimiento ${id} anulado.` });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof BodegaError ? e.message : String(e) });
    }
  };
  const exportJson = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }));
    a.download = "bodega-miras-datos.json";
    a.click();
  };
  return (
    <div className="max-w-3xl">
      <PageTitle title="Administración"><Btn variant="ghost" onClick={onLogout}>Salir</Btn></PageTitle>
      {msg && <div className="mb-3"><Notice kind={msg.kind}>{msg.text}</Notice></div>}
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-md border bg-card p-3">
          <h2 className="text-xl">Datos semilla</h2>
          <p className="mb-2 text-sm text-muted-foreground">Borra todo lo registrado en este navegador y vuelve a cargar la vendimia 2025 de ejemplo.</p>
          {confirmReset ? (
            <div className="flex gap-2">
              <Btn variant="warn" onClick={() => { resetSeed(); setConfirmReset(false); setMsg({ kind: "ok", text: "Datos semilla recargados." }); }}>Confirmar reinicio</Btn>
              <Btn variant="ghost" onClick={() => setConfirmReset(false)}>Cancelar</Btn>
            </div>
          ) : <Btn variant="ghost" onClick={() => setConfirmReset(true)}>Reiniciar datos semilla</Btn>}
          <Btn variant="ghost" className="mt-2" onClick={exportJson}>Exportar datos (JSON)</Btn>
        </section>
        <section className="rounded-md border bg-card p-3">
          <h2 className="text-xl">Clave del panel</h2>
          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (newKey.length < 6) return setMsg({ kind: "error", text: "La clave debe tener al menos 6 caracteres." }); setAdminKey(newKey); setNewKey(""); setMsg({ kind: "ok", text: "Clave actualizada en este navegador." }); }}>
            <Field label="Nueva clave"><input type="password" className={inputCls} value={newKey} onChange={(e) => setNewKey(e.target.value)} /></Field>
            <Btn type="submit">Guardar clave</Btn>
          </form>
        </section>
      </div>
      <section className="mt-4">
        <h2 className="mb-2 text-2xl">Anular movimientos</h2>
        <p className="mb-2 text-sm text-muted-foreground">Solo se anula un movimiento cuyos lotes no tengan descendientes.</p>
        <ul className="divide-y rounded-md border bg-card text-sm">
          {recent.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-1.5">
              <span className="min-w-0">
                <span className="num font-medium">{m.id}</span> {MOVEMENT_LABEL[m.type]}{m.data.remito && ` ${m.data.remito}`}
                <span className="num block text-xs text-muted-foreground">
                  {fmtDateTime(m.date)} · {m.outputs.map((o) => d.lots.get(o)?.code).join(", ") || m.data.vesselId}
                  {m.sources.length > 0 && ` · ${fmtL(m.sources.reduce((s, x) => s + x.liters, 0))}`}
                </span>
              </span>
              <button onClick={() => annul(m.id)} className="shrink-0 text-xs underline">Anular</button>
            </li>
          ))}
        </ul>
        <Link to="/" className="mt-3 inline-block text-sm underline">Volver al tablero</Link>
      </section>
    </div>
  );
}
