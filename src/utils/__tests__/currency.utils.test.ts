import { describe, expect, it } from "vitest";
import { moneyToNumber } from "../currency.utils.js";

describe("currency.utils - moneyToNumber", () => {
  it("should convert a BRL formatted string to number", () => {
    expect(moneyToNumber("R$ 1.234,56")).toBe(1234.56);
  });

  it("should handle strings without currency symbol", () => {
    expect(moneyToNumber("1.234,56")).toBe(1234.56);
  });

  it("should handle strings with dots and commas swapped or differently placed", () => {
    expect(moneyToNumber("R$ 114,00")).toBe(114);
    expect(moneyToNumber("R$ 1.000")).toBe(1000);
  });

  it("should return the number if a number is passed", () => {
    expect(moneyToNumber(123.45 as any)).toBe(123.45);
  });

  it("should return 0 for empty or invalid strings", () => {
    expect(moneyToNumber("")).toBe(0);
    expect(moneyToNumber(null as any)).toBe(0);
    expect(moneyToNumber(undefined as any)).toBe(0);
  });
});
