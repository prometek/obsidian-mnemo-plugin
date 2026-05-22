export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export interface MnemoSettings {
  port: number;
  chromaPath: string;
  logLevel: LogLevel;
  autoStart: boolean;
}

export const DEFAULT_SETTINGS: MnemoSettings = {
  port: 8765,
  chromaPath: '',
  logLevel: 'INFO',
  autoStart: true,
};
