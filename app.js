let selectedElement = null;
let draggedElement = null;

// Multi-Seiten Datenspeicher
let pages = {
    "index.html": `<h1 class="web-hero-title" contenteditable="true" draggable="true">Willkommen im Pro-Builder!</h1>
                   <p class="web-paragraph" contenteditable="true" draggable="true">Halte ein Element gedrückt, um es nach oben oder unten zu verschieben (Drag & Drop). Klicke es an, um es links zu färben.</p>`
};
let currentPage = "index.html";

// Initialisierung
registerCanvasEvents();

function registerCanvasEvents() {
    document.querySelectorAll('#canvas *').forEach(el => attachElementEvents(el));
}

// Events für JEDES Element (Klick, Rechtsklick, Drag & Drop)
function attachElementEvents(el) {
    el.setAttribute('draggable', 'true');

    // 1. Auswählen per Klick
    el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedElement) selectedElement.classList.remove('selected-element');
        selectedElement = el;
        el.classList.add('selected-element');
        
        document.getElementById('inspector').style.display = 'flex';
        document.getElementById('inspectColor').value = rgbToHex(window.getComputedStyle(el).color);
    });

    // 2. Löschen per Rechtsklick
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (selectedElement === el) document.getElementById('inspector').style.display = 'none';
        el.remove();
    });

    // 3. DRAG & DROP SORTIERLOGIK
    el.addEventListener('dragstart', (e) => {
        draggedElement = el;
        e.dataTransfer.effectAllowed = 'move';
    });

    el.addEventListener('dragover', (e) => {
        e.preventDefault();
        const bounding = el.getBoundingClientRect();
        const offset = e.clientY - bounding.top - (bounding.height / 2);
        if (offset < 0) {
            el.classList.add('drag-over');
        }
    });

    el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over');
    });

    el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        if (draggedElement && draggedElement !== el) {
            const canvas = document.getElementById('canvas');
            canvas.insertBefore(draggedElement, el);
        }
    });
}

// Element hinzufügen
function addComponent(tag, className, defaultText) {
    const el = document.createElement(tag);
    el.className = className;
    el.innerText = defaultText;
    el.contentEditable = "true";
    attachElementEvents(el);
    document.getElementById('canvas').appendChild(el);
}

// Bild hinzufügen mit URL Abfrage
function addImageComponent() {
    const url = prompt("Gib die Bild-URL ein (z.B. von unsplash.com oder picsum.photos):", "https://picsum.photos/600/300");
    if (url) {
        const img = document.createElement('img');
        img.className = 'web-img';
        img.src = url;
        attachElementEvents(img);
        document.getElementById('canvas').appendChild(img);
    }
}

// Inspector Änderungen
function adjustSelected(property, value) {
    if (selectedElement) selectedElement.style[property] = value;
}

function updateTheme() {
    const theme = document.getElementById('themeSelect').value;
    document.getElementById('canvas').className = theme;
}

// --- MULTI-PAGE LOGIK ---
function createNewPage() {
    const filename = prompt("Wie soll die neue Seite heißen? (z.B. about.html oder kontakt.html):");
    if (!filename || !filename.endsWith('.html')) {
        alert("Bitte gib einen gültigen Namen ein, der auf '.html' endet!");
        return;
    }
    
    // Speichere alte Seite, erstelle neue leere Seite
    pages[currentPage] = document.getElementById('canvas').innerHTML;
    pages[filename] = `<h1 class="web-hero-title" contenteditable="true" draggable="true">Neue Seite: ${filename}</h1>`;
    
    // Dropdown aktualisieren
    const select = document.getElementById('pageSelect');
    const opt = document.createElement('option');
    opt.value = filename;
    opt.innerText = filename;
    select.appendChild(opt);
    
    // Zur neuen Seite wechseln
    select.value = filename;
    switchPage(filename);
}

function switchPage(pageName) {
    // 1. Aktuellen Stand sichern
    pages[currentPage] = document.getElementById('canvas').innerHTML;
    
    // 2. Wechseln
    currentPage = pageName;
    document.getElementById('canvas').innerHTML = pages[pageName];
    
    // 3. Events neu binden, da HTML neu geladen wurde
    registerCanvasEvents();
    document.getElementById('inspector').style.display = 'none';
}

// --- SAUBERER EXPORT MIT EINGEBETTETEM CSS ---
function exportCurrentPage() {
    const theme = document.getElementById('themeSelect').value;
    const canvasClone = document.getElementById('canvas').cloneNode(true);
    
    canvasClone.querySelectorAll('*').forEach(el => {
        el.removeAttribute('contenteditable');
        el.removeAttribute('draggable');
        el.classList.remove('selected-element');
    });

    const cleanHTML = canvasClone.innerHTML;

    // Wir brennen das CSS direkt hier rein! Dadurch ist die index.html völlig unabhängig.
    const exportCode = `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${currentPage}</title>
    <style>
        body { margin: 0; padding: 60px 20px; font-family: system-ui, sans-serif; display: flex; justify-content: center; }
        .wrapper { width: 100%; max-width: 900px; }
        .web-hero-title { font-size: 3rem; font-weight: 800; margin-bottom: 15px; line-height: 1.2; }
        .web-paragraph { font-size: 1.1rem; line-height: 1.6; color: #475569; margin-bottom: 25px; }
        .web-btn { display: inline-block; background: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; text-decoration: none; }
        .web-img { max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 20px; display: block; }
        
        .style-clean { background-color: #ffffff !important; color: #0f172a !important; }
        .style-darkmode { background-color: #0f172a !important; color: #f8fafc !important; }
        .style-darkmode .web-paragraph { color: #94a3b8; }
        .style-darkmode .web-btn { background: #3b82f6; }
        .style-brutal { background-color: #ffe600 !important; color: #000000 !important; }
        .style-brutal .web-hero-title { font-weight: 900; text-transform: uppercase; border: 3px solid #000; padding: 10px; background: #fff; box-shadow: 5px 5px 0 #000; }
        .style-brutal .web-btn { background: #ff0055; border: 3px solid #000; box-shadow: 4px 4px 0 #000; color: white; }
    </style>
</head>
<body class="${theme}">
    <div class="wrapper">
        ${cleanHTML}
    </div>
</body>
</html>`;

    const blob = new Blob([exportCode], { type: 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = currentPage;
    link.click();
}

// Hilfsfunktion für Farben im Inspector
function rgbToHex(rgb) {
    if (rgb.startsWith('#')) return rgb;
    const rgbValues = rgb.match(/\d+/g);
    if (!rgbValues) return '#000000';
    return "#" + ((1 << 24) + (parseInt(rgbValues[0]) << 16) + (parseInt(rgbValues[1]) << 8) + parseInt(rgbValues[2])).toString(16).slice(1);
}
