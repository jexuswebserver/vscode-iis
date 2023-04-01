'use strict';

import path = require('path');
import {Uri, window, workspace} from 'vscode';
import {Configuration} from '../util/configuration';
import {findConfigFiles, ConfigFileOption} from './configFinder';
import {Logger} from '../util/logger';
import {
  numberShrinkThreshold,
  textConfigFileDescriptionDefault,
  textConfigFileLabelDefault,
  textConfigFileName,
  textConfigFileSelectedPostfix,
  textConfigFileShortLabelDefault,
  textConfigFileTooltipDefault,
} from '../util/constants';
/**
 *
 */
export class ConfigFileSelector {
  public static async findConfigDir(
    logger: Logger,
    inReset = false,
    resource: Uri
  ): Promise<ConfigFileOption | undefined> {
    const configurations: ConfigFileOption[] = [];
    const selected = Configuration.getConfigPath(resource);
    const workspaceRoot = workspace.getWorkspaceFolder(resource);
    const pathStrings: string[] = [];

    if (inReset || selected === '') {
      // Search for unique paths in the workspace and in parent
      // directories (useful when opening a single file, not a workspace)
      const pathsToAdd: string[] = await findConfigFiles(workspaceRoot!);
      for (const confPath of pathsToAdd) {
        const found = path.dirname(path.normalize(confPath));
        if (!pathStrings.includes(found)) {
          const option = new ConfigFileOption();
          option.label = `$(gear) Use config file in ${found}`;
          option.tooltip = `Full path ${found}. Click to reset.`;
          option.configDirectory = found;
          option.workspaceRoot = workspaceRoot!.uri.fsPath;
          option.shortLabel = `$(gear) Config file in ${shrink(found)}`;
          configurations.push(option);
          pathStrings.push(found);
        }
      }
    }

    logger.appendLine(
      `[preview] Found ${textConfigFileName} in paths: ${JSON.stringify(
        pathStrings
      )}`
    );

    const fullPathSelected = path.normalize(selected);
    const configSelected = new ConfigFileOption();
    configSelected.label = `$(gear) Use config file in ${fullPathSelected}`;
    configSelected.tooltip = `Full path ${fullPathSelected}. Click to reset.`;
    configSelected.description += textConfigFileSelectedPostfix;
    configSelected.configDirectory = fullPathSelected;
    configSelected.workspaceRoot = workspaceRoot!.uri.fsPath;
    configSelected.shortLabel = `$(gear) Config file in ${shrink(
      fullPathSelected
    )}`;

    if (configurations.length === 0) {
      if (selected !== '') {
        configurations.push(configSelected);
      } else {
        const configDefault = new ConfigFileOption();
        configDefault.label = textConfigFileLabelDefault;
        configDefault.tooltip = textConfigFileTooltipDefault;
        configDefault.description = textConfigFileDescriptionDefault;
        configDefault.configDirectory = '';
        configDefault.workspaceRoot = workspaceRoot!.uri.fsPath;
        configDefault.shortLabel = textConfigFileShortLabelDefault;
        configurations.push(configDefault);
      }
    }

    if (configurations.length === 1) {
      if (inReset) {
        window.showInformationMessage(
          'A single config file detected. No other files to select.'
        );
      }
      return configurations[0];
    }

    if (inReset) {
      // Found multiple config files, let the user decide
      return window.showQuickPick(configurations, {
        placeHolder: 'Select which config file to use',
      });
    }

    return configSelected;
  }
}

function shrink(path: string) {
  if (path.length < numberShrinkThreshold) {
    return path;
  }

  return `...${path.substring(path.length - numberShrinkThreshold + 3)}`;
}
