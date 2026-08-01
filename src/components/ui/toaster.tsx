"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "rounded-xl border border-[var(--border)] bg-[var(--card)] text-[var(--card-foreground)] shadow-lg",
          description: "text-[var(--muted-foreground)]",
        },
      }}
    />
  );
}

export { toast } from "sonner";
