import { Delete01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/ui/icon";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  open: boolean;
  onClose: () => void;
  label: string;
  value: number;
  onConfirm: (value: number) => void;
  max?: number;
}

const KEYS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["00", "0", "⌫"],
] as const;

/** Inline keypad panel — lives inside the delivery drawer, not a separate Vaul drawer */
export function QuantityKeypad({ open, onClose, label, value, onConfirm, max }: Props) {
  const [display, setDisplay] = useState(value > 0 ? String(value) : "");

  useEffect(() => {
    if (open) setDisplay(value > 0 ? String(value) : "");
  }, [open, value]);

  if (!open) return null;

  function press(key: string) {
    if (key === "⌫") {
      setDisplay((d) => d.slice(0, -1));
      return;
    }
    setDisplay((d) => {
      const next = d + key;
      const num = parseInt(next, 10);
      if (isNaN(num)) return d;
      if (max != null && num > max) return d;
      if (num > 9999) return d;
      return next.replace(/^0+(\d)/, "$1");
    });
  }

  function handleConfirm(e: React.MouseEvent) {
    e.stopPropagation();
    const num = display === "" ? 0 : parseInt(display, 10);
    onConfirm(isNaN(num) ? 0 : num);
  }

  const numVal = display === "" ? 0 : parseInt(display, 10);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col justify-end bg-black/40"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="rounded-t-xl border-t bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-3 mb-1 flex w-full items-center justify-center py-1">
          <div className="h-1.5 w-[100px] rounded-full bg-muted" />
        </div>

        <div className="px-4 pb-[max(1rem,env(safe-area-inset-bottom,1rem))] pt-1 space-y-3">
          <div className="text-center">
            <div className="text-lg font-semibold">{label}</div>
            <div className="sr-only">Ingresa la cantidad</div>
          </div>

          <div className="flex items-center justify-center h-16 rounded-xl bg-muted border">
            <span className="text-4xl font-bold tabular-nums tracking-tight">
              {display === "" ? <span className="text-muted-foreground">0</span> : display}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEYS.flat().map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                className={`h-14 rounded-xl text-xl font-semibold transition-colors active:scale-95 ${
                  key === "⌫"
                    ? "bg-muted text-muted-foreground hover:bg-muted/80"
                    : "bg-background border hover:bg-accent"
                }`}
              >
                {key === "⌫" ? (
                  <span className="flex items-center justify-center">
                    <Icon icon={Delete01Icon} className="h-5 w-5" />
                  </span>
                ) : (
                  key
                )}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button type="button" variant="outline" className="h-12" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" className="h-12 text-base font-semibold" onClick={handleConfirm}>
              {numVal > 0 ? `Confirmar · ${numVal}` : "Confirmar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
