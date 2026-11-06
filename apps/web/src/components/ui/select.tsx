"use client";

import * as React from "react";
import { CaretDown } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(({ className, children, ...props }, ref) => (
  <div className="relative">
    <select
      ref={ref}
      className={cn(
        "h-8 w-full appearance-none rounded-sm border border-line bg-[#0b0e11] pl-2.5 pr-8 text-[13px] text-fg",
        "transition-colors duration-150 ease-out hover:border-line-strong focus-visible:border-accent",
        "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/25",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </select>
    <CaretDown
      size={12}
      aria-hidden
      className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-dim"
    />
  </div>
));
Select.displayName = "Select";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex items-center rounded-sm border border-line bg-[#0b0e11] p-0.5"
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={cn(
            "h-6 rounded-[4px] px-2 text-[11px] font-medium transition-colors duration-150 ease-out",
            value === option.value
              ? "bg-panel-3 text-fg"
              : "text-dim hover:text-muted",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
