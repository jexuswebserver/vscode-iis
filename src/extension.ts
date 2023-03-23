// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { launchJexusManager } from './iis/jexusManager';
import ServerHostingStatus from './iis/statusBar';
import { Logger } from './util/logger';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext): Promise<void> {

    const channel = vscode.window.createOutputChannel('IIS');
	const logger = new Logger(channel);
    logger.log('Please visit https://docs.jexusmanager.com/getting-started/features.html to learn how to configure the extension.');

	await logger.logPlatform();

    // Status bar to show the active server hosting configuration
    const status = new ServerHostingStatus(logger);

    // Hook up the status bar to document change events
    context.subscriptions.push(
        vscode.commands.registerCommand('iis.resetStatus',
            status.reset, status),
    );

    await status.update();

	let disposable = vscode.commands.registerCommand('iis.launch', () => {
        launchJexusManager(logger);
	});

	context.subscriptions.push(disposable);
}

// This method is called when your extension is deactivated
export function deactivate() {}
