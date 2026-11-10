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

/** A milk carton with a folded top and a blank label, for stock. */
export function MilkIcon({ className }: IconProps) {
  return (
    <Silhouette className={className}>
      <path d="M22 3h20v7H22Z" />
      <path d="M22 12h20l6 11H16l6-11Z" />
      <path d="M16 26h32v34H16V26Zm6 9v12h20V35H22Z" />
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
