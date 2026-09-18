"use client";

import { useId, useState } from "react";
import { Settings } from "lucide-react";

import { SidebarMenuButton } from "@/components/ui/sidebar";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  parseTerminologyInput,
  setTerminology,
  useTerminology,
} from "@/lib/terminology-store";

/**
 * Terminology settings: one term per line, sent with every future
 * /v1/refine job to help recover drug names and jargon Whisper mishears.
 */
export function SettingsSheet() {
  const terminology = useTerminology();
  const textareaId = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => terminology.join("\n"));

  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        // Reset the draft from the persisted list each time the sheet opens.
        if (nextOpen) setDraft(terminology.join("\n"));
        setOpen(nextOpen);
      }}
    >
      <SheetTrigger
        render={
          <SidebarMenuButton className="cursor-pointer">
            <Settings />
            Settings
          </SidebarMenuButton>
        }
      />
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Configure the terms sent to offline refinement.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6">
          <Field>
            <FieldLabel htmlFor={textareaId}>Terminology</FieldLabel>
            <FieldDescription>
              Medications, procedures, jargon, device names and proper nouns
              that are especially likely to be mistranscribed. One term per
              line.
            </FieldDescription>
            <Textarea
              id={textareaId}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={"metoprolol\nvancomycin\nEliquis"}
              className="min-h-48"
            />
          </Field>
        </div>
        <SheetFooter>
          <SheetClose
            render={
              <Button
                onClick={() => setTerminology(parseTerminologyInput(draft))}
              >
                Save
              </Button>
            }
          />
          <SheetClose render={<Button variant="outline">Cancel</Button>} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
