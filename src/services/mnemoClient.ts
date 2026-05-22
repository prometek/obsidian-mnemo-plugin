import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

const CONFIG_PATH = path.join(os.homedir(), '.obsidian-mnemo', 'config.json');
const RETRY_DELAYS_MS = [500, 1000, 2000];

export class TokenMissingError extends Error {
  constructor() {
    super(
      'obsidian-mnemo config not found. Run the server once to generate it: obsidian-mnemo --vault <path>',
    );
    this.name = 'TokenMissingError';
  }
}

export class AuthError extends Error {
  constructor() {
    super('Bearer token rejected by obsidian-mnemo server (401). Re-generate config or restart.');
    this.name = 'AuthError';
  }
}

export class ServerNotReadyError extends Error {
  constructor(port: number) {
    super(`obsidian-mnemo server not reachable on port ${String(port)} after retries.`);
    this.name = 'ServerNotReadyError';
  }
}

export class MnemoError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'MnemoError';
  }
}

export class MnemoClient {
  private readonly baseUrl: string;
  private token: string | null = null;

  constructor(private readonly port: number) {
    this.baseUrl = `http://127.0.0.1:${String(port)}`;
  }

  private loadToken(): string {
    let raw: string;
    try {
      raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
    } catch {
      throw new TokenMissingError();
    }

    const config = JSON.parse(raw) as Record<string, unknown>;
    const token = config['bearer_token'];
    if (typeof token !== 'string' || token.length === 0) {
      throw new TokenMissingError();
    }
    return token;
  }

  private getToken(): string {
    if (!this.token) {
      this.token = this.loadToken();
    }
    return this.token;
  }

  async isReady(): Promise<boolean> {
    return tcpConnect(this.port);
  }

  async waitUntilReady(): Promise<void> {
    for (const delay of RETRY_DELAYS_MS) {
      if (await this.isReady()) return;
      await sleep(delay);
    }
    if (await this.isReady()) return;
    throw new ServerNotReadyError(this.port);
  }

  async vaultStatus(): Promise<VaultStatusResult> {
    const response = await this.call<VaultStatusResult>('vault_status', {});
    return response;
  }

  private async call<T>(tool: string, params: Record<string, unknown>): Promise<T> {
    const token = this.getToken();
    const res = await fetch(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: tool, arguments: params },
      }),
    });

    if (res.status === 401) throw new AuthError();
    if (!res.ok) throw new MnemoError(`Server returned ${String(res.status)}`, res.status);

    const json = (await res.json()) as JsonRpcResponse<T>;
    if ('error' in json) {
      throw new MnemoError(String(json.error.message));
    }
    return json.result;
  }
}

export interface VaultStatusResult {
  indexed: number;
  total: number;
  ready: boolean;
}

type JsonRpcResponse<T> =
  | { jsonrpc: '2.0'; id: number; result: T }
  | { jsonrpc: '2.0'; id: number; error: { code: number; message: string } };

function tcpConnect(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timer = setTimeout(() => {
      socket.destroy();
      resolve(false);
    }, 1000);
    socket.connect(port, '127.0.0.1', () => {
      clearTimeout(timer);
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
