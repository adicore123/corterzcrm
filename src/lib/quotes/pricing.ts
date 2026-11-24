/** Monetary values are expressed in agorot to avoid floating-point currency errors. */
export type QuotePriceInput = {
  quantity: number;
  unitPriceAgorot: number;
  totalPriceAgorot?: number;
  discount: { type: "none" } | { type: "amount"; agorot: number } | { type: "percent"; basisPoints: number };
};

export function calculateQuotePrice(input: QuotePriceInput) {
  if (!Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 100000) throw new Error("כמות לא תקינה");
  if (!Number.isSafeInteger(input.unitPriceAgorot) || input.unitPriceAgorot < 0) throw new Error("מחיר לא תקין");
  const subtotal = input.totalPriceAgorot ?? input.quantity * input.unitPriceAgorot;
  if (input.totalPriceAgorot !== undefined && (!Number.isSafeInteger(input.totalPriceAgorot) || input.totalPriceAgorot < 0)) throw new Error("מחיר לכמות לא תקין");
  if (!Number.isSafeInteger(subtotal)) throw new Error("סכום ההצעה גדול מדי");
  let discount = 0;
  if (input.discount.type === "amount") {
    discount = input.discount.agorot;
    if (!Number.isSafeInteger(discount) || discount < 0 || discount > subtotal) throw new Error("סכום ההנחה אינו תקין");
  } else if (input.discount.type === "percent") {
    const { basisPoints } = input.discount;
    if (!Number.isSafeInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new Error("אחוז ההנחה אינו תקין");
    // Integer quotient and remainder avoid an unsafe intermediate multiplication.
    discount = Math.floor(subtotal / 10000) * basisPoints + Math.round((subtotal % 10000) * basisPoints / 10000);
  }
  return { subtotalAgorot: subtotal, discountAgorot: discount, totalAgorot: subtotal - discount };
}

export function quoteTotal(input: QuotePriceInput & { vatMode: "included" | "excluded"; vatBasisPoints: number }) {
  const price = calculateQuotePrice(input);
  if (!Number.isSafeInteger(input.vatBasisPoints) || input.vatBasisPoints < 0 || input.vatBasisPoints > 10000) throw new Error("מע״מ לא תקין");
  const vatAgorot = input.vatMode === "excluded" ? Math.round(price.totalAgorot * input.vatBasisPoints / 10000) : 0;
  return { ...price, vatAgorot, payableAgorot: price.totalAgorot + vatAgorot };
}
