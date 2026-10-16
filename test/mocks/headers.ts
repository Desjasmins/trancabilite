/**
 * Bouchon de `next/headers` — `headers()` et `cookies()` sont asynchrones en Next 16.
 * Magasin en mémoire, remis à zéro par `resetHeadersMock()`.
 */
const cookieJar = new Map<string, string>();
let headerBag = new Headers();

export async function headers() {
  return headerBag;
}

export async function cookies() {
  return {
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    has: (name: string) => cookieJar.has(name),
    set: (name: string, value: string) => {
      cookieJar.set(name, value);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
    },
  };
}

export function setHeaders(init: Record<string, string>) {
  headerBag = new Headers(init);
}

export function resetHeadersMock() {
  cookieJar.clear();
  headerBag = new Headers();
}
