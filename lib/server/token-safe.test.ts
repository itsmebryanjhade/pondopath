import { randomBytes } from "node:crypto";
vi.mock("server-only", () => ({}));
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openToken, sealToken } from "./token-safe";

const key = () => randomBytes(32).toString("base64");
describe("token safe", () => {
  beforeEach(() => vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", key()));
  afterEach(() => vi.unstubAllEnvs());
  it("seals and opens a token", () => {
    const sealed = sealToken("1//fictional-refresh-token");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("fictional-refresh-token");
    expect(openToken(sealed)).toBe("1//fictional-refresh-token");
  });
  it("two seals of the same token differ", () => {
    expect(sealToken("same")).not.toBe(sealToken("same"));
  });
  it("tampered ciphertext fails closed", () => {
    const sealed = sealToken("secret-value");
    const [version, nonce, body] = sealed.split(".");
    const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
    expect(() => openToken([version, nonce, flipped].join("."))).toThrow("TOKEN_UNREADABLE");
    expect(() => openToken("v2.x.y")).toThrow("TOKEN_UNREADABLE");
  });
  it("a different key cannot open it, and errors never contain the token", () => {
    const sealed = sealToken("secret-value");
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", key());
    try { openToken(sealed); expect.unreachable(); } catch (error) {
      expect((error as Error).message).toBe("TOKEN_UNREADABLE");
      expect(String((error as Error).stack)).not.toContain("secret-value");
    }
  });
  it("a missing or wrong-size key is a configuration error", () => {
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", "");
    expect(() => sealToken("x")).toThrow("GOOGLE_NOT_CONFIGURED");
    vi.stubEnv("GOOGLE_TOKEN_ENCRYPTION_KEY", randomBytes(16).toString("base64"));
    expect(() => sealToken("x")).toThrow("GOOGLE_NOT_CONFIGURED");
  });
});
