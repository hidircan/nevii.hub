import { cacheClassForPath, cacheFileKey, cacheUserPrefix, isEntryFresh, CACHE_VERSION, type CacheEntry, type CacheKeyInput } from "./cache-keys";
import { recordCachePurge, recordCacheRead, recordCacheWrite } from "./stats";

/**
 * Read-cache deposu (Faz 7). Kalıcılık: uygulama-özel dosya dizini
 * (expo-file-system `documentDirectory`) — iOS sandbox + Android internal
 * storage; başka uygulama okuyamaz. SecureStore YALNIZCA küçük secret'lar
 * (token) içindir — liste/ekran verisi buraya yazılmaz.
 *
 * Depolama erişimi tembel (lazy) + best-effort: FileSystem yoksa
 * (node test ortamı) tüm işlemler sessiz no-op — ekranlar ağ yolundan
 * çalışmaya devam eder. Birim testler bellek backend'i kullanır.
 */

export type CacheBackend = {
  readText(key: string): Promise<string | null>;
  writeText(key: string, text: string): Promise<void>;
  remove(key: string): Promise<void>;
  removePrefix(prefix: string): Promise<void>;
};

type FileSystemLike = {
  documentDirectory: string | null;
  readAsStringAsync(path: string): Promise<string>;
  writeAsStringAsync(path: string, text: string): Promise<void>;
  deleteAsync(path: string, opts?: { idempotent?: boolean }): Promise<void>;
  makeDirectoryAsync(path: string, opts?: { intermediates?: boolean }): Promise<void>;
  readDirectoryAsync(path: string): Promise<string[]>;
  getInfoAsync(path: string): Promise<{ exists: boolean; isDirectory?: boolean; modificationTime?: number; size?: number }>;
};

const CACHE_ROOT_SEGMENT = "neviihub-read-cache";
const MAX_ENTRIES = 200;
const MAX_ENTRY_BYTES = 512 * 1024;

let fileBackend: CacheBackend | null | undefined;

function loadFileSystem(): FileSystemLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-file-system") as FileSystemLike;
    if (!mod?.documentDirectory) return null;
    return mod;
  } catch {
    return null;
  }
}

function getFileBackend(): CacheBackend | null {
  if (fileBackend !== undefined) return fileBackend;
  const loaded = loadFileSystem();
  if (!loaded) {
    fileBackend = null;
    return null;
  }
  const FS: FileSystemLike = loaded;
  const root = `${FS.documentDirectory}${CACHE_ROOT_SEGMENT}`;
  const full = (key: string) => `${root}/${key}`;
  const dirOf = (key: string) => full(key).split("/").slice(0, -1).join("/");

  async function listAll(prefix: string): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: string, rel: string): Promise<void> => {
      let names: string[];
      try {
        names = await FS.readDirectoryAsync(dir);
      } catch {
        return;
      }
      for (const name of names) {
        const child = `${dir}/${name}`;
        const childRel = rel ? `${rel}/${name}` : name;
        if (!childRel.startsWith(prefix) && !prefix.startsWith(childRel)) continue;
        const info = await FS.getInfoAsync(child);
        if (info.isDirectory) await walk(child, childRel);
        else if (childRel.startsWith(prefix)) out.push(childRel);
      }
    };
    await walk(root, "");
    return out;
  }

  async function evictIfNeeded(): Promise<void> {
    try {
      const keys = await listAll("");
      if (keys.length <= MAX_ENTRIES) return;
      const withTime = await Promise.all(
        keys.map(async (k) => ({ k, mtime: (await FS.getInfoAsync(full(k))).modificationTime ?? 0 }))
      );
      withTime.sort((a, b) => a.mtime - b.mtime);
      for (const victim of withTime.slice(0, keys.length - MAX_ENTRIES)) {
        await FS.deleteAsync(full(victim.k), { idempotent: true });
      }
    } catch {
      // best-effort
    }
  }

  fileBackend = {
    async readText(key) {
      try {
        return await FS.readAsStringAsync(full(key));
      } catch {
        return null;
      }
    },
    async writeText(key, text) {
      try {
        if (text.length > MAX_ENTRY_BYTES) return;
        await FS.makeDirectoryAsync(dirOf(key), { intermediates: true });
        await FS.writeAsStringAsync(full(key), text);
        await evictIfNeeded();
      } catch {
        // best-effort
      }
    },
    async remove(key) {
      try {
        await FS.deleteAsync(full(key), { idempotent: true });
      } catch {
        // best-effort
      }
    },
    async removePrefix(prefix) {
      try {
        for (const k of await listAll(prefix)) {
          await FS.deleteAsync(full(k), { idempotent: true });
        }
      } catch {
        // best-effort
      }
    },
  };
  return fileBackend;
}

/** Testler için bellek backend'i (üretimde kullanılmaz). */
export function createMemoryBackend(): CacheBackend & { keys(): string[] } {
  const map = new Map<string, string>();
  return {
    keys: () => [...map.keys()],
    async readText(key) {
      return map.get(key) ?? null;
    },
    async writeText(key, text) {
      map.set(key, text);
    },
    async remove(key) {
      map.delete(key);
    },
    async removePrefix(prefix) {
      for (const k of [...map.keys()]) {
        if (k.startsWith(prefix)) map.delete(k);
      }
    },
  };
}

export type CacheRead<T> = { entry: CacheEntry<T> | null; fresh: boolean };

export async function readCacheEntry<T>(
  backend: CacheBackend | null,
  input: CacheKeyInput,
  nowMs = Date.now()
): Promise<CacheRead<T>> {
  if (!backend) return { entry: null, fresh: false };
  const cls = cacheClassForPath(input.path);
  if (!cls) return { entry: null, fresh: false };
  const raw = await backend.readText(cacheFileKey(input));
  if (!raw) {
    recordCacheRead(false, false);
    return { entry: null, fresh: false };
  }
  try {
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (parsed?.v !== CACHE_VERSION || parsed.path !== input.path || !parsed.savedAt) {
      await backend.remove(cacheFileKey(input));
      recordCacheRead(false, false);
      return { entry: null, fresh: false };
    }
    const fresh = isEntryFresh(parsed, cls, nowMs);
    recordCacheRead(true, fresh);
    return { entry: parsed, fresh };
  } catch {
    // Bozuk kayıt: sil, miss say (eski/bozuk hassas veri gösterilmez).
    await backend.remove(cacheFileKey(input));
    recordCacheRead(false, false);
    return { entry: null, fresh: false };
  }
}

export async function writeCacheEntry<T>(
  backend: CacheBackend | null,
  input: CacheKeyInput,
  data: T,
  nowMs = Date.now()
): Promise<void> {
  if (!backend) return;
  if (!cacheClassForPath(input.path)) return;
  const entry: CacheEntry<T> = { v: CACHE_VERSION, path: input.path, savedAt: new Date(nowMs).toISOString(), data };
  await backend.writeText(cacheFileKey(input), JSON.stringify(entry));
  recordCacheWrite();
}

export async function removeCacheEntry(backend: CacheBackend | null, input: CacheKeyInput): Promise<void> {
  if (!backend) return;
  await backend.remove(cacheFileKey(input));
  recordCachePurge();
}

/** Logout/tenant-değişimi: kullanıcının TÜM cache'i silinir. */
export async function clearUserCache(tenantId: string, userId: string): Promise<void> {
  const backend = getFileBackend();
  if (!backend) return;
  await backend.removePrefix(cacheUserPrefix(tenantId, userId));
  recordCachePurge();
}

/** Üretim backend erişimi (hook içinden; testler memory backend verir). */
export function getProductionBackend(): CacheBackend | null {
  return getFileBackend();
}
