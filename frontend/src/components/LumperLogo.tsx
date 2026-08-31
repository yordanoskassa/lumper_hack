/** The Lumper mark, verbatim from the shipping product
 *  (lumper_app/frontend/src/components/LumperLogo.tsx): an L built from two
 *  rounded rects with the orange dot in the corner. The dot is always #f97316;
 *  the L is ink or near-white, never orange. */
export function LumperLogo({ className, tone = "light" }: {
  className?: string;
  tone?: "light" | "ink";
}) {
  const color = tone === "ink" ? "#0a0a0a" : "#fafafa";
  return (
    <svg viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg"
      role="img" aria-label="Lumper" className={className}>
      <rect x="32" y="20" width="52" height="212" rx="8" fill={color} />
      <rect x="32" y="180" width="192" height="52" rx="8" fill={color} />
      <circle cx="196" cy="68" r="28" fill="#f97316" />
    </svg>
  );
}
