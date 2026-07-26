# PactAI — 3-minute demo script

Spoken lines are in English. Everything is live on Arc Testnet; nothing is
faked or pre-rendered. Total speaking time is about 2:40, which leaves room for
the transactions to confirm.

## Before you hit record

- [ ] `SLOT_AUTO_SPAWN_MS=20000 bun run slot-source` and `cd web && npm run dev`
- [ ] MetaMask holds **both** keys: Wallet B (requester) and `0xA3A2…4829` (executor, agent #1)
- [ ] Both accounts are on Arc Testnet and Wallet B shows a USDC balance
- [ ] Browser: notifications off, bookmarks bar hidden, zoom ~110% so the text reads on a small screen
- [ ] A second tab is already open on the Activity page
- [ ] Screen recorder captures the MetaMask popup (it is a browser extension window — test one transaction first)

**Record continuously, cut afterwards.** The refund needs a real three-minute
wait. Leave it running, then cut that gap in the edit with a "3 minutes later"
caption. Do not try to rush the chain.

---

## 0:00 — 0:20 · The hook

> **On screen:** the landing page, with the payment animating through the escrow.

"It's 8 a.m. A passport office releases one appointment slot. Forty people are
refreshing that page. It is gone in eleven seconds.

You could hire someone to watch for you. But then you are paying up front and
hoping. That is the problem PactAI solves — for agents, and for the people
behind them."

---

## 0:20 — 0:35 · What it is

> **On screen:** stay on the landing page; the diagram is doing the explaining.

"One agent hires another and the money goes into escrow on Arc. It is released
only against proof that the work was done. Miss the deadline, and the refund is
automatic. No invoice, no trust, no chargeback."

---

## 0:35 — 1:30 · The half nobody demos: the refund

> **On screen:** `/app`, the Post a job form. Facility `clinic-warsaw`,
> executor `0xA3A2…`, amount 0.10, deadline **3 minutes**.

"Let me start with the case that goes wrong, because that is the one that
decides whether you would ever let an agent hold your money.

I'm posting a job for a clinic slot. Ten cents, three-minute deadline."

> Approve, then Fund. Point at the countdown.

"The USDC has left my wallet. It is in the escrow contract now — I cannot spend
it, and neither can the executor."

> Switch to the executor account. Hit **Hunt for slots**. It comes back empty.

"Here I am the executor. I search. There is nothing — this slot may simply never
appear. That is an honest outcome, not a failure of the protocol."

> **CUT — "3 minutes later"**. Come back with the countdown at zero and the
> button now reading *Refund (deadline passed)*. Wait 20–30 seconds past zero
> before clicking, or the chain will reject it.

"The deadline passed. And now look at who can press this: **anyone**. Not just
me, not an arbitrator, not a support ticket. The money goes back because time
passed, and that is enforced by the contract."

> Click. Show the state flip to **Refunded**.

---

## 1:30 — 2:30 · The half that pays: proof, then release

> **On screen:** post a second job. Facility `passport-office-krakow`, executor
> `0xA3A2…`, amount 0.10, deadline 30 minutes.

"Now the same thing, done right."

> Approve, Fund. Switch to the executor account, scroll to *Work assigned to
> you*, fill the terms, **Hunt for slots**.

"As the executor I hunt again — and this time a slot is open. I claim it before
anyone else does, and I commit a fingerprint of what I captured to the escrow."

> Claim, then **Submit result on-chain**. Copy the claim id.

"That fingerprint is all the contract stores. Which is a problem: a
thirty-two-byte hash tells a human nothing."

> Switch back to the requester. Paste the claim id, press **Fetch & verify**.

"So the dashboard does what the agent does. It fetches the record back from the
source — not from the executor, whose copy proves nothing — re-computes the
fingerprint, and answers four questions in plain language."

> Let the four green checks sit on screen for a beat.

"Same hash. Right office. Appointment early enough. Captured by the agent I
actually hired. Now I know what I am paying for."

> Click **Release payment**.

"Released. The executor is paid, in the same second, on-chain."

---

## 2:30 — 2:50 · Reputation

> **On screen:** click **Record outcome**, then switch to the Activity tab and
> reload.

"One more step, and anyone can take it — not just me. This writes the outcome
into an ERC-8004 registry. It cannot be gamed, because it does not ask anyone's
opinion: it reads the escrow's own final state.

So this agent's score is not stars. It is the record of payments it actually
earned."

---

## 2:50 — 3:00 · Close

> **On screen:** the Activity page, full history.

"Everything you just saw is on Arc Testnet — gas paid in USDC, so an agent that
earns USDC can pay its own fees. Escrow, proof, refund, reputation. That is
PactAI."

---

## If it runs long, cut in this order

1. The reputation section (2:30–2:50) — it is the most explainable in a caption.
2. The second **Hunt for slots** — claim the slot off-camera and cut to the
   captured claim.
3. The opening hook down to one sentence: "One slot, forty people refreshing,
   gone in eleven seconds."

Never cut the refund. It is the only part of this demo that a pay-per-call
payment rail cannot do at all.
