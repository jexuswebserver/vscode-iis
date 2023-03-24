'use strict';

import * as path from 'path';
import { window } from 'vscode';
import { Configuration } from '../util/configuration';
import { findConfigFiles, ServerHostingConfig } from './configFinder';
import { Logger } from '../util/logger';
/**
 *
 */
export class ServerHostingSelector {
    public static async findConfigDir(logger: Logger, inReset: boolean = false): Promise<ServerHostingConfig | undefined> {

        const configurations: ServerHostingConfig[] = [];
        const pathStrings: string[] = [];
        // A path may be configured in the settings. Include this path
        const selected = Configuration.getConfigPath();
        const workspaceRoot = Configuration.GetRootPath();

        const temp = new ServerHostingConfig();
        temp.label = '$(code) Use IIS Express: .iis\\applicationhost.config';
        temp.tooltip = 'Click to reset';
        temp.description = 'Use IIS Express with .iis\\applicationhost.config';
        temp.configDirectory = '';
        temp.workspaceRoot = workspaceRoot;
        temp.shortLabel = '$(code) IIS Express: .iis\\applicationhost.config';

        if (!inReset) {
            if (selected === '') {
                return temp;
            }

            const pth = path.join(path.normalize(selected), 'applicationHost.config');
            const qpSettings = new ServerHostingConfig();
            qpSettings.label = `\$(gear) Use IIS Express: ${pth}`;
            qpSettings.tooltip = `Click to reset. Full path: ${pth}`;
            qpSettings.description += ' (from iis.configPath setting)';
            qpSettings.configDirectory = path.dirname(pth);
            qpSettings.workspaceRoot = workspaceRoot;
            qpSettings.shortLabel = `\$(gear) IIS Express: ${shrink(pth)}`;
            return qpSettings;
        }
        // Add path to a directory containing applicationHost.config if it is not already stored
        function addPaths(pathsToAdd: string[]) {
            pathsToAdd.forEach((confPath) => {
                const pth = path.normalize(confPath);
                if (pathStrings.indexOf(pth) === -1) {
                    const qp = new ServerHostingConfig();
                    qp.label = `\$(gear) Use IIS Express: ${pth}`;
                    qp.tooltip = `Click to reset. Full path: ${pth}`;
                    qp.configDirectory = path.dirname(pth);
                    qp.workspaceRoot = workspaceRoot;
                    qp.shortLabel = `\$(gear) IIS Express: ${shrink(pth)}`;
                    configurations.push(qp);
                    pathStrings.push(pth);
                }
            });
        }
        // Search for unique applicationHost.config paths in the workspace and in parent
        // directories (useful when opening a single file, not a workspace)
        const paths1: string[] = await findConfigFiles();
        addPaths(paths1);
        logger.log('[preview] Found applicationHost.config paths: ' + JSON.stringify(pathStrings));

        if (configurations.length === 0) {
            configurations.push(temp);
        }

        if (configurations.length === 1) {
            // no applicationHost.config
            return configurations[0];
        }

        // Found multiple applicationHost.config files, let the user decide
        return window.showQuickPick(configurations, {
            placeHolder: 'Select how to host this project',
        });
    }
}

function shrink(path: string) {
    if (path.length < 25) {
        return path;
    }

    return `...${path.substring(path.length - 22)}`;
}
