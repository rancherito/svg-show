import * as vscode from 'vscode';

// Regex para detectar SVG inline en código
const SVG_STRING_REGEX = /(<svg[\s\S]*?<\/svg>)/gi;
const SVG_START_REGEX = /<svg[^>]*>/i;

// Función para determinar si un archivo debe ser ignorado
function shouldIgnoreFile(filePath: string): boolean {
	const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
	
	// Ignorar archivos de código fuente de la extensión
	const ignorePatterns = [
		'/src/extension.ts',
		'/out/',
		'/dist/',
		'/node_modules/',
		'/.vscode/',
		'/test/',
		'/tests/'
	];
	
	return ignorePatterns.some(pattern => normalizedPath.includes(pattern));
}

// Función para detectar si un SVG está dentro de un string literal
function isSvgInStringLiteral(text: string, svgStartIndex: number): boolean {
	// Buscar comillas antes del SVG
	const beforeSvg = text.substring(0, svgStartIndex);
	const lastSingleQuote = beforeSvg.lastIndexOf("'");
	const lastDoubleQuote = beforeSvg.lastIndexOf('"');
	const lastBacktick = beforeSvg.lastIndexOf('`');
	
	// Encontrar la comilla más cercana
	const quotePos = Math.max(lastSingleQuote, lastDoubleQuote, lastBacktick);
	
	if (quotePos === -1) {
		return false;
	}
	
	// Determinar qué tipo de comilla es
	let quoteChar = '';
	if (quotePos === lastSingleQuote) {
		quoteChar = "'";
	}
	else if (quotePos === lastDoubleQuote) {
		quoteChar = '"';
	}
	else if (quotePos === lastBacktick) {
		quoteChar = '`';
	}
	
	// Buscar la comilla de cierre después del SVG
	const afterQuote = text.substring(quotePos + 1);
	const closingQuotePos = afterQuote.indexOf(quoteChar);
	
	return closingQuotePos > (svgStartIndex - quotePos - 1);
}

// Interfaz para elementos SVG encontrados
interface SvgItem {
	label: string;
	svgContent: string;
	lineNumber: number;
	filePath: string;
}

// TreeDataProvider para la vista de SVGs
class SvgViewProvider implements vscode.TreeDataProvider<SvgItem> {
	private _onDidChangeTreeData: vscode.EventEmitter<SvgItem | undefined | null | void> = new vscode.EventEmitter<SvgItem | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<SvgItem | undefined | null | void> = this._onDidChangeTreeData.event;

	private svgItems: SvgItem[] = [];

	refresh(): void {
		this.updateSvgItems();
		this._onDidChangeTreeData.fire();
	}

	getTreeItem(element: SvgItem): vscode.TreeItem {
		const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
		item.tooltip = `Line ${element.lineNumber + 1}: ${element.label}`;
		item.description = `Línea ${element.lineNumber + 1}`;
		
		try {
			const dataUri = createSvgDataUri(element.svgContent, 16);
			item.iconPath = dataUri;
		} catch (error) {
			console.error('Error creating icon for tree item:', error);
		}
		
		item.command = {
			command: 'svg-show.goToLine',
			title: 'Go to SVG',
			arguments: [element.filePath, element.lineNumber]
		};
		
		return item;
	}

	getChildren(element?: SvgItem): Thenable<SvgItem[]> {
		if (!element) {
			return Promise.resolve(this.svgItems);
		}
		return Promise.resolve([]);
	}

	private updateSvgItems(): void {
		this.svgItems = [];
		
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor || !activeEditor.document) {
			return;
		}

		const document = activeEditor.document;
		const fileName = document.fileName;
		
		// Ignorar archivos de código fuente de la extensión
		if (shouldIgnoreFile(fileName)) {
			return;
		}
		
		const text = document.getText();

		try {
			// Para archivos .svg, agregar el archivo completo
			if (fileName.endsWith('.svg')) {
				const svgContent = text.trim();
				if (svgContent && (svgContent.startsWith('<svg') || svgContent.includes('<svg'))) {
					this.svgItems.push({
						label: 'Archivo SVG completo',
						svgContent: svgContent,
						lineNumber: 0,
						filePath: fileName
					});
				}
			} else {
				// Buscar SVGs inline en otros archivos
				const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
				let match;
				let svgIndex = 1;
				
				while ((match = svgRegex.exec(text)) !== null) {
					if (match && match[0] && typeof match.index === 'number') {
						const svgContent = match[0];
						const position = document.positionAt(match.index);
						const lineNumber = position.line;
						
						this.svgItems.push({
							label: `SVG ${svgIndex}`,
							svgContent: svgContent,
							lineNumber: lineNumber,
							filePath: fileName
						});
						svgIndex++;
					}
				}
			}
		} catch (error) {
			console.error('Error updating SVG items:', error);
		}
	}
}

// Map para almacenar decoraciones por editor
const editorDecorations = new Map<string, vscode.TextEditorDecorationType[]>();

// Provider global para la vista de SVGs
let svgViewProvider: SvgViewProvider;

// Vista webview para el preview integrado
let svgPreviewView: vscode.WebviewView | undefined;

/**
 * Encuentra todas las SVGs en un documento
 */
function findAllSvgsInDocument(document: vscode.TextDocument): Array<{svg: string, line: number}> {
	const svgs: Array<{svg: string, line: number}> = [];
	
	// Ignorar archivos de código fuente de la extensión
	if (shouldIgnoreFile(document.fileName)) {
		return svgs;
	}
	
	const text = document.getText();
	
	if (!text) {
		return svgs;
	}
	
	// Para archivos .svg, incluir todo el contenido
	if (document.fileName && document.fileName.endsWith('.svg')) {
		const svgContent = text.trim();
		if (svgContent && (svgContent.startsWith('<svg') || svgContent.includes('<svg'))) {
			svgs.push({ svg: svgContent, line: 0 });
		}
		return svgs;
	}
	
	// Para otros archivos, buscar todas las SVGs
	const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
	let match;
	let iterationCount = 0;
	const maxIterations = 1000;
	
	while ((match = svgRegex.exec(text)) !== null && iterationCount < maxIterations) {
		iterationCount++;
		
		if (!match || !match[0] || typeof match.index !== 'number') {
			continue;
		}
		
		const svgContent = match[0];
		const startPos = document.positionAt(match.index);
		const lineNumber = startPos.line;
		
		svgs.push({ svg: svgContent, line: lineNumber });
	}
	
	return svgs;
}

// Clase para el provider del webview del preview
class SvgPreviewViewProvider implements vscode.WebviewViewProvider {
	constructor(private readonly _extensionUri: vscode.Uri) {}

	resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken
	) {
		svgPreviewView = webviewView;
		
		webviewView.webview.options = {
			enableScripts: true,
			localResourceRoots: [this._extensionUri]
		};

		// Actualizar el contenido con el editor activo
		this.updateContent();
		
		// Escuchar cambios en el editor activo
		vscode.window.onDidChangeActiveTextEditor(() => {
			this.updateContent();
		});
		
		// Escuchar cambios en el documento
		vscode.workspace.onDidChangeTextDocument(() => {
			this.updateContent();
		});
	}

	updateContent() {
		if (!svgPreviewView) {
			return;
		}

		const editor = vscode.window.activeTextEditor;
		if (!editor || !editor.document) {
			svgPreviewView.webview.html = this.getEmptyHtml();
			return;
		}

		const svgs = findAllSvgsInDocument(editor.document);
		const fileName = editor.document.fileName.split(/[\\\/]/).pop() || 'Unknown';
		
		svgPreviewView.webview.html = this.getPreviewHtml(svgs, fileName);
	}

	private getEmptyHtml(): string {
		return `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="UTF-8">
			<style>
				body {
					font-family: var(--vscode-font-family);
					padding: 20px;
					color: var(--vscode-foreground);
				}
				.no-svgs {
					text-align: center;
					color: var(--vscode-descriptionForeground);
				}
			</style>
		</head>
		<body>
			<div class="no-svgs">
				<h3>No SVGs found</h3>
				<p>Open a file with SVG content to see previews here.</p>
			</div>
		</body>
		</html>`;
	}

	private getPreviewHtml(svgs: Array<{svg: string, line: number}>, fileName: string): string {
		if (svgs.length === 0) {
			return this.getEmptyHtml();
		}

		const svgItems = svgs.map((item, index) => {
			try {
				const encodedSvg = encodeURIComponent(item.svg)
					.replace(/'/g, '%27')
					.replace(/"/g, '%22');
				const dataUri = `data:image/svg+xml,${encodedSvg}`;
				
				return `
				<div class="svg-item" data-index="${index}">
					<div class="svg-info">
						<span class="svg-number">${index + 1} / ${svgs.length}</span>
						<span class="svg-line">Línea ${item.line + 1}</span>
					</div>
					<div class="svg-container">
						<img src="${dataUri}" alt="SVG ${index + 1}" class="svg-preview" />
					</div>
					<div class="svg-actions">
						<button class="action-button" onclick="copyCode(${index})">📋 Copiar</button>
					</div>
					<div class="svg-code" id="code-${index}">
						<pre><code>${item.svg.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>
					</div>
				</div>`;
			} catch (error) {
				console.error('Error creating SVG item:', error);
				return `<div class="svg-item error">Error al procesar SVG ${index + 1}</div>`;
			}
		}).join('\n');
		
		return `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<title>SVG Preview</title>
			<style>
				body {
					font-family: var(--vscode-font-family);
					margin: 0;
					padding: 10px;
					background: var(--vscode-sideBar-background);
					color: var(--vscode-foreground);
				}
				.header {
					margin-bottom: 15px;
					padding-bottom: 10px;
					border-bottom: 1px solid var(--vscode-panel-border);
				}
				.header h3 {
					margin: 0 0 5px 0;
					font-size: 14px;
					color: var(--vscode-foreground);
				}
				.header p {
					margin: 0;
					font-size: 12px;
					color: var(--vscode-descriptionForeground);
				}
				.controls {
					display: flex;
					justify-content: space-between;
					align-items: center;
					margin-bottom: 15px;
					gap: 8px;
				}
				.nav-button {
					background: var(--vscode-button-background);
					color: var(--vscode-button-foreground);
					border: none;
					padding: 6px 12px;
					border-radius: 2px;
					cursor: pointer;
					font-size: 12px;
					flex: 1;
				}
				.nav-button:hover {
					background: var(--vscode-button-hoverBackground);
				}
				.nav-button:disabled {
					opacity: 0.5;
					cursor: not-allowed;
				}
				.counter {
					font-weight: bold;
					font-size: 12px;
					color: var(--vscode-textLink-foreground);
					white-space: nowrap;
				}
				.svg-item {
					display: none;
				}
				.svg-item.active {
					display: block;
				}
				.svg-info {
					display: flex;
					justify-content: space-between;
					margin-bottom: 10px;
					font-size: 11px;
					color: var(--vscode-descriptionForeground);
				}
				.svg-container {
					display: flex;
					justify-content: center;
					align-items: center;
					min-height: 150px;
					background: var(--vscode-editor-background);
					border: 1px solid var(--vscode-panel-border);
					border-radius: 4px;
					margin-bottom: 10px;
					padding: 15px;
				}
				.svg-preview {
					max-width: 100%;
					max-height: 200px;
					object-fit: contain;
					background: white;
					padding: 8px;
					border-radius: 2px;
				}
				.svg-actions {
					margin-bottom: 10px;
				}
				.action-button {
					background: var(--vscode-button-secondaryBackground);
					color: var(--vscode-button-secondaryForeground);
					border: none;
					padding: 4px 8px;
					border-radius: 2px;
					cursor: pointer;
					font-size: 11px;
					width: 100%;
				}
				.action-button:hover {
					background: var(--vscode-button-secondaryHoverBackground);
				}
				.svg-code {
					text-align: left;
					background: var(--vscode-textCodeBlock-background);
					border-radius: 3px;
					padding: 8px;
					overflow-x: auto;
					max-height: 150px;
					font-size: 10px;
				}
				.svg-code pre {
					margin: 0;
					font-family: var(--vscode-editor-font-family);
					line-height: 1.3;
				}
				.error {
					color: var(--vscode-errorForeground);
					padding: 15px;
					text-align: center;
					font-size: 12px;
				}
			</style>
		</head>
		<body>
			<div class="header">
				<h3>SVG Preview</h3>
				<p>${fileName} - ${svgs.length} SVG${svgs.length !== 1 ? 's' : ''}</p>
			</div>
			
			${svgs.length > 1 ? `
			<div class="controls">
				<button class="nav-button" id="prevBtn" onclick="navigate(-1)">← Anterior</button>
				<span class="counter" id="counter">1 / ${svgs.length}</span>
				<button class="nav-button" id="nextBtn" onclick="navigate(1)">Siguiente →</button>
			</div>
			` : ''}
			
			<div class="slider">
				${svgItems}
			</div>
			
			<script>
				let currentIndex = 0;
				const totalItems = ${svgs.length};
				
				function updateDisplay() {
					document.querySelectorAll('.svg-item').forEach(item => {
						item.classList.remove('active');
					});
					
					const currentItem = document.querySelector('.svg-item[data-index="' + currentIndex + '"]');
					if (currentItem) {
						currentItem.classList.add('active');
					}
					
					if (totalItems > 1) {
						document.getElementById('counter').textContent = (currentIndex + 1) + ' / ' + totalItems;
						document.getElementById('prevBtn').disabled = currentIndex === 0;
						document.getElementById('nextBtn').disabled = currentIndex === totalItems - 1;
					}
				}
				
				function navigate(direction) {
					const newIndex = currentIndex + direction;
					if (newIndex >= 0 && newIndex < totalItems) {
						currentIndex = newIndex;
						updateDisplay();
					}
				}
				
				function copyCode(index) {
					const codeElement = document.getElementById('code-' + index);
					if (codeElement) {
						const text = codeElement.textContent;
						navigator.clipboard.writeText(text).then(() => {
							// Visual feedback
							const button = event.target;
							const originalText = button.textContent;
							button.textContent = '✓ Copiado';
							setTimeout(() => {
								button.textContent = originalText;
							}, 1500);
						});
					}
				}
				
				updateDisplay();
				
				document.addEventListener('keydown', function(event) {
					if (event.key === 'ArrowLeft') {
						navigate(-1);
					} else if (event.key === 'ArrowRight') {
						navigate(1);
					}
				});
			</script>
		</body>
		</html>`;
	}
}

/**
 * Extrae contenido SVG de una línea de código
 */
function extractSvgFromLine(lineText: string): string | null {
	// Buscar SVG que empiece en esta línea
	const svgStartMatch = lineText.match(SVG_START_REGEX);
	if (svgStartMatch) {
		return null; // Marcar que hay un SVG que empieza aquí
	}
	return null;
}

/**
 * Busca SVG completo desde una posición
 */
function findCompleteSvg(document: vscode.TextDocument, startLine: number): { svg: string; endLine: number } | null {
	let svgContent = '';
	let depth = 0;
	let inSvg = false;
	let endLine = startLine;

	for (let i = startLine; i < document.lineCount; i++) {
		const lineText = document.lineAt(i).text;
		
		for (let j = 0; j < lineText.length; j++) {
			const char = lineText[j];
			
			if (!inSvg) {
				// Buscar inicio de <svg
				const remaining = lineText.substring(j);
				if (remaining.match(/^<svg/i)) {
					inSvg = true;
					depth = 1;
					svgContent = '<svg';
					j += 3; // saltar "svg"
					continue;
				}
			} else {
				svgContent += char;
				
				// Detectar tags de apertura y cierre
				if (char === '<') {
					const remaining = lineText.substring(j);
					if (remaining.match(/^<\/svg>/i)) {
						depth--;
						if (depth === 0) {
							svgContent += '/svg>';
							endLine = i;
							return { svg: svgContent, endLine };
						}
					} else if (remaining.match(/^<svg/i)) {
						depth++;
					}
				}
			}
		}
		
		if (inSvg) {
			svgContent += '\n';
		}
	}
	
	return null;
}

/**
 * Extrae SVG de un string entre comillas o template literal
 */
function extractSvgFromText(text: string): string | null {
	const match = text.match(SVG_STRING_REGEX);
	if (match && match[0]) {
		return match[0];
	}
	return null;
}

/**
 * Crea un data URI para un SVG
 */
function createSvgDataUri(svgContent: string, size: number = 16): vscode.Uri {
	if (!svgContent || typeof svgContent !== 'string') {
		throw new Error('Invalid SVG content provided');
	}
	
	try {
		// Limpiar y normalizar el SVG
		let cleanSvg = svgContent
			.replace(/\\n/g, '\n')
			.replace(/\\"/g, '"')
			.replace(/\\'/g, "'")
			.replace(/\\\\/g, '\\')
			.trim();
		
		if (!cleanSvg) {
			throw new Error('SVG content is empty after cleaning');
		}
		
		// Asegurar que tiene viewBox o width/height para escalar
		if (!cleanSvg.includes('viewBox') && !cleanSvg.includes('width')) {
			cleanSvg = cleanSvg.replace('<svg', `<svg width="${size}" height="${size}"`);
		}
		
		// Encodear para data URI
		const encoded = encodeURIComponent(cleanSvg)
			.replace(/'/g, '%27')
			.replace(/"/g, '%22');
		
		return vscode.Uri.parse(`data:image/svg+xml,${encoded}`);
	} catch (error) {
		console.error('Error creating SVG data URI:', error);
		throw error;
	}
}

/**
 * Crea el Hover Provider para mostrar preview de SVG
 */
function createSvgHoverProvider(): vscode.HoverProvider {
	return {
		provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
			try {
				const lineText = document.lineAt(position.line).text;
				
				// Para archivos .svg, mostrar preview del archivo completo
				if (document.fileName && document.fileName.endsWith('.svg')) {
					const fullText = document.getText();
					if (fullText && fullText.trim()) {
						try {
							const svgUri = createSvgDataUri(fullText, 200);
							const markdown = new vscode.MarkdownString();
							markdown.isTrusted = true;
							markdown.supportHtml = true;
							markdown.appendMarkdown(`**SVG Preview**\n\n![SVG](${svgUri})`);
							return new vscode.Hover(markdown);
						} catch (error) {
							console.error('Error creating hover for SVG file:', error);
						}
					}
				}
				
				// Para otros archivos, buscar SVG en la línea o contexto
				const svgMatch = extractSvgFromText(lineText);
				if (svgMatch) {
					try {
						const svgUri = createSvgDataUri(svgMatch, 200);
						const markdown = new vscode.MarkdownString();
						markdown.isTrusted = true;
						markdown.supportHtml = true;
						markdown.appendMarkdown(`**SVG Preview**\n\n![SVG](${svgUri})`);
						return new vscode.Hover(markdown);
					} catch (error) {
						console.error('Error creating hover for inline SVG:', error);
					}
				}
				
				// Buscar SVG multilínea
				const result = findCompleteSvgFromPosition(document, position);
				if (result) {
					try {
						const svgUri = createSvgDataUri(result.svg, 200);
						const markdown = new vscode.MarkdownString();
						markdown.isTrusted = true;
						markdown.supportHtml = true;
						markdown.appendMarkdown(`**SVG Preview**\n\n![SVG](${svgUri})`);
						return new vscode.Hover(markdown);
					} catch (error) {
						console.error('Error creating hover for multiline SVG:', error);
					}
				}
				
				return null;
			} catch (error) {
				console.error('Error in hover provider:', error);
				return null;
			}
		}
	};
}

/**
 * Busca SVG completo desde una posición del cursor
 */
function findCompleteSvgFromPosition(document: vscode.TextDocument, position: vscode.Position): { svg: string; startLine: number; endLine: number } | null {
	// Buscar hacia atrás para encontrar el inicio del SVG
	let startLine = position.line;
	
	for (let i = position.line; i >= 0; i--) {
		const lineText = document.lineAt(i).text;
		if (lineText.match(SVG_START_REGEX)) {
			startLine = i;
			break;
		}
		// Si encontramos </svg> antes de <svg, no estamos dentro de un SVG
		if (lineText.includes('</svg>') && i !== position.line) {
			return null;
		}
	}
	
	// Ahora buscar el SVG completo desde startLine
	let svgContent = '';
	let depth = 0;
	let inSvg = false;
	let endLine = startLine;
	
	for (let i = startLine; i < document.lineCount; i++) {
		const lineText = document.lineAt(i).text;
		
		for (let j = 0; j < lineText.length; j++) {
			if (!inSvg) {
				const remaining = lineText.substring(j);
				const match = remaining.match(/^<svg/i);
				if (match) {
					inSvg = true;
					depth = 1;
					svgContent = '';
					// Buscar el final del tag de apertura
					let k = j;
					while (k < lineText.length) {
						svgContent += lineText[k];
						if (lineText[k] === '>') {
							j = k;
							break;
						}
						k++;
					}
					continue;
				}
			} else {
				const remaining = lineText.substring(j);
				
				if (remaining.match(/^<\/svg>/i)) {
					svgContent += '</svg>';
					endLine = i;
					return { svg: svgContent, startLine, endLine };
				} else if (remaining.match(/^<svg/i)) {
					depth++;
				}
				
				svgContent += lineText[j];
			}
		}
		
		if (inSvg && i < document.lineCount - 1) {
			svgContent += '\n';
		}
	}
	
	return null;
}

/**
 * Actualiza las decoraciones de gutter para un editor
 */
function updateGutterDecorations(editor: vscode.TextEditor) {
	if (!editor || !editor.document) {
		console.warn('Invalid editor or document provided to updateGutterDecorations');
		return;
	}
	
	const document = editor.document;
	
	// Ignorar archivos de código fuente de la extensión
	if (shouldIgnoreFile(document.fileName)) {
		return;
	}
	
	const editorKey = editor.document.uri.toString();
	
	try {
		// Limpiar decoraciones anteriores
		const oldDecorations = editorDecorations.get(editorKey);
		if (oldDecorations && Array.isArray(oldDecorations)) {
			oldDecorations.forEach(d => {
				if (d && typeof d.dispose === 'function') {
					d.dispose();
				}
			});
		}
		editorDecorations.set(editorKey, []);
	
		const newDecorations: vscode.TextEditorDecorationType[] = [];
		const text = document.getText();
		
		if (!text) {
			console.warn('Document has no text content');
			return;
		}
		
		// Para archivos SVG, mostrar decoración en la primera línea
		if (document.fileName && document.fileName.endsWith('.svg')) {
			const svgContent = text.trim();
			if (svgContent && (svgContent.startsWith('<svg') || svgContent.includes('<svg'))) {
				try {
					const dataUri = createSvgDataUri(svgContent, 16);
				const decorationType = vscode.window.createTextEditorDecorationType({
					gutterIconPath: dataUri,
					gutterIconSize: 'contain'
				});
				newDecorations.push(decorationType);
				editor.setDecorations(decorationType, [new vscode.Range(0, 0, 0, 0)]);
			} catch (e) {
				console.error('Error creating SVG decoration:', e);
			}
		}
		} else {
			// Buscar SVGs en el documento
			const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
			let match;
			const processedLines = new Set<number>();
			let iterationCount = 0;
			const maxIterations = 1000; // Prevenir bucles infinitos
			
			while ((match = svgRegex.exec(text)) !== null && iterationCount < maxIterations) {
				iterationCount++;
				
				if (!match || !match[0] || typeof match.index !== 'number') {
					continue;
				}
				
				const svgContent = match[0];
				const startPos = document.positionAt(match.index);
				const lineNumber = startPos.line;
				
				// Evitar duplicados en la misma línea
				if (processedLines.has(lineNumber)) {
					continue;
				}
				processedLines.add(lineNumber);
				
				try {
					const dataUri = createSvgDataUri(svgContent, 16);
					const decorationType = vscode.window.createTextEditorDecorationType({
						gutterIconPath: dataUri,
						gutterIconSize: 'contain'
					});
					newDecorations.push(decorationType);
					editor.setDecorations(decorationType, [new vscode.Range(lineNumber, 0, lineNumber, 0)]);
				} catch (e) {
					console.error('Error creating SVG decoration for line', lineNumber, ':', e);
				}
			}
		}
		
		editorDecorations.set(editorKey, newDecorations);
	} catch (error) {
		console.error('Error in updateGutterDecorations:', error);
		// En caso de error, asegurar que no queden decoraciones huérfanas
		editorDecorations.set(editorKey, []);
	}
}

/**
 * Activa la extensión
 */
export function activate(context: vscode.ExtensionContext) {
	const startTime = Date.now();
	console.log(`[INFO] ${new Date().toISOString()} - SVG Preview extension is activating...`);

	try {
		// Crear provider para la vista de SVGs
		svgViewProvider = new SvgViewProvider();
		const treeView = vscode.window.createTreeView('svgExplorer', {
			treeDataProvider: svgViewProvider,
			showCollapseAll: false
		});
		
		// Registrar el WebviewViewProvider para el preview en el sidebar
		const svgPreviewProvider = new SvgPreviewViewProvider(context.extensionUri);
		const svgPreviewView = vscode.window.registerWebviewViewProvider(
			'svgPreviewView',
			svgPreviewProvider
		);

		// Registrar Hover Provider para archivos SVG
	const svgHoverProvider = vscode.languages.registerHoverProvider(
		{ scheme: 'file', pattern: '**/*.svg' },
		createSvgHoverProvider()
	);

	// Registrar Hover Provider para otros tipos de archivos comunes
	const codeHoverProvider = vscode.languages.registerHoverProvider(
		[
			{ scheme: 'file', language: 'javascript' },
			{ scheme: 'file', language: 'typescript' },
			{ scheme: 'file', language: 'javascriptreact' },
			{ scheme: 'file', language: 'typescriptreact' },
			{ scheme: 'file', language: 'html' },
			{ scheme: 'file', language: 'xml' },
			{ scheme: 'file', language: 'vue' },
			{ scheme: 'file', language: 'svelte' },
			{ scheme: 'file', language: 'php' },
			{ scheme: 'file', language: 'python' },
			{ scheme: 'file', language: 'ruby' },
			{ scheme: 'file', language: 'java' },
			{ scheme: 'file', language: 'csharp' },
			{ scheme: 'file', language: 'css' },
			{ scheme: 'file', language: 'scss' },
			{ scheme: 'file', language: 'less' },
			{ scheme: 'file', language: 'json' },
			{ scheme: 'file', language: 'markdown' },
		],
		createSvgHoverProvider()
	);

	// Actualizar decoraciones cuando cambia el editor activo
	const onActiveEditorChange = vscode.window.onDidChangeActiveTextEditor(editor => {
		try {
			if (editor && editor.document) {
				updateGutterDecorations(editor);
				svgViewProvider.refresh();
			}
		} catch (error) {
			console.error('Error in onDidChangeActiveTextEditor:', error);
		}
	});

	// Actualizar decoraciones cuando cambia el documento
	const onDocumentChange = vscode.workspace.onDidChangeTextDocument(event => {
		try {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document && editor.document === event.document) {
				// Debounce para evitar actualizaciones excesivas
				setTimeout(() => {
					try {
						if (editor && editor.document) {
							updateGutterDecorations(editor);
							svgViewProvider.refresh();
						}
					} catch (error) {
						console.error('Error in delayed decoration update:', error);
					}
				}, 300);
			}
		} catch (error) {
			console.error('Error in onDidChangeTextDocument:', error);
		}
	});

	// Comando para refrescar manualmente las decoraciones
	const refreshCommand = vscode.commands.registerCommand('svg-show.refresh', () => {
		try {
			const editor = vscode.window.activeTextEditor;
			if (editor && editor.document) {
				updateGutterDecorations(editor);
				svgViewProvider.refresh();
				vscode.window.showInformationMessage('SVG decorations refreshed!');
			} else {
				vscode.window.showWarningMessage('No active editor found to refresh SVG decorations.');
			}
		} catch (error) {
			console.error('Error in refresh command:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage('Error refreshing SVG decorations: ' + errorMessage);
		}
	});

	// Comando para ir a una línea específica
	const goToLineCommand = vscode.commands.registerCommand('svg-show.goToLine', (filePath: string, lineNumber: number) => {
		try {
			vscode.workspace.openTextDocument(filePath).then(document => {
				vscode.window.showTextDocument(document).then(editor => {
					const position = new vscode.Position(lineNumber, 0);
					editor.selection = new vscode.Selection(position, position);
					editor.revealRange(new vscode.Range(position, position));
				});
			});
		} catch (error) {
			console.error('Error in goToLine command:', error);
		}
	});

	// Comando para mostrar el preview de SVG en el sidebar
	const showPreviewCommand = vscode.commands.registerCommand('svg-show.showPreview', () => {
		try {
			vscode.commands.executeCommand('svgPreviewView.focus');
		} catch (error) {
			console.error('Error in show preview command:', error);
			const errorMessage = error instanceof Error ? error.message : String(error);
			vscode.window.showErrorMessage('Error showing SVG preview: ' + errorMessage);
		}
	});

	// Actualizar decoraciones para el editor actual al activar
	try {
		if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
			updateGutterDecorations(vscode.window.activeTextEditor);
		}
	} catch (error) {
		console.error('Error initializing decorations on activation:', error);
	}

	context.subscriptions.push(
		treeView,
		svgPreviewView,
		svgHoverProvider,
		codeHoverProvider,
		onActiveEditorChange,
		onDocumentChange,
		refreshCommand,
		goToLineCommand,
		showPreviewCommand
	);
	
	const activationTime = Date.now() - startTime;
	console.log(`[INFO] ${new Date().toISOString()} - SVG Preview extension activated successfully in ${activationTime}ms`);
	
	} catch (error) {
		console.error('[ERROR] Failed to activate SVG Preview extension:', error);
		const errorMessage = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage('Failed to activate SVG Preview extension: ' + errorMessage);
	}
}

/**
 * Desactiva la extensión
 */
export function deactivate() {
	try {
		console.log('Deactivating SVG Preview extension...');
		
		// Limpiar la vista del webview si está activa
		if (svgPreviewView) {
			svgPreviewView = undefined;
		}
		
		// Limpiar todas las decoraciones
		editorDecorations.forEach((decorations, key) => {
			try {
				if (decorations && Array.isArray(decorations)) {
					decorations.forEach(d => {
						if (d && typeof d.dispose === 'function') {
							d.dispose();
						}
					});
				}
			} catch (error) {
				console.error(`Error disposing decorations for ${key}:`, error);
			}
		});
		editorDecorations.clear();
		
		console.log('SVG Preview extension deactivated successfully');
	} catch (error) {
		console.error('Error during SVG Preview extension deactivation:', error);
	}
}
