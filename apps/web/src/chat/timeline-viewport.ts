import { useEffect, useLayoutEffect, useRef } from "react";

import type { MessageView } from "./types.js";

interface Position {
  readonly first: string | undefined;
  readonly last: string | undefined;
  readonly height: number;
  readonly top: number;
  readonly bottom: boolean;
}
function restorePosition(
  el: HTMLDivElement,
  previous: Position | null,
  first: string | undefined,
  last: string | undefined,
) {
  if (!previous) {
    const divider = el.querySelector<HTMLElement>("[data-new]");
    el.scrollTop = divider ? Math.max(0, divider.offsetTop - 90) : el.scrollHeight;
  } else if (first !== previous.first) {
    el.scrollTop = previous.top + el.scrollHeight - previous.height;
  } else if (previous.bottom && (last !== previous.last || el.scrollHeight !== previous.height)) {
    el.scrollTop = el.scrollHeight;
  }
}
function visibleSequence(el: HTMLDivElement, messages: readonly MessageView[]) {
  const bounds = el.getBoundingClientRect();
  return messages
    .filter((message) => message.kind !== "event")
    .reduce((sequence, message) => {
      const node = document.getElementById(`m-${message.id}`);
      if (!node) return sequence;
      const rect = node.getBoundingClientRect();
      return rect.bottom > bounds.top && rect.top < bounds.bottom
        ? Math.max(sequence, message.sequence)
        : sequence;
    }, 0);
}

export function useTimelineViewport(
  messages: readonly MessageView[],
  setFar: (far: boolean) => void,
  onVisible: ((sequence: number) => void) | undefined,
) {
  const log = useRef<HTMLDivElement>(null);
  const position = useRef<Position | null>(null);
  useLayoutEffect((): (() => void) | undefined => {
    const el = log.current;
    if (!el) return () => {};
    const previous = position.current;
    const first = messages[0]?.id;
    const last = messages.at(-1)?.id;
    restorePosition(el, previous, first, last);
    const remember = () => {
      const bottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      position.current = {
        first,
        last,
        height: el.scrollHeight,
        top: el.scrollTop,
        bottom: bottom <= 1,
      };
      setFar(bottom > 240);
    };
    remember();
    el.addEventListener("scroll", remember);
    return () => el.removeEventListener("scroll", remember);
  }, [messages, setFar]);

  useVisibleMessages(() => log.current, messages, onVisible);
  return log;
}

function useVisibleMessages(
  getLog: () => HTMLDivElement | null,
  messages: readonly MessageView[],
  onVisible: ((sequence: number) => void) | undefined,
) {
  useEffect((): (() => void) | undefined => {
    const el = getLog();
    if (!el || !onVisible) return () => {};
    const visible = () => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      const sequence = visibleSequence(el, messages);
      if (sequence > 0) onVisible(sequence);
    };
    const observer = new IntersectionObserver(visible, { root: el });
    el.querySelectorAll(".msg").forEach((node) => observer.observe(node));
    el.addEventListener("scroll", visible);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    visible();
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", visible);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [getLog, messages, onVisible]);
}
