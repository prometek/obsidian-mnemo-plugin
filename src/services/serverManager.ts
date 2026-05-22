import { type ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import * as net from 'net';

import type { LogLevel } from '../settings';

export interface ServerStatus {
  running: boolean;
  pid?: number;
}

interface StartOptions {
  vaultPath: string;
  port: number;
  chromaPath: string;
  logLevel: LogLevel;
}

export class ServerManager extends EventEmitter {
  private process: ChildProcess | null = null;

  // typed overloads for the 'crashed' event
  on(event: 'crashed', listener: (exitCode: number | null) => void): this;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string | symbol, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  emit(event: 'crashed', exitCode: number | null): boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  emit(event: string | symbol, ...args: any[]): boolean {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return super.emit(event, ...args);
  }

  async start(opts: StartOptions): Promise<void> {
    if (this.isRunning()) return;

    const inUse = await isPortInUse(opts.port);
    if (inUse) {
      console.info(
        `obsidian-mnemo: port ${String(opts.port)} already in use — reusing existing instance`,
      );
      return;
    }

    const args = buildArgs(opts);
    this.process = spawn('obsidian-mnemo', args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      console.debug(`[obsidian-mnemo] ${chunk.toString().trim()}`);
    });

    this.process.on('exit', (code) => {
      const wasRunning = this.process !== null;
      this.process = null;
      if (wasRunning && code !== 0 && code !== null) {
        this.emit('crashed', code);
      }
    });
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
    if (!this.isRunning()) return { running: false };
    return { running: true, pid: this.process?.pid };
  }
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
