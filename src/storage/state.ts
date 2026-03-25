import fs from "node:fs";
import path from "node:path";

export interface PersistedWechatAccount {
  token: string;
  accountId: string;
  baseUrl: string;
  userId?: string;
  getUpdatesBuf?: string;
}

export interface PersistedState {
  accounts: PersistedWechatAccount[];
  credentials?: PersistedWechatAccount;
  getUpdatesBuf?: string;
}

export class StateManager {
  private filePath: string;
  private state: PersistedState = { accounts: [] };

  constructor(stateDir: string) {
    fs.mkdirSync(stateDir, { recursive: true });
    this.filePath = path.join(stateDir, "state.json");
  }

  load(): PersistedState {
    try {
      const raw = fs.readFileSync(this.filePath, "utf-8");
      this.state = this.normalizeState(JSON.parse(raw) as Partial<PersistedState>);
    } catch {
      this.state = { accounts: [] };
    }
    return this.state;
  }

  save(): void {
    fs.writeFileSync(
      this.filePath,
      JSON.stringify(this.state, null, 2),
      "utf-8",
    );
  }

  get(): PersistedState {
    return this.state;
  }

  update(partial: Partial<PersistedState>): void {
    Object.assign(this.state, partial);
    this.save();
  }

  listAccounts(): PersistedWechatAccount[] {
    return [...this.state.accounts];
  }

  upsertAccount(account: PersistedWechatAccount): { removedAccountIds: string[] } {
    const removedAccountIds: string[] = [];
    const nextAccounts = this.state.accounts.filter((existing) => {
      const sameAccountId = existing.accountId === account.accountId;
      const sameUserId = Boolean(account.userId) && existing.userId === account.userId;
      const shouldRemove = sameAccountId || sameUserId;
      if (shouldRemove) {
        removedAccountIds.push(existing.accountId);
      }
      return !shouldRemove;
    });

    nextAccounts.push(account);
    this.state = {
      accounts: nextAccounts,
    };
    this.save();

    return {
      removedAccountIds: removedAccountIds.filter((id) => id !== account.accountId),
    };
  }

  updateAccount(accountId: string, partial: Partial<PersistedWechatAccount>): void {
    this.state.accounts = this.state.accounts.map((account) =>
      account.accountId === accountId ? { ...account, ...partial } : account,
    );
    this.save();
  }

  clearAccounts(): void {
    this.state = { accounts: [] };
    this.save();
  }

  private normalizeState(raw: Partial<PersistedState>): PersistedState {
    if (Array.isArray(raw.accounts)) {
      return {
        accounts: raw.accounts.filter(isPersistedWechatAccount),
      };
    }

    if (raw.credentials && isPersistedWechatAccount(raw.credentials)) {
      return {
        accounts: [
          {
            ...raw.credentials,
            getUpdatesBuf: raw.getUpdatesBuf ?? raw.credentials.getUpdatesBuf ?? "",
          },
        ],
      };
    }

    return { accounts: [] };
  }
}

function isPersistedWechatAccount(value: unknown): value is PersistedWechatAccount {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.token === "string" &&
    typeof candidate.accountId === "string" &&
    typeof candidate.baseUrl === "string";
}
