import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  clearContextTokens,
  getContextToken,
  initContextTokenStore,
  setContextToken,
} from "./context-token.js";

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wechat-context-token-"));
}

describe("context-token persistence", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    clearContextTokens();
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("persists tokens to disk and restores them on init", () => {
    tempDir = makeTempDir();

    initContextTokenStore(tempDir);
    setContextToken("account-1", "user-a", "token-a");
    setContextToken("account-2", "user-a", "token-b");

    initContextTokenStore(tempDir);

    expect(getContextToken("account-1", "user-a")).toBe("token-a");
    expect(getContextToken("account-2", "user-a")).toBe("token-b");
  });

  it("clears persisted tokens on logout cleanup", () => {
    tempDir = makeTempDir();

    initContextTokenStore(tempDir);
    setContextToken("account-1", "user-a", "token-a");
    clearContextTokens();

    initContextTokenStore(tempDir);

    expect(getContextToken("account-1", "user-a")).toBeUndefined();
  });

  it("keeps tokens isolated between accounts", () => {
    tempDir = makeTempDir();

    initContextTokenStore(tempDir);
    setContextToken("account-1", "user-a", "token-a");
    setContextToken("account-2", "user-a", "token-b");

    expect(getContextToken("account-1", "user-a")).toBe("token-a");
    expect(getContextToken("account-2", "user-a")).toBe("token-b");
  });
});
