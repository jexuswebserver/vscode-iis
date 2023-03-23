'use strict';

import {
    workspace, WorkspaceFolder
} from 'vscode';

export class Configuration {
    public static getConfigPath(): string {
        return Configuration.loadSetting('configDir', '', true, 'iis');
    }

    public static async setConfigPath(value: string, insertMacro: boolean): Promise<string | undefined> {
        return await Configuration.saveSetting('configDir', value, insertMacro, 'iis');
    }

    private static loadAnySetting<T>(
        configSection: string, defaultValue: T, header: string = 'iis',
    ): T {
        return workspace.getConfiguration(header, null).get(configSection, defaultValue);
    }

    private static async saveAnySetting<T>(
        configSection: string, value: T, header: string = 'iis',
    ): Promise<T | undefined> {
        if (workspace.workspaceFolders)
        {
            await workspace.getConfiguration(header, null).update(configSection, value);
            return value;
        }
    }

    private static loadSetting(
        configSection: string,
        defaultValue: string,
        expand: boolean = true,
        header: string = 'iis'
    ): string {
        const result = this.loadAnySetting<string>(configSection, defaultValue, header);
        if (expand && result != null) {
            return this.expandMacro(result);
        }

        return result;
    }

    private static async saveSetting(
        configSection: string, value: string, insertMacro: boolean = false, header: string = 'iis',
    ): Promise<string | undefined> {
        if (insertMacro) {
            value = this.insertMacro(value);
        }
        return await this.saveAnySetting<string>(configSection, value, header);
    }

    private static insertMacro(input: string): string {

        let path: string | undefined;
        if (!workspace.workspaceFolders) {
            path = workspace.rootPath;
        } else {
            let root: WorkspaceFolder | undefined;
            if (workspace.workspaceFolders.length === 1) {
                root = workspace.workspaceFolders[0];
            }
            path = root ? root.uri.fsPath : undefined;
        }

        if (path && input.startsWith(path)) {
            return input
                .replace(path, '${workspaceFolder}');
        }
        return input;
    }

    public static expandMacro(input: string): string {
        if (input.indexOf('${') === -1) {
            return input;
        }

        let expanded: string;
        if (input.indexOf('${env:') > -1) {
            expanded = input.replace(/\$\{env\:(.+)\}/, (_match, p1)=>
                {
                    const variable = process.env[p1];
                    return variable ?? '';
                });
        } else {
            expanded = input;
        }

        if (expanded.indexOf('${') > -1) {
            const path = this.GetRootPath();
            if (path) {
                return expanded
                    .replace('${workspaceRoot}', path)
                    .replace('${workspaceFolder}', path);
            }
        }

        return expanded;
    }

    public static GetRootPath(): string | undefined {
        if (!workspace.workspaceFolders) {
            return workspace.rootPath;
        }

        let root: WorkspaceFolder | undefined;
        if (workspace.workspaceFolders.length === 1) {
            root = workspace.workspaceFolders[0];
        } else {
            root = undefined
        }

        if (root) {
            return root.uri.fsPath;
        }
        return undefined;
    }
}