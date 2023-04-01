'use strict';

import fs = require('fs');
import path = require('path');
import {QuickPickItem, Uri, workspace, WorkspaceFolder} from 'vscode';
import {
  textConfigFileDescription,
  textConfigFileName,
  textFindExclude,
  textFindInclude,
} from '../util/constants';

/**
 * Configuration for how to launch IIS Express using applicationHost.config.
 */
export class ConfigFileOption implements QuickPickItem {
  public label: string = '';
  public tooltip: string = '';
  public description: string = textConfigFileDescription;
  public configDirectory: string = '';
  public workspaceRoot: string | undefined;
  public shortLabel: string = '';
}

/**
 * Returns a list of applicationHost.config files in the workspace
 */
export async function findConfigFiles(
  root: WorkspaceFolder
): Promise<string[]> {
  const files = await workspace.findFiles(
    textFindInclude,
    textFindExclude,
    100
  );
  const items = files.filter(file =>
    file.fsPath.toLowerCase().endsWith(textConfigFileName)
  );
  return urisToPaths(items, root);
}

function urisToPaths(uris: Uri[], root: WorkspaceFolder): string[] {
  const paths: string[] = [];
  const workspaceFolder = root;
  uris.forEach(uri => {
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
  let parentDir = path.normalize(dirName + '/..');
  while (parentDir !== dirName) {
    // Sanity check - the parent directory must exist
    if (!fs.existsSync(parentDir) || !fs.statSync(parentDir).isDirectory()) {
      break;
    }

    // Check this directory for config file
    const configPath = path.join(parentDir, textConfigFileName);
    if (fs.existsSync(configPath) && fs.statSync(configPath).isFile()) {
      paths.push(configPath);
    }

    dirName = parentDir;
    parentDir = path.normalize(dirName + '/..');
  }

  return paths;
}
