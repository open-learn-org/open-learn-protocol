// Test issuer keypair used by the EduSSO validator to drive end-to-end flows
// against a tutor. The private key below is intentionally public — this issuer
// is for TESTING ONLY. Tutors should add it to their allow-list in staging
// environments and remove it before production.

import { importJWK, SignJWT, type CryptoKey } from "jose";

export const TEST_ISSUER = process.env.EDU_SSO_TEST_ISSUER ?? "https://test-issuer.openlearnprotocol.org";
export const TEST_KID = "test-issuer-2026-05";

export const TEST_PUBLIC_JWK = {
  kty: "OKP",
  crv: "Ed25519",
  x: "etXHaLrX-t3VKniHjaiu_Ei_9C8k0nQTd99d-eTj5KA",
  alg: "EdDSA",
  use: "sig",
  kid: TEST_KID,
} as const;

const TEST_PRIVATE_JWK = {
  kty: "OKP",
  crv: "Ed25519",
  x: "etXHaLrX-t3VKniHjaiu_Ei_9C8k0nQTd99d-eTj5KA",
  d: "ahYdFegARijhecstBGqusKEmiduqFg9xfa_3NWfXwWY",
  alg: "EdDSA",
} as const;

let cachedKey: CryptoKey | Uint8Array | null = null;

async function getPrivateKey() {
  if (cachedKey) return cachedKey;
  cachedKey = await importJWK(TEST_PRIVATE_JWK, "EdDSA");
  return cachedKey;
}

export async function mintTestToken(opts: {
  audience: string;
  email?: string;
  name?: string;
  emailVerified?: boolean;
  expiresIn?: string;
}): Promise<string> {
  const key = await getPrivateKey();
  return await new SignJWT({
    email: opts.email ?? "tester@test-issuer.openlearnprotocol.org",
    email_verified: opts.emailVerified ?? true,
    name: opts.name ?? "Test Student",
  })
    .setProtectedHeader({ alg: "EdDSA", kid: TEST_KID })
    .setIssuer(TEST_ISSUER)
    .setAudience(opts.audience)
    .setSubject("child:test")
    .setIssuedAt()
    .setExpirationTime(opts.expiresIn ?? "5m")
    .sign(key);
}
