import { App, Notice, PluginSettingTab, Setting } from 'obsidian';

import type MnemoPlugin from '../main';
import { type LogLevel } from '../settings';

export class MnemoSettingTab extends PluginSettingTab {
  private settingsDirty = false;
  private isTransitioning = false;
  private logEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly plugin: MnemoPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'Mnemo' });

    this.renderStatusSection(containerEl);
    if (this.settingsDirty && this.plugin.serverManager.isRunning()) {
      this.renderDirtyBanner(containerEl);
    }
    this.renderFields(containerEl);
    if (this.plugin.settings.showLogs) {
      this.renderLogSection(containerEl);
    }
  }

  refreshStatus(): void {
    this.display();
  }

  private renderStatusSection(containerEl: HTMLElement): void {
    const state = this.plugin.serverManager.getState();
    const status = this.plugin.serverManager.getStatus();

    let statusText: string;
    let statusColor: string;
    if (state === 'installing') {
      statusText = 'Installing… (this may take a minute)';
      statusColor = 'var(--color-yellow)';
    } else if (state === 'starting') {
      statusText = 'Starting…';
      statusColor = 'var(--color-yellow)';
    } else if (state === 'syncing') {
      statusText = `Syncing vault… (PID ${String(status.pid ?? '?')})`;
      statusColor = 'var(--color-yellow)';
    } else if (state === 'running') {
      statusText = `Running (PID ${String(status.pid ?? '?')})`;
      statusColor = 'var(--color-green)';
    } else {
      statusText = 'Stopped';
      statusColor = 'var(--color-red)';
    }

    const setting = new Setting(containerEl).setName('Server status').setDesc(statusText);

    setting.descEl.style.color = statusColor;

    if (this.isTransitioning || state === 'installing' || state === 'starting') {
      setting.addButton((btn) => btn.setButtonText('…').setDisabled(true));
      return;
    }

    if (state === 'stopped') {
      setting.addButton((btn) =>
        btn
          .setButtonText('Start')
          .setCta()
          .onClick(() => {
            void this.startServer();
          }),
      );
    } else {
      setting.addButton((btn) =>
        btn.setButtonText('Stop').onClick(() => {
          void this.stopServer();
        }),
      );
      setting.addButton((btn) =>
        btn.setButtonText('Restart').onClick(() => {
          void this.restartServer();
        }),
      );
    }
  }

  private renderDirtyBanner(containerEl: HTMLElement): void {
    const banner = containerEl.createEl('div', {
      text: '⚠ Restart the server to apply changes.',
    });
    banner.style.cssText =
      'background:var(--background-modifier-warning);padding:8px 12px;border-radius:4px;margin-bottom:12px;font-size:0.9em;';
  }

  private renderFields(containerEl: HTMLElement): void {
    new Setting(containerEl)
      .setName('Port')
      .setDesc('Port for the obsidian-mnemo SSE server (default: 8765)')
      .addText((text) =>
        text
          .setPlaceholder('8765')
          .setValue(String(this.plugin.settings.port))
          .onChange(async (value) => {
            const port = parseInt(value, 10);
            if (!Number.isNaN(port) && port > 0 && port < 65536) {
              this.plugin.settings.port = port;
              await this.plugin.saveSettings();
              this.markDirty();
            }
          }),
      );

    new Setting(containerEl)
      .setName('ChromaDB path')
      .setDesc('Persistence directory for the vector index. Leave empty for default.')
      .addText((text) =>
        text
          .setPlaceholder('~/.obsidian-mnemo/chroma')
          .setValue(this.plugin.settings.chromaPath)
          .onChange(async (value) => {
            this.plugin.settings.chromaPath = value.trim();
            await this.plugin.saveSettings();
            this.markDirty();
          }),
      );

    new Setting(containerEl)
      .setName('Log level')
      .setDesc('Verbosity of the obsidian-mnemo server logs.')
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            DEBUG: 'DEBUG',
            INFO: 'INFO',
            WARNING: 'WARNING',
            ERROR: 'ERROR',
          })
          .setValue(this.plugin.settings.logLevel)
          .onChange(async (value) => {
            this.plugin.settings.logLevel = value as LogLevel;
            await this.plugin.saveSettings();
            this.markDirty();
          }),
      );

    new Setting(containerEl)
      .setName('Auto-start')
      .setDesc('Start the server automatically when Obsidian loads the plugin.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoStart).onChange(async (value) => {
          this.plugin.settings.autoStart = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName('Show logs')
      .setDesc('Display server logs in the settings tab.')
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showLogs).onChange(async (value) => {
          this.plugin.settings.showLogs = value;
          await this.plugin.saveSettings();
          this.display();
        }),
      );
  }

  private renderLogSection(containerEl: HTMLElement): void {
    containerEl.createEl('h3', { text: 'Logs' });

    const pre = containerEl.createEl('pre');
    pre.style.cssText =
      'max-height:200px;overflow-y:auto;background:var(--background-secondary);' +
      'padding:8px;border-radius:4px;font-size:0.8em;white-space:pre-wrap;word-break:break-all;';

    const logs = this.plugin.serverManager.getLogs();
    pre.setText(logs.join('\n'));
    pre.scrollTop = pre.scrollHeight;

    this.logEl = pre;
  }

  appendLog(line: string): void {
    if (!this.logEl || !this.plugin.settings.showLogs) return;
    const current = this.logEl.getText();
    this.logEl.setText(current ? `${current}\n${line}` : line);
    this.logEl.scrollTop = this.logEl.scrollHeight;
  }

  private markDirty(): void {
    if (!this.settingsDirty && this.plugin.serverManager.isRunning()) {
      this.settingsDirty = true;
      this.display();
    }
  }

  private async startServer(): Promise<void> {
    this.isTransitioning = true;
    this.display();
    try {
      await this.plugin.startServer();
      this.settingsDirty = false;
    } catch (err) {
      new Notice(`Failed to start server: ${String(err)}`);
    } finally {
      this.isTransitioning = false;
      this.display();
    }
  }

  private async stopServer(): Promise<void> {
    this.isTransitioning = true;
    this.display();
    try {
      await this.plugin.serverManager.stop();
    } finally {
      this.isTransitioning = false;
      this.display();
    }
  }

  private async restartServer(): Promise<void> {
    this.isTransitioning = true;
    this.display();
    try {
      await this.plugin.serverManager.stop();
      await this.plugin.startServer();
      this.settingsDirty = false;
    } catch (err) {
      new Notice(`Failed to restart server: ${String(err)}`);
    } finally {
      this.isTransitioning = false;
      this.display();
    }
  }
}
