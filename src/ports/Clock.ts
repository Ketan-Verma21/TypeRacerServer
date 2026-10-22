/** Time as a dependency, so tests can control it (FakeClock). */
export interface Clock {
    now(): number; // ms since epoch
}
