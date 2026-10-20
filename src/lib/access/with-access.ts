import "server-only";

import { POLICIES, type ActionName } from "@/app/actions/policies";
import type { ActionResult } from "@/app/actions/_shared";
import { allowed, refusal, type Actor } from "./policy";
import { getActor } from "./actor";
import { floorEnforced } from "./flag";
import type { ErrorCode } from "./errors";

type Handler = (input: unknown, actor: Actor) => Promise<ActionResult>;

const refuse = (error: ErrorCode): ActionResult => ({ ok: false, error });

/**
 * Garde d'une Server Action (#3). La politique vient du tableau unique POLICIES :
 * un nom absent est refusé (défaut fermé), avant toute lecture de session ou de base.
 */
export function withAccess(name: ActionName, handler: Handler) {
  return async (input: unknown): Promise<ActionResult> => {
    const policy = Object.hasOwn(POLICIES, name) ? POLICIES[name] : undefined;
    if (!policy) return refuse("FORBIDDEN");
    try {
      const actor = await getActor({ mode: "action" });
      if (!allowed(policy, actor, floorEnforced())) return refuse(refusal(policy, actor));
      return await handler(input, actor);
    } catch (e) {
      // Le détail (connexion, SQL…) reste au journal serveur ; le client reçoit un code (D9).
      console.error(`[${name}]`, e);
      return refuse("GENERIC");
    }
  };
}
