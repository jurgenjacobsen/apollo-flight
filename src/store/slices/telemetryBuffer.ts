import { TelemetryPoint } from "../../types/flight";
import { safeInvoke } from "../../utils/ipc";

const BATCH_SIZE_THRESHOLD = 20;
const FLUSH_INTERVAL_MS = 5000;

let telemetryBuffer: TelemetryPoint[] = [];
let lastFlushTimestamp = Date.now();

export type TelemetryBatchInvoker = (
    cmd: string,
    args: { points: TelemetryPoint[] },
) => Promise<unknown>;

/**
 * Buffers a telemetry point and flushes to SQLite when the batch size or age threshold is reached.
 */
export async function pushTelemetryPoint(
    point: TelemetryPoint,
    invoker: TelemetryBatchInvoker = safeInvoke,
): Promise<void> {
    telemetryBuffer.push(point);
    if (
        telemetryBuffer.length >= BATCH_SIZE_THRESHOLD ||
        Date.now() - lastFlushTimestamp > FLUSH_INTERVAL_MS
    ) {
        await flushTelemetryBuffer(invoker);
    }
}

/**
 * Flushes any buffered telemetry points to SQLite in a single batch.
 */
export async function flushTelemetryBuffer(
    invoker: TelemetryBatchInvoker = safeInvoke,
): Promise<void> {
    if (telemetryBuffer.length === 0) return;
    const toSend = [...telemetryBuffer];
    telemetryBuffer = [];
    lastFlushTimestamp = Date.now();

    await invoker("save_telemetry_batch", { points: toSend });
}

/**
 * Clears any buffered telemetry points without persisting (used in tests).
 */
export function resetTelemetryBuffer(): void {
    telemetryBuffer = [];
    lastFlushTimestamp = Date.now();
}

/**
 * Returns the number of points currently waiting in the buffer.
 */
export function getTelemetryBufferLength(): number {
    return telemetryBuffer.length;
}
