import { execFile } from "node:child_process";

export async function getClaudeUsageReport(): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "ccusage",
      ["daily", "--compact", "--offline", "--no-color"],
      {
        env: {
          ...process.env,
          NO_COLOR: "1",
        },
        maxBuffer: 1024 * 1024,
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = stderr.trim() || err.message;
          reject(new Error(detail));
          return;
        }

        const text = stdout.trim();
        resolve(text || "ccusage returned no output.");
      },
    );
  });
}
