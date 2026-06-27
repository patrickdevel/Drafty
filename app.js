'use strict';

/* ======================================================================
   STATE
   ====================================================================== */
let selectedElement = null;
let draggedElement = null;
let isDirty = false;

let pages = {
    "index.html": {
        html: `<div class="web-navbar" draggable="true"><span class="nav-logo" contenteditable="true">MeineSeite</span><div class="nav-links"><span contenteditable="true">Start</span><span contenteditable="true">Über</span><span contenteditable="true">Kontakt</span></div></div>
               <span class="web-badge" contenteditable="true" draggable="true">✨ Neu hier</span>
               <h1 class="web-hero-title" contenteditable="true" draggable="true">Willkommen im Pro-Builder!</h1>
               <p class="web-paragraph" contenteditable="true" draggable="true">Halte ein Element gedrückt, um es zu verschieben. Klicke es an, um es im Inspector links zu bearbeiten. Rechtsklick zum Löschen.</p>`,
        theme: "style-clean"
    }
};
let currentPage = "index.html";

let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50;
let isRestoringHistory = false;

/* ======================================================================
   INIT
   ====================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    registerCanvasEvents();
    updateCanvasEmptyState();
    pushHistory(); 
    updateStatusBar();
    initKeyboardShortcuts();
    loadAutosave();

    document.getElementById('canvas').addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (link && !document.body.classList.contains('preview-mode')) {
            e.preventDefault();
        }
    });
});

if (document.readyState === 'interactive' || document.readyState === 'complete') {
    registerCanvasEvents();
    updateCanvasEmptyState();
}

/* ======================================================================
   CANVAS EVENT WIRING
   ====================================================================== */
function registerCanvasEvents() {
    const canvas = document.getElementById('canvas');
    if (!canvas) return;
    canvas.querySelectorAll(':scope > *').forEach(el => attachElementEvents(el));
    canvas.querySelectorAll('.web-col').forEach(col => {
        attachContainerDropEvents(col);
        Array.from(col.children).forEach(child => attachElementEvents(child));
    });
}

function attachElementEvents(el) {
    if (el.dataset.boundEvents === '1') return;
    el.dataset.boundEvents = '1';
    el.setAttribute('draggable', 'true');

    el.addEventListener('click', (e) => {
        e.stopPropagation();
        selectElement(el);
    });

    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        confirmDeleteElement(el);
    });

    el.addEventListener('dragstart', (e) => {
        draggedElement = el;
        el.classList.add('dragging-now');
        document.getElementById('canvas').classList.add('dragging-active');
        e.dataTransfer.effectAllowed = 'move';
    });

    el.addEventListener('dragend', () => {
        el.classList.remove('dragging-now');
        document.getElementById('canvas').classList.remove('dragging-active');
        document.querySelectorAll('.drag-over-top, .drag-over-bottom').forEach(n => {
            n.classList.remove('drag-over-top', 'drag-over-bottom');
        });
    });

    el.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!draggedElement || draggedElement === el) return;
        const bounding = el.getBoundingClientRect();
        const offset = e.clientY - bounding.top - (bounding.height / 2);
        el.classList.toggle('drag-over-top', offset < 0);
        el.classList.toggle('drag-over-bottom', offset >= 0);
    });

    el.addEventListener('dragleave', () => {
        el.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wasTop = el.classList.contains('drag-over-top');
        el.classList.remove('drag-over-top', 'drag-over-bottom');
        if (draggedElement && draggedElement !== el && el.parentElement) {
            if (wasTop) {
                el.parentElement.insertBefore(draggedElement, el);
            } else {
                el.parentElement.insertBefore(draggedElement, el.nextSibling);
            }
            markDirty();
            pushHistory();
        }
        draggedElement = null;
    });

    if (el.isContentEditable || el.hasAttribute('contenteditable')) {
        el.addEventListener('blur', () => { markDirty(); pushHistory(); });
    }
    el.querySelectorAll('[contenteditable="true"]').forEach(child => {
        if (child.dataset.blurBound === '1') return;
        child.dataset.blurBound = '1';
        child.addEventListener('blur', () => { markDirty(); pushHistory(); });
        child.addEventListener('click', (e) => e.stopPropagation());
    });
}

function attachContainerDropEvents(col) {
    if (col.dataset.dropBound === '1') return;
    col.dataset.dropBound = '1';
    col.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    col.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (draggedElement && !col.contains(draggedElement)) {
            col.appendChild(draggedElement);
            markDirty();
            pushHistory();
        }
        draggedElement = null;
    });
}

document.getElementById('canvas')?.addEventListener('click', () => deselectElement());

/* ======================================================================
   SELECTION / INSPECTOR
   ====================================================================== */
function selectElement(el) {
    if (selectedElement) {
        selectedElement.classList.remove('selected-element');
        removeElementToolbar();
    }
    selectedElement = el;
    el.classList.add('selected-element');
    showElementToolbar(el);

    const inspector = document.getElementById('inspector');
    inspector.style.display = 'flex';

    const linkInput = document.getElementById('inspectLink');
    const pageSelect = document.getElementById('inspectPageLink');
    if (el.tagName.toLowerCase() === 'a') {
        linkInput.value = el.getAttribute('href') || '';
    } else {
        linkInput.value = '';
    }
    
    pageSelect.innerHTML = '<option value="">Seiten...</option>';
    Object.keys(pages).forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.innerText = p;
        pageSelect.appendChild(opt);
    });

    const computed = window.getComputedStyle(el);
    document.getElementById('inspectColor').value = rgbToHex(computed.color);
    document.getElementById('inspectBg').value = rgbToHex(computed.backgroundColor) || '#ffffff';

    const fontSizePx = parseFloat(computed.fontSize) || 16;
    document.getElementById('inspectFontSize').value = Math.round(fontSizePx);
    document.getElementById('fontSizeValue').textContent = Math.round(fontSizePx) + 'px';

    const marginBottomPx = parseFloat(el.style.marginBottom || computed.marginBottom) || 0;
    document.getElementById('inspectMargin').value = Math.min(100, Math.round(marginBottomPx));

    const paddingPx = parseFloat(el.style.padding) || 0;
    document.getElementById('inspectPadding').value = Math.min(60, Math.round(paddingPx));

    document.querySelectorAll('.align-row button').forEach(b => b.classList.remove('active'));
    const align = el.style.textAlign || 'left';
    const alignBtn = document.querySelector(`.align-row button[data-align="${align}"]`);
    if (alignBtn) alignBtn.classList.add('active');

    document.getElementById('elTagLabel').textContent = el.tagName.toLowerCase() + (el.className ? '.' + el.className.split(' ')[0] : '');
}

function deselectElement() {
    if (selectedElement) {
        selectedElement.classList.remove('selected-element');
        removeElementToolbar();
        selectedElement = null;
    }
    document.getElementById('inspector').style.display = 'none';
}

function showElementToolbar(el) {
    removeElementToolbar();
    const toolbar = document.createElement('div');
    toolbar.className = 'element-toolbar';
    toolbar.innerHTML = `
        <button title="Nach oben" data-act="up">↑</button>
        <button title="Nach unten" data-act="down">↓</button>
        <button title="Duplizieren" data-act="dup">⧉</button>
        <button title="Löschen" class="del-btn" data-act="del">✕</button>
    `;
    toolbar.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = e.target.dataset.act;
        if (!act) return;
        if (act === 'up') moveElement(el, -1);
        if (act === 'down') moveElement(el, 1);
        if (act === 'dup') duplicateElement(el);
        if (act === 'del') confirmDeleteElement(el);
    });
    el.appendChild(toolbar);
}

function removeElementToolbar() {
    document.querySelectorAll('.element-toolbar').forEach(t => t.remove());
}

function moveElement(el, direction) {
    const parent = el.parentElement;
    if (!parent) return;
    if (direction === -1 && el.previousElementSibling) {
        parent.insertBefore(el, el.previousElementSibling);
    } else if (direction === 1 && el.nextElementSibling) {
        parent.insertBefore(el.nextElementSibling, el);
    }
    markDirty();
    pushHistory();
}

function duplicateElement(el) {
    const clone = el.cloneNode(true);
    clone.classList.remove('selected-element');
    clone.querySelectorAll('.element-toolbar').forEach(t => t.remove());
    clone.removeAttribute('data-bound-events');
    clone.querySelectorAll('[data-bound-events]').forEach(n => n.removeAttribute('data-bound-events'));
    el.parentElement.insertBefore(clone, el.nextSibling);
    attachElementEvents(clone);
    clone.querySelectorAll(':scope *').forEach(child => {
        if (child.matches('[draggable]')) attachElementEvents(child);
    });
    clone.querySelectorAll('.web-col').forEach(col => {
        attachContainerDropEvents(col);
        Array.from(col.children).forEach(child => attachElementEvents(child));
    });
    markDirty();
    pushHistory();
    showToast('Element dupliziert', 'success');
}

function confirmDeleteElement(el) {
    openConfirmModal(
        'Element löschen?',
        'Dieses Element wird dauerhaft aus der Seite entfernt. Das kannst du mit Strg+Z wieder rückgängig machen.',
        () => {
            if (selectedElement === el) deselectElement();
            el.remove();
            updateCanvasEmptyState();
            markDirty();
            pushHistory();
            showToast('Element gelöscht', 'danger');
        }
    );
}

/* ======================================================================
   COMPONENT LIBRARY
   ====================================================================== */
function addComponent(tag, className, defaultText) {
    const el = document.createElement(tag);
    el.className = className;
    el.innerText = defaultText;
    el.contentEditable = "true";
    appendToCanvas(el);
}

function addBlock(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html.trim();
    const el = wrapper.firstElementChild;
    appendToCanvas(el);
}

function appendToCanvas(el) {
    const canvas = document.getElementById('canvas');
    canvas.appendChild(el);
    attachElementEvents(el);
    el.querySelectorAll('[contenteditable], img, button, a').forEach(child => {
        if (child.hasAttribute('contenteditable')) {
            child.addEventListener('click', (ev) => ev.stopPropagation());
            child.addEventListener('blur', () => { markDirty(); pushHistory(); });
        }
    });
    el.querySelectorAll('.web-col').forEach(col => attachContainerDropEvents(col));
    updateCanvasEmptyState();
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    markDirty();
    pushHistory();
}

function addImageComponent() {
    const url = prompt("Gib die Bild-URL ein (z.B. von unsplash.com oder picsum.photos):", "https://picsum.photos/600/300");
    if (url) {
        const img = document.createElement('img');
        img.className = 'web-img';
        img.src = url;
        img.alt = "Bild";
        appendToCanvas(img);
    }
}

function addVideoComponent() {
    const url = prompt("YouTube- oder Vimeo-Link einfügen:", "https://www.youtube.com/embed/dQw4w9WgXcQ");
    if (!url) return;
    const wrap = document.createElement('div');
    wrap.className = 'web-video';
    wrap.innerHTML = `<iframe src="${url}" allowfullscreen></iframe>`;
    appendToCanvas(wrap);
}

const BLOCKS = {
    navbar: `<div class="web-navbar" draggable="true"><span class="nav-logo" contenteditable="true">Marke</span><div class="nav-links"><span contenteditable="true">Start</span><span contenteditable="true">Leistungen</span><span contenteditable="true">Kontakt</span></div></div>`,
    subtitle: `<p class="web-subtitle" contenteditable="true" draggable="true">Ein aussagekräftiger Unter­titel, der den Wert deines Angebots erklärt.</p>`,
    badge: `<span class="web-badge" contenteditable="true" draggable="true">🚀 Neu</span>`,
    quote: `<blockquote class="web-quote" contenteditable="true" draggable="true">„Ein inspirierendes Zitat, das Vertrauen schafft.“</blockquote>`,
    list: `<ul class="web-list" contenteditable="true" draggable="true"><li>Erster Punkt</li><li>Zweiter Punkt</li><li>Dritter Punkt</li></ul>`,
    divider: `<hr class="web-divider" draggable="true">`,
    spacer: `<div class="web-spacer" draggable="true"></div>`,
    columns2: `<div class="web-columns-2" draggable="true"><div class="web-col"><p class="web-paragraph" contenteditable="true">Linke Spalte – hier Text oder weitere Bausteine hinein ziehen.</p></div><div class="web-col"><p class="web-paragraph" contenteditable="true">Rechte Spalte – hier Text oder weitere Bausteine hinein ziehen.</p></div></div>`,
    columns3: `<div class="web-columns-3" draggable="true"><div class="web-col"><p class="web-paragraph" contenteditable="true">Spalte 1</p></div><div class="web-col"><p class="web-paragraph" contenteditable="true">Spalte 2</p></div><div class="web-col"><p class="web-paragraph" contenteditable="true">Spalte 3</p></div></div>`,
    card: `<div class="web-card" draggable="true"><div class="card-title" contenteditable="true">Karten-Titel</div><div class="card-text" contenteditable="true">Kurze Beschreibung, die den Inhalt dieser Karte zusammenfasst.</div></div>`,
    iconbox: `<div class="web-icon-box" draggable="true"><div class="icon-circle" contenteditable="true">⚡</div><div class="ib-title" contenteditable="true">Schnell</div><div class="ib-text" contenteditable="true">Kurzer Beschreibungstext zu diesem Vorteil.</div></div>`,
    form: `<form class="web-form" draggable="true" onsubmit="return false;"><input type="text" placeholder="Name"><input type="text" placeholder="E-Mail"><textarea placeholder="Nachricht" rows="4"></textarea><button type="button" class="form-submit">Absenden</button></form>`,
    footer: `<div class="web-footer" contenteditable="true" draggable="true">© 2026 Meine Webseite. Alle Rechte vorbehalten.</div>`,
};

function addBlockByKey(key) {
    if (BLOCKS[key]) addBlock(BLOCKS[key]);
}

/* ======================================================================
   INSPECTOR ACTIONS & LINKING
   ====================================================================== */
function applyLink(url) {
    if (!selectedElement) return;
    url = url.trim();

    if (url) {
        if (selectedElement.tagName.toLowerCase() === 'a') {
            selectedElement.setAttribute('href', url);
        } else {
            const a = document.createElement('a');
            a.innerHTML = selectedElement.innerHTML;
            a.setAttribute('href', url);
            // FIX: Ursprünglichen Tag merken, damit wir ihn beim Löschen des Links wiederherstellen können
            a.dataset.origTag = selectedElement.tagName.toLowerCase();
            
            Array.from(selectedElement.attributes).forEach(attr => {
                if (attr.name !== 'href' && attr.name !== 'data-orig-tag') {
                    a.setAttribute(attr.name, attr.value);
                }
            });
            selectedElement.replaceWith(a);
            selectedElement = a;
            attachElementEvents(a);
            showElementToolbar(a);
        }
    } else {
        if (selectedElement.tagName.toLowerCase() === 'a') {
            // FIX: Hole den korrekten Ursprungs-Tag zurück (statt pauschal span/div zu raten)
            const tag = selectedElement.dataset.origTag || 'span';
            const el = document.createElement(tag);
            el.innerHTML = selectedElement.innerHTML;
            Array.from(selectedElement.attributes).forEach(attr => {
                if (attr.name !== 'href' && attr.name !== 'data-orig-tag') {
                    el.setAttribute(attr.name, attr.value);
                }
            });
            selectedElement.replaceWith(el);
            selectedElement = el;
            attachElementEvents(el);
            showElementToolbar(el);
        }
    }
    
    document.getElementById('elTagLabel').textContent = selectedElement.tagName.toLowerCase() + (selectedElement.className ? '.' + selectedElement.className.split(' ')[0] : '');
    markDirty();
    pushHistory();
}

function adjustSelected(property, value) {
    if (!selectedElement) return;
    selectedElement.style[property] = value;
    markDirty();
}

function commitInspectorChange() {
    pushHistory();
}

function setAlign(align) {
    if (!selectedElement) return;
    selectedElement.style.textAlign = align;
    document.querySelectorAll('.align-row button').forEach(b => b.classList.remove('active'));
    document.querySelector(`.align-row button[data-align="${align}"]`)?.classList.add('active');
    markDirty();
    pushHistory();
}

function applySwatch(hex) {
    if (!selectedElement) return;
    selectedElement.style.color = hex;
    document.getElementById('inspectColor').value = hex;
    markDirty();
    pushHistory();
}

function updateTheme() {
    const theme = document.getElementById('themeSelect').value;
    const canvas = document.getElementById('canvas');
    canvas.className = theme + (getViewportClass() ? ' ' + getViewportClass() : '');
    pages[currentPage].theme = theme;
    markDirty();
    pushHistory();
}

function getViewportClass() {
    const canvas = document.getElementById('canvas');
    if (canvas.classList.contains('viewport-tablet')) return 'viewport-tablet';
    if (canvas.classList.contains('viewport-mobile')) return 'viewport-mobile';
    return '';
}

function setViewport(size) {
    const canvas = document.getElementById('canvas');
    canvas.classList.remove('viewport-tablet', 'viewport-mobile');
    if (size === 'tablet') canvas.classList.add('viewport-tablet');
    if (size === 'mobile') canvas.classList.add('viewport-mobile');
    document.querySelectorAll('.viewport-toggle button').forEach(b => b.classList.remove('active'));
    document.querySelector(`.viewport-toggle button[data-vp="${size}"]`)?.classList.add('active');
}

function updateCanvasEmptyState() {
    const canvas = document.getElementById('canvas');
    canvas.classList.toggle('empty-canvas', canvas.children.length === 0);
}

/* ======================================================================
   MULTI-PAGE LOGIK
   ====================================================================== */
function createNewPage() {
    openPromptModal(
        'Neue Seite erstellen',
        'Dateiname der neuen Seite (z.B. about.html):',
        'about.html',
        (filename) => {
            filename = filename.trim();
            if (!filename) return;
            
            // FIX: Automatisch .html anhängen, wenn es vom User vergessen wurde
            if (!filename.endsWith('.html')) {
                filename += '.html';
            }

            if (!/^[a-zA-Z0-9_-]+\.html$/.test(filename)) {
                showToast('Ungültiger Name. Nutze nur Buchstaben/Zahlen.', 'danger');
                return;
            }
            if (pages[filename]) {
                showToast('Diese Seite existiert bereits.', 'danger');
                return;
            }
            savePageSnapshot();
            pages[filename] = {
                html: `<h1 class="web-hero-title" contenteditable="true" draggable="true">Neue Seite: ${escapeHtml(filename)}</h1><p class="web-paragraph" contenteditable="true" draggable="true">Beginne hier mit dem Aufbau dieser Seite.</p>`,
                theme: document.getElementById('themeSelect').value
            };
            addPageOption(filename);
            document.getElementById('pageSelect').value = filename;
            switchPage(filename);
            showToast('Seite "' + filename + '" erstellt', 'success');
        }
    );
}

function addPageOption(filename) {
    const select = document.getElementById('pageSelect');
    const opt = document.createElement('option');
    opt.value = filename;
    opt.innerText = filename;
    select.appendChild(opt);
}

function deleteCurrentPage() {
    if (Object.keys(pages).length <= 1) {
        showToast('Die letzte Seite kann nicht gelöscht werden.', 'danger');
        return;
    }
    openConfirmModal(
        'Seite löschen?',
        `"${currentPage}" wird endgültig entfernt. Dies kann nicht über Strg+Z rückgängig gemacht werden.`,
        () => {
            delete pages[currentPage];
            const select = document.getElementById('pageSelect');
            const opt = [...select.options].find(o => o.value === currentPage);
            if (opt) opt.remove();
            const nextPage = Object.keys(pages)[0];
            select.value = nextPage;
            currentPage = nextPage; 
            loadPageIntoCanvas(nextPage);
            showToast('Seite gelöscht', 'danger');
        }
    );
}

function savePageSnapshot() {
    const canvas = document.getElementById('canvas');
    const clone = canvas.cloneNode(true);
    clone.querySelectorAll('.element-toolbar').forEach(t => t.remove());
    clone.querySelectorAll('.selected-element').forEach(n => n.classList.remove('selected-element'));
    pages[currentPage] = pages[currentPage] || {};
    pages[currentPage].html = clone.innerHTML;
    pages[currentPage].theme = document.getElementById('themeSelect').value;
}

function switchPage(pageName) {
    savePageSnapshot();
    currentPage = pageName;
    loadPageIntoCanvas(pageName);
}

function loadPageIntoCanvas(pageName) {
    deselectElement();
    const data = pages[pageName];
    const canvas = document.getElementById('canvas');
    canvas.innerHTML = data.html;
    const vp = getViewportClass();
    canvas.className = data.theme + (vp ? ' ' + vp : '');
    document.getElementById('themeSelect').value = data.theme;
    canvas.querySelectorAll('[data-bound-events]').forEach(n => n.removeAttribute('data-bound-events'));
    registerCanvasEvents();
    updateCanvasEmptyState();
    undoStack = [];
    redoStack = [];
    pushHistory();
    updateStatusBar();
}

/* ======================================================================
   HISTORY (UNDO / REDO)
   ====================================================================== */
function pushHistory() {
    if (isRestoringHistory) return;
    const canvas = document.getElementById('canvas');
    const clone = canvas.cloneNode(true);
    clone.querySelectorAll('.element-toolbar').forEach(t => t.remove());
    const snapshot = clone.innerHTML;
    if (undoStack.length && undoStack[undoStack.length - 1] === snapshot) return;
    undoStack.push(snapshot);
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateUndoRedoButtons();
}

function undo() {
    if (undoStack.length <= 1) return;
    redoStack.push(undoStack.pop());
    restoreSnapshot(undoStack[undoStack.length - 1]);
    updateUndoRedoButtons();
}

function redo() {
    if (!redoStack.length) return;
    const snapshot = redoStack.pop();
    undoStack.push(snapshot);
    restoreSnapshot(snapshot);
    updateUndoRedoButtons();
}

function restoreSnapshot(snapshot) {
    isRestoringHistory = true;
    deselectElement();
    const canvas = document.getElementById('canvas');
    canvas.innerHTML = snapshot;
    canvas.querySelectorAll('[data-bound-events]').forEach(n => n.removeAttribute('data-bound-events'));
    canvas.querySelectorAll('[data-blur-bound]').forEach(n => n.removeAttribute('data-blur-bound'));
    canvas.querySelectorAll('[data-drop-bound]').forEach(n => n.removeAttribute('data-drop-bound'));
    registerCanvasEvents();
    updateCanvasEmptyState();
    markDirty();
    isRestoringHistory = false;
}

function updateUndoRedoButtons() {
    document.getElementById('undoBtn').disabled = undoStack.length <= 1;
    document.getElementById('redoBtn').disabled = redoStack.length === 0;
}

/* ======================================================================
   KEYBOARD SHORTCUTS
   ====================================================================== */
function initKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // FIX: Prüfe, ob IRGENDEIN Input-Feld aktiv ist, nicht nur contenteditable
        const active = document.activeElement;
        const isEditingText = active && (
            active.isContentEditable || 
            active.tagName === 'INPUT' || 
            active.tagName === 'TEXTAREA' || 
            active.tagName === 'SELECT'
        );

        const mod = e.ctrlKey || e.metaKey;

        if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
            // Erlaube normales Browser-Undo in Textfeldern
            if (!isEditingText) {
                e.preventDefault();
                undo();
            }
            return;
        }
        if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
            if (!isEditingText) {
                e.preventDefault();
                redo();
            }
            return;
        }
        if (mod && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveProjectToFile();
            return;
        }
        // Hier passierte der Bug: Wenn man im Pop-up Backspace drückte, wurde das Element gelöscht!
        if (!isEditingText && (e.key === 'Delete' || e.key === 'Backspace') && selectedElement) {
            e.preventDefault();
            confirmDeleteElement(selectedElement);
            return;
        }
        if (!isEditingText && mod && e.key.toLowerCase() === 'd' && selectedElement) {
            e.preventDefault();
            duplicateElement(selectedElement);
            return;
        }
        if (e.key === 'Escape') {
            const modalOpen = document.getElementById('modalOverlay').style.display === 'flex';
            if (modalOpen) {
                closeModal();
            } else if (document.body.classList.contains('preview-mode')) {
                exitPreview();
            } else {
                deselectElement();
            }
        }
    });
}

/* ======================================================================
   PREVIEW MODE
   ====================================================================== */
function togglePreview() {
    savePageSnapshot();
    deselectElement();
    document.body.classList.add('preview-mode');
    if (!document.getElementById('previewExitBtn')) {
        const btn = document.createElement('button');
        btn.id = 'previewExitBtn';
        btn.className = 'preview-exit-btn';
        btn.innerText = '✕ Vorschau beenden';
        btn.onclick = exitPreview;
        document.body.appendChild(btn);
    }
}
function exitPreview() {
    document.body.classList.remove('preview-mode');
    document.getElementById('previewExitBtn')?.remove();
}

/* ======================================================================
   STATUS BAR
   ====================================================================== */
function updateStatusBar() {
    document.getElementById('currentPageLabel').textContent = currentPage;
    const count = document.getElementById('canvas').children.length;
    document.getElementById('elementCountLabel').textContent = count + (count === 1 ? ' Element' : ' Elemente');
}

function markDirty() {
    isDirty = true;
    updateStatusBar();
    const dot = document.getElementById('saveDot');
    if (dot) dot.classList.add('unsaved');
    scheduleAutosave();
}

function markClean() {
    isDirty = false;
    const dot = document.getElementById('saveDot');
    if (dot) dot.classList.remove('unsaved');
}

let autosaveTimer = null;
function scheduleAutosave() {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
        savePageSnapshot();
    }, 800);
}
function loadAutosave() {
}

/* ======================================================================
   PROJEKT SPEICHERN / LADEN
   ====================================================================== */
function saveProjectToFile() {
    savePageSnapshot();
    const projectData = {
        version: 1,
        currentPage,
        pages
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'webbuilder-projekt.json';
    link.click();
    markClean();
    showToast('Projekt als JSON gespeichert', 'success');
}

function triggerProjectLoad() {
    document.getElementById('projectFileInput').click();
}

function handleProjectFileSelected(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.pages || !Object.keys(data.pages).length) throw new Error('invalid');
            pages = data.pages;
            currentPage = data.currentPage && pages[data.currentPage] ? data.currentPage : Object.keys(pages)[0];

            const select = document.getElementById('pageSelect');
            select.innerHTML = '';
            Object.keys(pages).forEach(name => addPageOption(name));
            select.value = currentPage;

            loadPageIntoCanvas(currentPage);
            markClean();
            showToast('Projekt erfolgreich geladen', 'success');
        } catch (err) {
            showToast('Diese Datei konnte nicht gelesen werden.', 'danger');
        }
    };
    reader.readAsText(file);
    input.value = '';
}

/* ======================================================================
   EXPORT
   ====================================================================== */
function buildExportHtml(pageName, theme, innerHtml) {
    return `<!DOCTYPE html>
<html lang="de">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(pageName.replace('.html', ''))}</title>
    <style>
${EXPORT_CSS}
    </style>
</head>
<body class="${theme}">
    <div class="wrapper">
        ${innerHtml}
    </div>
</body>
</html>`;
}

const EXPORT_CSS = `        body { margin: 0; padding: 60px 20px; font-family: system-ui, sans-serif; display: flex; justify-content: center; }
        .wrapper { width: 100%; max-width: 900px; }
        a { text-decoration: none; color: inherit; }
        .web-hero-title { font-size: 3rem; font-weight: 800; margin-bottom: 15px; line-height: 1.2; }
        .web-subtitle { font-size: 1.3rem; font-weight: 500; color: #64748b; margin-bottom: 20px; line-height: 1.4; }
        .web-paragraph { font-size: 1.1rem; line-height: 1.6; color: #475569; margin-bottom: 25px; }
        .web-btn { display: inline-block; background: #1e293b; color: white; padding: 12px 24px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer; text-decoration: none; text-align: center; }
        .web-img { max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 20px; display: block; }
        .web-divider { border: none; border-top: 1px solid #cbd5e1; margin: 30px 0; }
        .web-spacer { height: 40px; }
        .web-quote { border-left: 4px solid #3b82f6; padding: 10px 20px; font-style: italic; color: #334155; font-size: 1.15rem; margin: 25px 0; background: rgba(59,130,246,0.05); border-radius: 0 8px 8px 0; }
        .web-list { padding-left: 22px; margin-bottom: 25px; line-height: 1.8; font-size: 1.05rem; color: #334155; }
        .web-list li { margin-bottom: 4px; }
        .web-badge { display: inline-block; background: #e0e7ff; color: #4338ca; padding: 4px 12px; border-radius: 20px; font-size: 0.8rem; font-weight: 700; margin-bottom: 14px; letter-spacing: 0.02em; }
        .web-navbar { display: flex; justify-content: space-between; align-items: center; padding-bottom: 25px; margin-bottom: 25px; border-bottom: 1px solid #e2e8f0; }
        .web-navbar .nav-logo { font-weight: 800; font-size: 1.2rem; }
        .web-navbar .nav-links { display: flex; gap: 22px; font-weight: 600; font-size: 0.92rem; color: #334155; }
        .web-columns-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 25px; }
        .web-columns-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 25px; }
        .web-col { padding: 4px; min-height: 40px; }
        .web-card { border: 1px solid #e2e8f0; border-radius: 10px; padding: 22px; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
        .web-card .card-title { font-weight: 700; font-size: 1.1rem; margin-bottom: 8px; }
        .web-card .card-text { color: #64748b; font-size: 0.92rem; line-height: 1.5; }
        .web-icon-box { text-align: center; padding: 10px; }
        .web-icon-box .icon-circle { width: 52px; height: 52px; border-radius: 50%; background: #e0e7ff; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; margin: 0 auto 12px; }
        .web-icon-box .ib-title { font-weight: 700; margin-bottom: 6px; }
        .web-icon-box .ib-text { color: #64748b; font-size: 0.88rem; }
        .web-form { display: flex; flex-direction: column; gap: 12px; max-width: 420px; margin-bottom: 25px; }
        .web-form input, .web-form textarea { padding: 11px 14px; border: 1px solid #cbd5e1; border-radius: 6px; font-family: inherit; font-size: 0.92rem; }
        .web-form .form-submit { background: #1e293b; color: white; border: none; padding: 12px; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .web-video { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 10px; margin-bottom: 20px; background: #0f172a; }
        .web-video iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0; }
        .web-footer { border-top: 1px solid #e2e8f0; padding-top: 22px; margin-top: 35px; color: #94a3b8; font-size: 0.85rem; text-align: center; }
        .align-left { text-align: left; } .align-center { text-align: center; } .align-right { text-align: right; }
        .style-clean { background-color: #ffffff !important; color: #0f172a !important; }
        .style-darkmode { background-color: #0f172a !important; color: #f8fafc !important; }
        .style-darkmode .web-paragraph, .style-darkmode .web-subtitle { color: #94a3b8; }
        .style-darkmode .web-btn { background: #3b82f6; }
        .style-darkmode .web-card { background: #1e293b; border-color: #334155; }
        .style-darkmode .web-navbar { border-color: #334155; }
        .style-darkmode .web-form input, .style-darkmode .web-form textarea { background: #1e293b; border-color: #334155; color: #f8fafc; }
        .style-darkmode .web-divider { border-color: #334155; }
        .style-darkmode .web-footer { border-color: #334155; }
        .style-darkmode .web-badge { background: #312e81; color: #c7d2fe; }
        .style-darkmode .web-icon-box .icon-circle { background: #312e81; }
        .style-brutal { background-color: #ffe600 !important; color: #000000 !important; }
        .style-brutal .web-hero-title { font-weight: 900; text-transform: uppercase; border: 3px solid #000; padding: 10px; background: #fff; box-shadow: 5px 5px 0 #000; }
        .style-brutal .web-btn { background: #ff0055; border: 3px solid #000; box-shadow: 4px 4px 0 #000; color: white; }
        .style-brutal .web-card { border: 3px solid #000; box-shadow: 5px 5px 0 #000; border-radius: 0; }
        .style-brutal .web-badge { background: #000; color: #ffe600; border-radius: 0; }
        .style-soft { background-color: #fdf2f8 !important; color: #500724 !important; }
        .style-soft .web-hero-title { color: #831843; }
        .style-soft .web-paragraph, .style-soft .web-subtitle { color: #9d174d; }
        .style-soft .web-btn { background: #db2777; border-radius: 50px; }
        .style-soft .web-card { background: #fff; border: 1px solid #fbcfe8; border-radius: 18px; }
        .style-soft .web-badge { background: #fce7f3; color: #be185d; }`;

function cleanCanvasHtml(html) {
    const wrap = document.createElement('div');
    wrap.innerHTML = html;
    wrap.querySelectorAll('*').forEach(el => {
        el.removeAttribute('contenteditable');
        el.removeAttribute('draggable');
        el.removeAttribute('data-bound-events');
        el.removeAttribute('data-blur-bound');
        el.removeAttribute('data-drop-bound');
        el.classList.remove('selected-element', 'dragging-now');
        if (el.classList.contains('element-toolbar')) el.remove();
    });
    wrap.querySelectorAll('.element-toolbar').forEach(t => t.remove());
    return wrap.innerHTML;
}

function exportCurrentPage() {
    savePageSnapshot();
    const data = pages[currentPage];
    const cleanHTML = cleanCanvasHtml(data.html);
    const exportCode = buildExportHtml(currentPage, data.theme, cleanHTML);
    downloadFile(exportCode, currentPage, 'text/html');
    markClean();
    showToast('"' + currentPage + '" exportiert', 'success');
}

function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
}

function exportAllPagesAsZip() {
    savePageSnapshot();
    if (typeof JSZip === 'undefined') {
        showToast('ZIP-Bibliothek konnte nicht geladen werden.', 'danger');
        return;
    }
    const zip = new JSZip();
    Object.keys(pages).forEach(pageName => {
        const data = pages[pageName];
        const cleanHTML = cleanCanvasHtml(data.html);
        const exportCode = buildExportHtml(pageName, data.theme, cleanHTML);
        zip.file(pageName, exportCode);
    });
    zip.generateAsync({ type: 'blob' }).then(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'webseite-export.zip';
        link.click();
        markClean();
        showToast('Alle Seiten als ZIP exportiert', 'success');
    });
}

/* ======================================================================
   UI HELPERS: Tabs, Modals, Toasts
   ====================================================================== */
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabName));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.tab === tabName));
}

let modalConfirmCallback = null;
function openConfirmModal(title, text, onConfirm) {
    modalConfirmCallback = onConfirm;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalText').textContent = text;
    document.getElementById('modalOverlay').style.display = 'flex';
    document.getElementById('modalPromptInput').style.display = 'none';
    
    document.getElementById('modalConfirmBtn').onclick = () => {
        closeModal();
        if (modalConfirmCallback) modalConfirmCallback();
    };
}

let modalPromptCallback = null;
function openPromptModal(title, label, defaultValue, onSubmit) {
    modalPromptCallback = onSubmit;
    document.getElementById('modalTitle').textContent = title;
    document.getElementById('modalText').textContent = label;
    const input = document.getElementById('modalPromptInput');
    input.style.display = 'block';
    input.value = defaultValue || '';
    document.getElementById('modalOverlay').style.display = 'flex';
    setTimeout(() => input.focus(), 50);
    
    // FIX: Enter-Taste unterstützt!
    input.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            document.getElementById('modalConfirmBtn').click();
        }
    };

    document.getElementById('modalConfirmBtn').onclick = () => {
        const val = input.value;
        closeModal();
        input.onkeydown = null; // cleanup
        if (modalPromptCallback) modalPromptCallback(val);
    };
}

function closeModal() {
    document.getElementById('modalOverlay').style.display = 'none';
    modalConfirmCallback = null;
    modalPromptCallback = null;
}

function showToast(message, type) {
    const stack = document.getElementById('toastStack');
    const toast = document.createElement('div');
    toast.className = 'toast' + (type ? ' toast-' + type : '');
    const icon = type === 'success' ? '✓' : type === 'danger' ? '⚠' : 'ℹ';
    toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    stack.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 2800);
}

function rgbToHex(rgb) {
    if (!rgb) return '#000000';
    if (rgb.startsWith('#')) return rgb;
    if (rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return '#ffffff';
    const rgbValues = rgb.match(/\d+/g);
    if (!rgbValues) return '#000000';
    return "#" + ((1 << 24) + (parseInt(rgbValues[0]) << 16) + (parseInt(rgbValues[1]) << 8) + parseInt(rgbValues[2])).toString(16).slice(1);
}

function escapeHtml(str) {
    const div = document.createElement('div');
    div.innerText = str;
    return div.innerHTML;
}

window.addEventListener('beforeunload', (e) => {
    if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
    }
});
