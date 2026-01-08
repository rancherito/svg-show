// Test de diferentes formatos de SVG

// SVG con solo viewBox (el que reportaste que no funcionaba)
const icon1 = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="blue"/></svg>';

// SVG con width y height
const icon2 = '<svg width="24" height="24"><circle cx="12" cy="12" r="10" fill="red"/></svg>';

// SVG con viewBox y dimensiones
const icon3 = '<svg width="100" height="100" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="green"/></svg>';

// SVG completo con namespace
const icon4 = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="orange"/></svg>';

// SVG multilinea en template literal
const icon5 = `<svg viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="10" fill="purple"/>
  <circle cx="12" cy="12" r="5" fill="white"/>
</svg>`;
