import { Plugin } from 'obsidian';

import { DEFAULT_SETTINGS, type MnemoSettings } from './settings';

export default class MnemoPlugin extends Plugin {
  settings!: MnemoSettings;

  async onload(): Promise<void> {
    await this.loadSettings();
    // TODO(server-manager): start server if settings.autoStart
    // TODO(settings-tab): this.addSettingTab(new MnemoSettingTab(this.app, this))
  }

  onunload(): void {
    // TODO(server-manager): serverManager.stop()
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()) as MnemoSettings;
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
