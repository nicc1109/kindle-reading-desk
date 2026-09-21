import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

function luminance(hex: string): number {
  const channels = hex.match(/[\da-f]{2}/gi)?.map((value) => Number.parseInt(value, 16) / 255) || [];
  const [red, green, blue] = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrast(foreground: string, background: string): number {
  const left = luminance(foreground.replace("#", ""));
  const right = luminance(background.replace("#", ""));
  return (Math.max(left, right) + 0.05) / (Math.min(left, right) + 0.05);
}

describe("visual accessibility tokens", () => {
  it("keeps normal text colors at WCAG AA contrast and focus indicators at 3:1", async () => {
    const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
    const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[\\da-f]{6})`, "i"))?.[1] || "";
    const paper = token("paper");

    for (const foreground of [token("ink"), token("muted"), token("oxblood"), token("green"), token("amber"), token("blue")]) {
      expect(contrast(foreground, paper), `${foreground} on ${paper}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast("#fffaf3", token("oxblood"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#a3454e", paper)).toBeGreaterThanOrEqual(3);
  });
});
