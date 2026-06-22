const vscode = require('vscode')
const { ConfigEditorProvider } = require('./configEditorProvider')
const { AutoBuilder } = require('./autoBuilder')

const output = vscode.window.createOutputChannel('mesh-x')

function activate(context) {
	output.appendLine('mesh-x extension activated')
	context.subscriptions.push(
		ConfigEditorProvider.register(context, output)
	)

	const autoBuilder = new AutoBuilder(context.extensionPath, output)
	autoBuilder.activate(context)
}

function deactivate() {}

module.exports = { activate, deactivate }
