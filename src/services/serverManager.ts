import { type ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LogLevel } from '../settings';

export interface ServerStatus {
  running: boolean;
  pid?: number;
  installing?: boolean;
}

export type ServerState = 'stopped' | 'installing' | 'starting' | 'syncing' | 'running';

interface StartOptions {
  vaultPath: string;
  port: number;
  chromaPath: string;
  logLevel: LogLevel;
}

// Directories Electron omits from PATH on macOS
const EXTRA_DIRS = [
  path.join(os.homedir(), '.local', 'bin'),
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
];

const MAX_LOG_LINES = 100;

export class ServerManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private state: ServerState = 'stopped';
  private readonly logLines: string[] = [];
  private ownedPid: number | null = null;

  on(event: 'crashed', listener: (exitCode: number | null) => void): this;
  on(event: 'state', listener: (state: ServerState) => void): this;
  on(event: 'log', listener: (line: string) => void): this;
  on(event: 'synced', listener: (indexed: number, skipped: number) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  emit(event: 'crashed', exitCode: number | null): boolean;
  emit(event: 'state', state: ServerState): boolean;
  emit(event: 'log', line: string): boolean;
  emit(event: 'synced', indexed: number, skipped: number): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string | symbol, ...args: any[]): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return super.emit(event, ...args);
  }

  getLogs(): readonly string[] {
    return this.logLines;
  }

  getState(): ServerState {
    return this.state;
  }

  private log(line: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    const entry = `${ts}  ${line}`;
    this.logLines.push(entry);
    if (this.logLines.length > MAX_LOG_LINES) this.logLines.shift();
    this.emit('log', entry);
  }

  async start(opts: StartOptions): Promise<void> {
    if (this.isRunning()) return;

    const inUse = await isPortInUse(opts.port);
    if (inUse) {
      this.log(`port ${String(opts.port)} already in use — reusing existing instance`);
      this.setState('running');
      return;
    }

    let binaryPath = findExecutable('obsidian-mnemo');

    if (!binaryPath) {
      this.setState('installing');
      await installObsidianMnemo(this.log.bind(this));
      binaryPath = findExecutable('obsidian-mnemo');
      if (!binaryPath) {
        this.setState('stopped');
        throw new Error(
          'obsidian-mnemo could not be installed automatically. ' +
            'Install it manually: uv tool install obsidian-mnemo',
        );
      }
    }

    const args = buildArgs(opts);
    this.process = spawn(binaryPath, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, PATH: augmentedPath() },
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim();
      this.log(line);
      if (line.includes('Starting initial vault sync')) {
        this.setState('syncing');
      } else if (line.includes('Vault sync done')) {
        this.setState('running');
        const match = /Vault sync done: (\d+) indexed, (\d+) skipped/.exec(line);
        if (match) {
          this.emit('synced', parseInt(match[1], 10), parseInt(match[2], 10));
        }
      }
    });

    this.ownedPid = this.process.pid ?? null;

    this.process.on('error', (err) => {
      this.ownedPid = null;
      this.process = null;
      this.setState('stopped');
      this.log(`spawn error: ${String(err)}`);
      this.emit('crashed', null);
    });

    this.process.on('exit', (code) => {
      const wasRunning = this.process !== null;
      this.ownedPid = null;
      this.process = null;
      this.setState('stopped');
      if (wasRunning && code !== 0 && code !== null) {
        this.emit('crashed', code);
      }
    });

    this.setState('starting');
  }

  getOwnedPid(): number | null {
    return this.ownedPid;
  }

  killSync(): void {
    if (this.ownedPid !== null) {
      try {
        process.kill(this.ownedPid, 'SIGKILL');
      } catch {
        // already dead
      }
    }
  }

  async stop(): Promise<void> {
    const proc = this.process;
    if (!proc) return;

    return new Promise((resolve) => {
      const killTimer = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve();
      }, 5000);

      proc.once('exit', () => {
        clearTimeout(killTimer);
        resolve();
      });

      this.process = null;
      proc.kill('SIGTERM');
    });
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  getStatus(): ServerStatus {
    if (this.state === 'installing') return { running: false, installing: true };
    if (this.state === 'stopped') return { running: false };
    return { running: true, pid: this.process?.pid };
  }

  private setState(state: ServerState): void {
    this.state = state;
    this.emit('state', state);
  }
}

function findExecutable(name: string): string | null {
  const dirs = [...EXTRA_DIRS, ...(process.env.PATH?.split(':') ?? [])];
  for (const dir of dirs) {
    const full = path.join(dir, name);
    try {
      fs.accessSync(full, fs.constants.X_OK);
      return full;
    } catch {
      // not found in this dir
    }
  }
  return null;
}

function augmentedPath(): string {
  const existing = process.env.PATH ?? '';
  const extra = EXTRA_DIRS.filter((d) => !existing.includes(d)).join(':');
  return extra ? `${extra}:${existing}` : existing;
}

function installObsidianMnemo(log: (line: string) => void): Promise<void> {
  const uv = findExecutable('uv');
  const pip = findExecutable('pip3') ?? findExecutable('pip');

  if (!uv && !pip) {
    return Promise.reject(new Error('Neither uv nor pip found. Install obsidian-mnemo manually.'));
  }

  const cmd = uv ?? (pip as string);
  const args = uv
    ? ['tool', 'install', '--python', '3.14', 'obsidian-mnemo']
    : ['install', '--user', 'obsidian-mnemo'];

  log(`installing via: ${cmd} ${args.join(' ')}`);

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, PATH: augmentedPath() },
    });

    proc.stdout.on('data', (chunk: Buffer) => {
      log(chunk.toString().trim());
    });
    proc.stderr.on('data', (chunk: Buffer) => {
      log(chunk.toString().trim());
    });

    proc.on('exit', (code) => {
      log(`install exited with code ${String(code)}`);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Installation failed (exit ${String(code)})`));
      }
    });
    proc.on('error', (err) => {
      log(`install spawn error: ${String(err)}`);
      reject(err);
    });
  });
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => {
      resolve(true);
    });
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port, '127.0.0.1');
  });
}

function buildArgs(opts: StartOptions): string[] {
  const args = [
    '--vault',
    opts.vaultPath,
    '--port',
    String(opts.port),
    '--transport',
    'sse',
    '--log-level',
    opts.logLevel,
  ];
  if (opts.chromaPath) {
    args.push('--chroma', opts.chromaPath);
  }
  return args;
}
