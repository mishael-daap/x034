import { randomInt } from "node:crypto";

// No ambiguous characters (I/O/0/1 excluded).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;

/** Generate an 8-char referral code. Uniqueness is enforced by the DB. */
export function generateReferralCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
