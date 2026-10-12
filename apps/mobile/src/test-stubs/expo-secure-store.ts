/**
 * Node test ortamı için Expo SecureStore bellek sazı — gerçek cihaz
 * deposu yerine test başına izole bir Map kullanılır. Saf fonksiyon
 * testleri (`src/**`) dil zincirini (`locale-store`) sorunsuz içe aktarır.
 */
const memory = new Map<string, string>();

export async function getItemAsync(key: string): Promise<string | null> {
  return memory.get(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  memory.set(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  memory.delete(key);
}

export function __resetMemory(): void {
  memory.clear();
}
