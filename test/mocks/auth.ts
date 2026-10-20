import { vi } from "vitest";

/**
 * Bouchon de `@/lib/auth` : seul `auth.api.getSession` existe, comme sur Better Auth.
 * Forme rendue : `{ session, user } | null`. Par défaut : aucune session.
 */
export type MockSession = {
  session: { id: string; userId: string; token: string; expiresAt: Date };
  user: { id: string; name: string; email?: string; role: string | null; banned?: boolean | null };
} | null;

export const auth = {
  api: { getSession: vi.fn<(opts?: { headers: Headers }) => Promise<MockSession>>(async () => null) },
};

/** Règle la session rendue par `auth.api.getSession`. */
export function setSession(session: MockSession) {
  auth.api.getSession.mockResolvedValue(session);
}

/** Construit une session complète pour un utilisateur donné. */
export function sessionFor(user: NonNullable<MockSession>["user"]): NonNullable<MockSession> {
  return {
    session: { id: `s-${user.id}`, userId: user.id, token: "jeton-factice", expiresAt: new Date("2099-01-01T00:00:00Z") },
    user,
  };
}
