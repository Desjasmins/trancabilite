import { loadSnapshot } from "@/lib/queries";
import { AppProvider } from "@/components/app-context";
import { AppRoot } from "@/components/app-root";
import { DbSetupNotice } from "@/components/db-setup-notice";

export const dynamic = "force-dynamic";

export default async function Home() {
  let snapshot;
  try {
    snapshot = await loadSnapshot();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return <DbSetupNotice message={message} />;
  }

  return (
    <AppProvider initial={snapshot}>
      <AppRoot />
    </AppProvider>
  );
}
