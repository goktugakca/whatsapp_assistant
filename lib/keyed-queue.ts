// Aynı anahtara sahip işleri sırayla çalıştırır; farklı anahtarlar paralel çalışır.
// Sadece tek süreç içinde geçerlidir.
export class KeyedQueue {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(fn);
    this.tails.set(key, next);
    const cleanup = () => {
      if (this.tails.get(key) === next) this.tails.delete(key);
    };
    next.then(cleanup, cleanup);
    return next;
  }
}
