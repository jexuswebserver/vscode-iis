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
import * as fs from 'fs';

let languageClient: LanguageClient | undefined;

type ResolvedServerCommand = {
  command: string;
  args: string[];
  description: string;
};

function getPreferredRids(): string[] {
  const archToRid: Record<string, string> = {
    x64: 'win-x64',
    arm64: 'win-arm64',
    ia32: 'win-x86',
  };
  const preferredRid = archToRid[process.arch];
  const allRids = ['win-x64', 'win-arm64', 'win-x86'];
  return preferredRid
    ? [preferredRid, ...allRids.filter((rid) => rid !== preferredRid)]
    : allRids;
}

function findServerExecutable(basePath: string, rids: string[]): string | undefined {
  for (const rid of rids) {
    const serverPath = path.join(basePath, rid, 'IIS.LanguageServer.exe');
    if (fs.existsSync(serverPath)) {
      return serverPath;
    }
  }

  return undefined;
}

function findDebugServerDll(extensionPath: string): string | undefined {
  const debugDllPath = path.join(
    extensionPath,
    'JexusManager/IIS.LanguageServer/bin/Debug/net9.0-windows10.0.17763.0/IIS.LanguageServer.dll'
  );

  return fs.existsSync(debugDllPath) ? debugDllPath : undefined;
}

function findLanguageServerCommand(
  extensionPath: string,
  extensionMode: vscode.ExtensionMode
): ResolvedServerCommand | undefined {
  const rids = getPreferredRids();
  if (extensionMode === vscode.ExtensionMode.Development || extensionMode === vscode.ExtensionMode.Test) {
    const debugServerDll = findDebugServerDll(extensionPath);
    if (debugServerDll) {
      return {
        command: 'dotnet',
        args: [debugServerDll],
        description: debugServerDll,
      };
    }

    const releaseServer = findServerExecutable(
      path.join(
        extensionPath,
        'JexusManager/IIS.LanguageServer/bin/Release/net9.0-windows10.0.17763.0'
      ),
      rids
    );
    if (releaseServer) {
      return {
        command: releaseServer,
        args: [],
        description: releaseServer,
      };
    }
  }

  const packagedServer = findServerExecutable(path.join(extensionPath, 'server'), rids);
  if (!packagedServer) {
    return undefined;
  }

  return {
    command: packagedServer,
    args: [],
    description: packagedServer,
  };
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

  if (!folders) {
    logger.appendLine('No workspace folder is opened');
    return;
  }

  // Start the IIS configuration language server
  try {
    const serverCommand = findLanguageServerCommand(
      context.extensionPath,
      context.extensionMode
    );

    if (!serverCommand) {
      logger.appendLine(
        'IIS Configuration Language Server executable not found. Completions and hover will not be available.'
      );
    } else {
      const serverOptions: ServerOptions = {
        command: serverCommand.command,
        args: serverCommand.args,
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

      void languageClient.start();
      context.subscriptions.push({
        dispose: () => {
          if (languageClient) {
            void languageClient.stop();
          }
        },
      });
      logger.appendLine(`IIS Configuration Language Server started from ${serverCommand.description}`);
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
