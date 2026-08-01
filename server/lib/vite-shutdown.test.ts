import type { ViteDevServer } from "vite";
import { describe, expect, it, vi } from "vitest";
import { closeViteDevelopmentServer } from "../../scripts/vite-shutdown.js";

function viteServerFixture(
  listeningAfterClose: boolean,
  closeImplementation: () => Promise<void> = () => Promise.resolve(),
) {
  const close = vi.fn(closeImplementation);
  const closeWebSocket = vi.fn().mockResolvedValue(undefined);
  const closeWatcher = vi.fn().mockResolvedValue(undefined);
  const closePlugins = vi.fn().mockResolvedValue(undefined);
  const closeEnvironment = vi.fn().mockResolvedValue(undefined);
  const server = {
    close,
    httpServer: { listening: listeningAfterClose },
    ws: { close: closeWebSocket },
    watcher: { close: closeWatcher },
    pluginContainer: { close: closePlugins },
    environments: { client: { close: closeEnvironment } },
  } as unknown as ViteDevServer;
  return {
    close,
    closeEnvironment,
    closePlugins,
    closeWatcher,
    closeWebSocket,
    server,
  };
}

describe("Vite development shutdown", () => {
  it("awaits Vite's own complete close lifecycle", async () => {
    const { close, server } = viteServerFixture(false);

    await expect(closeViteDevelopmentServer(server)).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledOnce();
  });

  it("reports a Vite server that remains listening", async () => {
    const { server } = viteServerFixture(true);

    await expect(closeViteDevelopmentServer(server)).rejects.toThrow(
      /still listening/,
    );
  });

  it("asks Vite-owned resources to close when normal shutdown fails", async () => {
    const failure = new Error("normal close failed");
    const fixture = viteServerFixture(false, () => Promise.reject(failure));

    await expect(closeViteDevelopmentServer(fixture.server)).rejects.toThrow(
      "normal close failed",
    );
    expect(fixture.closeWebSocket).toHaveBeenCalledOnce();
    expect(fixture.closeWatcher).toHaveBeenCalledOnce();
    expect(fixture.closePlugins).toHaveBeenCalledOnce();
    expect(fixture.closeEnvironment).toHaveBeenCalledOnce();
  });
});
