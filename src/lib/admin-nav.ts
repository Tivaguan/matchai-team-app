// The owners' backoffice pages, in the order they appear in the top bar.
// Each inner list is one group of pages that sit together.
export const ADMIN_GROUPS = [
  [{ href: "/admin/cash", label: "Cash" }],
  [{ href: "/admin/stock", label: "Stock" }],
  [{ href: "/admin/team", label: "Team" }],
] as const;

export const ALERTS_HREF = "/admin/alerts";

export function isOnPage(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
