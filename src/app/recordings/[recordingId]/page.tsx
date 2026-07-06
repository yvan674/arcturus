"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function RecordingPage() {
  return (
    <>
      <header className="sticky top-0 flex shrink-0 items-center gap-2 border-b justify-between bg-background p-4 h-12">
        <h1 className="text-base font-medium text-foreground">William Smith</h1>
        <h2 className="text-base text-muted-foreground">
          Wednesday, 2 July 9:34 AM
        </h2>
      </header>
      <Tabs defaultValue="account" className="w-full p-4">
        <TabsList className="w-[50dvw] mx-auto">
          <TabsTrigger value="live">Live Transcription</TabsTrigger>
          <TabsTrigger value="processed">Review Recording</TabsTrigger>
        </TabsList>
        <TabsContent value="live">Live Transcription</TabsContent>
        <TabsContent value="processed">Review Recording</TabsContent>
      </Tabs>
    </>
  );
}
