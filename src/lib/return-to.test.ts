import { beforeEach, describe, expect, it } from "vitest";
import { getReturnTo, setReturnTo } from "./return-to";

describe("private area return path", () => {
  beforeEach(() => sessionStorage.clear());
  it("defaults to the recipe dashboard", () => expect(getReturnTo()).toBe("/dashboard"));
  it("returns to ZENVIK-AGENT after the gate when that was requested", () => {
    setReturnTo("/zenvik-agent");
    expect(getReturnTo()).toBe("/zenvik-agent");
  });
  it("handles a GitHub Pages sub-path", () => {
    setReturnTo("/my-repo/zenvik-agent/");
    expect(getReturnTo()).toBe("/zenvik-agent");
  });
  it("ignores unknown paths", () => {
    setReturnTo("https://evil.example/zenvik");
    expect(getReturnTo()).toBe("/dashboard");
  });
});
