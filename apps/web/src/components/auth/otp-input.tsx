"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export function OtpInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const update = (index: number, digit: string) => {
    if (!/^\d?$/.test(digit)) return;
    const next = [...value];
    next[index] = digit;
    onChange(next);
    if (digit && index < 5) refs.current[index + 1]?.focus();
  };

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Código de verificacao">
      {value.map((digit, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={digit}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="off"
          maxLength={1}
          aria-label={`Dígito ${index + 1}`}
          onChange={(event) => {
            const raw = event.target.value.replace(/\D/g, "");
            if (raw.length > 1) {
              const next = raw.slice(0, 6).split("");
              onChange(next);
              refs.current[Math.min(next.length, 5)]?.focus();
              return;
            }
            update(index, raw);
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !value[index] && index > 0) {
              refs.current[index - 1]?.focus();
            }
            if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
            if (event.key === "ArrowRight" && index < 5) refs.current[index + 1]?.focus();
          }}
          onPaste={(event) => {
            event.preventDefault();
            const raw = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
            if (!raw) return;
            const next = raw.split("");
            onChange(next);
            refs.current[Math.min(next.length, 5)]?.focus();
          }}
          className={cn(
            "h-11 w-10 rounded-sm border border-line bg-[#0b0e11] text-center text-mono text-[16px] font-medium text-fg",
            "transition-colors duration-150 ease-out hover:border-line-strong",
            "focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/25",
            "disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
