"use client";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { LogOut, Plus } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "./ui/spinner";
import Link from "next/link";
import {
  useRecordingsHydrated,
  useRecordingsList,
  type RecordingStatus,
} from "@/lib/recordings-store";

const STATUS_HINTS: Record<RecordingStatus, string> = {
  new: "Not started",
  live: "Live",
  "live-ended": "Recorded",
  refining: "Processing…",
  refined: "Reviewed",
  "refine-error": "Failed",
};

export function AppSidebar() {
  const router = useRouter();
  const recordings = useRecordingsList();
  const recordingsHydrated = useRecordingsHydrated();

  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSigningOut = async () => {
    if (isSigningOut) return;

    setIsSigningOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to sign out");
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Error signing out:", error);
      setIsSigningOut(false);
    }
  };

  return (
    <Sidebar>
      <SidebarHeader className="border-b h-12">
        <div className="flex w-full items-center justify-between">
          <div className="flex flex-row items-center gap-2 text-base font-medium text-foreground">
            <div className=" p-2">
              <Image
                src="/alpineai-square.svg"
                alt="AlpineAI Logo"
                width={16}
                height={16}
              />
            </div>
            Project Arcturus
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <Link
              href="/recordings"
              className="flex items-center gap-2 border-b p-4 text-sm font-medium hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Plus className="size-4" />
              New recording
            </Link>
            {!recordingsHydrated && (
              <p className="p-4 text-xs text-muted-foreground">
                Loading recordings…
              </p>
            )}
            {recordingsHydrated && recordings.length === 0 && (
              <p className="p-4 text-xs text-muted-foreground">
                No recordings yet.
              </p>
            )}
            {recordings.map((recording) => (
              <Link
                href={`/recordings/${recording.id}`}
                key={recording.id}
                className="flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <div className="flex w-full items-center gap-2">
                  <span className="font-medium">{recording.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {STATUS_HINTS[recording.status]} ·{" "}
                    {new Date(recording.createdAt).toLocaleTimeString(
                      undefined,
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                  </span>
                </div>
              </Link>
            ))}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSigningOut}
              disabled={isSigningOut}
              className="cursor-pointer"
            >
              {isSigningOut && (
                <Spinner data-icon="inline-start" className="size-4 " />
              )}
              {!isSigningOut && <LogOut />}
              Signout
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
