// Platform-level configuration (Phase 1, test currency).
// The earnings floor is a platform guarantee: no node owner should earn less
// than this for a completed job. It caps each job's pool size and is NOT
// shown to users.
export const PLATFORM_EARNINGS_FLOOR = 1.0;

// Nodes can't join a job's pool within this many hours before it starts.
export const COMMIT_WINDOW_HOURS = 1;
