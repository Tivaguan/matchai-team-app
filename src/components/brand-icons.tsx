// Solid silhouette icons, drawn in the style of the vessels on Matchai's printed menu.
// They take their color from the text color around them.

type IconProps = { className?: string };

function Silhouette({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 64 64" fill="currentColor" fillRule="evenodd" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

/** A matcha tin: lid, body, and a label band. */
export function TinIcon({ className }: IconProps) {
  return (
    <Silhouette className={className}>
      <rect x="15" y="6" width="34" height="11" rx="3" />
      <path d="M18 20h28v34a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5V20Zm5 12v12h18V32H23Z" />
    </Silhouette>
  );
}

/** A banknote, for cash taken from the drawer. */
export function NoteIcon({ className }: IconProps) {
  return (
    <Silhouette className={className}>
      <path d="M8 16h48a4 4 0 0 1 4 4v24a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V20a4 4 0 0 1 4-4Zm24 8a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM13 29a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm38 0a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    </Silhouette>
  );
}

/** The shop front, for opening and closing the day. */
export function ShopIcon({ className }: IconProps) {
  return (
    <Silhouette className={className}>
      <path d="M10 6h44l6 16a7 7 0 0 1-14 0 7 7 0 0 1-14 0 7 7 0 0 1-14 0 7 7 0 0 1-14 0L10 6Z" />
      <path d="M9 31h46v27H9V31Zm6 5v11h16V36H15Zm22 0v22h12V36H37Z" />
    </Silhouette>
  );
}
