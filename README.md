# SVG Preview

Una extensión de VS Code que muestra previsualizaciones de SVG directamente en el editor.

## ✨ Características

### 🖱️ Preview al Hover
- Pasa el cursor sobre archivos `.svg` para ver una previsualización
- Detecta SVG inline en código (JavaScript, TypeScript, HTML, etc.)
- Funciona con SVG en strings y template literals

### 📍 Decoraciones en el Gutter
- Muestra un icono del SVG al lado izquierdo del número de línea
- Similar a la funcionalidad de Android Studio
- Se actualiza automáticamente al editar el código

## 🎯 Lenguajes Soportados

- SVG (`.svg`)
- JavaScript / TypeScript
- JSX / TSX (React)
- HTML
- Vue
- Svelte
- PHP
- Python
- Ruby
- Java
- C#
- CSS / SCSS / LESS
- JSON
- Markdown

## 🚀 Uso

1. Abre un archivo `.svg` y pasa el cursor encima para ver la preview
2. En archivos de código, los SVG inline se detectan automáticamente
3. Usa el comando `SVG Preview: Refresh Decorations` si necesitas actualizar manualmente

## 📸 Ejemplos

```typescript
// El icono se mostrará en el gutter y al hover
const icon = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="blue"/></svg>';
```

```html
<!-- También funciona en HTML -->
<svg width="100" height="100">
  <rect x="10" y="10" width="80" height="80" fill="green"/>
</svg>
```

## ⌨️ Comandos

| Comando | Descripción |
|---------|-------------|
| `SVG Preview: Refresh Decorations` | Refresca las decoraciones de SVG en el editor actual |

## 🔧 Desarrollo

```bash
# Instalar dependencias
npm install

# Compilar
npm run compile

# Modo watch
npm run watch

# Ejecutar tests
npm test
```

## 📝 Notas

- Los SVG muy grandes pueden no renderizarse correctamente en el gutter
- Para mejor rendimiento, la actualización de decoraciones tiene un debounce de 300ms

## 📄 Licencia

MIT
