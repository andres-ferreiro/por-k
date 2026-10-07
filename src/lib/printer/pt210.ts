import type { Raster } from "./raster";

/**
 * Web Bluetooth driver for the GOOJPRT PT-210 (58 mm, ESC/POS, 384 dots wide).
 *
 * Only works in Chromium browsers (Chrome on Android) over HTTPS, and every pairing
 * must start from a user gesture (a tap).
 *
 * The web Bluetooth types are not part of the TypeScript DOM lib, so the objects are
 * typed loosely on purpose.
 */

const SERVICE_UUIDS = [
  "000018f0-0000-1000-8000-00805f9b34fb",
  "49535343-fe7d-4ae5-8fa9-9fafd205e455",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "0000fee7-0000-1000-8000-00805f9b34fb",
  "0000ff00-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "0000ae30-0000-1000-8000-00805f9b34fb",
];

/** Known write characteristics, in order of preference. */
const PREFERRED_CHARACTERISTICS = [
  "00002af1-0000-1000-8000-00805f9b34fb",
  "49535343-8841-43f4-a8d4-ecbe34729bb3",
];

const CONNECT_TIMEOUT_MS = 12_000;
/** Rows sent per GS v 0 command. Keeps each command small so the printer buffer never overflows. */
const BAND_ROWS = 128;
const MAX_ATTEMPTS = 3;

export class PrinterError extends Error {
  constructor(
    message: string,
    public code: "unsupported" | "no_device" | "cancelled" | "connect_failed" | "no_channel" | "write_failed",
  ) {
    super(message);
    this.name = "PrinterError";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new PrinterError(message, "connect_failed")), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function bluetooth(): any {
  return typeof navigator !== "undefined" ? (navigator as any).bluetooth : undefined;
}

export class Pt210Printer {
  private device: any = null;
  private characteristic: any = null;
  private disconnectHandler: (() => void) | null = null;

  /** Called when the printer drops the connection (turned off, out of range, etc.). */
  onDisconnected: (() => void) | null = null;

  static isSupported(): boolean {
    return !!bluetooth();
  }

  get hasDevice(): boolean {
    return !!this.device;
  }

  get name(): string | null {
    return this.device?.name ?? null;
  }

  get id(): string | null {
    return this.device?.id ?? null;
  }

  get connected(): boolean {
    return !!this.device?.gatt?.connected && !!this.characteristic;
  }

  /** Opens the browser's Bluetooth picker. Must be called from a tap. */
  async pair(showAllDevices = false): Promise<void> {
    const bt = bluetooth();
    if (!bt) throw new PrinterError("Este navegador no permite conectar impresoras Bluetooth.", "unsupported");

    let device: any;
    try {
      device = await bt.requestDevice(
        showAllDevices
          ? { acceptAllDevices: true, optionalServices: SERVICE_UUIDS }
          : {
              filters: [
                { services: [SERVICE_UUIDS[0]] },
                { services: [SERVICE_UUIDS[1]] },
                { namePrefix: "PT-" },
                { namePrefix: "PT2" },
                { namePrefix: "MTP" },
                { namePrefix: "GOOJPRT" },
                { namePrefix: "Printer" },
              ],
              optionalServices: SERVICE_UUIDS,
            },
      );
    } catch (e: any) {
      if (e?.name === "NotFoundError") {
        throw new PrinterError("No se eligió ninguna impresora.", "cancelled");
      }
      throw new PrinterError(e?.message ?? "No se pudo abrir la lista de dispositivos.", "connect_failed");
    }

    this.attach(device);
    await this.connect();
  }

  /**
   * Re-links a printer that was paired before (needs `navigator.bluetooth.getDevices`,
   * which not every browser version has). Returns false when it can't be done silently.
   */
  async restore(savedId: string): Promise<boolean> {
    const bt = bluetooth();
    if (!bt?.getDevices) return false;
    try {
      const devices: any[] = await bt.getDevices();
      const found = devices.find((d) => d.id === savedId);
      if (!found) return false;
      this.attach(found);
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }

  private attach(device: any) {
    this.detach();
    this.device = device;
    this.characteristic = null;
    this.disconnectHandler = () => {
      this.characteristic = null;
      this.onDisconnected?.();
    };
    device.addEventListener("gattserverdisconnected", this.disconnectHandler);
  }

  private detach() {
    if (this.device && this.disconnectHandler) {
      this.device.removeEventListener("gattserverdisconnected", this.disconnectHandler);
    }
    this.disconnectHandler = null;
  }

  /** Connects to the already-known device and finds the channel we write to. */
  async connect(): Promise<void> {
    if (!this.device) throw new PrinterError("Aún no has vinculado una impresora.", "no_device");
    if (this.connected) return;

    try {
      const server = await withTimeout(
        this.device.gatt.connect(),
        CONNECT_TIMEOUT_MS,
        "La impresora no responde. Revisa que esté encendida y cerca del teléfono.",
      );
      this.characteristic = await this.findWriteCharacteristic(server);
    } catch (e: any) {
      this.safeDisconnect();
      if (e instanceof PrinterError) throw e;
      throw new PrinterError(
        "No se pudo conectar con la impresora. Revisa que esté encendida y cerca del teléfono.",
        "connect_failed",
      );
    }
  }

  private async findWriteCharacteristic(server: any): Promise<any> {
    const services: any[] = await server.getPrimaryServices();
    let fallback: any = null;

    for (const preferred of PREFERRED_CHARACTERISTICS) {
      for (const service of services) {
        try {
          const ch = await service.getCharacteristic(preferred);
          if (ch.properties.write || ch.properties.writeWithoutResponse) return ch;
        } catch {
          // This service doesn't have it; keep looking.
        }
      }
    }

    for (const service of services) {
      let chars: any[] = [];
      try {
        chars = await service.getCharacteristics();
      } catch {
        continue;
      }
      for (const ch of chars) {
        if (ch.properties.write || ch.properties.writeWithoutResponse) {
          fallback = fallback ?? ch;
        }
      }
    }

    if (!fallback) {
      throw new PrinterError(
        "Este dispositivo no parece ser una impresora compatible.",
        "no_channel",
      );
    }
    return fallback;
  }

  private safeDisconnect() {
    try {
      if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    } catch {
      // ignore
    }
    this.characteristic = null;
  }

  /** Closes the connection but keeps the device so we can reconnect without the picker. */
  disconnect() {
    this.safeDisconnect();
  }

  /** Removes the saved pairing completely. */
  async forget() {
    this.safeDisconnect();
    this.detach();
    try {
      await this.device?.forget?.();
    } catch {
      // ignore
    }
    this.device = null;
  }

  private async write(bytes: Uint8Array) {
    const ch = this.characteristic;
    if (!ch) throw new PrinterError("Impresora desconectada.", "write_failed");
    const acknowledged = !!ch.properties.write;
    // 128 bytes with acknowledgement is what the PT-210 handles reliably; fall back to
    // tiny unacknowledged writes with a pause only if that's all the printer offers.
    const size = acknowledged ? 128 : 20;
    for (let i = 0; i < bytes.length; i += size) {
      const chunk = bytes.slice(i, i + size);
      if (acknowledged) {
        if (ch.writeValueWithResponse) await ch.writeValueWithResponse(chunk);
        else await ch.writeValue(chunk);
      } else {
        await ch.writeValueWithoutResponse(chunk);
        await sleep(12);
      }
    }
  }

  private async sendRaster(raster: Raster) {
    if (raster.bytesPerRow > 0xff) throw new PrinterError("Imagen demasiado ancha.", "write_failed");

    await this.write(new Uint8Array([0x1b, 0x40])); // ESC @  (initialize)

    for (let row = 0; row < raster.height; row += BAND_ROWS) {
      const rows = Math.min(BAND_ROWS, raster.height - row);
      const header = new Uint8Array([
        0x1d, 0x76, 0x30, 0x00, // GS v 0, normal density
        raster.bytesPerRow & 0xff, (raster.bytesPerRow >> 8) & 0xff,
        rows & 0xff, (rows >> 8) & 0xff,
      ]);
      const body = raster.data.subarray(row * raster.bytesPerRow, (row + rows) * raster.bytesPerRow);
      const packet = new Uint8Array(header.length + body.length);
      packet.set(header, 0);
      packet.set(body, header.length);
      await this.write(packet);
    }

    await this.write(new Uint8Array([0x1b, 0x64, 0x06])); // ESC d 6 (feed past the tear bar)
  }

  /**
   * Prints a bitmap. Reconnects automatically and retries a couple of times if the
   * connection drops while printing.
   */
  async printRaster(raster: Raster): Promise<void> {
    if (!this.device) throw new PrinterError("Aún no has vinculado una impresora.", "no_device");

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        if (!this.connected) await this.connect();
        await this.sendRaster(raster);
        return;
      } catch (e) {
        lastError = e;
        this.safeDisconnect();
        if (attempt < MAX_ATTEMPTS) await sleep(600 * attempt);
      }
    }

    if (lastError instanceof PrinterError && lastError.code !== "write_failed") throw lastError;
    throw new PrinterError(
      "No se pudo imprimir. Revisa que la impresora esté encendida, con papel y batería.",
      "write_failed",
    );
  }
}
