import {ExtensionContext, ProgressLocation, Uri, window} from 'vscode';
import {Configuration} from '../util/configuration';

import {spawn} from 'child_process';
import path = require('path');
import fs = require('fs');
import xml2js = require('xml2js');
import {Logger} from '../util/logger';
import {learnMore} from '../util/messages';
import {textConfigFileName} from '../util/constants';

export async function launchJexusManager(
  context: ExtensionContext,
  logger: Logger,
  resource: Uri
) {
  // The code you place here will be executed every time your command is executed
  // Display a message box to the user
  let configPath = Configuration.getConfigPath(resource);
  if (configPath === '') {
    const currentFolder =
      Configuration.getCurrentWorkspaceFolder(resource)!.uri.fsPath;
    const target = path.join(currentFolder, '.iis', textConfigFileName);
    configPath = path.dirname(target);
    if (!fs.existsSync(target)) {
      try {
        const template = path.join(context.extensionPath, textConfigFileName);
        const data = await fs.promises.readFile(template);
        const parser = new xml2js.Parser();
        const builder = new xml2js.Builder();
        const result = await parser.parseStringPromise(data);
        result.configuration[
          'system.applicationHost'
        ][0].sites[0].site[0].application[0].virtualDirectory[0].$.physicalPath =
          currentFolder;
        const xml = builder.buildObject(result);
        await fs.promises.mkdir(configPath, {recursive: true});
        await fs.promises.writeFile(target, xml);
        logger.appendLine(`Created ${target} from template`);
      } catch (err) {
        learnMore('Working directory update failed');
        logger.appendLine(`Unexpected error ${err}`);
      }
    }
  }

  logger.appendLine(`Config path: ${configPath}`);
  const programFilesPath = process.env['ProgramFiles'];
  if (!programFilesPath) {
    learnMore('Cannot detect Program Files');
    logger.appendLine('Could not find Program Files directory');
    return;
  }

  let jexusManagerPath: string | null = null;
  const candidateFolders = ['Jexus Manager', 'JexusManager'];
  for (const folder of candidateFolders) {
    const base = path.join(programFilesPath, folder);

    // Check the executable directly under the folder
    const direct = path.join(base, 'JexusManager.exe');
    if (fs.existsSync(direct)) {
      jexusManagerPath = direct;
      break;
    }

    // If the folder exists, search first-level subdirectories (versioned folders)
    try {
      if (fs.existsSync(base) && fs.statSync(base).isDirectory()) {
        const entries = fs.readdirSync(base, {withFileTypes: true});
        for (const e of entries) {
          if (e.isDirectory()) {
            const candidate = path.join(base, e.name, 'JexusManager.exe');
            if (fs.existsSync(candidate)) {
              jexusManagerPath = candidate;
              break;
            }
          }
        }
      }
    } catch (err) {
      logger.appendLine(`Error searching ${base}: ${err}`);
    }

    if (jexusManagerPath) break;
  }

  if (!jexusManagerPath) {
    learnMore("Jexus Manager isn't installed or not found in Program File locations");
    logger.appendLine(`Searched Program File locations but could not find Jexus Manager`);
    return;
  }

  // Normalize to a non-null string for later use
  const jexusManagerExecutable = jexusManagerPath;
  logger.appendLine(`Found Jexus Manager at ${jexusManagerExecutable}`);
  const browser = Configuration.getBrowser(resource);
  const args = [path.join(configPath, 'applicationHost.config')];
  const options = {
    cwd: path.dirname(jexusManagerPath),
    env: {
      ...process.env,
      JEXUSMANAGER_BROWSER: browser,
    },
  };

  window.withProgress(
    {
      location: ProgressLocation.Notification,
      title: 'Jexus Manager is working',
      cancellable: false,
    },
    () => {
      return new Promise<void>((resolve, reject) => {
        const child = spawn(jexusManagerPath, args, options);

        child.on('error', error => {
          window.showErrorMessage(
            `Failed to launch Jexus Manager: ${error.message}`
          );
          reject(error);
        });

        child.on('close', code => {
          if (code !== 0) {
            window.showErrorMessage(`Jexus Manager exited with code: ${code}`);
            reject(new Error(`Exit code: ${code}`));
          } else {
            resolve();
          }
        });
      });
    }
  );
}
