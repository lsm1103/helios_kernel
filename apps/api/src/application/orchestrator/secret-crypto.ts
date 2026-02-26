import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function keyFromSecret(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

function currentSecret(): string {
  return process.env.HELIOS_SECRET_KEY?.trim() || "helios-dev-secret";
}

export function encryptSecret(plainText: string): string {
  if (!plainText) {
    return "";
  }

  const key = keyFromSecret(currentSecret());
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(value: string): string {
  if (!value) {
    return "";
  }

  if (!value.startsWith("v1:")) {
    return value;
  }

  const parts = value.split(":");
  if (parts.length !== 4) {
    throw new Error("Invalid encrypted secret format");
  }

  const [, ivB64, tagB64, cipherB64] = parts;
  const key = keyFromSecret(currentSecret());
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const encrypted = Buffer.from(cipherB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return plain.toString("utf8");
}

export function maskSecret(value: string): string {
  if (!value) {
    return "";
  }

  if (value.length <= 6) {
    return "***";
  }

  const prefix = value.slice(0, 3);
  const suffix = value.slice(-2);
  return `${prefix}***${suffix}`;
}
