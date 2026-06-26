import { headers } from "next/headers";
import { loadSnapshot } from "@/lib/queries";
import { auth } from "@/lib/auth";
import { AppProvider } from "@/components/app-context";
import { AppRoot } from "@/components/app-root";
import { DbSetupNotice } from "@/components/db-setup-notice";
import type { AuthUser } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function Home() {
  let snapshot;
  let user: AuthUser | null = null;
  try {
    const [snap, session] = await Promise.all([
      loadSnapshot(),
      auth.api.getSession({ headers: await headers() }),
    ]);
    snapshot = snap;
    if (session?.user) {
      user = {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: (session.user as { role?: string | null }).role ?? null,
      };
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return <DbSetupNotice message={message} />;
  }

  return (
    <AppProvider initial={snapshot} user={user}>
      <AppRoot />
    </AppProvider>
  );
}
