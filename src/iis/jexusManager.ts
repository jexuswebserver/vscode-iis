import { window } from "vscode";
import { Configuration } from "../util/configuration";

import { spawn } from "child_process";
import path = require("path");
import { Logger } from "../util/logger";

export function launchJexusManager(logger: Logger) {
    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    var configPath = Configuration.getConfigPath();
    window.showInformationMessage('Hello World from vscode-iis!' + ' ' + configPath);
    const programFilesPath = process.env['ProgramFiles'];
    if (!programFilesPath) {
        logger.appendLine('Could not find Program Files directory');
        return;
    }

    const jexusManagerPath =path.join(programFilesPath, 'Jexus Manager', 'JexusManager.exe');
    const args = [path.join(configPath, 'applicationHost.config')];
    spawn(jexusManagerPath, args);
}
