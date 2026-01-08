// Test file to demonstrate inline SVG preview

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <circle cx="12" cy="12" r="10" fill="#2196F3"/>
  <path d="M12 6v6l4 2" stroke="white" stroke-width="2" fill="none"/>
</svg>`;

const anotherSvg = '<svg viewBox="0 0 50 50"><rect x="5" y="5" width="40" height="40" fill="#FF5722" rx="8"/></svg>';

export const icons = {
  check: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    <circle cx="12" cy="12" r="10" fill="#4CAF50"/>
    <path d="M9 12l2 2 4-4" stroke="white" stroke-width="2" fill="none"/>
  </svg>`,
  
  close: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
    <circle cx="12" cy="12" r="10" fill="#f44336"/>
    <path d="M8 8l8 8M16 8l-8 8" stroke="white" stroke-width="2"/>
  </svg>`
};
