import { cn } from "@/lib/utils";

/** The Gemini spark, drawn as a four-point star in Google's gradient. This is
 *  our own rendering for attribution — swap in the official asset from
 *  Google's brand resources if you want the exact mark. */
export function GeminiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label="Google Gemini"
      className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id="gemini-spark" x1="0" y1="24" x2="24" y2="0">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="45%" stopColor="#9B72CB" />
          <stop offset="100%" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        fill="url(#gemini-spark)"
        d="M12 0c0 6.627 5.373 12 12 12-6.627 0-12 5.373-12 12 0-6.627-5.373-12-12-12C6.627 12 12 6.627 12 0Z"
      />
    </svg>
  );
}
