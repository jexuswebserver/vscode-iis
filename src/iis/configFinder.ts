"use strict";

import * as fs from "fs";
import * as path from "path";
import { QuickPickItem, Uri, workspace, WorkspaceFolder } from "vscode";

/**
 * Configuration for how to launch IIS Express using applicationHost.config.
 */
export class ServerHostingConfig implements QuickPickItem {
    public label: string = "";
    public tooltip: string = "";
    public description: string =
        "Use IIS Express with the selected applicationHost.config path";
    public configDirectory: string = "";
    public workspaceRoot: string | undefined;
    public shortLabel: string = "";
}

/**
 * Returns a list of applicationHost.config files in the workspace
 */
export async function findConfigFiles(
    root: WorkspaceFolder
): Promise<string[]> {
    const files = await workspace.findFiles("**/*.config", ".iis/*");
    const items = files.filter((file) =>
        file.fsPath.toLowerCase().endsWith("applicationhost.config")
    );
    return urisToPaths(items, root);
}

function urisToPaths(uris: Uri[], root: WorkspaceFolder): string[] {
    const paths: string[] = [];
    const workspaceFolder = root;
    uris.forEach((uri) => {
        const folder = workspace.getWorkspaceFolder(uri);
        if (folder === workspaceFolder) {
            paths.push(uri.fsPath);
        }
    });
    return paths;
}

/**
 * Find applicationHost.config files by looking at parent directories. Useful in case
 * a single file is opened without a workspace
 */
export function findConfigFilesInParentDirs(filePath: string): string[] {
    const paths: string[] = [];

    // Walk the directory up from the current directory looking for the applicationHost.config file
    let dirName = filePath;
    while (true) {
        // Get the name of the parent directory
        const parentDir = path.normalize(dirName + "/..");

        // Check if we are at the root directory already to avoid an infinite loop
        if (parentDir === dirName) {
            break;
        }

        // Sanity check - the parent directory must exist
        if (
            !fs.existsSync(parentDir) ||
            !fs.statSync(parentDir).isDirectory()
        ) {
            break;
        }

        // Check this directory for applicationHost.config
        const configPath = path.join(parentDir, "applicationHost.config");
        if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
            paths.push(configPath);
        }

        dirName = parentDir;
    }

    return paths;
}
