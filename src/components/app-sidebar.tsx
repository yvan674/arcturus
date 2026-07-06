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
import { LogOut } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Spinner } from "./ui/spinner";
import Link from "next/link";

export function AppSidebar() {
  const router = useRouter();

  const recordings = [
    {
      name: "William Smith",
      recordingId: "y25bI1paeFWsVi3fzAww",
      date: "09:34 AM",
    },
    {
      name: "Alice Smith",
      recordingId: "2",
      date: "Yesterday",
    },
    {
      name: "Bob Johnson",
      recordingId: "3",
      date: "2 days ago",
    },
    {
      name: "Emily Davis",
      recordingId: "4",
      date: "2 days ago",
    },
    {
      name: "Michael Wilson",
      recordingId: "5",
      date: "1 week ago",
    },
    {
      name: "Sarah Brown",
      recordingId: "6",
      date: "1 week ago",
    },
    {
      name: "David Lee",
      recordingId: "7",
      date: "1 week ago",
    },
    {
      name: "Olivia Wilson",
      recordingId: "8",
      date: "1 week ago",
    },
    {
      name: "James Martin",
      recordingId: "9",
      date: "1 week ago",
    },
    {
      name: "Sophia White",
      recordingId: "10",
      date: "1 week ago",
    },
  ];

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
            {recordings.map((recording) => (
              <Link
                href={`/recordings/${recording.recordingId}/`}
                key={recording.recordingId}
                className="flex flex-col items-start gap-2 border-b p-4 text-sm leading-tight whitespace-nowrap last:border-b-0 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <div className="flex w-full items-center gap-2">
                  <span className="font-medium">{recording.name}</span>{" "}
                  <span className="ml-auto text-xs">{recording.date}</span>
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
