/** Strip the credential before it ever leaves the server. */
export function sanitizeUser(user: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...user };
  delete copy.password_hash;
  return copy;
}
