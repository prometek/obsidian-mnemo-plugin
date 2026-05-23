export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export interface MnemoSettings {
  port: number;
  chromaPath: string;
  logLevel: LogLevel;
  autoStart: boolean;
  showLogs: boolean;
  showNotices: boolean;
}

export const DEFAULT_SETTINGS: MnemoSettings = {
  port: 8765,
  chromaPath: '',
  logLevel: 'INFO',
  autoStart: true,
  showLogs: true,
  showNotices: true,
};
