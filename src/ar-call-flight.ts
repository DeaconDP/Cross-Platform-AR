export type ArCallPolicy = "latest" | "serial";

export type ArCallFlightResult<T> =
  | { status: "ran"; value: T }
  | { status: "superseded" };

type Queued<TArgs, TResult> = {
  args: TArgs;
  run: (args: TArgs) => Promise<TResult>;
  resolve: (result: ArCallFlightResult<TResult>) => void;
  reject: (err: unknown) => void;
};

/**
 * Serialize Capacitor AR bridge calls.
 * `latest` keeps only the newest waiting tap/move (fast place).
 * `serial` runs every queued call in order (Cube multi-place).
 */
export function createArCallFlight(policy: ArCallPolicy = "latest") {
  const busy = new Set<string>();
  const waiting = new Map<string, Queued<unknown, unknown>[]>();

  function list(key: string): Queued<unknown, unknown>[] {
    let q = waiting.get(key);
    if (!q) {
      q = [];
      waiting.set(key, q);
    }
    return q;
  }

  function launch<TArgs, TResult>(
    key: string,
    args: TArgs,
    run: (args: TArgs) => Promise<TResult>,
    resolve: (result: ArCallFlightResult<TResult>) => void,
    reject: (err: unknown) => void,
  ): void {
    busy.add(key);
    void Promise.resolve()
      .then(() => run(args))
      .then((value) => resolve({ status: "ran", value }))
      .catch(reject)
      .finally(() => {
        busy.delete(key);
        const next = list(key).shift();
        if (!next) {
          if (list(key).length === 0) waiting.delete(key);
          return;
        }
        launch(key, next.args, next.run, next.resolve, next.reject);
      });
  }

  function schedule<TArgs, TResult>(
    key: string,
    args: TArgs,
    run: (args: TArgs) => Promise<TResult>,
  ): Promise<ArCallFlightResult<TResult>> {
    if (!busy.has(key)) {
      return new Promise((resolve, reject) => {
        launch(key, args, run, resolve, reject);
      });
    }

    return new Promise((resolve, reject) => {
      const q = list(key);
      const item = { args, run, resolve, reject } as Queued<unknown, unknown>;
      if (policy === "latest") {
        for (const pending of q) {
          pending.resolve({ status: "superseded" });
        }
        q.length = 0;
      }
      q.push(item);
    });
  }

  function reset(): void {
    for (const q of waiting.values()) {
      for (const pending of q) {
        pending.resolve({ status: "superseded" });
      }
    }
    waiting.clear();
  }

  function inflight(key: string): boolean {
    return busy.has(key);
  }

  function pending(key: string): number {
    return list(key).length;
  }

  return { schedule, reset, inflight, pending };
}
