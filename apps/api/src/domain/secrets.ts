import crypto from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer | null {
  const secret = process.env.SECRETS_ENCRYPTION_KEY;
  if (!secret) return null;
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(plainText: string): string {
  const key = getEncryptionKey();
  if (!key) return plainText;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

export function decryptSecret(encryptedText: string): string {
  const key = getEncryptionKey();
  if (!key) return encryptedText;

  const parts = encryptedText.split(":");
  if (parts.length !== 3) return encryptedText;

  try {
    const [ivHex, tagHex, encrypted] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return encryptedText;
  }
}
