import { describe, it, expect } from "vitest";
import { extractOpenCodeErrorMessage } from "./open-errors.js";

describe("extractOpenCodeErrorMessage", () => {
  it("reads APIError message and appends responseBody", () => {
    const msg = extractOpenCodeErrorMessage({
      name: "APIError",
      data: {
        message: "Request failed",
        responseBody: '{"error":"insufficient_quota"}',
      },
    });
    expect(msg).toContain("Request failed");
    expect(msg).toContain("insufficient_quota");
  });

  it("reads UnknownError message", () => {
    expect(
      extractOpenCodeErrorMessage({
        name: "UnknownError",
        data: { message: "out of funds" },
      }),
    ).toBe("out of funds");
  });

  it("returns undefined when no message", () => {
    expect(extractOpenCodeErrorMessage({ name: "MessageOutputLengthError", data: {} })).toBeUndefined();
  });
});
