import { Plugin } from 'obsidian';

export default class MnemoPlugin extends Plugin {
  async onload(): Promise<void> {
    // TODO: load settings, start server, register commands and settings tab
  }

  onunload(): void {
    // TODO: kill server, cleanup resources
  }
}
