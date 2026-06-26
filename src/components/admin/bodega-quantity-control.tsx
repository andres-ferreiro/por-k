import { useEffect, useState } from "react";

export function QuantityControl({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const [inputVal, setInputVal] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    setInputVal(value > 0 ? String(value) : "");
  }, [value]);

  const dec = () => onChange(Math.max(0, value - 1));
  const inc = () => onChange(value + 1);
  const isActive = value > 0;

  const commit = (raw: string) => {
    const n = parseFloat(raw);
    if (!raw.trim() || isNaN(n) || n <= 0) {
      onChange(0);
      setInputVal("");
    } else {
      onChange(n);
      setInputVal(String(n));
    }
  };

  return (
    <div
      className={`flex items-center rounded-lg border overflow-hidden transition-all ${
        isActive ? "border-primary shadow-sm shadow-primary/10" : "border-border"
      }`}
    >
      <button
        type="button"
        disabled={disabled || value === 0}
        onClick={dec}
        className="w-8 h-8 flex items-center justify-center text-lg leading-none hover:bg-muted disabled:opacity-25 disabled:cursor-not-allowed transition-colors select-none flex-shrink-0"
        aria-label="Disminuir"
      >
        −
      </button>
      <input
        type="number"
        inputMode="decimal"
        min="0"
        step="any"
        disabled={disabled}
        value={inputVal}
        placeholder="0"
        onChange={(e) => setInputVal(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className={`w-12 text-center text-sm font-semibold tabular-nums bg-transparent border-none outline-none transition-colors
          [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none
          disabled:opacity-40 ${isActive ? "text-primary" : "text-muted-foreground"}`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={inc}
        className="w-8 h-8 flex items-center justify-center text-lg leading-none hover:bg-muted disabled:opacity-25 disabled:cursor-not-allowed transition-colors select-none flex-shrink-0"
        aria-label="Aumentar"
      >
        +
      </button>
    </div>
  );
}
