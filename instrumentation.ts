/**
 * Runs once at server startup. Warms the Supabase DNS cache and keep-alive
 * connection in the background so the first auth request doesn't pay the
 * cold-DNS penalty (~5s on this dev machine).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    import("./lib/supabase")
      .then(({ supabaseFetch }) => {
        supabaseFetch("/rest/v1/users?select=id&limit=1").catch(() => {});
      })
      .catch(() => {});
  }
}
