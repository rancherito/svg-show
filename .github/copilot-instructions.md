# SVG Preview Extension

## Project Overview
VS Code extension that renders SVG previews:
- Hover preview for SVG files and SVG strings in code
- Gutter decorations showing inline SVG preview next to line numbers
- Support for both .svg files and inline SVG content

## Development Guidelines
- Use TypeScript for all source code
- Follow VS Code extension best practices
- Test with various SVG sizes and formats

## Key APIs Used
- `vscode.languages.registerHoverProvider` - For hover previews
- `vscode.window.createTextEditorDecorationType` - For gutter decorations
- `vscode.Uri.parse` with data URI for SVG rendering
