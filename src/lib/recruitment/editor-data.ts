import { runWithTenantAsync } from "../tenant-context";

/** İlan editörü için şube + etkin enstrüman listesi. */
export async function loadEditorLookups(tenantId: string): Promise<{ branches: { id: string; name: string }[]; instruments: string[] }> {
  const { readData } = await import("../store");
  const data = await runWithTenantAsync(tenantId, () => readData());
  let instruments: string[] = [];
  try {
    const { resolveActiveInstrumentNames } = await import("../instrument-catalog");
    instruments = await resolveActiveInstrumentNames(tenantId);
  } catch {
    instruments = [];
  }
  return { branches: data.settings.branches.map((b) => ({ id: b.id, name: b.name })), instruments };
}
