'use strict';

import {Uri, workspace} from 'vscode';

export class Configuration {
  public static getActiveResource(): Uri {
    let result = workspace.workspaceFolders![0].uri;
    if (workspace.workspaceFolders!.length > 1) {
      const activeFolder = Configuration.getActiveFolder();
      result = workspace.workspaceFolders!.find(
        folder => folder.name === activeFolder
      )!.uri;
    }
    return result;
  }

  public static getActiveFolder(): string {
    return Configuration.loadAnySetting<string>('activeFolder', '', 'iis');
  }

  public static getConfigPath(resource: Uri): string {
    return Configuration.loadSetting('configDir', '', true, 'iis', resource);
  }

  public static getBrowser(resource: Uri): string {
    return Configuration.loadSetting('browser', '', true, 'iis', resource);
  }

  public static async setActiveFolder(
    value: string
  ): Promise<string | undefined> {
    return Configuration.saveAnySetting('activeFolder', value, 'iis');
  }

  public static async setConfigPath(
    value: string,
    insertMacro: boolean,
    resource: Uri
  ): Promise<string | undefined> {
    return await Configuration.saveSetting(
      'configDir',
      value,
      insertMacro,
      'iis',
      resource
    );
  }

  private static loadAnySetting<T>(
    configSection: string,
    defaultValue: T,
    header = 'iis',
    resource: Uri | undefined = undefined
  ): T {
    return workspace
      .getConfiguration(header, resource)
      .get(configSection, defaultValue);
  }

  private static async saveAnySetting<T>(
    configSection: string,
    value: T,
    header = 'iis',
    resource: Uri | undefined = undefined
  ): Promise<T | undefined> {
    if (workspace.workspaceFolders) {
      await workspace
        .getConfiguration(header, resource)
        .update(configSection, value);
      return value;
    }
    return undefined;
  }

  private static loadSetting(
    configSection: string,
    defaultValue: string,
    expand = true,
    header = 'iis',
    resource: Uri
  ): string {
    const result = this.loadAnySetting<string>(
      configSection,
      defaultValue,
      header,
      resource
    );
    if (expand && result !== null) {
      return this.expandMacro(result, resource);
    }

    return result;
  }

  private static async saveSetting(
    configSection: string,
    value: string,
    insertMacro = false,
    header = 'iis',
    resource: Uri
  ): Promise<string | undefined> {
    if (insertMacro) {
      value = this.insertMacro(value, resource);
    }
    return await this.saveAnySetting<string>(
      configSection,
      value,
      header,
      resource
    );
  }

  private static insertMacro(input: string, resource: Uri): string {
    const path = workspace.getWorkspaceFolder(resource)!.uri.fsPath;
    if (path && input.startsWith(path)) {
      return input.replace(path, '${workspaceFolder}');
    }
    return input;
  }

  public static expandMacro(input: string, resource: Uri): string {
    if (input.indexOf('${') === -1) {
      return input;
    }

    let expanded: string;
    if (input.indexOf('${env:') > -1) {
      expanded = input.replace(/\$\{env:(.+)\}/, (_match, p1) => {
        const variable = process.env[p1];
        return variable ?? '';
      });
    } else {
      expanded = input;
    }

    if (expanded.indexOf('${') > -1) {
      const path = workspace.getWorkspaceFolder(resource)!.uri.fsPath;
      if (path) {
        return expanded
          .replace('${workspaceRoot}', path)
          .replace('${workspaceFolder}', path);
      }
    }

    return expanded;
  }
}
