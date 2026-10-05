import { describe, expect, it } from "vitest";
import { formatIban, isValidBic, isValidEmail, isValidIban, vatLooksValid } from "../../src/lib/validators";

describe("field validators", () => {
  it("checks IBAN checksums", () => {
    expect(isValidIban("NL91ABNA0417164300")).toBe(true);
    expect(isValidIban("nl91 abna 0417 1643 00")).toBe(true);
    expect(isValidIban("DE89370400440532013000")).toBe(true);
    expect(isValidIban("NL91ABNA0417164301")).toBe(false); // one digit off
    expect(isValidIban("hello")).toBe(false);
  });
  it("formats IBANs in groups of four", () => {
    expect(formatIban("nl91abna0417164300")).toBe("NL91 ABNA 0417 1643 00");
  });
  it("checks BIC, VAT and email shape", () => {
    expect(isValidBic("ABNANL2A")).toBe(true);
    expect(isValidBic("ABNANL2AXXX")).toBe(true);
    expect(isValidBic("ABN")).toBe(false);
    expect(vatLooksValid("NL123456789B01", "NL")).toBe(true);
    expect(vatLooksValid("DE123456789", "NL")).toBe(false);
    expect(vatLooksValid("ATU12345678", "AT")).toBe(true);
    expect(isValidEmail("a@b.nl")).toBe(true);
    expect(isValidEmail("a@b")).toBe(false);
  });
});
