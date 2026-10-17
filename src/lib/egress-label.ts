import { AsyncLocalStorage } from "async_hooks";

/**
 * DB egress ölçümü (2026-10-17) — `egress:readData:full` log satırına çalışan Server Action'ın adını ekler.
 * Server Action'lar sayfa yolunda POST olarak loglanır (ör. `POST /panel/program`); rota tek başına hangi
 * işlemin tam okuma yaptığını söylemez. Sabit iç ad (PII yok); yalnız ölçüm içindir, davranışı değiştirmez.
 */
const als = new AsyncLocalStorage<string>();

export function withEgressLabel<T>(label: string, fn: () => Promise<T>): Promise<T> {
  return als.run(label, fn);
}

export function egressLabel(): string {
  return als.getStore() ?? "";
}
