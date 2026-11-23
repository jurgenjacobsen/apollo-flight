// Dynamic safe invoke helper for Tauri v2 / browser compatibility
export async function safeInvoke<T>(
    cmd: string,
    args: Record<string, any> = {},
): Promise<T | null> {
    if (
        typeof window !== "undefined" &&
        ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
    ) {
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            return await invoke<T>(cmd, args);
        } catch (err) {
            console.warn(
                `[Tauri IPC] ${cmd} failed or running outside Tauri runtime:`,
                err,
            );
            return null;
        }
    }
    return null;
}
