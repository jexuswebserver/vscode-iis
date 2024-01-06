// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import vscode = require('vscode');
import {launchJexusManager} from './iis/jexusManager';
import SelectedConfigFileStatus, {
  ActiveFolderStatus,
  LaunchStatus,
} from './iis/statusBar';
import {updateActivationCount} from './rating';
import {
  commandLaunch,
  commandResetSelectedFile,
  commandSyncSelectedFile,
  textHomepage,
} from './util/constants';
import {Logger} from './util/logger';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const channel = vscode.window.createOutputChannel('IIS');
  const logger = new Logger(channel);
  logger.appendLine(
    `Please visit ${textHomepage} to learn how to configure the extension.`
  );

  const supported = await logger.logPlatform();
  const folders = vscode.workspace.workspaceFolders;
  const singleFolder = folders?.length === 1;
  vscode.commands.executeCommand(
    'setContext',
    'iis.supported',
    supported && folders
  );
  vscode.commands.executeCommand(
    'setContext',
    'iis.singleFolder',
    supported && singleFolder
  );

  if (!supported) {
    logger.appendLine('This extension only works on Windows');
    return;
  }

  if (!singleFolder) {
    // Status bar to show the active folder in current workspace
    const statusActiveFolder = new ActiveFolderStatus(logger);

    // Hook up the status bar to document change events
    context.subscriptions.push(
      vscode.commands.registerCommand(
        'iis.resetFolder',
        statusActiveFolder.reset,
        statusActiveFolder
      )
    );

    await statusActiveFolder.update();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const statusLaunch = new LaunchStatus();

  // Status bar to show the selected config file configuration
  const statusSelectedConfigFile = new SelectedConfigFileStatus(
    logger,
    singleFolder
  );

  // Hook up the status bar to change events
  context.subscriptions.push(
    vscode.commands.registerCommand(
      commandResetSelectedFile,
      statusSelectedConfigFile.reset,
      statusSelectedConfigFile
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      commandSyncSelectedFile,
      statusSelectedConfigFile.update,
      statusSelectedConfigFile
    )
  );

  await statusSelectedConfigFile.update();

  const disposable = vscode.commands.registerCommand(
    commandLaunch,
    (resource: vscode.Uri) => {
      if (JSON.stringify(resource) !== '{}') {
        launchJexusManager(context, logger, resource);
      } else {
        vscode.window.showErrorMessage(
          'Please select a folder to launch IIS/IIS Express.'
        );
      }
    }
  );

  context.subscriptions.push(disposable);
  await updateActivationCount(context);
}

// This method is called when your extension is deactivated
export function deactivate() {}
