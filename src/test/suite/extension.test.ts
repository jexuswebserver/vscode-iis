import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension', () => {
  test('registers the IIS config language', async () => {
    const extension = vscode.extensions.getExtension('lextudio.iis');
    assert.ok(extension);

    await extension?.activate();

    const doc = await vscode.workspace.openTextDocument({
      language: 'iis-config',
      content: '<configuration />',
    });

    assert.strictEqual(doc.languageId, 'iis-config');
  });
});
