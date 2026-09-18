"use client";

import { useEffect, useRef, useState } from "react";

const CHARS_PER_SECOND = 45;

function commonPrefixLength(a: string, b: string): number {
  const max = Math.min(a.length, b.length);
  let i = 0;
  while (i < max && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLength(a: string, b: string, prefixLimit: number): number {
  const max = Math.min(a.length, b.length) - prefixLimit;
  let i = 0;
  while (i < max && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/**
 * Animates text transitions character-by-character instead of snapping to
 * the new value, so streaming transcript updates read as live typing/
 * correction rather than a jump cut. The unchanged prefix and suffix (found
 * via a simple diff, not a full LCS) stay put; only the differing middle
 * morphs, left to right — a pure append (delta text) becomes a typewriter
 * reveal of the new tail, and a mid-string correction (a revised word)
 * becomes an in-place overwrite of just that word.
 */
export function useTypewriterText(text: string): string {
  const [displayed, setDisplayed] = useState(text);
  const displayedRef = useRef(text);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    displayedRef.current = displayed;
  }, [displayed]);

  useEffect(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);

    const from = displayedRef.current;
    const to = text;
    if (from === to) return;

    const prefixLen = commonPrefixLength(from, to);
    const suffixLen = commonSuffixLength(from, to, prefixLen);
    const prefix = to.slice(0, prefixLen);
    const suffix = suffixLen > 0 ? to.slice(to.length - suffixLen) : "";
    const oldMiddle = from.slice(prefixLen, from.length - suffixLen);
    const newMiddle = to.slice(prefixLen, to.length - suffixLen);
    const steps = Math.max(oldMiddle.length, newMiddle.length);

    if (steps === 0) {
      setDisplayed(to);
      return;
    }

    let startTime: number | null = null;

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const elapsedChars = ((now - startTime) / 1000) * CHARS_PER_SECOND;
      const i = Math.min(steps, Math.ceil(elapsedChars));
      setDisplayed(prefix + newMiddle.slice(0, i) + oldMiddle.slice(i) + suffix);
      frameRef.current = i < steps ? requestAnimationFrame(tick) : null;
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [text]);

  return displayed;
}
