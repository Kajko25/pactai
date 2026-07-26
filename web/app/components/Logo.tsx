/**
 * The mark: two halves reaching for each other with value held between them.
 *
 * That is the whole protocol in one glyph — two parties who do not trust each
 * other, and money that sits in the gap until the work is proven. The dot is
 * mint (the release colour) inside an amber ring (the escrow colour), so the
 * logo uses the same vocabulary as every state badge in the app.
 */
export function LogoMark({ size = 24, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* left party */}
      <path
        d="M9 3.5A9 9 0 0 0 9 20.5"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* right party */}
      <path
        d="M15 3.5A9 9 0 0 1 15 20.5"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* the escrow: value held in the gap */}
      <circle
        cx="12"
        cy="12"
        r="4.25"
        stroke="var(--amber)"
        strokeWidth="1.5"
        className={animated ? "logo-ring" : undefined}
      />
      <circle cx="12" cy="12" r="2" fill="var(--mint)" />
    </svg>
  );
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <LogoMark size={size} animated />
      <span className="font-bold tracking-tight">PactAI</span>
    </span>
  );
}
