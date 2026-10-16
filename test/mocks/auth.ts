import { vi } from "vitest";

/**
 * Bouchon de `@/lib/auth`. Le vrai module n'exporte aujourd'hui que `auth`
 * (Better Auth) ; `getSession` est la forme attendue du futur module d'accès (TDD §11).
 * Par défaut : aucune session.
 */
export type MockSession = { user: { id: string; name: string; role: string | null; banned?: boolean } } | null;

export const getSession = vi.fn(async (): Promise<MockSession> => null);

export const auth = { api: { getSession } };

/** Règle la session renvoyée par les deux points d'entrée. */
export function setSession(session: MockSession) {
  getSession.mockResolvedValue(session);
}
