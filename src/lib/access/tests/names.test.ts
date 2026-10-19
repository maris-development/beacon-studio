import { expect, it } from "vitest";
import { isValidName } from "../names";

it.each(["jane_doe", "Jane", "_x", "a1"])("accepts %s", (name) =>
    expect(isValidName(name)).toBe(true)
);
it.each(["", "1abc", "jane-doe", "jane doe", "jöhn", "a;b"])("rejects %s", (name) =>
    expect(isValidName(name)).toBe(false)
);
