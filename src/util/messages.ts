import { env, Uri, window } from "vscode";
import { homepage } from "./constants";

export async function learnMore(message: string) {
    const action = 'Learn more';
    const selectedAction = await window.showErrorMessage(message, action);
    if (selectedAction === action) {
        env.openExternal(Uri.parse(homepage));
    }
}
