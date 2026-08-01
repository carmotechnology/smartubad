import * as React from "react";

import { cn } from "@/lib/utils";

const inputClasses =
  "flex h-11 w-full rounded-lg border border-[var(--input)] bg-[var(--card)] px-3 py-2 text-base shadow-sm transition-colors placeholder:text-[var(--muted-foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm";

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input type={type} className={cn(inputClasses, className)} ref={ref} {...props} />
  ),
);
Input.displayName = "Input";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(inputClasses, "min-h-[88px] resize-y py-2.5", className)}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";

/** Native select — fewer moving parts than a Radix listbox, and it works
 *  better with a phone's built-in picker, which is where most use happens. */
const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <select className={cn(inputClasses, "pr-8", className)} ref={ref} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";

export { Input, Textarea, Select, inputClasses };
