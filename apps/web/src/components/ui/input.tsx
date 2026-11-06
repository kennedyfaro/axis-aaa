"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "h-8 w-full rounded-sm border border-line bg-[#0b0e11] px-2.5 text-[13px] text-fg",
        "placeholder:text-dim/90",
        "transition-colors duration-150 ease-out hover:border-line-strong",
        "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-danger/70 aria-invalid:focus-visible:outline-danger/20",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-20 w-full resize-y rounded-sm border border-line bg-[#0b0e11] px-2.5 py-2 text-[13px] text-fg",
      "placeholder:text-dim/90 transition-colors duration-150 ease-out hover:border-line-strong",
      "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/25",
      "aria-invalid:border-danger/70",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  const hintId = hint ? `${htmlFor ?? label}-hint` : undefined;
  const errorId = error ? `${htmlFor ?? label}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[12px] font-medium text-muted">
        {label}
      </label>
      {children}
      {hint && !error ? (
        <p id={hintId} className="text-[11px] leading-4 text-dim">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-[11px] leading-4 text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
