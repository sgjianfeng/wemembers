import {
  enrichReceiptFields,
  guessAmountCentsFromText,
  guessLast4FromText,
  last4FromReceiptNumber,
} from "@/lib/receipt-parse";

describe("receipt-parse", () => {
  it("extracts last 4 from receipt number", () => {
    expect(last4FromReceiptNumber("INV-20260802-8841")).toBe("8841");
    expect(last4FromReceiptNumber("R#12")).toBe("12");
  });

  it("guesses TOTAL amount from text", () => {
    const raw = `
      Item A 10.00
      TOTAL S$128.50
      Change 0.50
    `;
    expect(guessAmountCentsFromText(raw)).toBe(12850);
  });

  it("guesses last4 from receipt line", () => {
    expect(guessLast4FromText("Receipt No: AB-9921\nTOTAL $50")).toBe("9921");
  });

  it("enriches OCR fields with fallbacks", () => {
    const r = enrichReceiptFields({
      totalAmountCents: null,
      receiptNumber: null,
      receiptLast4: null,
      rawText: "Bill No. 7788\nGrand Total: S$61.00",
    });
    expect(r.amountCents).toBe(6100);
    expect(r.receiptLast4).toBe("7788");
  });
});
