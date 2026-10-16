/**
 * Bouchon de `next/headers` — `headers()` et `cookies()` sont asynchrones en Next 16.
 * Magasin en mémoire, remis à zéro par `resetHeadersMock()`.
 */
export type CookieOptions = {
  httpOnly?: boolean; secure?: boolean; sameSite?: "lax" | "strict" | "none";
  path?: string; maxAge?: number; expires?: Date;
};

const cookieJar = new Map<string, string>();
const cookieOptions = new Map<string, CookieOptions>();

/** Options passées au dernier `set` d'un cookie (pour les assertions). */
export function cookieOptionsOf(name: string): CookieOptions | undefined {
  return cookieOptions.get(name);
}
let headerBag = new Headers();

export async function headers() {
  return headerBag;
}

export async function cookies() {
  return {
    get: (name: string) => (cookieJar.has(name) ? { name, value: cookieJar.get(name)! } : undefined),
    getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
    has: (name: string) => cookieJar.has(name),
    // Les options (httpOnly, secure, maxAge…) sont acceptées et conservées pour inspection.
    set: (name: string, value: string, options?: CookieOptions) => {
      cookieJar.set(name, value);
      if (options) cookieOptions.set(name, options);
      else cookieOptions.delete(name);
    },
    delete: (name: string) => {
      cookieJar.delete(name);
      cookieOptions.delete(name);
    },
  };
}

export function setHeaders(init: Record<string, string>) {
  headerBag = new Headers(init);
}

export function resetHeadersMock() {
  cookieJar.clear();
  cookieOptions.clear();
  headerBag = new Headers();
}
