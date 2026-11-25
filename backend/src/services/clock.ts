// A NaN or non-Date clock is stored by the Mongo driver as 1970 and would make every time check
// pass or fail open, so services refuse it at the boundary.
export function assertValidNow(now: Date): void {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("Invalid clock value");
  }
}
