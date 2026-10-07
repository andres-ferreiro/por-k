import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pt210Printer, PrinterError } from "@/lib/printer/pt210";
import { canvasToRaster } from "@/lib/printer/raster";
import { renderTestTicketCanvas } from "@/lib/receipt/render-receipt-canvas";
import { PrinterSheet } from "@/components/driver/printer-sheet";

export type PrinterStatus =
  | "unsupported"
  | "disconnected"
  | "connecting"
  | "connected"
  | "printing"
  | "error";

interface PrinterContextValue {
  status: PrinterStatus;
  /** False when the browser can't talk to Bluetooth printers (iPhone, Firefox...). */
  supported: boolean;
  /** Name of the paired printer, if any. */
  deviceName: string | null;
  /** Last error message, cleared on the next successful action. */
  error: string | null;
  lastPrintAt: Date | null;
  /** Opens the Bluetooth picker. Must be called from a tap. */
  pair: (showAllDevices?: boolean) => Promise<boolean>;
  /** Reconnects to the paired printer without the picker. */
  reconnect: () => Promise<boolean>;
  forget: () => Promise<void>;
  /** Prints a canvas that is exactly 384 px wide. Throws a PrinterError with a friendly message. */
  printCanvas: (canvas: HTMLCanvasElement) => Promise<void>;
  printTest: () => Promise<boolean>;
  openSheet: () => void;
  closeSheet: () => void;
  sheetOpen: boolean;
}

const PrinterContext = createContext<PrinterContextValue | null>(null);

const STORAGE_KEY = "pork.printer";

function readSaved(): { id: string; name: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as { id: string; name: string }) : null;
  } catch {
    return null;
  }
}

export function PrinterProvider({ children }: { children: ReactNode }) {
  const printerRef = useRef<Pt210Printer | null>(null);
  if (printerRef.current === null) printerRef.current = new Pt210Printer();
  const printer = printerRef.current;

  const [supported, setSupported] = useState(true);
  const [status, setStatus] = useState<PrinterStatus>("disconnected");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastPrintAt, setLastPrintAt] = useState<Date | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const busyRef = useRef(false);

  const remember = useCallback(() => {
    if (printer.id) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: printer.id, name: printer.name ?? "Impresora" }));
      } catch {
        // storage unavailable; the session still works
      }
    }
    setDeviceName(printer.name ?? "Impresora");
  }, [printer]);

  // Initial detection + silent restore of a previously paired printer.
  useEffect(() => {
    if (!Pt210Printer.isSupported()) {
      setSupported(false);
      setStatus("unsupported");
      return;
    }
    const saved = readSaved();
    if (saved) setDeviceName(saved.name);

    printer.onDisconnected = () => {
      if (busyRef.current) return; // the print loop handles its own reconnects
      setStatus("disconnected");
    };

    if (saved) {
      setStatus("connecting");
      printer.restore(saved.id).then((ok) => {
        if (ok) {
          remember();
          setStatus("connected");
        } else {
          setStatus("disconnected");
        }
      });
    }
    return () => {
      printer.onDisconnected = null;
    };
  }, [printer, remember]);

  // Try to get the connection back when the driver returns to the app.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (busyRef.current || !printer.hasDevice || printer.connected) return;
      setStatus("connecting");
      printer
        .connect()
        .then(() => setStatus("connected"))
        .catch(() => setStatus("disconnected"));
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [printer]);

  const pair = useCallback(
    async (showAllDevices = false) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setError(null);
      setStatus("connecting");
      try {
        await printer.pair(showAllDevices);
        remember();
        setStatus("connected");
        return true;
      } catch (e) {
        if (e instanceof PrinterError && e.code === "cancelled") {
          setStatus(printer.connected ? "connected" : "disconnected");
        } else {
          setError(e instanceof Error ? e.message : "No se pudo conectar la impresora.");
          setStatus("error");
        }
        return false;
      } finally {
        busyRef.current = false;
      }
    },
    [printer, remember],
  );

  const reconnect = useCallback(async () => {
    if (busyRef.current) return false;
    if (!printer.hasDevice) return pair();
    busyRef.current = true;
    setError(null);
    setStatus("connecting");
    try {
      await printer.connect();
      remember();
      setStatus("connected");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo conectar la impresora.");
      setStatus("error");
      return false;
    } finally {
      busyRef.current = false;
    }
  }, [printer, pair, remember]);

  const forget = useCallback(async () => {
    await printer.forget();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    setDeviceName(null);
    setError(null);
    setStatus("disconnected");
  }, [printer]);

  const printCanvas = useCallback(
    async (canvas: HTMLCanvasElement) => {
      if (busyRef.current) throw new PrinterError("La impresora está ocupada. Intenta de nuevo.", "write_failed");
      if (!printer.hasDevice) {
        throw new PrinterError("Primero conecta la impresora.", "no_device");
      }
      busyRef.current = true;
      setError(null);
      setStatus("printing");
      try {
        await printer.printRaster(canvasToRaster(canvas));
        setLastPrintAt(new Date());
        setStatus("connected");
      } catch (e) {
        const message = e instanceof Error ? e.message : "No se pudo imprimir.";
        setError(message);
        setStatus(printer.connected ? "connected" : "error");
        throw e;
      } finally {
        busyRef.current = false;
      }
    },
    [printer],
  );

  const printTest = useCallback(async () => {
    try {
      await printCanvas(await renderTestTicketCanvas(1));
      return true;
    } catch {
      return false;
    }
  }, [printCanvas]);

  const value = useMemo<PrinterContextValue>(
    () => ({
      status,
      supported,
      deviceName,
      error,
      lastPrintAt,
      pair,
      reconnect,
      forget,
      printCanvas,
      printTest,
      openSheet: () => setSheetOpen(true),
      closeSheet: () => setSheetOpen(false),
      sheetOpen,
    }),
    [status, supported, deviceName, error, lastPrintAt, pair, reconnect, forget, printCanvas, printTest, sheetOpen],
  );

  return (
    <PrinterContext.Provider value={value}>
      {children}
      <PrinterSheet />
    </PrinterContext.Provider>
  );
}

export function usePrinter(): PrinterContextValue {
  const ctx = useContext(PrinterContext);
  if (!ctx) throw new Error("usePrinter debe usarse dentro de PrinterProvider.");
  return ctx;
}
