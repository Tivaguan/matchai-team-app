// Photos of Moroccan notes and coins, so a tile is recognised before its number is read.
// Sources and credits are listed in the README.

const NOTES = new Set(["200", "100", "50", "20"]);

// Coins are shown at roughly their real relative sizes.
const COIN_SCALE: Record<string, string> = {
  "10": "h-full",
  "5": "h-[92%]",
  "2": "h-[88%]",
  "1": "h-[80%]",
  "0.5": "h-[72%]",
};

export function MoneyPicture({ value, className = "" }: { value: string; className?: string }) {
  const isNote = NOTES.has(value);

  return (
    <span className={`flex items-center ${className}`} aria-hidden="true">
      {/* Plain img on purpose: small local files, no resizing needed. */}
      <img
        src={`/money/${value}.${isNote ? "jpg" : "png"}`}
        alt=""
        draggable={false}
        className={isNote ? "max-h-full w-auto shadow-sm" : `${COIN_SCALE[value] ?? "h-full"} w-auto drop-shadow-sm`}
      />
    </span>
  );
}
