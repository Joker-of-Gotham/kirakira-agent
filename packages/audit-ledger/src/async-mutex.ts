/** Simple async mutex: serializes async critical sections on a single strand. */
export class AsyncMutex {
  private locked: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release!: () => void;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prev = this.locked;
    this.locked = prev.then(() => next);
    await prev;
    return release;
  }
}
