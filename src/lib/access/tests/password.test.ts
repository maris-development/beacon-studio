import { describe, expect, it } from "vitest";
import { generatePassword, maskSecret } from "../password";

it("gives 20 characters from the alphabet", () => {
    expect(generatePassword()).toMatch(/^[A-HJ-NP-Za-km-z2-9]{20}$/);
});

it("drops bytes above the last full alphabet cycle", () => {
    // 255 is above the cutoff, so the next byte (0) gives the first letter.
    let calls = 0;
    const random = (bytes: Uint8Array) => {
        bytes.fill(calls++ === 0 ? 255 : 0);
        return bytes;
    };
    expect(generatePassword(random, 1)).toBe("A");
});

describe("maskSecret", () => {
    it("masks the typed form", () => {
        expect(maskSecret("bad abc here", "abc")).toBe("bad *** here");
    });

    it("masks the quoted form", () => {
        expect(maskSecret("WITH PASSWORD 'a''b'", "a'b")).toBe("WITH PASSWORD '***'");
    });

    it("masks every copy", () => {
        expect(maskSecret("abc abc", "abc")).toBe("*** ***");
    });

    it("keeps the text for an empty secret", () => {
        expect(maskSecret("text", "")).toBe("text");
    });
});
