import { FileSystemAdapter, Notice, Plugin } from 'obsidian';

import { MnemoClient } from './services/mnemoClient';
import { ServerManager } from './services/serverManager';
import { DEFAULT_SETTINGS, type MnemoSettings } from './settings';
import { MnemoSettingTab } from './ui/settingTab';

export default class MnemoPlugin extends Plugin {
  settings!: MnemoSettings;
  serverManager!: ServerManager;
  client!: MnemoClient;

  private settingTab!: MnemoSettingTab;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.serverManager = new ServerManager();
    this.client = new MnemoClient(this.settings.port);

    this.serverManager.on('crashed', (exitCode) => {
      new Notice(
        `obsidian-mnemo server crashed (exit ${String(exitCode ?? 'null')}). Check the console for details.`,
      );
      this.settingTab.refreshStatus();
    });

    this.serverManager.on('state', () => {
      this.settingTab.refreshStatus();
    });

    this.serverManager.on('log', (line) => {
      this.settingTab.appendLog(line);
    });

    this.settingTab = new MnemoSettingTab(this.app, this);
    this.addSettingTab(this.settingTab);

    this.registerDomEvent(window, 'beforeunload', () => {
      this.serverManager.killSync();
    });

    if (this.settings.autoStart) {
      try {
        await this.startServer();
      } catch (err) {
        console.error('[obsidian-mnemo] auto-start failed:', err);
        new Notice(`obsidian-mnemo: ${String(err)}`, 10000);
      }
    }
  }

  onunload(): void {
    this.serverManager.killSync();
  }

  async startServer(): Promise<void> {
    const vaultPath = this.getVaultPath();
    await this.serverManager.start({
      vaultPath,
      port: this.settings.port,
      chromaPath: this.settings.chromaPath,
      logLevel: this.settings.logLevel,
    });
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as MnemoSettings;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private getVaultPath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) {
      return adapter.getBasePath();
    }
    return '';
  }
}
