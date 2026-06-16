export class AsyncLocalStorage<T> {
  run<R>(_store: T, callback: (...args: unknown[]) => R): R {
    return callback();
  }
  getStore(): T | undefined {
    return undefined;
  }
  enterWith(_store: T): void {}
  disable(): void {}
}

export class AsyncResource {
  constructor(_type: string) {}
  runInAsyncScope<R>(fn: (...args: unknown[]) => R): R {
    return fn();
  }
  static bind<T extends (...args: unknown[]) => unknown>(fn: T): T {
    return fn;
  }
  bind<T extends (...args: unknown[]) => unknown>(fn: T): T {
    return fn;
  }
}

export function createHook() {
  return { enable() {}, disable() {} };
}

export const executionAsyncId = () => 0;
export const triggerAsyncId = () => 0;
