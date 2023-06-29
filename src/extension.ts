import * as vscode from 'vscode';
export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "codexp" is now active!');

	let disposable = vscode.commands.registerCommand('codexp.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from codeXP!');
	});

	context.subscriptions.push(disposable);
}

export function deactivate() {}
