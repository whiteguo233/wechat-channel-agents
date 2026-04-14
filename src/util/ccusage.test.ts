import { beforeEach, describe, expect, it, vi } from "vitest";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

describe("getClaudeUsageReport", () => {
  beforeEach(() => {
    vi.resetModules();
    execFileMock.mockReset();
  });

  it("runs ccusage daily in compact offline mode", async () => {
    execFileMock.mockImplementation((_file, _args, _opts, cb) => {
      cb(null, "usage output", "");
    });

    const { getClaudeUsageReport } = await import("./ccusage.js");
    const result = await getClaudeUsageReport();

    expect(result).toBe("usage output");
    expect(execFileMock).toHaveBeenCalledWith(
      "ccusage",
      ["daily", "--compact", "--offline", "--no-color"],
      expect.objectContaining({
        env: expect.objectContaining({ NO_COLOR: "1" }),
        maxBuffer: 1024 * 1024,
      }),
      expect.any(Function),
    );
  });

  it("surfaces command failures with stderr", async () => {
    execFileMock.mockImplementation((_file, _args, _opts, cb) => {
      cb(new Error("exit 1"), "", "ccusage failed");
    });

    const { getClaudeUsageReport } = await import("./ccusage.js");

    await expect(getClaudeUsageReport()).rejects.toThrow("ccusage failed");
  });
});
