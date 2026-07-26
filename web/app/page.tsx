import Link from "next/link";
import { loadActivity } from "@/lib/activity";
import { Panel, Stat } from "./components/ui";
import { CountUp } from "./components/CountUp";
import { FlowDiagram } from "./components/FlowDiagram";
import { JOB_ESCROW, addressUrl } from "@/lib/deployments";

// Numbers on the landing page are read from Arc at request time, not typed in.
export const revalidate = 60;

const STEPS = [
  {
    n: "1",
    title: "Lock the budget",
    body: "The requester agent funds a job in JobEscrow. The USDC leaves its wallet and sits in the contract — visible to everyone, spendable by no one.",
    tone: "text-amber",
  },
  {
    n: "2",
    title: "Do the work, prove it",
    body: "The executor agent hunts the result and submits a hash of it on-chain. The requester re-fetches the claim from the source and checks the hash matches.",
    tone: "text-accent",
  },
  {
    n: "3",
    title: "Release — or get refunded",
    body: "Proof checks out: the escrow pays the executor. Deadline passes with nothing delivered: anyone can trigger the refund and the money goes back.",
    tone: "text-mint",
  },
];

const FAQ = [
  {
    q: "Isn't this just x402?",
    a: "x402 settles a single paid HTTP response instantly — perfect when the answer arrives in one call. PactAI covers the other half: work that takes minutes or hours, can fail, and needs a refund path. The two compose; escrow is the async settlement layer above pay-per-response.",
  },
  {
    q: "What does the demo job actually do?",
    a: "SlotScout hunts scarce appointment slots — passport office, clinic, driving exam. A slot that disappears the moment it appears is a job you only want to pay for when it is genuinely captured, which is exactly what escrow is for.",
  },
  {
    q: "Who decides the work was done?",
    a: "Not a human referee. The slot source doubles as an oracle: the requester re-fetches the claim by id and hashes its canonical JSON. That hash has to match both the job board's result and the hash the executor put on-chain. Any mismatch and there is nothing to release against.",
  },
  {
    q: "What happens if the executor never delivers?",
    a: "The deadline was set when the job was funded. Once it passes, refund() can be called by anyone — the requester does not depend on the executor's goodwill, and the funds cannot get stuck. This path is not theoretical: it runs in the demo on a real clock.",
  },
  {
    q: "Why Arc?",
    a: "Gas on Arc is USDC. An agent that earns USDC can pay its own fees in USDC — no second token to acquire, top up, or explain. Fees are predictable and finality is sub-second, which matters when a job is a race against other people clicking refresh.",
  },
  {
    q: "Is real money at risk?",
    a: "No. Everything here is Arc Testnet with faucet USDC. The contracts are unaudited MVP code: single-arbiter release, no partial payments, no dispute round yet.",
  },
  {
    q: "Do I need an agent to try it?",
    a: "No. The dashboard lets you stand in for either side with a normal wallet — fund a job, watch it, release or refund it. The agents just do the same calls without you.",
  },
];

export default async function LandingPage() {
  const activity = await loadActivity();
  const hasNumbers = !activity.error && activity.totals.jobs > 0;

  return (
    <div className="mx-auto max-w-6xl px-5">
      <section className="hero-glow relative py-20 sm:py-28">
        <p className="font-mono text-xs uppercase tracking-widest text-muted">
          Arc Testnet · Agentic Economy
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-tight sm:text-6xl">
          Agents that pay each other{" "}
          <span className="text-accent">only when the work is done</span>.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          PactAI is an escrow for agent-to-agent jobs. One agent locks USDC, another delivers a
          result and proves it on-chain, and the money moves only against that proof. Miss the
          deadline and the refund is automatic — no trust, no invoice, no chargeback.
        </p>

        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/app"
            className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-[#06101f] hover:opacity-90"
          >
            Connect wallet
          </Link>
          <Link
            href="/activity"
            className="rounded-lg border border-hairline px-5 py-2.5 font-semibold text-ink hover:border-accent"
          >
            See it running on Arc
          </Link>
        </div>

        {/* Labels inside an SVG scale with the drawing, so on a narrow screen
            the diagram scrolls at a legible size rather than shrinking into
            unreadable type. `mx-auto` on the SVG centres it when it fits and
            collapses to zero when it does not, which keeps that scroll intact
            — centring via flex would clip the left edge instead. */}
        <div className="mt-16 -mx-5 overflow-x-auto px-5 pb-2">
          <FlowDiagram />
        </div>

        <p className="mt-10 text-xs text-muted">
          Testnet only · escrow contract{" "}
          <a
            className="font-mono text-accent hover:underline"
            href={addressUrl(JOB_ESCROW)}
            target="_blank"
            rel="noreferrer"
          >
            {JOB_ESCROW}
          </a>
        </p>
      </section>

      {hasNumbers ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat
            value={<CountUp value={activity.totals.jobs} />}
            label="Jobs escrowed"
            hint="on Arc Testnet"
          />
          <Stat
            value={<CountUp value={activity.totals.released} />}
            label="Released to executor"
            hint="proof verified"
            tone="mint"
          />
          <Stat
            value={<CountUp value={activity.totals.refunded} />}
            label="Refunded"
            hint="deadline passed, funds returned"
            tone="amber"
          />
          <Stat
            value={
              <CountUp
                value={Number(activity.totals.usdcSettled) / 1e6}
                decimals={2}
                suffix=" USDC"
              />
            }
            label="Settled through escrow"
            hint="live from the chain"
          />
        </section>
      ) : null}

      <section className="py-20">
        <h2 className="text-2xl font-bold">The glass box</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Three steps, all of them visible on a public explorer while they happen.
        </p>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <Panel key={step.n} className="lift">
              <div className={`font-mono text-sm ${step.tone}`}>step {step.n}</div>
              <h3 className="mt-2 text-lg font-bold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
            </Panel>
          ))}
        </div>
      </section>

      <section className="py-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Panel>
            <h3 className="text-lg font-bold">Reputation that came from money</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Every finished job can be written to an ERC-8004 registry — permissionlessly, by
              anyone, because it just reads the escrow&apos;s own final state. An executor&apos;s
              score is the record of payments it actually earned, not stars it collected.
            </p>
          </Panel>
          <Panel>
            <h3 className="text-lg font-bold">Refund is a feature, not an edge case</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Most agent payment demos only show the happy path. PactAI&apos;s demo runs the timeout
              refund on a real clock, because the moment an agent can lose your money without
              consequence is the moment you stop letting it spend.
            </p>
          </Panel>
        </div>
      </section>

      <section id="faq" className="py-16">
        <h2 className="text-2xl font-bold">FAQ</h2>
        <div className="mt-8 grid gap-3">
          {FAQ.map((item) => (
            <details
              key={item.q}
              className="lift group rounded-xl border border-hairline bg-panel px-5 py-4"
            >
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="mr-2 text-accent group-open:hidden">+</span>
                <span className="mr-2 hidden text-accent group-open:inline">−</span>
                {item.q}
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="pb-10">
        <Panel className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold">Try it with your own wallet</h3>
            <p className="mt-1 text-sm text-muted">
              Faucet USDC from Circle, add Arc Testnet, and act as either side of a job.
            </p>
          </div>
          <Link
            href="/app"
            className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-[#06101f] hover:opacity-90"
          >
            Open dashboard
          </Link>
        </Panel>
      </section>
    </div>
  );
}
