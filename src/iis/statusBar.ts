'use strict';

import * as vscode from 'vscode';
import { Configuration } from '../util/configuration';
import { ServerHostingSelector } from './selector';
import { ServerHostingConfig } from './configFinder';
import { Logger } from '../util/logger';

/**
 * Status bar updates. Shows the selected config object when a
 * document is active. If you click on the status bar
 * then the config object is reset and you will need to select from
 * the menu next time.
 */
export default class RstTransformerStatus {
    private _statusBarItem: vscode.StatusBarItem;
    public config: ServerHostingConfig | undefined;
    private inReset:  boolean;

    constructor(private logger: Logger) {
        this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
        this._statusBarItem.command = 'iis.resetStatus';
        this.inReset = false;
    }

    public setLabel() {
        if (this.config) {
            this._statusBarItem.text = this.config.shortLabel;
            this._statusBarItem.tooltip = this.config.tooltip;
            Configuration.setConfigPath(this.config.configDirectory, true);
        }
    }

    public async update() {
        const workspaceRoot = Configuration.GetRootPath();
        if (!this.config || this.config.workspaceRoot !== workspaceRoot) {
            await this.refreshConfig();
        }

        this.setLabel();
        this._statusBarItem.show();
    }

    public async reset() {
        this.logger.log("[preview] reset config.");
        this.inReset = true;
        try
        {
            await this.refreshConfig();
            this.setLabel();
        } finally {
            this.inReset = false;
        }
    }

    public async refreshConfig(): Promise<ServerHostingConfig | undefined> {
        const configDir = await ServerHostingSelector.findConfigDir(this.logger, this.inReset);
        if (configDir == undefined) {
            return undefined;
        }

        this.config = configDir;
        this.logger.log("[preview] set config to " + configDir.configDirectory);
        await Configuration.setConfigPath(configDir.configDirectory, true);
        return configDir;
    }
}
