import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// Google refresh tokens are stored only as AES-256-GCM ciphertext: "v1.<nonce>.<ciphertext+tag>", all base64url.
function encryptionKey(): Buffer {
  const key = Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY ?? "", "base64");
  if (key.length !== 32) throw new Error("GOOGLE_NOT_CONFIGURED");
  return key;
}

export function sealToken(plain: string): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), nonce);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final(), cipher.getAuthTag()]);
  return ["v1", nonce.toString("base64url"), body.toString("base64url")].join(".");
}

export function openToken(sealed: string): string {
  const key = encryptionKey();
  try {
    const [version, nonce, body, extra] = sealed.split(".");
    if (version !== "v1" || !nonce || !body || extra !== undefined) throw new Error();
    const data = Buffer.from(body, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64url"));
    decipher.setAuthTag(data.subarray(data.length - 16));
    return Buffer.concat([decipher.update(data.subarray(0, data.length - 16)), decipher.final()]).toString("utf8");
  } catch {
    // Never include the sealed value or any decrypted bytes in the error.
    throw new Error("TOKEN_UNREADABLE");
  }
}
