import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateQuotePrice } from "../src/lib/quotes/pricing";

test("quote prices calculate quantity and discounts in whole agorot", () => {
  assert.deepEqual(calculateQuotePrice({ quantity: 3, unitPriceAgorot: 3333, totalPriceAgorot: 10000, discount: { type: "none" } }),
    { subtotalAgorot: 10000, discountAgorot: 0, totalAgorot: 10000 });
  assert.deepEqual(calculateQuotePrice({ quantity: 3, unitPriceAgorot: 199999, discount: { type: "percent", basisPoints: 1250 } }),
    { subtotalAgorot: 599997, discountAgorot: 75000, totalAgorot: 524997 });
  assert.deepEqual(calculateQuotePrice({ quantity: 2, unitPriceAgorot: 50000, discount: { type: "amount", agorot: 10000 } }),
    { subtotalAgorot: 100000, discountAgorot: 10000, totalAgorot: 90000 });
});

test("quote prices reject invalid quantities, discounts, and unsafe totals", () => {
  assert.throws(() => calculateQuotePrice({ quantity: 0, unitPriceAgorot: 100, discount: { type: "none" } }));
  assert.throws(() => calculateQuotePrice({ quantity: 1, unitPriceAgorot: 100, discount: { type: "amount", agorot: 101 } }));
  assert.throws(() => calculateQuotePrice({ quantity: 1, unitPriceAgorot: 100, discount: { type: "percent", basisPoints: 10001 } }));
  assert.throws(() => calculateQuotePrice({ quantity: 100000, unitPriceAgorot: Number.MAX_SAFE_INTEGER, discount: { type: "none" } }));
});
