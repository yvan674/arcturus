"use client";

import { useSyncExternalStore } from "react";

/**
 * The user's terminology list: strings especially likely to be
 * mistranscribed (medications, procedures, jargon, proper nouns), sent to
 * POST /v1/refine for phoneme-based recovery. Persisted in localStorage only
 * (no per-user backend storage exists yet), so it's shared by anyone using
 * this browser profile.
 */

const TERMINOLOGY_STORAGE_KEY = "arcturus.terminology.v1";

let terms: string[] = [];
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): string[] {
  return terms;
}

const EMPTY_TERMS: string[] = [];

function getServerSnapshot(): string[] {
  return EMPTY_TERMS;
}

function readStoredTerminology(): string[] {
  try {
    const value = localStorage.getItem(TERMINOLOGY_STORAGE_KEY);
    if (!value) return [];
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((term): term is string => typeof term === "string")
      : [];
  } catch {
    return [];
  }
}

if (typeof window !== "undefined") {
  terms = readStoredTerminology();
}

export function useTerminology(): string[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function getTerminology(): string[] {
  return terms;
}

export function setTerminology(next: string[]): void {
  terms = next;
  try {
    localStorage.setItem(TERMINOLOGY_STORAGE_KEY, JSON.stringify(terms));
  } catch (error) {
    console.warn("Could not persist terminology.", error);
  }
  emit();
}

/** Splits the settings textarea on newlines, trimming and dropping blanks. */
export function parseTerminologyInput(value: string): string[] {
  return value
    .split("\n")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}
