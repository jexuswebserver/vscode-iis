// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import vscode = require('vscode');
import {launchJexusManager} from './iis/jexusManager';
import SelectedConfigFileStatus, {ActiveFolderStatus} from './iis/statusBar';
import {textHomepage} from './util/constants';
import {Logger} from './util/logger';
import {learnMore} from './util/messages';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const channel = vscode.window.createOutputChannel('IIS');
  const logger = new Logger(channel);
  logger.show();
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
    learnMore('This extension only works on Windows');
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

  // Status bar to show the selected config file configuration
  const statusSelectedConfigFile = new SelectedConfigFileStatus(
    logger,
    singleFolder
  );

  // Hook up the status bar to change events
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'iis.resetStatus',
      statusSelectedConfigFile.reset,
      statusSelectedConfigFile
    )
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'iis.syncStatus',
      statusSelectedConfigFile.update,
      statusSelectedConfigFile
    )
  );

  await statusSelectedConfigFile.update();

  const disposable = vscode.commands.registerCommand(
    'iis.launch',
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
}

// This method is called when your extension is deactivated
export function deactivate() {}
