import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Encrypts calendar_connections' OAuth tokens before they're ever
// written to Postgres, and decrypts them after reading -- Postgres
// itself never sees a plaintext token or holds the key, it just stores
// an opaque ciphertext column. AES-256-GCM: authenticated encryption, so
// a tampered/corrupted ciphertext fails to decrypt loudly rather than
// silently returning garbage.
//
// CALENDAR_TOKEN_ENC_KEY can be any length the operator pastes in --
// hashing it to a fixed 32 bytes via SHA-256 avoids a footgun where a
// key that's the "wrong" length throws deep inside Node's crypto module
// instead of failing clearly at startup.
function encryptionKey(): Buffer {
  const secret = process.env.CALENDAR_TOKEN_ENC_KEY;
  if (!secret) {
    throw new Error(
      "CALENDAR_TOKEN_ENC_KEY is not set -- calendar token storage has nothing to encrypt with.",
    );
  }
  return createHash("sha256").update(secret).digest();
}

const IV_LENGTH = 12; // 96-bit nonce, the standard/recommended size for GCM

// Output shape: "<iv>:<authTag>:<ciphertext>", each base64 -- self-
// contained per value, no separate column needed for the IV/tag.
export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decryptToken(stored: string): string {
  const [ivB64, authTagB64, ciphertextB64] = stored.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Malformed encrypted token value.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
