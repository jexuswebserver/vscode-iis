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
import {LanguageClient, LanguageClientOptions, ServerOptions} from 'vscode-languageclient/node';
import * as path from 'path';

let languageClient: LanguageClient | undefined;

function findLanguageServerPath(extensionPath: string): string | undefined {
  const basePath = path.join(
    extensionPath,
    'JexusManager/IIS.LanguageServer/bin/Release/net9.0-windows10.0.17763.0'
  );

  // Try common RIDs in order of preference
  const rids = ['win-x64', 'win-arm64', 'win-x86'];

  for (const rid of rids) {
    const serverPath = path.join(basePath, rid, 'IIS.LanguageServer.exe');
    try {
      const fs = require('fs');
      if (fs.existsSync(serverPath)) {
        return serverPath;
      }
    } catch {
      // Continue to next RID
    }
  }

  return undefined;
}

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

  // Start the IIS configuration language server
  try {
    const serverPath = findLanguageServerPath(context.extensionPath);

    if (!serverPath) {
      logger.appendLine(
        'IIS Configuration Language Server executable not found. Completions and hover will not be available.'
      );
    } else {
      const serverOptions: ServerOptions = {
        command: serverPath,
        args: [],
        options: {
          stdio: ['pipe', 'pipe', 'pipe']
        }
      };

      const clientOptions: LanguageClientOptions = {
        documentSelector: [{language: 'iis-config', scheme: 'file'}],
        diagnosticCollectionName: 'iis-config',
        outputChannel: channel,
        revealOutputChannelOn: 4 // Never
      };

      languageClient = new LanguageClient(
        'iis-config',
        'IIS Configuration Language Server',
        serverOptions,
        clientOptions
      );

      const disposable = languageClient.start();
      context.subscriptions.push(disposable);
      logger.appendLine('IIS Configuration Language Server started');
    }
  } catch (error) {
    logger.appendLine(`Failed to start language server: ${error}`);
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
      if (statusLaunch.isRunning()) {
        vscode.window.showInformationMessage(
          'Jexus Manager is already running.'
        );
        return;
      }

      if (JSON.stringify(resource) !== '{}') {
        launchJexusManager(context, logger, resource, (isRunning) => {
          statusLaunch.setRunning(isRunning);
        });
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
export async function deactivate() {
  if (languageClient) {
    await languageClient.stop();
  }
}
