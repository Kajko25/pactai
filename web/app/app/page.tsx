import { loadActivity } from "@/lib/activity";
import { toClientJobs } from "@/lib/client-types";
import { Dashboard } from "../components/Dashboard";

export const revalidate = 30;

export default async function DashboardPage() {
  const activity = await loadActivity();

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <h1 className="text-3xl font-extrabold">Dashboard</h1>
      <p className="mt-2 max-w-2xl text-muted">
        Your side of PactAI: what this wallet is on-chain, what it has earned or spent through the
        escrow, and every job it took part in.
      </p>

      <Dashboard jobs={toClientJobs(activity.jobs)} loadError={activity.error} />
    </div>
  );
}
