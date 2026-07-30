import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type LocaleTree = Record<string, string | LocaleTree>;

function readLocale(name: string): LocaleTree {
  return JSON.parse(
    readFileSync(resolve("client/src/i18n/locales", `${name}.json`), "utf8"),
  ) as LocaleTree;
}

function flatten(tree: LocaleTree, prefix = ""): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tree).flatMap(([key, value]) => {
      const path = prefix ? `${prefix}.${key}` : key;
      return typeof value === "string"
        ? [[path, value]]
        : Object.entries(flatten(value, path));
    }),
  );
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)]
    .map((match) => match[1])
    .sort();
}

describe("translation catalogues", () => {
  const english = flatten(readLocale("en"));

  it.each(["es", "de", "de-CH"])(
    "%s contains every translation key and preserves placeholders",
    (language) => {
      const locale = flatten(readLocale(language));

      expect(Object.keys(locale).sort()).toEqual(Object.keys(english).sort());

      for (const [key, value] of Object.entries(locale)) {
        expect(placeholders(value), key).toEqual(placeholders(english[key]));
      }
    },
  );

  it("uses Swiss spelling in the de-CH catalogue", () => {
    const swissGerman = Object.values(flatten(readLocale("de-CH"))).join("\n");
    expect(swissGerman).not.toContain("ß");
  });
});
