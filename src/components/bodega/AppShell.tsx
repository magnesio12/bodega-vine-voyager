import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

const NAV = [
  { to: "/", label: "Tablero" },
  { to: "/recipientes", label: "Recipientes" },
  { to: "/movimiento", label: "Movimiento" },
  { to: "/lotes", label: "Lotes" },
  { to: "/remitos", label: "Remitos" },
  { to: "/validador", label: "Validador" },
  { to: "/retiro", label: "Retiro" },
  { to: "/admin", label: "Admin" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 pt-2">
          <Link to="/" className="leading-none">
            <span className="font-display text-xl font-semibold text-ink">Bodega Miras</span>
            <span className="ml-2 text-[11px] uppercase tracking-widest text-muted-foreground">Trazabilidad</span>
          </Link>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-mq" />Mainqué</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-full bg-fo" />F. Oro</span>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 py-2 [scrollbar-width:none]">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              activeProps={{ className: "bg-primary text-primary-foreground hover:bg-primary" }}
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-3 py-4">{children}</main>
      <footer className="mx-auto max-w-6xl px-3 pb-6 text-[11px] text-muted-foreground">
        Sistema de trazabilidad · Datos guardados en este navegador
      </footer>
    </div>
  );
}
