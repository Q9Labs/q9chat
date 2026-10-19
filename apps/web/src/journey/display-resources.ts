interface Resource {
  readonly url: string;
  readonly bytes: number;
}

/** The budget applies to idle entries; mounted consumers keep their URLs until release. */
export class DisplayResources {
  private readonly entries = new Map<string, Resource>();
  private readonly owners = new Map<string, number>();

  retain(path: string) {
    this.owners.set(path, (this.owners.get(path) ?? 0) + 1);
  }
  held(path: string) {
    return this.owners.has(path);
  }
  get(path: string) {
    return this.entries.get(path)?.url;
  }
  urls() {
    return new Map([...this.entries].map(([path, value]) => [path, value.url]));
  }
  release(path: string) {
    const count = this.owners.get(path) ?? 0;
    if (count > 1) {
      this.owners.set(path, count - 1);
      return null;
    }
    this.owners.delete(path);
    const value = this.entries.get(path);
    this.entries.delete(path);
    return value?.url ?? null;
  }
  add(path: string, value: Resource) {
    this.entries.set(path, value);
    const evicted: string[] = [];
    while (
      this.entries.size > 8 ||
      [...this.entries.values()].reduce((total, item) => total + item.bytes, 0) > 40_000_000
    ) {
      const idle = [...this.entries.keys()].find((key) => key !== path && !this.held(key));
      if (idle === undefined) break;
      const url = this.release(idle);
      if (url) evicted.push(url);
    }
    return evicted;
  }
  clear() {
    const urls = [...this.entries.values()].map((value) => value.url);
    this.entries.clear();
    this.owners.clear();
    return urls;
  }
}
