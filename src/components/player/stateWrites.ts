/**
 * Every course-state write this browser tab makes, in the order it made them.
 *
 * Bridge writes are whole values — storage.set carries the entire blob, last write
 * wins — which is only safe while writes land in the order they were made. The client
 * retries a write a gateway answered for (the API asleep), and unserialised, a write
 * waiting to retry could land after a newer one that went straight through and quietly
 * roll the learner's work back. So, per course-state key:
 *
 *   - One write in flight. A newer write waits; a newer one still replaces it rather
 *     than queueing too (the value in between would be overwritten a moment later),
 *     and the replaced caller settles with the write that replaced it.
 *   - Reads see writes that have not landed yet. latest() is the newest value this tab
 *     intends the key to hold; the bridge answers storage.get from it, so a course that
 *     reloads mid-write never starts from the server's older copy.
 *   - A write that finally fails is kept, not dropped, and sent again a little later —
 *     unless a newer write for the key comes first. Until it lands it counts as
 *     unsaved, which is what the player's leave-page warning checks.
 *
 * One instance per tab (the player module holds it), not per player: moving to another
 * session remounts the player, and a queue that died with it let a retry from the old
 * mount land on top of a write from the new one.
 *
 * A write's `run` must not itself write to its own key — it would wait on itself.
 */

export type StateOp = { kind: "set"; value: string } | { kind: "delete" };

type Settle = { resolve: () => void; reject: (error: unknown) => void };
type Job = {
  op: StateOp;
  run: (signal: AbortSignal) => Promise<void>;
  waiters: Settle[];
  /** How many times this job has been re-sent after failing. */
  resends: number;
};
type Lane = {
  busy: boolean;
  inFlight?: Job;
  pending?: Job;
  failed?: { job: Job; timer?: ReturnType<typeof setTimeout> };
};

export type StateWritesOptions = {
  /** Whether a final failure is worth sending again later (the API away, not a 4xx). */
  shouldResend: (error: unknown) => boolean;
  /** Delay before each re-send of a failed write. After the last, it stays unsaved. */
  resendDelaysMs: readonly number[];
};

export type ResendEvent = { key: string; ok: boolean };

export function createStateWrites({ shouldResend, resendDelaysMs }: StateWritesOptions) {
  const lanes = new Map<string, Lane>();
  const listeners = new Set<(event: ResendEvent) => void>();
  let controller = new AbortController();

  const notify = (event: ResendEvent) => {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A listener's failure must not strand the queue.
      }
    }
  };

  function forgetIfIdle(key: string, lane: Lane) {
    if (!lane.busy && !lane.pending && !lane.failed) lanes.delete(key);
  }

  async function drain(key: string, lane: Lane) {
    lane.busy = true;
    while (lane.pending) {
      const job = lane.pending;
      lane.pending = undefined;
      lane.inFlight = job;
      try {
        await job.run(controller.signal);
        lane.inFlight = undefined;
        for (const waiter of job.waiters) waiter.resolve();
        if (job.resends > 0) notify({ key, ok: true });
      } catch (error) {
        lane.inFlight = undefined;
        for (const waiter of job.waiters) waiter.reject(error);
        // Nothing newer is waiting to take its place, so this is still the newest
        // value the learner meant this key to hold: keep it, and try again later.
        if (!lane.pending && shouldResend(error)) keepFailed(key, lane, job);
        else if (job.resends > 0) notify({ key, ok: false });
      }
    }
    lane.busy = false;
    forgetIfIdle(key, lane);
  }

  function keepFailed(key: string, lane: Lane, job: Job) {
    const delay = resendDelaysMs[job.resends];
    const failed: NonNullable<Lane["failed"]> = { job };
    lane.failed = failed;
    if (job.resends > 0) notify({ key, ok: false });
    if (delay === undefined) return; // Out of re-sends: stays unsaved.
    failed.timer = setTimeout(() => {
      if (lane.failed !== failed) return; // A newer write came first.
      lane.failed = undefined;
      lane.pending = { ...job, waiters: [], resends: job.resends + 1 };
      if (!lane.busy) void drain(key, lane);
    }, delay);
  }

  return {
    /** Queue a write; resolves or rejects with the write that finally carries it. */
    write(key: string, op: StateOp, run: (signal: AbortSignal) => Promise<void>) {
      let lane = lanes.get(key);
      if (!lane) {
        lane = { busy: false };
        lanes.set(key, lane);
      }
      const current = lane;
      // A newer write supersedes one that failed and was waiting to be re-sent.
      if (current.failed) {
        clearTimeout(current.failed.timer);
        current.failed = undefined;
      }
      return new Promise<void>((resolve, reject) => {
        if (current.pending) {
          current.pending.op = op;
          current.pending.run = run;
          current.pending.waiters.push({ resolve, reject });
        } else {
          current.pending = { op, run, waiters: [{ resolve, reject }], resends: 0 };
        }
        if (!current.busy) void drain(key, current);
      });
    },

    /** The newest value this tab intends `key` to hold, if the server may not have it yet. */
    latest(key: string): StateOp | undefined {
      const lane = lanes.get(key);
      return lane?.pending?.op ?? lane?.inFlight?.op ?? lane?.failed?.job.op;
    },

    /** Writes that failed and have not been re-sent successfully — work only this tab has. */
    hasUnsaved() {
      for (const lane of lanes.values()) if (lane.failed) return true;
      return false;
    },

    /** Called on each re-send's outcome, so a player can flip its indicator back to Saved. */
    subscribe(listener: (event: ResendEvent) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /**
     * Drop everything — on sign-out. A write still queued or waiting to be re-sent
     * would otherwise go out later carrying whoever is signed in by then.
     */
    abandon() {
      controller.abort(new Error("Signed out; unsent course state was dropped."));
      controller = new AbortController();
      for (const lane of lanes.values()) {
        if (lane.failed) clearTimeout(lane.failed.timer);
        lane.failed = undefined;
        const waiting = lane.pending;
        lane.pending = undefined;
        for (const waiter of waiting?.waiters ?? []) waiter.reject(new Error("Signed out."));
      }
      for (const [key, lane] of lanes) forgetIfIdle(key, lane);
    },
  };
}

export type StateWrites = ReturnType<typeof createStateWrites>;
