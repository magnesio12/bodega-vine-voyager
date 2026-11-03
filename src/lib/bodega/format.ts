const nf1 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 0 });
const nf0 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

export const fmtL = (n: number) => `${nf1.format(round1(n))} L`;
export const fmtKg = (n: number) => `${nf0.format(n)} kg`;
export const fmtInt = (n: number) => nf0.format(n);
export const fmtNum = (n: number) => nf1.format(round1(n));
export const fmtPct = (f: number) => `${nf2.format(f * 100)} %`;
export const fmtPct1 = (f: number) => `${nf1.format(f * 100)} %`;
export const fmtMonths = (m: number) => `${nf1.format(Math.round(m * 10) / 10)} meses`;

export const round1 = (n: number) => Math.round(n * 10) / 10;

export function fmtDate(iso: string) {
  const d = iso.slice(0, 10);
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
export function fmtDateTime(iso: string) {
  const t = iso.split("T")[1];
  return t ? `${fmtDate(iso)} ${t.slice(0, 5)}` : fmtDate(iso);
}

export const PLANT_NAME = { MQ: "Planta Mainqué", FO: "Planta Fernández Oro" } as const;
export const PLANT_SHORT = { MQ: "Mainqué", FO: "Fernández Oro" } as const;

export const MOVEMENT_LABEL: Record<string, string> = {
  ingreso: "Ingreso de uva",
  descube: "Descube y trasiego",
  corte: "Corte",
  maceracion: "Maceración con pieles",
  crianza_llenado: "Crianza: llenado de barricas",
  crianza_reunion: "Crianza: reunión de barricas",
  traslado: "Traslado entre plantas",
  recepcion: "Recepción de traslado",
  embotellado: "Embotellado",
  limpieza: "Limpieza de recipiente",
};

export const LINE_LABEL = { joven: "Joven", liviana: "Liviana", crianza: "Crianza", icono: "Ícono" } as const;
