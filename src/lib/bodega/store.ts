import { useMemo, useSyncExternalStore } from "react";
import { derive } from "./engine";
import { SEED_VERSION, buildSeed } from "./seed";
import type { Db } from "./types";

export const STORAGE_KEY = "bodega-miras:datos";
export const ADMIN_KEY_STORAGE = "bodega-miras:clave-admin";
/** Clave inicial del panel de administración (ver README). */
export const DEFAULT_ADMIN_KEY = "miras1958";

let seedCache: Db | null = null;
const seed = () => (seedCache ??= buildSeed());

let current: Db | null = null;
const listeners = new Set<() => void>();

function load(): Db {
  if (current) return current;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.version === SEED_VERSION) {
        current = parsed;
        return current;
      }
    }
  } catch {
    /* datos corruptos: se recarga la semilla */
  }
  current = seed();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  return current;
}

export function getDb(): Db {
  return typeof window === "undefined" ? seed() : load();
}

export function setDb(db: Db) {
  current = db;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  listeners.forEach((l) => l());
}

export function resetSeed() {
  seedCache = null;
  setDb(buildSeed());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
};

export function useDb(): Db {
  return useSyncExternalStore(subscribe, load, seed);
}

export function useDerived() {
  const db = useDb();
  return useMemo(() => derive(db), [db]);
}

export function getAdminKey() {
  return window.localStorage.getItem(ADMIN_KEY_STORAGE) || DEFAULT_ADMIN_KEY;
}
export function setAdminKey(k: string) {
  window.localStorage.setItem(ADMIN_KEY_STORAGE, k);
}

export function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
