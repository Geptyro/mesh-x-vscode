<script>
	import MountNode from './MountNode.svelte'
	import { editor, acceptedComponents } from '../stores/editor.svelte.js'
	import { postMessage } from '../stores/messages.svelte.js'
	import PropControl from './PropControl.svelte'

	let { node, pathArr, depth = 0 } = $props()

	let propsExpanded = $state(false)

	// Components this socket may hold, filtered by the type it accepts. An
	// undeclared socket (no `accepts`) yields an empty list — nothing to pick.
	const options = $derived(acceptedComponents(node.accepts))

	function onMountChange(e) {
		const component = e.target.value || null
		postMessage({ type: 'mountChanged', path: pathArr, component })
	}

	function onMountPropChange(key, v) {
		postMessage({ type: 'mountPropChanged', path: pathArr, prop: key, value: v })
	}
</script>

<div class="mount-row" style="padding-left: {12 + depth * 16}px">
	<span class="mount-label" title={node.accepts ? 'accepts: ' + node.accepts : 'no accepted type declared'}>
		{node.name.replace('Mount_', '')}
		{#if node.accepts}<span class="mount-type">{node.accepts.split('/').pop()}</span>{/if}
	</span>
	{#if editor.isPreview}
		{#if !node.accepts}
			<span class="mount-info">no type declared</span>
		{:else if options.length === 0}
			<span class="mount-info">no {node.accepts.split('/').pop()} components</span>
		{:else}
			<select class="mount-select" value={node.component || ''} onchange={onMountChange}>
				<option value="">(None)</option>
				{#each options as comp}
					<option value={comp} title={comp}>{comp.split('/').pop()}</option>
				{/each}
			</select>
		{/if}
	{:else}
		<span class="mount-info">mount point</span>
	{/if}
</div>

{#if node.component && node.schema && Object.keys(node.schema).length > 0}
	<div class="mount-props" style="padding-left: {12 + depth * 16}px">
		<div class="mount-props-toggle" onclick={() => propsExpanded = !propsExpanded}>
			{propsExpanded ? '\u25be' : '\u25b8'} Props
		</div>
		{#if propsExpanded}
			<div class="mount-props-content">
				{#each Object.entries(node.schema) as [key, def]}
					<div class="mount-prop-row">
						<label class="prop-label">{key}</label>
						<PropControl
							{key}
							{def}
							value={node.props?.[key] !== undefined ? node.props[key] : def.default}
							onchange={(v) => onMountPropChange(key, v)}
						/>
					</div>
				{/each}
			</div>
		{/if}
	</div>
{/if}

{#if node.childMounts}
	{#each node.childMounts as child}
		<MountNode node={child} pathArr={[...pathArr, child.name]} depth={depth + 1} />
	{/each}
{/if}

<style>
	.mount-row {
		padding: 6px 12px;
		display: flex;
		align-items: center;
		gap: 6px;
		border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
	}
	.mount-label {
		font-size: 11px;
		color: var(--vscode-descriptionForeground, #999);
		white-space: nowrap;
		min-width: 50px;
	}
	.mount-type {
		display: inline-block;
		margin-left: 4px;
		padding: 0 4px;
		border-radius: 2px;
		font-size: 9px;
		color: var(--vscode-badge-foreground, #fff);
		background: var(--vscode-badge-background, #4d4d4d);
		vertical-align: middle;
	}
	.mount-select {
		flex: 1;
		min-width: 0;
		background: var(--vscode-input-background, #3c3c3c);
		color: var(--vscode-input-foreground, #ccc);
		border: 1px solid var(--vscode-input-border, #555);
		border-radius: 2px;
		padding: 3px 4px;
		font-size: 11px;
		font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
	}
	.mount-select:focus {
		outline: 1px solid var(--vscode-focusBorder, #007acc);
	}
	.mount-info {
		font-size: 11px;
		font-style: italic;
		color: var(--vscode-descriptionForeground, #777);
	}
	.mount-props {
		border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
	}
	.mount-props-toggle {
		padding: 3px 12px;
		font-size: 10px;
		color: var(--vscode-descriptionForeground, #888);
		cursor: pointer;
		user-select: none;
	}
	.mount-props-toggle:hover {
		color: var(--vscode-foreground, #ccc);
	}
	.mount-props-content {
		padding: 0 8px 4px 8px;
	}
	.mount-prop-row {
		padding: 4px 4px;
		overflow: hidden;
	}
	.prop-label {
		display: block;
		font-size: 11px;
		color: var(--vscode-descriptionForeground, #999);
		margin-bottom: 4px;
	}
</style>
