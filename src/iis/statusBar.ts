"use strict";

import vscode = require("vscode");
import { Configuration } from "../util/configuration";
import { ServerHostingSelector } from "./selector";
import { ServerHostingConfig } from "./configFinder";
import { Logger } from "../util/logger";

/**
 * Status bar updates. Shows the selected config object when a
 * document is active. If you click on the status bar
 * then the config object is reset and you will need to select from
 * the menu next time.
 */
export default class ServerHostingStatus {
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
        if (!this.singleFolder) {
            this._statusBarItem.text = `$(warning) IIS Express: Multiple folders opened`;
            this._statusBarItem.tooltip =
                "When multiple folders are opened, please use context menu item in EXPLORER to reset.";
            this._statusBarItem.show();
            return;
        }

        var resource = vscode.workspace.workspaceFolders![0].uri;
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
            vscode.window.showErrorMessage("Please select a folder to launch IIS/IIS Express.");
            return;
        }

        if (!resource) {
            resource = vscode.workspace.workspaceFolders![0].uri;
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
        this.logger.appendLine("[preview] set config to " + configDir.configDirectory);
        await Configuration.setConfigPath(
            configDir.configDirectory,
            true,
            resource
        );
        return configDir;
    }
}
