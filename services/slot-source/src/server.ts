import { Hono } from "hono";
import type { Slot, SlotClaim } from "@pactai/shared";

/**
 * Mock appointment-slot source ("the agency website").
 *
 * Stands in for the real-world signal SlotScout hunts: scarce appointment
 * slots that appear at unpredictable times and disappear when someone claims
 * them. It doubles as the verification oracle — a claim can be re-fetched by
 * `claimId` by anyone, so the requester never has to trust the executor's
 * word (or bytes) about what was captured.
 *
 * Slots appear two ways:
 *   - POST /admin/spawn        (demo/e2e hook: force a slot into existence)
 *   - SLOT_AUTO_SPAWN_MS env   (background spawner, for a "live" demo feel)
 */

const slots = new Map<string, Slot>(); // open slots only
const claims = new Map<string, SlotClaim>(); // claimId -> claim

const app = new Hono();

function now(): number {
  return Math.floor(Date.now() / 1000);
}

function spawnSlot(facility: string, date?: number): Slot {
  const slot: Slot = {
    id: crypto.randomUUID(),
    facility,
    // default: an appointment ~3 days out
    date: date ?? now() + 3 * 24 * 3600,
    postedAt: now(),
  };
  slots.set(slot.id, slot);
  console.log(`[slot-source] slot appeared: ${slot.facility} @ ${slot.date} (${slot.id})`);
  return slot;
}

app.get("/slots", (c) => {
  const facility = c.req.query("facility");
  const open = [...slots.values()];
  return c.json(facility ? open.filter((s) => s.facility === facility) : open);
});

app.post("/slots/:id/claim", async (c) => {
  const slot = slots.get(c.req.param("id"));
  if (!slot) return c.json({ error: "slot gone" }, 409); // claimed or never existed

  const { claimant } = await c.req.json<{ claimant: string }>();
  if (!claimant) return c.json({ error: "claimant required" }, 400);

  slots.delete(slot.id); // a claimed slot is no longer available to anyone else
  const claim: SlotClaim = {
    claimId: crypto.randomUUID(),
    slotId: slot.id,
    facility: slot.facility,
    date: slot.date,
    claimant,
    claimedAt: now(),
  };
  claims.set(claim.claimId, claim);
  console.log(`[slot-source] slot ${slot.id} claimed by ${claimant} -> claim ${claim.claimId}`);
  return c.json(claim, 201);
});

// Verification oracle: anyone can re-fetch a claim record by id.
app.get("/claims/:id", (c) => {
  const claim = claims.get(c.req.param("id"));
  if (!claim) return c.json({ error: "not found" }, 404);
  return c.json(claim);
});

// Demo/e2e hook — not part of the protocol, just how the "real world" is
// simulated. In production this whole service is replaced by a scraper or an
// official booking API.
app.post("/admin/spawn", async (c) => {
  const { facility, date } = await c.req.json<{ facility: string; date?: number }>();
  if (!facility) return c.json({ error: "facility required" }, 400);
  return c.json(spawnSlot(facility, date), 201);
});

const autoSpawnMs = Number(process.env.SLOT_AUTO_SPAWN_MS ?? 0);
const autoSpawnFacility = process.env.SLOT_AUTO_SPAWN_FACILITY ?? "passport-office-krakow";
if (autoSpawnMs > 0) {
  setInterval(() => spawnSlot(autoSpawnFacility), autoSpawnMs);
  console.log(`[slot-source] auto-spawning a ${autoSpawnFacility} slot every ${autoSpawnMs}ms`);
}

const port = Number(process.env.PORT ?? 4100);
console.log(`[slot-source] listening on :${port}`);
export default { port, fetch: app.fetch };
