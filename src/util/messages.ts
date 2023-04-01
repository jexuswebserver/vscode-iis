import {env, Uri, window} from 'vscode';
import {textHomepage} from './constants';

export async function learnMore(message: string) {
  const action = 'Learn more';
  const selectedAction = await window.showErrorMessage(message, action);
  if (selectedAction === action) {
    env.openExternal(Uri.parse(textHomepage));
  }
}
