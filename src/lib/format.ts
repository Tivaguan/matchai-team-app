const moneyFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const quantityFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

const SHOP_TIME_ZONE = "Africa/Casablanca";

/** 1250.5 -> "1,250.50 MAD" */
export function formatMoney(amount: number | string) {
  return `${moneyFormat.format(Number(amount))} MAD`;
}

/** 1250.5 -> "1,250.50", for places where the currency is already clear. */
export function formatAmount(amount: number | string) {
  return moneyFormat.format(Number(amount));
}

/** 6.5, "L" -> "6.5 L" */
export function formatQuantity(quantity: number | string, unit = "") {
  const text = quantityFormat.format(Number(quantity));
  return unit ? `${text} ${unit}` : text;
}

/** A timestamp as shop time, e.g. "10:52". */
export function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: SHOP_TIME_ZONE }).format(
    new Date(timestamp),
  );
}

/** A day like "2026-11-10" as "Tue 10 Nov 2026". */
export function formatDay(day: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}

/** Today in the shop, as "2026-11-10". Call it in the browser only. */
export function shopToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: SHOP_TIME_ZONE }).format(new Date());
}
