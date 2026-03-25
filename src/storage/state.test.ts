import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { StateManager } from "./state.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wechat-state-"));
}

describe("StateManager", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("migrates legacy single-account state into accounts array", () => {
    tempDir = makeTempDir();
    const statePath = path.join(tempDir, "state.json");

    fs.writeFileSync(
      statePath,
      JSON.stringify({
        credentials: {
          token: "token-1",
          accountId: "account-1",
          baseUrl: "https://example.com",
          userId: "user-1",
        },
        getUpdatesBuf: "buf-1",
      }),
      "utf-8",
    );

    const manager = new StateManager(tempDir);
    const state = manager.load();

    expect(state.accounts).toEqual([
      {
        token: "token-1",
        accountId: "account-1",
        baseUrl: "https://example.com",
        userId: "user-1",
        getUpdatesBuf: "buf-1",
      },
    ]);
  });

  it("replaces stale accounts with the same userId when re-login happens", () => {
    tempDir = makeTempDir();
    const manager = new StateManager(tempDir);
    manager.load();

    manager.upsertAccount({
      token: "token-1",
      accountId: "account-1",
      baseUrl: "https://example.com",
      userId: "user-1",
    });

    const result = manager.upsertAccount({
      token: "token-2",
      accountId: "account-2",
      baseUrl: "https://example.com",
      userId: "user-1",
    });

    expect(result.removedAccountIds).toEqual(["account-1"]);
    expect(manager.listAccounts()).toEqual([
      {
        token: "token-2",
        accountId: "account-2",
        baseUrl: "https://example.com",
        userId: "user-1",
      },
    ]);
  });
});
