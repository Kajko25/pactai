/**
 * The escrow, running.
 *
 * A payment leaves the requester, stops dead in the middle — visibly held,
 * not in flight — and only then continues to the executor. Every so often it
 * takes the other exit instead and goes home. Those two outcomes are the
 * entire product, and showing them beats another three-column explainer.
 *
 * Pure SVG plus CSS motion paths: no JS, no library, and it switches off
 * completely under `prefers-reduced-motion`.
 */
export function FlowDiagram() {
  return (
    <svg
      viewBox="0 0 640 210"
      className="mx-auto block w-full min-w-[560px] max-w-4xl"
      role="img"
      aria-label="A USDC payment moves from the requester into the escrow, waits there, then continues to the executor — or returns to the requester when the deadline passes."
    >
      {/* refund arc — drawn first so the release line sits on top */}
      <path
        id="pact-refund-path"
        d="M 320 105 C 320 30, 90 30, 80 105"
        fill="none"
        stroke="var(--red)"
        strokeOpacity="0.35"
        strokeWidth="1.5"
        strokeDasharray="5 6"
      />
      <text x="200" y="34" textAnchor="middle" className="flow-label" fill="var(--red)">
        refund on timeout
      </text>

      {/* the money's path: requester → escrow → executor */}
      <path
        d="M 80 105 H 560"
        fill="none"
        stroke="var(--border)"
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* travelling value */}
      <circle r="6" fill="var(--mint)" className="flow-dot" />
      <circle r="5" fill="var(--red)" className="flow-dot-refund" />

      {/* nodes */}
      <Node x={80} y={105} color="var(--accent)" label="Requester" sub="locks the budget" />
      <EscrowNode />
      <Node x={560} y={105} color="var(--mint)" label="Executor" sub="paid on proof" />
    </svg>
  );
}

function Node({
  x,
  y,
  color,
  label,
  sub,
}: {
  x: number;
  y: number;
  color: string;
  label: string;
  sub: string;
}) {
  return (
    <g>
      <circle cx={x} cy={y} r="18" fill="var(--panel)" stroke={color} strokeWidth="2" />
      <circle cx={x} cy={y} r="5" fill={color} />
      <text x={x} y={y + 42} textAnchor="middle" className="flow-node-label" fill="var(--text)">
        {label}
      </text>
      <text x={x} y={y + 60} textAnchor="middle" className="flow-label" fill="var(--muted)">
        {sub}
      </text>
    </g>
  );
}

function EscrowNode() {
  return (
    <g>
      <circle
        cx="320"
        cy="105"
        r="30"
        fill="var(--panel)"
        stroke="var(--amber)"
        strokeWidth="2"
        className="escrow-ring"
      />
      <circle cx="320" cy="105" r="30" fill="none" stroke="var(--amber)" strokeOpacity="0.25" strokeWidth="1" />
      <text x="320" y="110" textAnchor="middle" className="flow-node-label" fill="var(--amber)">
        escrow
      </text>
      <text x="320" y="163" textAnchor="middle" className="flow-label" fill="var(--muted)">
        nobody can spend it here
      </text>
    </g>
  );
}
