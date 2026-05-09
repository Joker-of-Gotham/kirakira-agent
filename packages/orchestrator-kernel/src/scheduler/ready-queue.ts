type Entry = { id: string; priority: number };

export class ReadyQueue {
  private heap: Entry[] = [];

  enqueue(nodeId: string, priority: number): void {
    this.heap.push({ id: nodeId, priority });
    this.bubbleUp(this.heap.length - 1);
  }

  dequeue(): string | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    if (top === undefined) return undefined;
    const last = this.heap.pop();
    if (this.heap.length > 0 && last !== undefined) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top.id;
  }

  peek(): string | undefined {
    return this.heap[0]?.id;
  }

  size(): number {
    return this.heap.length;
  }

  remove(nodeId: string): boolean {
    const idx = this.heap.findIndex((e) => e.id === nodeId);
    if (idx < 0) return false;
    const last = this.heap.pop();
    if (idx < this.heap.length && last !== undefined) {
      this.heap[idx] = last;
      this.bubbleUp(idx);
      this.bubbleDown(idx);
    }
    return true;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const p = (i - 1) >> 1;
      const parent = this.heap[p];
      const cur = this.heap[i];
      if (parent === undefined || cur === undefined) break;
      if (cur.priority <= parent.priority) break;
      this.heap[p] = cur;
      this.heap[i] = parent;
      i = p;
    }
  }

  private bubbleDown(i: number): void {
    const len = this.heap.length;
    while (true) {
      const l = i * 2 + 1;
      const r = l + 1;
      let best = i;
      const cur = this.heap[i];
      if (cur === undefined) break;
      const left = this.heap[l];
      if (l < len && left !== undefined && left.priority > (this.heap[best]?.priority ?? -Infinity)) {
        best = l;
      }
      const right = this.heap[r];
      if (r < len && right !== undefined && right.priority > (this.heap[best]?.priority ?? -Infinity)) {
        best = r;
      }
      if (best === i) break;
      const swap = this.heap[best];
      if (swap === undefined) break;
      this.heap[best] = cur;
      this.heap[i] = swap;
      i = best;
    }
  }
}
