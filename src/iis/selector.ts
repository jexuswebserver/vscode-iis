"use strict";

import path = require("path");
import { Uri, window, workspace } from "vscode";
import { Configuration } from "../util/configuration";
import { findConfigFiles, ServerHostingConfig } from "./configFinder";
import { Logger } from "../util/logger";
/**
 *
 */
export class ServerHostingSelector {
    public static async findConfigDir(
        logger: Logger,
        inReset: boolean = false,
        resource: Uri
    ): Promise<ServerHostingConfig | undefined> {
        const configurations: ServerHostingConfig[] = [];
        // A path may be configured in the settings. Include this path
        const selected = Configuration.getConfigPath(resource);
        const workspaceRoot = workspace.getWorkspaceFolder(resource);

        const pathStrings: string[] = [];

        if (inReset || selected === "") {
            // Search for unique applicationHost.config paths in the workspace and in parent
            // directories (useful when opening a single file, not a workspace)
            const pathsToAdd: string[] = await findConfigFiles(workspaceRoot!);
            for (const confPath of pathsToAdd) {
                const pth = path.normalize(confPath);
                if (!pathStrings.includes(pth)) {
                    const qp = new ServerHostingConfig();
                    qp.label = `$(gear) Use IIS Express: ${pth}`;
                    qp.tooltip = `Click to reset. Full path: ${pth}`;
                    qp.configDirectory = path.dirname(pth);
                    qp.workspaceRoot = workspaceRoot!.uri.fsPath;
                    qp.shortLabel = `$(gear) IIS Express: ${shrink(pth)}`;
                    configurations.push(qp);
                    pathStrings.push(pth);
                }
            }
        }

        logger.appendLine(
            "[preview] Found applicationHost.config paths: " +
                JSON.stringify(pathStrings)
        );

        const fullPathSelected = path.join(
            path.normalize(selected),
            "applicationHost.config"
        );
        const configSelected = new ServerHostingConfig();
        configSelected.label = `\$(gear) Use IIS Express: ${fullPathSelected}`;
        configSelected.tooltip = `Click to reset. Full path: ${fullPathSelected}`;
        configSelected.description += " (from iis.configPath setting)";
        configSelected.configDirectory = path.dirname(fullPathSelected);
        configSelected.workspaceRoot = workspaceRoot!.uri.fsPath;
        configSelected.shortLabel = `\$(gear) IIS Express: ${shrink(
            fullPathSelected
        )}`;

        if (configurations.length === 0) {
            if (selected !== "") {
                configurations.push(configSelected);
            } else {
                const configDefault = new ServerHostingConfig();
                configDefault.label =
                    "$(file-text) Use IIS Express: .iis\\applicationhost.config";
                configDefault.tooltip = "Click to reset";
                configDefault.description =
                    "Use IIS Express with .iis\\applicationhost.config";
                configDefault.configDirectory = "";
                configDefault.workspaceRoot = workspaceRoot!.uri.fsPath;
                configDefault.shortLabel =
                    "$(file-text) IIS Express: .iis\\applicationhost.config";
                configurations.push(configDefault);
            }
        }

        if (configurations.length === 1) {
            if (inReset) {
                window.showInformationMessage(
                    "A single config file detected. No other files to select."
                );
            }
            return configurations[0];
        }

        if (inReset) {
            // Found multiple applicationHost.config files, let the user decide
            return window.showQuickPick(configurations, {
                placeHolder: "Select how to host this project",
            });
        }

        return configSelected;
    }
}

function shrink(path: string) {
    if (path.length < 25) {
        return path;
    }

    return `...${path.substring(path.length - 22)}`;
}
