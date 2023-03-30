"use strict";

import vscode = require("vscode");
import { Configuration } from "../util/configuration";
import { ServerHostingSelector } from "./selector";
import { ServerHostingConfig } from "./configFinder";
import { Logger } from "../util/logger";

export class ActiveFolderStatus {
    private _statusBarItem: vscode.StatusBarItem;
    public folder: string;
    private inReset: boolean;

    constructor(private logger: Logger) {
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left
        );
        this._statusBarItem.command = "iis.resetFolder";
        this.inReset = false;
        this.folder = Configuration.getActiveFolder();
    }

    public setLabel() {
        if (this.folder) {
            this._statusBarItem.text = `$(folder) ${this.folder}`;
            this._statusBarItem.tooltip = `Active folder of current workspace is ${this.folder}. Click to reset.`;
            Configuration.setActiveFolder(this.folder);
        }
    }

    public async update() {
        if (!this.folder) {
            await this.refreshFolder();
        }

        this.setLabel();
        this._statusBarItem.show();
    }

    public async reset() {
        this.logger.appendLine("[preview] reset folder.");
        this.inReset = true;
        try {
            await this.refreshFolder();
            this.setLabel();
            vscode.commands.executeCommand("iis.syncStatus");
        } finally {
            this.inReset = false;
        }
    }

    public async refreshFolder(): Promise<string | undefined> {
        let folder: string | undefined = this.folder;
        if (this.inReset) {
            const workspaceFolders = vscode.workspace.workspaceFolders!.map(
                (folder) => {
                    return {
                        label: folder.name,
                        description: folder.uri.fsPath,
                        folder: folder,
                    };
                }
            );
            const selected = await vscode.window.showQuickPick(
                workspaceFolders,
                { placeHolder: "Select a workspace folder" }
            );
            folder = selected?.label;
        }
        if (folder === undefined || folder === "") {
            folder = vscode.workspace.workspaceFolders![0].name;
        }

        this.folder = folder;
        this.logger.appendLine(`[preview] set folder to ${folder}`);
        await Configuration.setActiveFolder(folder);
        return folder;
    }
}

/**
 * Status bar updates. Shows the selected config file.
 * If you click on the status bar
 * then the config file is reset and you will need to select from
 * the menu next time.
 */
export default class SelectedConfigFileStatus {
    private _statusBarItem: vscode.StatusBarItem;
    public config: ServerHostingConfig | undefined;
    private inReset: boolean;

    constructor(private logger: Logger, private singleFolder: boolean) {
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left
        );
        this._statusBarItem.command = "iis.resetStatus";
        this.inReset = false;
    }

    public setLabel(resource: vscode.Uri) {
        if (this.config) {
            this._statusBarItem.text = this.config.shortLabel;
            this._statusBarItem.tooltip = this.config.tooltip;
            Configuration.setConfigPath(
                this.config.configDirectory,
                true,
                resource
            );
        }
    }

    public async update() {
        let resource = vscode.workspace.workspaceFolders![0].uri;
        if (!this.singleFolder) {
            const folder = Configuration.getActiveFolder();
            resource = vscode.workspace.workspaceFolders!.find(
                (item) => item.name === folder
            )!.uri;
        }

        const workspaceRoot = resource.fsPath;
        if (!this.config || this.config.workspaceRoot !== workspaceRoot) {
            await this.refreshConfig(resource);
        }

        this.setLabel(resource);
        this._statusBarItem.show();
    }

    public async reset(resource: vscode.Uri) {
        if (!vscode.workspace.workspaceFolders) {
            return;
        }

        if (JSON.stringify(resource) === "{}") {
            vscode.window.showErrorMessage(
                "Please select a folder to start configuration."
            );
            return;
        }

        if (!resource) {
            resource = vscode.workspace.workspaceFolders![0].uri;
            if (!this.singleFolder) {
                const folder = Configuration.getActiveFolder();
                resource = vscode.workspace.workspaceFolders!.find(
                    (item) => item.name === folder
                )!.uri;
            }
        }

        this.logger.appendLine("[preview] reset config.");
        this.inReset = true;
        try {
            await this.refreshConfig(resource);
            this.setLabel(resource);
        } finally {
            this.inReset = false;
        }
    }

    public async refreshConfig(
        resource: vscode.Uri
    ): Promise<ServerHostingConfig | undefined> {
        const configDir = await ServerHostingSelector.findConfigDir(
            this.logger,
            this.inReset,
            resource
        );
        if (configDir === undefined) {
            return undefined;
        }

        this.config = configDir;
        this.logger.appendLine(
            "[preview] set config to " + configDir.configDirectory
        );
        await Configuration.setConfigPath(
            configDir.configDirectory,
            true,
            resource
        );
        return configDir;
    }
}
