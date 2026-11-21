import { AsyncLocalStorage } from "node:async_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { AppError } from "../errors";

type Adapter<T> = {
  read: () => Promise<{ value: T; version: string | null }>;
  commit: (value: T, version: string | null) => Promise<boolean>;
};

export function createVersionedStore<T>(adapter: Adapter<T>) {
  const scope = new AsyncLocalStorage<{ value: T; dirty: boolean }>();

  return {
    current: () => scope.getStore()?.value,
    async read() {
      const context = scope.getStore();
      return context ? context.value : (await adapter.read()).value;
    },
    replace(value: T) {
      const context = scope.getStore();
      if (!context) throw new Error("A storage transaction is required.");
      context.value = value;
      context.dirty = true;
    },
    async transaction<R>(work: () => Promise<R>) {
      if (scope.getStore()) throw new Error("Nested storage transaction.");
      for (let attempt = 0; attempt < 12; attempt++) {
        const { value, version } = await adapter.read();
        const context = { value, dirty: false };
        const result = await scope.run(context, work);
        if (!context.dirty || await adapter.commit(context.value, version)) return result;
        await delay(Math.min(500, 12 * 2 ** attempt) * (0.5 + Math.random()));
      }
      throw new AppError(503, "יש עומס שמירות במערכת. יש לנסות שוב.");
    },
  };
}
