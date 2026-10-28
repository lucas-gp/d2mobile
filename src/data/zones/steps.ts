/**
 * Lot 312: a zone's build cut into short steps (a generator that yields between them), so that the neighbour of a zone joined edge to
 * edge is built behind the play, a few milliseconds per idle period (src/sim/seam-worlds.ts); `runSteps` runs one whole, the same build.
 */
export type Steps<T> = Generator<void, T, void>;

/** The whole build at once (the zone is the same as built in steps) */
export function runSteps<T>(g: Steps<T>): T {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}
