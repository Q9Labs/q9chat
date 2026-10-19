import { useEffect, useLayoutEffect, useRef } from "react";

import type { MessageView } from "./types.js";

interface Anchor {
  readonly id: string;
  readonly offset: number;
  readonly sequence: number;
}
interface Position {
  readonly first: string | undefined;
  readonly bottom: boolean;
  readonly anchor: Anchor | null;
}
function visibleAnchor(el: HTMLDivElement): Anchor | null {
  const bounds = el.getBoundingClientRect();
  for (const node of el.querySelectorAll<HTMLElement>("[data-sequence]")) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom > bounds.top && rect.top < bounds.bottom)
      return {
        id: node.id,
        offset: rect.top - bounds.top,
        sequence: Number(node.dataset["sequence"]),
      };
  }
  return null;
}
function restoreAnchor(el: HTMLDivElement, anchor: Anchor | null) {
  if (!anchor) return;
  const node = document.getElementById(anchor.id);
  if (node)
    el.scrollTop +=
      node.getBoundingClientRect().top - el.getBoundingClientRect().top - anchor.offset;
}
function scrollToLatest(el: HTMLDivElement) {
  el.scrollTo({
    top: el.scrollHeight,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}
function restorePosition(
  el: HTMLDivElement,
  previous: Position | null,
  first: string | undefined,
  paging: boolean,
) {
  if (!previous) {
    const divider = el.querySelector<HTMLElement>("[data-new]");
    el.scrollTop = divider ? Math.max(0, divider.offsetTop - 90) : el.scrollHeight;
  } else if (paging || (first !== previous.first && !previous.bottom)) {
    restoreAnchor(el, previous.anchor);
  } else if (previous.bottom) {
    el.scrollTop = el.scrollHeight;
  }
}
function visibleSequence(el: HTMLDivElement, messages: readonly MessageView[]) {
  const bounds = el.getBoundingClientRect();
  return messages
    .filter(
      (message) =>
        message.kind !== "event" && (message.kind === "deleted" || message.sendState === undefined),
    )
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
  loading: boolean,
  onAtBottom: ((bottom: boolean) => void) | undefined,
  onAnchor: ((sequence: number) => void) | undefined,
  latestRequest: number | undefined,
) {
  const log = useRef<HTMLDivElement>(null);
  const position = useRef<Position | null>(null);
  const paging = useRef(false);
  const jumping = useRef(false);
  const requestedLatest = useRef(latestRequest);
  const preserveAnchor = () => {
    const el = log.current;
    if (el && position.current)
      position.current = { ...position.current, anchor: visibleAnchor(el) };
    paging.current = true;
  };
  const jump = (onLatest: (() => void) | undefined) => {
    jumping.current = true;
    onLatest?.();
    if (log.current) {
      log.current.focus({ preventScroll: true });
      scrollToLatest(log.current);
    }
  };
  useLayoutEffect((): (() => void) | undefined => {
    const el = log.current;
    if (!el) return () => {};
    if (requestedLatest.current !== latestRequest) {
      requestedLatest.current = latestRequest;
      jumping.current = true;
    }
    const previous = position.current;
    const first = messages[0]?.id;
    // Retained rows can receive live updates while the destination window loads.
    if (jumping.current) {
      if (!loading) scrollToLatest(el);
    } else restorePosition(el, previous, first, paging.current);
    if (!loading) {
      jumping.current = false;
      paging.current = false;
    }
    const remember = () => {
      const bottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      const anchor = visibleAnchor(el);
      position.current = {
        first,
        bottom: bottom <= 1,
        anchor,
      };
      if (!jumping.current && anchor) onAnchor?.(anchor.sequence);
      setFar(bottom > 240);
      onAtBottom?.(bottom <= 1);
    };
    remember();
    el.addEventListener("scroll", remember);
    return () => el.removeEventListener("scroll", remember);
  });
  useVisibleMessages(() => log.current, messages, loading ? undefined : onVisible);
  return { log, preserveAnchor, jump };
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
