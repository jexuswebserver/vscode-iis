import { ExtensionContext, workspace } from "vscode";
import { Configuration } from "../util/configuration";

import { spawn } from "child_process";
import path = require("path");
import fs = require("fs");
import xml2js = require("xml2js");
import { Logger } from "../util/logger";
import { learnMore } from "../util/messages";

export async function launchJexusManager(context: ExtensionContext, logger: Logger) {
    // The code you place here will be executed every time your command is executed
    // Display a message box to the user
    var configPath = Configuration.getConfigPath();
    if (configPath === '') {
        if (workspace.workspaceFolders) {
            const currentFolder = workspace.workspaceFolders[0].uri.fsPath;
            const template = path.join(context.extensionPath, 'applicationhost.config');
            const target = path.join(currentFolder, ".iis", "applicationhost.config");
            try {
                const data = await fs.promises.readFile(fs.existsSync(target) ? target : template);
                const parser = new xml2js.Parser();
                const builder = new xml2js.Builder();
                const result = await parser.parseStringPromise(data);
                result.configuration['system.applicationHost'][0].sites[0].site[0].application[0].virtualDirectory[0].$.physicalPath = currentFolder;
                const xml = builder.buildObject(result);
                configPath = path.dirname(target);
                await fs.promises.mkdir(configPath, { recursive: true });
                await fs.promises.writeFile(target, xml);
            } catch (err) {
                learnMore('Working directory update failed');
                logger.appendLine(`Unexpected error ${err}`);
            }
        }
    }

    const programFilesPath = process.env['ProgramFiles'];
    if (!programFilesPath) {
        learnMore('Cannot detect Program Files');
        logger.appendLine('Could not find Program Files directory');
        return;
    }

    const jexusManagerPath =path.join(programFilesPath, 'Jexus Manager', 'JexusManager.exe');
    if (!fs.existsSync(jexusManagerPath)) {
        learnMore('Jexus Manager isn\'t installed');
        return;
    }
    const browser = Configuration.getBrowser();
    const args = [path.join(configPath, 'applicationHost.config')];
    const options = {
        cwd: path.dirname(jexusManagerPath),
        env: {
            ...process.env,
            JEXUSMANAGER_BROWSER: browser
        }
    };

    spawn(jexusManagerPath, args, options);
}
