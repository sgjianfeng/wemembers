"use client";

import { useRef, useState, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

interface CodeInputProps {
  length?: number;
  onComplete: (code: string) => void;
  error?: string;
}

export function CodeInput({ length = 6, onComplete, error }: CodeInputProps) {
  const [values, setValues] = useState<string[]>(Array(length).fill(""));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  function handleChange(index: number, value: string) {
    if (!/^\d*$/.test(value)) return;
    const newValues = [...values];
    newValues[index] = value.slice(-1);
    setValues(newValues);

    if (value && index < length - 1) {
      inputs.current[index + 1]?.focus();
    }

    const code = newValues.join("");
    if (code.length === length) {
      onComplete(code);
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !values[index] && index > 0) {
      inputs.current[index - 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, length);
    const newValues = [...values];
    for (let i = 0; i < text.length; i++) {
      newValues[i] = text[i];
    }
    setValues(newValues);
    const code = newValues.join("");
    if (code.length === length) onComplete(code);
  }

  return (
    <div>
      <div className="flex gap-2 justify-center" onPaste={handlePaste}>
        {values.map((val, i) => (
          <input
            key={i}
            ref={(el) => { inputs.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={val}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            className={cn(
              "w-10 h-12 text-center text-lg font-semibold rounded-lg border border-slate-200",
              "focus:outline-none focus:ring-2 focus:ring-[#1A6EFF] focus:border-transparent",
              error && "border-red-300"
            )}
          />
        ))}
      </div>
      {error && <p className="mt-2 text-center text-xs text-red-500">{error}</p>}
    </div>
  );
}
