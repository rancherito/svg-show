"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode = __toESM(require("vscode"));
var SVG_STRING_REGEX = /(<svg[\s\S]*?<\/svg>)/gi;
var SVG_START_REGEX = /<svg[^>]*>/i;
function shouldIgnoreFile(filePath) {
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, "/");
  const ignorePatterns = [
    "/src/extension.ts",
    "/out/",
    "/dist/",
    "/node_modules/",
    "/.vscode/",
    "/test/",
    "/tests/"
  ];
  return ignorePatterns.some((pattern) => normalizedPath.includes(pattern));
}
var SvgViewProvider = class {
  _onDidChangeTreeData = new vscode.EventEmitter();
  onDidChangeTreeData = this._onDidChangeTreeData.event;
  svgItems = [];
  refresh() {
    this.updateSvgItems();
    this._onDidChangeTreeData.fire();
  }
  getTreeItem(element) {
    const item = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    item.tooltip = `Line ${element.lineNumber + 1}: ${element.label}`;
    item.description = `L\xEDnea ${element.lineNumber + 1}`;
    try {
      const dataUri = createSvgDataUri(element.svgContent, 16);
      item.iconPath = dataUri;
    } catch (error) {
      console.error("Error creating icon for tree item:", error);
    }
    item.command = {
      command: "svg-show.goToLine",
      title: "Go to SVG",
      arguments: [element.filePath, element.lineNumber]
    };
    return item;
  }
  getChildren(element) {
    if (!element) {
      return Promise.resolve(this.svgItems);
    }
    return Promise.resolve([]);
  }
  updateSvgItems() {
    this.svgItems = [];
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor || !activeEditor.document) {
      return;
    }
    const document = activeEditor.document;
    const fileName = document.fileName;
    if (shouldIgnoreFile(fileName)) {
      return;
    }
    const text = document.getText();
    try {
      if (fileName.endsWith(".svg")) {
        const svgContent = text.trim();
        if (svgContent && (svgContent.startsWith("<svg") || svgContent.includes("<svg"))) {
          this.svgItems.push({
            label: "Archivo SVG completo",
            svgContent,
            lineNumber: 0,
            filePath: fileName
          });
        }
      } else {
        const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
        let match;
        let svgIndex = 1;
        while ((match = svgRegex.exec(text)) !== null) {
          if (match && match[0] && typeof match.index === "number") {
            const svgContent = match[0];
            const position = document.positionAt(match.index);
            const lineNumber = position.line;
            this.svgItems.push({
              label: `SVG ${svgIndex}`,
              svgContent,
              lineNumber,
              filePath: fileName
            });
            svgIndex++;
          }
        }
      }
    } catch (error) {
      console.error("Error updating SVG items:", error);
    }
  }
};
var editorDecorations = /* @__PURE__ */ new Map();
var svgViewProvider;
var svgPreviewView;
function findAllSvgsInDocument(document) {
  const svgs = [];
  if (shouldIgnoreFile(document.fileName)) {
    return svgs;
  }
  const text = document.getText();
  if (!text) {
    return svgs;
  }
  if (document.fileName && document.fileName.endsWith(".svg")) {
    const svgContent = text.trim();
    if (svgContent && (svgContent.startsWith("<svg") || svgContent.includes("<svg"))) {
      svgs.push({ svg: svgContent, line: 0 });
    }
    return svgs;
  }
  const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
  let match;
  let iterationCount = 0;
  const maxIterations = 1e3;
  while ((match = svgRegex.exec(text)) !== null && iterationCount < maxIterations) {
    iterationCount++;
    if (!match || !match[0] || typeof match.index !== "number") {
      continue;
    }
    const svgContent = match[0];
    const startPos = document.positionAt(match.index);
    const lineNumber = startPos.line;
    svgs.push({ svg: svgContent, line: lineNumber });
  }
  return svgs;
}
var SvgPreviewViewProvider = class {
  constructor(_extensionUri) {
    this._extensionUri = _extensionUri;
  }
  resolveWebviewView(webviewView, context, _token) {
    svgPreviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };
    this.updateContent();
    vscode.window.onDidChangeActiveTextEditor(() => {
      this.updateContent();
    });
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
    const fileName = editor.document.fileName.split(/[\\\/]/).pop() || "Unknown";
    svgPreviewView.webview.html = this.getPreviewHtml(svgs, fileName);
  }
  getEmptyHtml() {
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
  getPreviewHtml(svgs, fileName) {
    if (svgs.length === 0) {
      return this.getEmptyHtml();
    }
    const svgItems = svgs.map((item, index) => {
      try {
        const encodedSvg = encodeURIComponent(item.svg).replace(/'/g, "%27").replace(/"/g, "%22");
        const dataUri = `data:image/svg+xml,${encodedSvg}`;
        return `
				<div class="svg-item" data-index="${index}">
					<div class="svg-info">
						<span class="svg-number">${index + 1} / ${svgs.length}</span>
						<span class="svg-line">L\xEDnea ${item.line + 1}</span>
					</div>
					<div class="svg-container">
						<img src="${dataUri}" alt="SVG ${index + 1}" class="svg-preview" />
					</div>
				</div>`;
      } catch (error) {
        console.error("Error creating SVG item:", error);
        return `<div class="svg-item error">Error al procesar SVG ${index + 1}</div>`;
      }
    }).join("\n");
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
				<p>${fileName} - ${svgs.length} SVG${svgs.length !== 1 ? "s" : ""}</p>
			</div>
			
			${svgs.length > 1 ? `
			<div class="controls">
				<button class="nav-button" id="prevBtn" onclick="navigate(-1)">\u2190 Anterior</button>
				<span class="counter" id="counter">1 / ${svgs.length}</span>
				<button class="nav-button" id="nextBtn" onclick="navigate(1)">Siguiente \u2192</button>
			</div>
			` : ""}
			
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
							button.textContent = '\u2713 Copiado';
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
};
function extractSvgFromText(text) {
  const match = text.match(SVG_STRING_REGEX);
  if (match && match[0]) {
    return match[0];
  }
  return null;
}
function createSvgDataUri(svgContent, size = 16) {
  if (!svgContent || typeof svgContent !== "string") {
    throw new Error("Invalid SVG content provided");
  }
  try {
    let cleanSvg = svgContent.replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\'/g, "'").replace(/\\\\/g, "\\").trim();
    if (!cleanSvg) {
      throw new Error("SVG content is empty after cleaning");
    }
    if (!cleanSvg.includes("xmlns")) {
      cleanSvg = cleanSvg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (cleanSvg.includes("viewBox") && !cleanSvg.includes("width=")) {
      cleanSvg = cleanSvg.replace("<svg", `<svg width="${size}" height="${size}"`);
    }
    if (!cleanSvg.includes("viewBox") && !cleanSvg.includes("width=")) {
      cleanSvg = cleanSvg.replace("<svg", `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"`);
    }
    const encoded = encodeURIComponent(cleanSvg).replace(/'/g, "%27").replace(/"/g, "%22");
    return vscode.Uri.parse(`data:image/svg+xml,${encoded}`);
  } catch (error) {
    console.error("Error creating SVG data URI:", error);
    throw error;
  }
}
function createSvgHoverProvider() {
  return {
    provideHover(document, position) {
      try {
        const lineText = document.lineAt(position.line).text;
        if (document.fileName && document.fileName.endsWith(".svg")) {
          const fullText = document.getText();
          if (fullText && fullText.trim()) {
            try {
              const svgUri = createSvgDataUri(fullText, 200);
              const markdown = new vscode.MarkdownString();
              markdown.isTrusted = true;
              markdown.supportHtml = true;
              markdown.appendMarkdown(`**SVG Preview**

![SVG](${svgUri})`);
              return new vscode.Hover(markdown);
            } catch (error) {
              console.error("Error creating hover for SVG file:", error);
            }
          }
        }
        const svgMatch = extractSvgFromText(lineText);
        if (svgMatch) {
          try {
            const svgUri = createSvgDataUri(svgMatch, 200);
            const markdown = new vscode.MarkdownString();
            markdown.isTrusted = true;
            markdown.supportHtml = true;
            markdown.appendMarkdown(`**SVG Preview**

![SVG](${svgUri})`);
            return new vscode.Hover(markdown);
          } catch (error) {
            console.error("Error creating hover for inline SVG:", error);
          }
        }
        const result = findCompleteSvgFromPosition(document, position);
        if (result) {
          try {
            const svgUri = createSvgDataUri(result.svg, 200);
            const markdown = new vscode.MarkdownString();
            markdown.isTrusted = true;
            markdown.supportHtml = true;
            markdown.appendMarkdown(`**SVG Preview**

![SVG](${svgUri})`);
            return new vscode.Hover(markdown);
          } catch (error) {
            console.error("Error creating hover for multiline SVG:", error);
          }
        }
        return null;
      } catch (error) {
        console.error("Error in hover provider:", error);
        return null;
      }
    }
  };
}
function findCompleteSvgFromPosition(document, position) {
  let startLine = position.line;
  for (let i = position.line; i >= 0; i--) {
    const lineText = document.lineAt(i).text;
    if (lineText.match(SVG_START_REGEX)) {
      startLine = i;
      break;
    }
    if (lineText.includes("</svg>") && i !== position.line) {
      return null;
    }
  }
  let svgContent = "";
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
          svgContent = "";
          let k = j;
          while (k < lineText.length) {
            svgContent += lineText[k];
            if (lineText[k] === ">") {
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
          svgContent += "</svg>";
          endLine = i;
          return { svg: svgContent, startLine, endLine };
        } else if (remaining.match(/^<svg/i)) {
          depth++;
        }
        svgContent += lineText[j];
      }
    }
    if (inSvg && i < document.lineCount - 1) {
      svgContent += "\n";
    }
  }
  return null;
}
function updateGutterDecorations(editor) {
  if (!editor || !editor.document) {
    console.warn("Invalid editor or document provided to updateGutterDecorations");
    return;
  }
  const document = editor.document;
  if (shouldIgnoreFile(document.fileName)) {
    return;
  }
  const editorKey = editor.document.uri.toString();
  try {
    const oldDecorations = editorDecorations.get(editorKey);
    if (oldDecorations && Array.isArray(oldDecorations)) {
      oldDecorations.forEach((d) => {
        if (d && typeof d.dispose === "function") {
          d.dispose();
        }
      });
    }
    editorDecorations.set(editorKey, []);
    const newDecorations = [];
    const text = document.getText();
    if (!text) {
      console.warn("Document has no text content");
      return;
    }
    if (document.fileName && document.fileName.endsWith(".svg")) {
      const svgContent = text.trim();
      if (svgContent && (svgContent.startsWith("<svg") || svgContent.includes("<svg"))) {
        try {
          const dataUri = createSvgDataUri(svgContent, 16);
          const decorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: dataUri,
            gutterIconSize: "contain"
          });
          newDecorations.push(decorationType);
          editor.setDecorations(decorationType, [new vscode.Range(0, 0, 0, 0)]);
        } catch (e) {
          console.error("Error creating SVG decoration:", e);
        }
      }
    } else {
      const svgRegex = /<svg[\s\S]*?<\/svg>/gi;
      let match;
      const processedLines = /* @__PURE__ */ new Set();
      let iterationCount = 0;
      const maxIterations = 1e3;
      while ((match = svgRegex.exec(text)) !== null && iterationCount < maxIterations) {
        iterationCount++;
        if (!match || !match[0] || typeof match.index !== "number") {
          continue;
        }
        const svgContent = match[0];
        const startPos = document.positionAt(match.index);
        const lineNumber = startPos.line;
        if (processedLines.has(lineNumber)) {
          continue;
        }
        processedLines.add(lineNumber);
        try {
          const dataUri = createSvgDataUri(svgContent, 16);
          const decorationType = vscode.window.createTextEditorDecorationType({
            gutterIconPath: dataUri,
            gutterIconSize: "contain"
          });
          newDecorations.push(decorationType);
          editor.setDecorations(decorationType, [new vscode.Range(lineNumber, 0, lineNumber, 0)]);
        } catch (e) {
          console.error("Error creating SVG decoration for line", lineNumber, ":", e);
        }
      }
    }
    editorDecorations.set(editorKey, newDecorations);
  } catch (error) {
    console.error("Error in updateGutterDecorations:", error);
    editorDecorations.set(editorKey, []);
  }
}
function activate(context) {
  const startTime = Date.now();
  console.log(`[INFO] ${(/* @__PURE__ */ new Date()).toISOString()} - SVG Preview extension is activating...`);
  try {
    svgViewProvider = new SvgViewProvider();
    const treeView = vscode.window.createTreeView("svgExplorer", {
      treeDataProvider: svgViewProvider,
      showCollapseAll: false
    });
    const svgPreviewProvider = new SvgPreviewViewProvider(context.extensionUri);
    const svgPreviewView2 = vscode.window.registerWebviewViewProvider(
      "svgPreviewView",
      svgPreviewProvider
    );
    const svgHoverProvider = vscode.languages.registerHoverProvider(
      { scheme: "file", pattern: "**/*.svg" },
      createSvgHoverProvider()
    );
    const codeHoverProvider = vscode.languages.registerHoverProvider(
      [
        { scheme: "file", language: "javascript" },
        { scheme: "file", language: "typescript" },
        { scheme: "file", language: "javascriptreact" },
        { scheme: "file", language: "typescriptreact" },
        { scheme: "file", language: "html" },
        { scheme: "file", language: "xml" },
        { scheme: "file", language: "vue" },
        { scheme: "file", language: "svelte" },
        { scheme: "file", language: "php" },
        { scheme: "file", language: "python" },
        { scheme: "file", language: "ruby" },
        { scheme: "file", language: "java" },
        { scheme: "file", language: "csharp" },
        { scheme: "file", language: "css" },
        { scheme: "file", language: "scss" },
        { scheme: "file", language: "less" },
        { scheme: "file", language: "json" },
        { scheme: "file", language: "markdown" }
      ],
      createSvgHoverProvider()
    );
    const onActiveEditorChange = vscode.window.onDidChangeActiveTextEditor((editor) => {
      try {
        if (editor && editor.document) {
          updateGutterDecorations(editor);
          svgViewProvider.refresh();
        }
      } catch (error) {
        console.error("Error in onDidChangeActiveTextEditor:", error);
      }
    });
    const onDocumentChange = vscode.workspace.onDidChangeTextDocument((event) => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document && editor.document === event.document) {
          setTimeout(() => {
            try {
              if (editor && editor.document) {
                updateGutterDecorations(editor);
                svgViewProvider.refresh();
              }
            } catch (error) {
              console.error("Error in delayed decoration update:", error);
            }
          }, 300);
        }
      } catch (error) {
        console.error("Error in onDidChangeTextDocument:", error);
      }
    });
    const refreshCommand = vscode.commands.registerCommand("svg-show.refresh", () => {
      try {
        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document) {
          updateGutterDecorations(editor);
          svgViewProvider.refresh();
          vscode.window.showInformationMessage("SVG decorations refreshed!");
        } else {
          vscode.window.showWarningMessage("No active editor found to refresh SVG decorations.");
        }
      } catch (error) {
        console.error("Error in refresh command:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage("Error refreshing SVG decorations: " + errorMessage);
      }
    });
    const goToLineCommand = vscode.commands.registerCommand("svg-show.goToLine", (filePath, lineNumber) => {
      try {
        vscode.workspace.openTextDocument(filePath).then((document) => {
          vscode.window.showTextDocument(document).then((editor) => {
            const position = new vscode.Position(lineNumber, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
          });
        });
      } catch (error) {
        console.error("Error in goToLine command:", error);
      }
    });
    const showPreviewCommand = vscode.commands.registerCommand("svg-show.showPreview", () => {
      try {
        vscode.commands.executeCommand("svgPreviewView.focus");
      } catch (error) {
        console.error("Error in show preview command:", error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage("Error showing SVG preview: " + errorMessage);
      }
    });
    try {
      if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document) {
        updateGutterDecorations(vscode.window.activeTextEditor);
      }
    } catch (error) {
      console.error("Error initializing decorations on activation:", error);
    }
    context.subscriptions.push(
      treeView,
      svgPreviewView2,
      svgHoverProvider,
      codeHoverProvider,
      onActiveEditorChange,
      onDocumentChange,
      refreshCommand,
      goToLineCommand,
      showPreviewCommand
    );
    const activationTime = Date.now() - startTime;
    console.log(`[INFO] ${(/* @__PURE__ */ new Date()).toISOString()} - SVG Preview extension activated successfully in ${activationTime}ms`);
  } catch (error) {
    console.error("[ERROR] Failed to activate SVG Preview extension:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage("Failed to activate SVG Preview extension: " + errorMessage);
  }
}
function deactivate() {
  try {
    console.log("Deactivating SVG Preview extension...");
    if (svgPreviewView) {
      svgPreviewView = void 0;
    }
    editorDecorations.forEach((decorations, key) => {
      try {
        if (decorations && Array.isArray(decorations)) {
          decorations.forEach((d) => {
            if (d && typeof d.dispose === "function") {
              d.dispose();
            }
          });
        }
      } catch (error) {
        console.error(`Error disposing decorations for ${key}:`, error);
      }
    });
    editorDecorations.clear();
    console.log("SVG Preview extension deactivated successfully");
  } catch (error) {
    console.error("Error during SVG Preview extension deactivation:", error);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
//# sourceMappingURL=extension.js.map
