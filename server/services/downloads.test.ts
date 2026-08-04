import { afterEach, describe, expect, it, vi } from "vitest";
import { getDownloadManifest } from "./downloads.js";

const variables = [
  "DOWNLOAD_WINDOWS_URL",
  "DOWNLOAD_ANDROID_URL",
  "DOWNLOAD_MACOS_URL",
  "DOWNLOAD_IOS_URL",
  "DOWNLOAD_ZIP_URL",
] as const;

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("download manifest", () => {
  it("keeps unpublished applications unavailable", () => {
    for (const variable of variables) vi.stubEnv(variable, "");

    expect(getDownloadManifest()).toHaveLength(5);
    expect(
      getDownloadManifest().every(
        (option) => !option.available && option.url === null,
      ),
    ).toBe(true);
  });

  it("only exposes configured HTTPS destinations", () => {
    vi.stubEnv(
      "DOWNLOAD_WINDOWS_URL",
      "https://apps.example.com/umbravia-forge",
    );
    vi.stubEnv(
      "DOWNLOAD_ANDROID_URL",
      "http://insecure.example.com/umbravia-forge",
    );
    vi.stubEnv("DOWNLOAD_ZIP_URL", "not-a-url");

    const manifest = getDownloadManifest();

    expect(manifest.find((option) => option.id === "windows")).toMatchObject({
      available: true,
      url: "https://apps.example.com/umbravia-forge",
    });
    expect(manifest.find((option) => option.id === "android")).toMatchObject({
      available: false,
      url: null,
    });
    expect(manifest.find((option) => option.id === "zip")).toMatchObject({
      available: false,
      url: null,
    });
  });
});
