import { describe, expect, it } from "vitest"

import { sha256 } from "./sha256"

const enc = (s: string) => new TextEncoder().encode(s)

describe("sha256 (fallback)", () => {
  it("coincide con los vectores conocidos", () => {
    expect(sha256(enc(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    )
    expect(sha256(enc("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    )
  })
})
