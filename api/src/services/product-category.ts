/** Rule-based product category from title + retailer. */
export function classifyProductCategory(productName: string, siteId: string): string {
  const t = productName.toLowerCase();
  if (/shampoo|conditioner|serum|moistur|cream|lotion|spf|sunscreen|deodorant|hairspray|parfum|cosmetic|makeup|lipstick|mascara/.test(t)) {
    return "cosmetics";
  }
  if (/snack|biscuit|chips|juice|milk|yogurt|food|nutrition/.test(t)) {
    return "food";
  }
  if (siteId.includes("nykaa") || siteId.includes("myntra")) return "cosmetics";
  if (siteId.includes("blinkit") || siteId.includes("zepto")) return "grocery";
  return "general";
}
