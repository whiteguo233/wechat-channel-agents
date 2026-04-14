import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMessageMock = vi.fn().mockResolvedValue(undefined);
const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

vi.mock("./api.js", () => ({
  sendMessage: sendMessageMock,
}));

vi.mock("../util/logger.js", () => ({
  logger,
}));

describe("sendTextMessage", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMessageMock.mockClear();
    logger.info.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    logger.debug.mockClear();
  });

  it("logs successful sends with recipient and text length", async () => {
    const { sendTextMessage } = await import("./send.js");
    const userId = "user-123456789";

    await sendTextMessage({
      to: userId,
      text: "hello",
      opts: {
        baseUrl: "https://api.test",
        token: "tok",
        contextToken: "ctx-token",
      },
    });

    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("sendTextMessage: sent to=user...6789"),
    );
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining("len=5"),
    );
  });
});
