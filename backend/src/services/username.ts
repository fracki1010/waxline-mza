// Single source of truth for username keys: the lockout and the staff lookup must agree,
// or a variant spelling of the same name would dodge the lock.
export const normaliseUsername = (username: string): string => username.trim().toLowerCase();
