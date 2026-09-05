// Session key used to trigger the one-time "rules debrief" popup right after
// a successful login/signup. Set before redirecting to "/"; the dashboard
// reads (and clears) it once so the popup only appears immediately after login.
export const RULES_ONBOARDING_KEY = "x034.rules_onboarding_pending";

/** Flag a just-authenticated session so the dashboard shows the rules popup. */
export function markRulesOnboardingPending() {
  try {
    sessionStorage.setItem(RULES_ONBOARDING_KEY, "1");
  } catch {
    // storage unavailable — the popup is skipped, sign-in still works
  }
}
