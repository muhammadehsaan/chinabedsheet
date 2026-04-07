const MONEY_SCALE = 2;
const PERCENT_SCALE = 2;
const TEN = 10n;

const normalizeDecimalInput = (value) => {
  if (value === null || value === undefined) {
    return "0";
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return "0";
    }

    const text = value.toString();
    if (text.includes("e") || text.includes("E")) {
      return value.toFixed(20).replace(/\.?0+$/, "");
    }
    return text;
  }

  return String(value).trim() || "0";
};

const roundDiv = (numerator, denominator) => {
  if (denominator === 0n) {
    throw new Error("Division by zero");
  }

  const half = denominator / 2n;
  if (numerator >= 0n) {
    return (numerator + half) / denominator;
  }

  return (numerator - half) / denominator;
};

const toScaledInteger = (value, scale = MONEY_SCALE) => {
  let input = normalizeDecimalInput(value);

  if (!/^-?\d+(\.\d+)?$/.test(input)) {
    const parsed = Number(input);
    input = Number.isFinite(parsed) ? parsed.toFixed(scale + 6) : "0";
  }

  const negative = input.startsWith("-");
  if (negative) {
    input = input.slice(1);
  }

  const [integerPartRaw, fractionPartRaw = ""] = input.split(".");
  const integerPart = integerPartRaw.replace(/^0+(?=\d)/, "") || "0";
  const required = scale + 1;
  const paddedFraction = (fractionPartRaw + "0".repeat(required)).slice(0, required);
  const retainedFraction = paddedFraction.slice(0, scale);
  const guardDigit = Number(paddedFraction[scale] || "0");

  let scaled = BigInt(`${integerPart}${retainedFraction || ""}` || "0");
  if (guardDigit >= 5) {
    scaled += 1n;
  }

  return negative ? -scaled : scaled;
};

const fromScaledInteger = (value, scale = MONEY_SCALE) => {
  const units = typeof value === "bigint" ? value : BigInt(value || 0);
  const divisor = TEN ** BigInt(scale);
  const abs = units < 0n ? -units : units;
  const whole = abs / divisor;
  const fraction = (abs % divisor).toString().padStart(scale, "0");
  const numeric = Number(`${whole.toString()}.${fraction}`);

  return units < 0n ? -numeric : numeric;
};

export const toMoneyMinor = (value) => toScaledInteger(value, MONEY_SCALE);
export const toPercentMinor = (value) => toScaledInteger(value, PERCENT_SCALE);
export const fromMoneyMinor = (value) => fromScaledInteger(value, MONEY_SCALE);

export const roundMoney = (value) => fromMoneyMinor(toMoneyMinor(value));

export const calcTaxAmount = (baseAmount, gstPercent) => {
  const baseMinor = toMoneyMinor(baseAmount);
  const percentMinor = toPercentMinor(gstPercent);
  const taxMinor = roundDiv(baseMinor * percentMinor, 10000n);

  return fromMoneyMinor(taxMinor);
};

export const calcSalePrice = (purchasePrice, marginPercent) => {
  const purchaseMinor = toMoneyMinor(purchasePrice);
  const marginMinor = toPercentMinor(marginPercent);
  const marginAmountMinor = roundDiv(purchaseMinor * marginMinor, 10000n);

  return fromMoneyMinor(purchaseMinor + marginAmountMinor);
};

export const calcPurchaseLineTotals = ({ quantity, unitCost, gstPercent }) => {
  const qty = Number(quantity || 0);
  const safeQty = Number.isFinite(qty) && qty > 0 ? Math.floor(qty) : 0;
  const cost = roundMoney(unitCost);
  const gst = roundMoney(gstPercent);
  const base = roundMoney(safeQty * cost);
  const tax = calcTaxAmount(base, gst);
  const total = roundMoney(base + tax);

  return {
    quantity: safeQty,
    unitCost: cost,
    gstPercent: gst,
    base,
    tax,
    total,
  };
};
