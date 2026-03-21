// Simple shared secret so only your own frontend can hit these API routes.
// The secret lives in .env.local — the browser never sees it.
export function verifySecret(request) {
  const secret = request.headers.get("x-internal-secret");
  return secret === process.env.INTERNAL_API_SECRET;
}
