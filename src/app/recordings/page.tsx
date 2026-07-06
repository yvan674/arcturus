"use client";

import { useRef, useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Mic, Upload } from "lucide-react";

/**
 * This page is used to create or start a new recording
 */
export default function RecordingsStartPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);

  const onFileSelected = (file?: File) => {
    if (!file) return;
    setSelectedFileName(file.name);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    onFileSelected(event.dataTransfer.files?.[0]);
  };

  return (
    <>
      <header className="sticky top-0 flex shrink-0 items-center gap-2 border-b bg-background p-4 h-12">
        <h1 className="text-base font-medium text-foreground">
          Create new recording
        </h1>
      </header>
      <div className="p-4 text-muted-foreground text-">
        Start by uploading an existing recording or starting a new recording
      </div>
      <div className="p-4 flex flex-row gap-4 ">
        <div className="flex-1 flex flex-col items-center text-center gap-6">
          <div className="bg-slate-200 p-4 rounded-lg">
            <Upload />
          </div>
          <div className="flex flex-col items-center text-center gap-2">
            <h2 className="font-medium">Upload Recording</h2>
            <p className="text-muted-foreground">
              Upload an existing recording
            </p>
          </div>
          <div
            className="w-full max-w-sm rounded-lg border-2 border-dashed border-muted-foreground/40 bg-muted/20 px-4 py-8 text-sm text-muted-foreground"
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <p>Drag and drop your recording here</p>
            <p className="mt-1 text-xs">Supported formats: audio files</p>
            {selectedFileName ? (
              <p className="mt-3 text-foreground">
                Selected: {selectedFileName}
              </p>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(event) => onFileSelected(event.target.files?.[0])}
          />
          <Button onClick={() => fileInputRef.current?.click()}>
            Upload Recording
          </Button>
        </div>
        <Separator orientation="vertical" />
        <div className="flex-1 flex flex-col items-center text-center gap-6">
          <div className="bg-slate-200 p-4 rounded-lg">
            <Mic />
          </div>
          <div className="flex flex-col items-center text-center gap-2">
            <h2 className="font-medium">New Recording</h2>
            <p className="text-muted-foreground">
              Start a new recording session
            </p>
          </div>
          <a
            href="#"
            className={buttonVariants({ variant: "default", size: "sm" })}
          >
            Start Recording
          </a>
        </div>
      </div>
    </>
  );
}
