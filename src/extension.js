const vscode = require('vscode')
const { ConfigEditorProvider } = require('./configEditorProvider')

const output = vscode.window.createOutputChannel('Falcra')

function activate(context) {
	output.appendLine('Falcra extension activated')
	context.subscriptions.push(
		ConfigEditorProvider.register(context, output)
	)
}

function deactivate() {}

module.exports = { activate, deactivate }
