import { describe, expect, it } from "vitest";
import { parseServerPort } from "./server-endpoint.js";

describe("parseServerPort", () => {
  it("accepts valid numeric and string ports", () => {
    expect(parseServerPort(3001)).toBe(3001);
    expect(parseServerPort("8080")).toBe(8080);
  });

  it.each(["", "3001abc", 0, 65_536, 3.5])(
    "rejects an invalid port: %s",
    (value) => {
      expect(() => parseServerPort(value)).toThrow("Invalid server port");
    },
  );
});
