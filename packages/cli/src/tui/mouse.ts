export type TuiMouseEventKind = "click" | "release" | "drag" | "wheel-up" | "wheel-down";

export interface TuiMouseEvent {
  kind: TuiMouseEventKind;
  button: number;
  x: number;
  y: number;
}

const SGR_MOUSE_RE = /(?:\x1b)?\[<(\d+);(\d+);(\d+)([mM])/u;
const SGR_MOUSE_TAIL_RE = /^(\d+);(\d+);(\d+)([mM])$/u;
const SGR_MOUSE_PREFIX_RE = /^(?:\x1b)?(?:\[|\[<|\[<\d+|\[<\d+;\d*|\[<\d+;\d+;\d*)$/u;
const SGR_MOUSE_TAIL_PREFIX_RE = /^(?:\d+|\d+;\d*|\d+;\d+;\d*)$/u;
const X10_MOUSE_RE = /(?:\x1b)?\[M(.)(.)(.)/u;
const CSI_CONTROL_RE = /^(?:\x1b)?\[[0-9;?]*[~A-Za-z]$/u;

function decodeButton(button: number, final: string): TuiMouseEventKind {
  if ((button & 64) === 64) {
    return (button & 1) === 1 ? "wheel-down" : "wheel-up";
  }
  if (final === "m") return "release";
  if ((button & 32) === 32) return "drag";
  return "click";
}

export function parseTuiMouseEvent(input: string): TuiMouseEvent | null {
  const sgr = SGR_MOUSE_RE.exec(input);
  if (sgr) {
    const button = Number.parseInt(sgr[1] ?? "", 10);
    const x = Number.parseInt(sgr[2] ?? "", 10);
    const y = Number.parseInt(sgr[3] ?? "", 10);
    const final = sgr[4] ?? "M";
    if (!Number.isFinite(button) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { kind: decodeButton(button, final), button, x, y };
  }

  const sgrTail = SGR_MOUSE_TAIL_RE.exec(input);
  if (sgrTail) {
    const button = Number.parseInt(sgrTail[1] ?? "", 10);
    const x = Number.parseInt(sgrTail[2] ?? "", 10);
    const y = Number.parseInt(sgrTail[3] ?? "", 10);
    const final = sgrTail[4] ?? "M";
    if (!Number.isFinite(button) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { kind: decodeButton(button, final), button, x, y };
  }

  const x10 = X10_MOUSE_RE.exec(input);
  if (x10) {
    const button = (x10[1]?.charCodeAt(0) ?? 32) - 32;
    const x = (x10[2]?.charCodeAt(0) ?? 32) - 32;
    const y = (x10[3]?.charCodeAt(0) ?? 32) - 32;
    if (!Number.isFinite(button) || !Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }
    return { kind: decodeButton(button, "M"), button, x, y };
  }

  return null;
}

function isTerminalSequencePrefix(input: string): boolean {
  if (!input) return false;
  return SGR_MOUSE_PREFIX_RE.test(input);
}

function isMouseSequenceFragment(input: string): boolean {
  if (!input) return false;
  if (parseTuiMouseEvent(input)) return true;
  if (isTerminalSequencePrefix(input)) return true;
  return /^\[<[\d;]*[mM]?$/u.test(input) || /^[\d;]+[mM]?$/u.test(input);
}

export function isLikelyMouseInput(input: string): boolean {
  if (!input) return false;
  if (parseTuiMouseEvent(input)) return true;
  return (
    SGR_MOUSE_PREFIX_RE.test(input) ||
    /^\[<[\d;]*[mM]?$/u.test(input) ||
    /^\d+;\d+;\d+[mM]$/u.test(input)
  );
}

export function isTerminalControlInput(input: string): boolean {
  if (!input) return false;
  if (parseTuiMouseEvent(input)) return true;
  if (isTerminalSequencePrefix(input)) return true;
  if (CSI_CONTROL_RE.test(input)) return true;
  return input.startsWith("\x1b") || /[\x00-\x08\x0b-\x1f\x7f]/u.test(input);
}

export function isPrintableTextInput(input: string): boolean {
  return input.length > 0 && !isTerminalControlInput(input);
}

export interface TuiInputDecodeResult {
  consumed: boolean;
  event: TuiMouseEvent | null;
}

export class TuiMouseInputDecoder {
  private pending = "";

  hasPending(): boolean {
    return this.pending.length > 0;
  }

  feed(input: string): TuiInputDecodeResult {
    if (!input) return { consumed: false, event: null };

    const candidate = this.pending ? `${this.pending}${input}` : input;
    const event = parseTuiMouseEvent(candidate);
    if (event) {
      this.pending = "";
      return { consumed: true, event };
    }

    if (isTerminalSequencePrefix(candidate)) {
      this.pending = candidate;
      return { consumed: true, event: null };
    }

    if (this.pending) {
      if ((isMouseSequenceFragment(input) || SGR_MOUSE_TAIL_PREFIX_RE.test(input)) && candidate.length <= 48) {
        this.pending = candidate;
        return { consumed: true, event: null };
      }
      this.pending = "";
      return { consumed: true, event: null };
    }

    if (isTerminalControlInput(input)) {
      return { consumed: true, event: null };
    }

    return { consumed: false, event: null };
  }
}
