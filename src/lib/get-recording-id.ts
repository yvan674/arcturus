"use client";

import { redirect, useParams } from "next/navigation";

const isFirestoreAutoId = (id: string) => /^[A-Za-z0-9]{20}$/.test(id);

/**
 * Gets the current activity ID from the path and validates it.
 * If the activity ID is invalid, redirects to 404.
 * @returns The activity ID as a string.
 */
export function useRecordingId(): string {
  const params = useParams<{ recordingId: string | string[] }>();
  const value = params.recordingId;

  let assumedValue: string | null;

  if (Array.isArray(value)) {
    assumedValue = value[0] ?? null;
  } else {
    assumedValue = value ?? null;
  }

  if (isFirestoreAutoId(assumedValue)) {
    return assumedValue;
  } else {
    redirect("/404");
  }
}
