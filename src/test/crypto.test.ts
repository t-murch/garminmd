import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt, generateEncryptionKey } from "@/lib/utils/crypto";

describe("crypto", () => {
  const testKey = "a".repeat(64); // 32 bytes of 0xaa

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = testKey;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("encrypt/decrypt roundtrip", () => {
    const plaintext = "super secret token 123!@#";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(":")).toHaveLength(3);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("produces different ciphertext for same input (random IV)", () => {
    const plaintext = "same input";
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  it("throws on missing ENCRYPTION_KEY", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt("test")).toThrow(
      "ENCRYPTION_KEY environment variable is required",
    );
  });

  it("throws on invalid key length", () => {
    process.env.ENCRYPTION_KEY = "tooshort";
    expect(() => encrypt("test")).toThrow("64 hex characters");
  });

  it("throws on tampered ciphertext", () => {
    const encrypted = encrypt("test");
    const parts = encrypted.split(":");
    const ciphertextHex = parts[2] ?? "";
    const firstByte = parseInt(ciphertextHex.slice(0, 2) || "00", 16);
    const tamperedByte = (firstByte ^ 0x01).toString(16).padStart(2, "0");
    parts[2] = `${tamperedByte}${ciphertextHex.slice(2)}`;
    expect(() => decrypt(parts.join(":"))).toThrow();
  });

  it("generateEncryptionKey produces valid key", () => {
    const key = generateEncryptionKey();
    expect(key).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });
});
