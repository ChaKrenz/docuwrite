// app.js
// Initialize Firebase (already done in each HTML file for now)
// import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
// import { getFirestore, collection, addDoc, getDocs, doc, updateDoc, getDoc, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

// Firebase configuration and initialization
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase and Firestore
let db;
let firestore;
let currentDocumentId = null;
let autoSaveTimeout;
let isModified = false;

// Speech Recognition (Dictation) functionality variables
let recognition;
let isDictating = false;
let speechToTextBtn;

// Initialize Firebase when the page loads
document.addEventListener('DOMContentLoaded', async function() {
    try {
        // Import Firebase modules dynamically
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        const { getFirestore, collection, addDoc, getDocs, doc, updateDoc, getDoc, query, orderBy } =
            await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');

        // Initialize Firebase
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        firestore = { collection, addDoc, getDocs, doc, updateDoc, getDoc, query, orderBy };

        // Initialize page-specific content
        if (window.location.pathname.includes('index.html')) {
            loadDocuments();
        } else if (window.location.pathname.includes('editor.html')) {
            initializeEditor();
            // Initialize speech recognition for the editor page
            speechToTextBtn = document.getElementById('speechToTextBtn');
            if (speechToTextBtn) { // Ensure the button exists
                speechToTextBtn.addEventListener('click', toggleSpeechToText);
                initSpeechRecognition(); // Initialize recognition when editor loads
            }
        }
    } catch (error) {
        console.error('Firebase initialization error:', error);
    }
});

// Initialize editor-specific components
function initializeEditor() {
    const editor = document.getElementById('editor');
    if (!editor) return;

    initCustomDropdowns();
    initFontDropdown();
    initLineSpacingDropdown();
    initAlignIndentDropdown();
    updateToolbarState();
    updateWordCount();

    // Load document if ID is in URL
    const urlParams = new URLSearchParams(window.location.search);
    const docId = urlParams.get('docId');

    if (docId) {
        loadDocument(docId);
    } else {
        resetEditor();
    }

    // Add event listeners
    document.addEventListener('selectionchange', updateToolbarState);
    document.addEventListener('mouseup', updateToolbarState);
    editor.addEventListener('input', handleEditorInput);
    document.getElementById('docTitle').addEventListener('input', markAsModified);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            switch(e.key) {
                case 'b':
                    e.preventDefault();
                    toggleFormat('bold');
                    break;
                case 'i':
                    e.preventDefault();
                    toggleFormat('italic');
                    break;
                case 'u':
                    e.preventDefault();
                    toggleFormat('underline');
                    break;
                case 's':
                    e.preventDefault();
                    saveDocument();
                    break;
            }
        }
    });

    // Delegate click events for dropdowns and color pickers
    document.body.addEventListener('click', function(event) {
        document.querySelectorAll('.custom-dropdown .dropdown-content').forEach(content => {
            if (!event.target.closest('.custom-dropdown')) {
                content.style.display = 'none';
            }
        });
    });

    editor.focus();
}

// --- Editor Related Functions (used in editor.html) ---

// Access editor element (assuming it exists in the current page)
let editor = document.getElementById('editor');

function toggleFormat(command) {
    document.execCommand(command);
    updateToolbarState();
    const editor = document.getElementById('editor');
    if (editor) editor.focus();
    markAsModified();
}

function changeFont(font) {
    // Update the selected font text in the dropdown (assuming custom dropdown in editor.html)
     const selectedFontSpan = document.querySelector('#fontSelect .selected-font');
     if(selectedFontSpan) selectedFontSpan.textContent = font; // Check if element exists

    document.execCommand('fontName', false, font);
    const editor = document.getElementById('editor');
    if (editor) editor.focus();

    // Re-apply the current font size after changing font name
    changeFontSize(0);

    markAsModified();
}

function changeFontSize(delta) {
    const fontSizeInput = document.getElementById('fontSizeInput');
    if (!fontSizeInput) return;

    let currentSize = parseInt(fontSizeInput.value) || 12;

    if (delta === 0) {
        // Direct input case - validate the input value
        currentSize = Math.max(8, Math.min(72, currentSize));
        fontSizeInput.value = currentSize;
    } else {
        // Increment/decrement case
        currentSize = Math.max(8, Math.min(72, currentSize + delta));
        fontSizeInput.value = currentSize;
    }

    const editor = document.getElementById('editor');
    if (!editor) return;

    // Get the current selection
    const selection = window.getSelection();
    if (!selection.rangeCount) {
        // If no selection, apply to the entire editor
        editor.style.fontSize = currentSize + 'px';
    } else {
        // If there's a selection, apply to the selected text
        document.execCommand('fontSize', false, '7'); // First set a base size
        const fontElements = editor.querySelectorAll('font[size="7"]');
        fontElements.forEach(el => {
            el.removeAttribute('size');
            el.style.fontSize = currentSize + 'px';
        });
    }

    editor.focus();
    markAsModified();
}

function setAlignment(align) {
    const commands = {
        'left': 'justifyLeft',
        'center': 'justifyCenter',
        'right': 'justifyRight',
        'justify': 'justifyFull'
    };
     const editor = document.getElementById('editor');
     if (editor) { // Check if editor element exists
        document.execCommand(commands[align]);
        // Update the selected text in the dropdown (assuming custom dropdown in editor.html)
        const selectedAlignSpan = document.querySelector('#alignIndentSelect .selected-align');
        if(selectedAlignSpan) selectedAlignSpan.textContent = align.charAt(0).toUpperCase() + align.slice(1);
        editor.focus();
        markAsModified();
     }
}

function setLineSpacing(spacing) {
     const editor = document.getElementById('editor');
     if (!editor) return; // Check if editor element exists
    const selection = window.getSelection();
    if (!selection.rangeCount) return;

    const range = selection.getRangeAt(0);
    const startNode = range.startContainer;
    const endNode = range.endContainer;

    let commonAncestor = range.commonAncestorContainer;
    if (commonAncestor.nodeType === 3) {
        commonAncestor = commonAncestor.parentElement;
    }

    const paragraphs = commonAncestor.querySelectorAll('p');

    if (paragraphs.length > 0) {
        paragraphs.forEach(p => {
            const pRange = document.createRange();
            pRange.selectNodeContents(p);
            if (range.intersectsNode(p)) {
                 p.style.lineHeight = spacing;
            }
            pRange.detach();
        });
    } else {
         if (commonAncestor && commonAncestor !== editor) {
             commonAncestor.style.lineHeight = spacing;
         } else {
             console.warn('Could not apply line spacing precisely. Select a paragraph or block of text.');
         }
     }

    const selectedSpacingSpan = document.querySelector('#lineSpacingSelect .selected-spacing');
    if(selectedSpacingSpan) selectedSpacingSpan.textContent = spacing === '1' ? 'Single' : spacing;

    editor.focus();
    markAsModified();
}

function updateWordCount() {
    const wordCountSpan = document.getElementById('wordCount');
    const charCountSpan = document.getElementById('charCount');
    const pageCountSpan = document.getElementById('pageCount');

    if (!editor || !wordCountSpan || !charCountSpan || !pageCountSpan) return; // Check if elements exist

    const text = editor.innerText || editor.textContent;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);
    const chars = text.length;

    wordCountSpan.textContent = words.length;
    charCountSpan.textContent = chars;

    const pages = Math.max(1, Math.ceil(words.length / 250));
    pageCountSpan.textContent = pages;
}

function updateToolbarState() {
    // This function is primarily relevant to the editor page
    if (!document.getElementById('editorPage')) return;

    const buttons = document.querySelectorAll('.toolbar-btn');
    buttons.forEach(btn => btn.classList.remove('active'));

    if (document.queryCommandState('bold')) {
        const boldButton = document.querySelector('button[title="Bold"]');
        if(boldButton) boldButton.classList.add('active');
    }
    if (document.queryCommandState('italic')) {
        const italicButton = document.querySelector('button[title="Italic"]');
         if(italicButton) italicButton.classList.add('active');
    }
    if (document.queryCommandState('underline')) {
        const underlineButton = document.querySelector('button[title="Underline"]');
        if(underlineButton) underlineButton.classList.add('active');
    }
     // Note: queryCommandState is not reliable for fontName, fontSize, alignment, lists.
}

function changeZoom(delta) {
    const zoomLevelSpan = document.getElementById('zoomLevel');
    const container = document.querySelector('.document-container');

    if (!zoomLevelSpan || !container) return; // Check if elements exist

    let currentZoom = parseInt(zoomLevelSpan.textContent) || 100;
    currentZoom = Math.max(25, Math.min(200, currentZoom + delta));
    zoomLevelSpan.textContent = currentZoom + '%';

    container.style.transform = `scale(${currentZoom / 100})`;
    container.style.transformOrigin = 'top center';

    const editorHeight = editor ? editor.offsetHeight : 0; // Use editor if available
    const currentContainerHeight = container.offsetHeight;
    const scaledContainerHeight = currentContainerHeight * (currentZoom / 100);
    const marginBottom = scaledContainerHeight - currentContainerHeight;
    container.style.marginBottom = `${marginBottom}px`;

    if (currentZoom !== 100) {
        container.style.marginLeft = `-${(container.offsetWidth * (currentZoom / 100) - container.offsetWidth) / 2}px`;
    } else {
        container.style.marginLeft = '';
    }
}

function handleEditorInput() {
    updateWordCount();
    markAsModified();
    scheduleAutoSave();
}

function markAsModified() {
    isModified = true;
    updateSaveStatus('modified', 'Unsaved changes');
     const saveBtn = document.getElementById('saveBtn');
     if(saveBtn) saveBtn.disabled = false; // Enable save button
}

function scheduleAutoSave() {
    clearTimeout(autoSaveTimeout);
    autoSaveTimeout = setTimeout(() => {
        if (isModified && currentDocumentId) { // Only auto-save existing docs
            autoSave();
        } else if (!currentDocumentId) {
             updateSaveStatus('ready', 'Ready'); // Set status back to ready if new doc and no input for auto-save
        }
    }, 3000); // Auto-save after 3 seconds of inactivity
}

async function autoSave() {
    if (!isModified || !currentDocumentId) { // Only auto-save existing docs
         updateSaveStatus('ready', 'Ready');
        return;
    }

    try {
        updateSaveStatus('saving', 'Auto-saving...');

        const titleInput = document.getElementById('docTitle');
        const title = titleInput ? titleInput.value || 'Untitled Document' : 'Untitled Document';
        const content = editor ? editor.innerHTML : '';
         const wordCountSpan = document.getElementById('wordCount');
        const wordCount = wordCountSpan ? parseInt(wordCountSpan.textContent) || 0 : 0;

        const docRef = firestore.doc(db, 'documents', currentDocumentId);
        await firestore.updateDoc(docRef, {
            title: title,
            content: content,
            wordCount: wordCount,
            lastModified: new Date()
        });

        isModified = false;
        updateSaveStatus('saved', 'Auto-saved');

        setTimeout(() => {
            if (!isModified) {
                updateSaveStatus('ready', 'Ready');
            }
        }, 2000);

    } catch (error) {
        console.error('Auto-save failed:', error);
        updateSaveStatus('error', 'Auto-save failed');
    } finally {
         const saveBtn = document.getElementById('saveBtn');
         if(saveBtn) saveBtn.disabled = false;
    }
}

async function saveDocument() {
    if (!db || !firestore) {
        console.error('Firebase not initialized');
        updateSaveStatus('error', 'Firebase not initialized');
        return;
    }

    clearTimeout(autoSaveTimeout);
    const editor = document.getElementById('editor');
    if (!editor || (!isModified && currentDocumentId)) {
        updateSaveStatus('ready', currentDocumentId ? 'No changes to save' : 'Ready');
        return;
    }

    try {
        const saveBtn = document.getElementById('saveBtn');
        if(saveBtn) saveBtn.disabled = true;
        updateSaveStatus('saving', 'Saving...');

        const titleInput = document.getElementById('docTitle');
        const title = titleInput ? titleInput.value || 'Untitled Document' : 'Untitled Document';
        const content = editor.innerHTML;
        const wordCountSpan = document.getElementById('wordCount');
        const wordCount = wordCountSpan ? parseInt(wordCountSpan.textContent) || 0 : 0;

        if (currentDocumentId) {
            const docRef = firestore.doc(db, 'documents', currentDocumentId);
            await firestore.updateDoc(docRef, {
                title: title,
                content: content,
                wordCount: wordCount,
                lastModified: new Date()
            });
        } else {
            const docRef = await firestore.addDoc(firestore.collection(db, 'documents'), {
                title: title,
                content: content,
                wordCount: wordCount,
                createdAt: new Date(),
                lastModified: new Date()
            });
            currentDocumentId = docRef.id;
        }

        isModified = false;
        updateSaveStatus('saved', 'Saved successfully');

        setTimeout(() => {
            updateSaveStatus('ready', 'Ready');
        }, 2000);

    } catch (error) {
        console.error('Save failed:', error);
        updateSaveStatus('error', 'Save failed');
    } finally {
        const saveBtn = document.getElementById('saveBtn');
        if(saveBtn) saveBtn.disabled = false;
    }
}

function updateSaveStatus(status, message) {
    const saveStatus = document.getElementById('saveStatus');
    const spinner = document.getElementById('loadingSpinner');
    const statusText = saveStatus ? saveStatus.querySelector('span') : null;

     if (!saveStatus || !spinner || !statusText) return; // Check if elements exist

    saveStatus.classList.remove('ready', 'modified', 'saving', 'saved', 'error');
    saveStatus.classList.add(status);

    statusText.textContent = message;

    if (status === 'saving') {
        spinner.style.display = 'block';
    } else {
        spinner.style.display = 'none';
    }
}


// --- Navigation Functions ---

function showDocumentsPage() {
    // Save current document before navigating if modified
    if (isModified && currentDocumentId) { // Only prompt to save if it's an existing modified document
        saveDocument().then(() => {
             window.location.href = 'index.html'; // Navigate after saving
        }).catch(error => {
            console.error('Failed to save before leaving:', error);
            // Navigate even if save fails
             window.location.href = 'index.html';
        });
    } else {
        // No unsaved changes or it's a new unsaved doc, just navigate
         window.location.href = 'index.html';
    }
}

async function loadDocument(docId) {
    // This function is now called on editor.html load if docId is in URL
    try {
        // Ensure editor is ready
        if (!editor) editor = document.getElementById('editor');
        if (!editor) { // Should not happen if called from editor.html
            console.error('Editor element not found.');
            return;
        }

        const docRef = firestore.doc(db, 'documents', docId);
        const docSnap = await firestore.getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            currentDocumentId = docId;

            const docTitleInput = document.getElementById('docTitle');
            if(docTitleInput) docTitleInput.value = data.title;

            editor.innerHTML = data.content; // Load rich text content

            updateWordCount(); // Update word count for loaded content
            isModified = false; // Reset modified state after loading
            updateSaveStatus('ready', 'Document loaded');

            // Navigation is handled by the initial page load in editor.html
            // showEditorPage(); // Not needed with direct navigation

        } else {
            console.error('Document not found:', docId);
            updateSaveStatus('error', 'Document not found');
            // Optionally redirect back to the documents list or show an error message
             // Redirect to create a new document if the requested one is not found
             window.location.href = 'editor.html';
        }
    } catch (error) {
        console.error('Failed to load document:', error);
        updateSaveStatus('error', 'Failed to load document');
         // Redirect to documents page on load error
         window.location.href = 'index.html';
    }
}

function createNewDocument() {
    // Save current document before creating a new one if modified
    if (isModified && currentDocumentId) { // Only prompt to save if existing modified document
        saveDocument().then(() => {
            window.location.href = 'editor.html'; // Navigate to empty editor after saving
        }).catch(error => {
            console.error('Failed to save before creating new document:', error);
            // Navigate even if save fails
            window.location.href = 'editor.html';
        });
    } else {
        // No unsaved changes or it's a new unsaved doc, just navigate to empty editor
        window.location.href = 'editor.html';
    }
}

function resetEditor() {
     // This function is called on editor.html load if no docId is present
    currentDocumentId = null;
    const docTitleInput = document.getElementById('docTitle');
    if(docTitleInput) docTitleInput.value = 'Untitled Document';
    if(editor) {
        editor.innerHTML = '<p class="placeholder">Start typing your document here...</p>';
        editor.addEventListener('click', function() {
            const placeholder = editor.querySelector('.placeholder');
            if (placeholder) {
                placeholder.remove();
            }
        }, { once: true }); // Only trigger once
    }
    updateWordCount();
    isModified = false;
    updateSaveStatus('ready', 'Ready');
}

// Function to load and display documents on index.html
async function loadDocuments() {
    // This function is called on index.html load
    try {
        // Ensure Firebase is initialized and available globally in index.html
         if (!db || !firestore) {
             console.error('Firebase not initialized.');
             // Consider showing an error message on the page
             return;
         }

        const q = firestore.query(
            firestore.collection(db, 'documents'),
            firestore.orderBy('lastModified', 'desc')
        );
        const querySnapshot = await firestore.getDocs(q);

        const documentsGrid = document.getElementById('documentsGrid');
         if(!documentsGrid) { // Check if on the index.html page
             console.error('Documents grid element not found.');
             return;
         }

        documentsGrid.innerHTML = ''; // Clear previous list

        if (querySnapshot.empty) {
            documentsGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    <p style="color: rgba(255, 255, 255, 0.7); font-size: 16px;">
                        No documents found. Create your first document!
                    </p>
                </div>
            `;
            return;
        }

        querySnapshot.forEach((doc) => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'document-card';
            // Navigate to editor.html with the document ID as a URL parameter
            card.addEventListener('click', () => {
                 // Optional: Save current state before navigating if this were an editor page button
                 // Since this is the documents list, direct navigation is fine.
                window.location.href = `editor.html?docId=${doc.id}`;
            });

            const lastModified = data.lastModified?.toDate?.() || new Date();
            // Sanitize and truncate content for preview
            const previewText = data.content ? data.content.replace(/<[^>]*>/g, '') : ''; // Handle potential null content
            const preview = previewText.substring(0, 150) + (previewText.length > 150 ? '...' : '');

            card.innerHTML = `
                <h3>${escapeHTML(data.title || 'Untitled Document')}</h3> <p>${escapeHTML(preview)}</p>
                <div class="document-meta">
                    <span>${data.wordCount || 0} words</span>
                    <span>${lastModified.toLocaleDateString()} ${lastModified.toLocaleTimeString()}</span>
                </div>
            `;

            documentsGrid.appendChild(card);
        });

    } catch (error) {
        console.error('Failed to load documents:', error);
        const documentsGrid = document.getElementById('documentsGrid');
         if (documentsGrid) {
            documentsGrid.innerHTML = `
                 <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #f8d7da; background-color: #721c24; border: 1px solid #f5c6cb; border-radius: 5px; padding: 10px; margin-top: 20px;">
                     <p>Error loading documents. Please check the console for details.</p>
                 </div>
            `;
         }
    }
}

// Helper function to escape HTML for display
function escapeHTML(str) {
     // Ensure str is a string before processing
     if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}

// Custom Dropdown Logic (primarily used in editor.html)
function initCustomDropdowns() {
     // Only initialize if custom dropdowns exist (i.e., on editor.html)
     const customDropdowns = document.querySelectorAll('.custom-dropdown');
     if (customDropdowns.length === 0) return;

    customDropdowns.forEach(dropdown => {
        dropdown.addEventListener('click', function(event) {
            // Close other custom dropdowns
            document.querySelectorAll('.custom-dropdown .dropdown-content').forEach(content => {
                if (content.parentElement !== dropdown) {
                    content.style.display = 'none';
                }
            });

            // Toggle the clicked dropdown
            const content = dropdown.querySelector('.dropdown-content');
            content.style.display = content.style.display === 'block' ? 'none' : 'block';
            event.stopPropagation();
        });
    });
}

function initFontDropdown() {
    const fontDropdown = document.getElementById('fontDropdown');
     const selectedFontSpan = document.querySelector('#fontSelect .selected-font');

     // Only initialize if font dropdown exists (i.e., on editor.html)
     if (!fontDropdown || !selectedFontSpan) return;

    const fonts = ['Times New Roman', 'Arial', 'Helvetica', 'Georgia', 'Verdana', 'Courier New', 'Lucida Sans Unicode'];

    fontDropdown.innerHTML = ''; // Clear existing options
    fonts.forEach(font => {
        const fontOption = document.createElement('div');
        fontOption.className = 'dropdown-item';
        fontOption.textContent = font;
        fontOption.style.fontFamily = font;
        fontOption.onclick = () => {
            changeFont(font);
            const editor = document.getElementById('editor');
            if (editor) editor.focus();
        };
        fontDropdown.appendChild(fontOption);
    });
     // Set initial selected font display - done in editor.html DOMContentLoaded
     // selectedFontSpan.textContent = editor.style.fontFamily.replace(/"/g, '') || 'Arial';
}

function initAlignIndentDropdown() {
    const alignIndentDropdown = document.getElementById('alignIndentDropdown');
    const selectedAlignSpan = document.querySelector('#alignIndentSelect .selected-align');

     // Only initialize if align/indent dropdown exists (i.e., on editor.html)
     if (!alignIndentDropdown || !selectedAlignSpan) return;

    // Clear existing options before adding
    alignIndentDropdown.innerHTML = '';

    // Add alignment options (onclick handlers will call setAlignment defined in app.js)
    const alignments = ['Left', 'Center', 'Right', 'Justify'];
    alignments.forEach(align => {
        const alignOption = document.createElement('div');
        alignOption.className = 'dropdown-item';
        alignOption.textContent = 'Align ' + align;
        alignOption.onclick = () => {
            setAlignment(align.toLowerCase());
            const editor = document.getElementById('editor');
            if (editor) editor.focus();
        };
        alignIndentDropdown.appendChild(alignOption);
    });

    // Add a separator
    const separator = document.createElement('div');
    separator.style.cssText = 'border-top: 1px solid #eee; margin: 8px 0;';
    alignIndentDropdown.appendChild(separator);

    // Add indent/outdent options (onclick handlers will call execCommand directly as before)
    const indentOption = document.createElement('div');
    indentOption.className = 'dropdown-item';
    indentOption.textContent = 'Increase Indent';
    indentOption.onclick = () => {
        document.execCommand('indent');
        const editor = document.getElementById('editor');
        if (editor) editor.focus();
        markAsModified();
    };
    alignIndentDropdown.appendChild(indentOption);

    const outdentOption = document.createElement('div');
    outdentOption.className = 'dropdown-item';
    outdentOption.textContent = 'Decrease Indent';
    outdentOption.onclick = () => {
        document.execCommand('outdent');
        const editor = document.getElementById('editor');
        if (editor) editor.focus();
        markAsModified();
    };
    alignIndentDropdown.appendChild(outdentOption);

     // Set initial selected alignment display - more complex, leaving default text for now
}

function initLineSpacingDropdown() {
    const lineSpacingDropdown = document.getElementById('lineSpacingDropdown');
    const selectedSpacingSpan = document.querySelector('#lineSpacingSelect .selected-spacing');

     // Only initialize if line spacing dropdown exists (i.e., on editor.html)
     if (!lineSpacingDropdown || !selectedSpacingSpan) return;

    // Clear existing options before adding
    lineSpacingDropdown.innerHTML = '';

    // Add line spacing options (onclick handlers will call setLineSpacing defined in app.js)
    const spacings = ['1', '1.15', '1.5', '2'];
    spacings.forEach(spacing => {
        const spacingOption = document.createElement('div');
        spacingOption.className = 'dropdown-item';
        spacingOption.textContent = spacing === '1' ? 'Single' : spacing;
        spacingOption.onclick = () => {
            setLineSpacing(spacing);
            const editor = document.getElementById('editor');
            if (editor) editor.focus();
        };
        lineSpacingDropdown.appendChild(spacingOption);
    });
     // Set initial selected spacing display - complex, leaving default text
}

// Speech Recognition (Dictation) functionality
function initSpeechRecognition() {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true; // Keep listening
        recognition.interimResults = true; // Get results while speaking
        recognition.lang = 'en-US'; // Set language

        let silenceTimer = null;

        recognition.onstart = function() {
            isDictating = true;
            speechToTextBtn.textContent = '🛑 Stop Dictation';
            speechToTextBtn.classList.add('active'); // Add a visual active state if desired
            console.log('Speech recognition started');

            // Start silence detection timer
            silenceTimer = setTimeout(() => {
                if (isDictating) {
                    displayMessage('No speech detected for 5 seconds. Stopping dictation.', 'error');
                    recognition.stop();
                    isDictating = false;
                }
            }, 5000);
        };

        recognition.onresult = function(event) {
            // Reset silence timer whenever we get results
            clearTimeout(silenceTimer);
            silenceTimer = setTimeout(() => {
                if (isDictating) {
                    displayMessage('No speech detected for 5 seconds. Stopping dictation.', 'error');
                    recognition.stop();
                    isDictating = false;
                }
            }, 5000);

            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    // Process the transcript to handle punctuation
                    let processedTranscript = event.results[i][0].transcript
                        .toLowerCase()
                        .replace(/\s+\bperiod\b/g, '.')
                        .replace(/\s+\bcomma\b/g, ',')
                        .replace(/\s+\bexclamation point\b/g, '!')
                        .replace(/\s+\bexclamation mark\b/g, '!')
                        .replace(/\s+\bquestion mark\b/g, '?')
                        .replace(/\s+\bquestion\b/g, '?')
                        .replace(/\s+\bcolon\b/g, ':')
                        .replace(/\s+\bsemicolon\b/g, ';')
                        .replace(/\s+\bhyphen\b/g, '-')
                        .replace(/\s+\bdash\b/g, '-')
                        .replace(/\s+\bopen parenthesis\b/g, '(')
                        .replace(/\s+\bclose parenthesis\b/g, ')')
                        .replace(/\s+\bopen parentheses\b/g, '(')
                        .replace(/\s+\bclose parentheses\b/g, ')')
                        .replace(/\s+\bopen bracket\b/g, '[')
                        .replace(/\s+\bclose bracket\b/g, ']')
                        .replace(/\s+\bopen quote\b/g, '"')
                        .replace(/\s+\bclose quote\b/g, '"')
                        .replace(/\s+\bquotation mark\b/g, '"')
                        .replace(/\s+\bapostrophe\b/g, "'")
                        .replace(/\s+\bsingle quote\b/g, "'")
                        .replace(/\s+\bdouble quote\b/g, '"')
                        .replace(/\s+\bellipsis\b/g, '...')
                        .replace(/\s+\bdot dot dot\b/g, '...');

                    // Apply grammar rules
                    processedTranscript = processedTranscript
                        // Capitalize first letter of the transcript
                        .replace(/^[a-z]/, letter => letter.toUpperCase())
                        // Capitalize after sentence-ending punctuation
                        .replace(/([.!?])\s+([a-z])/g, (match, p1, p2) => `${p1} ${p2.toUpperCase()}`)
                        // Capitalize after ellipsis
                        .replace(/\.\.\.\s+([a-z])/g, (match, p1) => `... ${p1.toUpperCase()}`)
                        // Capitalize "I" when it's a standalone word
                        .replace(/\bi\b/g, 'I')
                        // Capitalize first letter after a new line
                        .replace(/\n([a-z])/g, (match, p1) => `\n${p1.toUpperCase()}`);

                    finalTranscript += processedTranscript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }

            // Append final transcript to editor, clear interim (or show separately)
            if (finalTranscript) {
                const editor = document.getElementById('editor');
                if (editor) {
                    // Append directly to the editor's current content
                    // Or, more robustly, insert at cursor position
                    const selection = window.getSelection();
                    if (selection.rangeCount > 0) {
                        const range = selection.getRangeAt(0);
                        range.deleteContents(); // Remove any selected text
                        const textNode = document.createTextNode(finalTranscript + ' '); // Add a space
                        range.insertNode(textNode);
                        range.setStartAfter(textNode);
                        range.setEndAfter(textNode);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } else {
                        editor.innerHTML += finalTranscript + ' ';
                    }
                    updateWordCount(); // Update word count after dictation
                    markAsModified(); // Mark document as modified
                }
            }
        };

        recognition.onerror = function(event) {
            console.error('Speech recognition error:', event.error);
            isDictating = false;
            speechToTextBtn.textContent = '🎤 Start Dictation';
            speechToTextBtn.classList.remove('active');
            // Using a custom modal/message box instead of alert()
            displayMessage('Speech recognition error: ' + event.error + '. Please check your microphone and browser permissions.', 'error');
        };

        recognition.onend = function() {
            if (isDictating) { // If it ended unexpectedly, try to restart
                console.log('Speech recognition ended. Restarting...');
                recognition.start();
            } else {
                 console.log('Speech recognition stopped by user.');
            }
            speechToTextBtn.textContent = '🎤 Start Dictation';
            speechToTextBtn.classList.remove('active');
        };

    } else {
        speechToTextBtn = document.getElementById('speechToTextBtn');
        if (speechToTextBtn) {
            speechToTextBtn.disabled = true;
            speechToTextBtn.textContent = 'Speech Not Supported';
            speechToTextBtn.title = 'Your browser does not support Web Speech API.';
        }
        console.warn('Web Speech API is not supported in this browser.');
    }
}

function toggleSpeechToText() {
    if (!recognition) {
        displayMessage('Speech recognition not initialized or supported.', 'warning');
        return;
    }

    if (isDictating) {
        recognition.stop();
        isDictating = false;
    } else {
        // Ensure editor is focused before starting dictation
        const editor = document.getElementById('editor');
        if (editor) editor.focus();
        recognition.start();
    }
}

// Function to display custom messages (replaces alert())
function displayMessage(message, type = 'info') {
    const messageContainer = document.createElement('div');
    messageContainer.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 15px 25px;
        border-radius: 8px;
        font-family: sans-serif;
        font-size: 16px;
        color: white;
        z-index: 9999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        opacity: 0;
        transition: opacity 0.3s ease-in-out, transform 0.3s ease-in-out;
    `;

    if (type === 'error') {
        messageContainer.style.backgroundColor = '#dc3545';
    } else if (type === 'warning') {
        messageContainer.style.backgroundColor = '#ffc107';
        messageContainer.style.color = '#333';
    } else { // info
        messageContainer.style.backgroundColor = '#007bff';
    }

    messageContainer.textContent = message;
    document.body.appendChild(messageContainer);

    // Fade in
    setTimeout(() => {
        messageContainer.style.opacity = '1';
        messageContainer.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);

    // Fade out and remove
    setTimeout(() => {
        messageContainer.style.opacity = '0';
        messageContainer.style.transform = 'translateX(-50%) translateY(-20px)';
        messageContainer.addEventListener('transitionend', () => messageContainer.remove());
    }, 5000);
}

// Make functions available globally if needed by inline HTML onclick handlers
window.toggleFormat = toggleFormat;
window.changeFont = changeFont;
window.changeFontSize = changeFontSize;
window.setAlignment = setAlignment;
window.setLineSpacing = setLineSpacing;
window.updateWordCount = updateWordCount;
window.updateToolbarState = updateToolbarState; // Called by event listeners
window.changeZoom = changeZoom;
window.handleEditorInput = handleEditorInput; // Called by editor input listener
window.markAsModified = markAsModified; // Called by title input listener
window.scheduleAutoSave = scheduleAutoSave; // Called by handleEditorInput
window.autoSave = autoSave; // Called by scheduleAutoSave
window.saveDocument = saveDocument; // Called by save button and navigation
window.updateSaveStatus = updateSaveStatus; // Called by save functions
window.escapeHTML = escapeHTML; // Called in loadDocuments (index.html)

window.loadDocuments = loadDocuments; // Called on index.html load
window.loadDocument = loadDocument; // Called on editor.html load
window.createNewDocument = createNewDocument; // Called on index.html and editor.html
window.resetEditor = resetEditor; // Called on editor.html load and createNewDocument
window.showDocumentsPage = showDocumentsPage; // Called from editor.html button

window.initCustomDropdowns = initCustomDropdowns;
window.initFontDropdown = initFontDropdown;
window.initAlignIndentDropdown = initAlignIndentDropdown;
window.initLineSpacingDropdown = initLineSpacingDropdown;
window.toggleSpeechToText = toggleSpeechToText; // Make speech function globally available

// Add export function globally
window.exportDocument = exportDocument;

// --- AI Assist Functionality (Updated to use backend) ---

// Removed AI_API_KEY from here for security

async function aiAssist() {
    const editor = document.getElementById('editor');
    const aiAssistBtn = document.getElementById('aiAssistBtn');
    if (!editor || !aiAssistBtn) {
        displayMessage('Editor or AI Assist button not found.', 'error');
        return;
    }

    const originalText = editor.innerText; // Use innerText to get plain text

    if (!originalText.trim()) {
        displayMessage('Editor is empty. Nothing to assist.', 'warning');
        return;
    }

    // Indicate processing state
    aiAssistBtn.disabled = true;
    aiAssistBtn.textContent = '✨ Assisting...';
    displayMessage('Sending document to AI...', 'info');

    const prompt = `Please review the following text for spelling, grammar, punctuation, and improve general formatting without changing the meaning or adding new information. Provide only the corrected text.

Text to review:

${originalText}`;

    try {
        // Use the deployed backend URL
        const backendUrl = 'https://wordwithai-backend.onrender.com/ai-assist';
        
        const response = await fetch(backendUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('AI API error:', response.status, errorData);
            displayMessage(`AI API error: ${response.status} - ${errorData.error || response.statusText}`, 'error');
            return;
        }

        const data = await response.json();
        console.log('AI Response Data:', data);

        // Extract the generated text from the response
        const assistedText = data?.assistedText;

        if (assistedText) {
            // Replace editor content with assisted text
            editor.innerText = assistedText; // Use innerText to insert as plain text
            displayMessage('AI assistance applied.', 'saved'); // Use 'saved' type for success look
            markAsModified(); // Mark document as modified
        } else {
            console.warn('AI response did not contain text.', data);
            displayMessage('AI response did not contain text.', 'warning');
        }

    } catch (error) {
        console.error('Error during AI assist fetch:', error);
        displayMessage('Failed to get AI assistance. Please try again later.', 'error');
    } finally {
        // Reset button state
        aiAssistBtn.disabled = false;
        aiAssistBtn.textContent = '✨ AI Assist';
    }
}

// Add event listener after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...

    // AI Assist Button event listener
    const aiAssistBtn = document.getElementById('aiAssistBtn');
    if (aiAssistBtn) {
        aiAssistBtn.addEventListener('click', aiAssist);
    }
});

// --- Export Functionality --- //

async function exportDocument(format) {
    const titleInput = document.getElementById('docTitle');
    const title = titleInput ? titleInput.value || 'Untitled Document' : 'Untitled Document';
    const editor = document.getElementById('editor');
    if (!editor) {
        displayMessage('Editor not found.', 'error');
        return;
    }

    const content = editor.innerHTML; // Get rich text HTML content
    const textContent = editor.innerText; // Get plain text content

    if (format === 'txt') {
        // Export as plain text
        const blob = new Blob([textContent], { type: 'text/plain' });
        const anchor = document.createElement('a');
        anchor.href = URL.createObjectURL(blob);
        anchor.download = `${title}.txt`;
        anchor.click();
        URL.revokeObjectURL(anchor.href); // Clean up
        displayMessage('Document exported as TXT.', 'info');

    } else if (format === 'pdf') {
        // Export as PDF using a library (e.g., html2pdf.js or jsPDF)
        // This requires an external library. For simplicity, I'll add a placeholder
        // and suggest integrating a library.

        // *** IMPORTANT: You need to include a PDF generation library in your HTML ***
        // For example, add this script tag in editor.html's <head>:
        // <script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"></script>

        if (typeof html2pdf !== 'undefined') {
            displayMessage('Exporting as PDF...', 'info');

            // Create a temporary element with the content to be converted
            const element = document.createElement('div');
            element.innerHTML = content; // Use innerHTML to preserve formatting

            // Configure options for html2pdf
            const options = {
                margin: 10, // mm
                filename: `${title}.pdf`,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            };

            // Generate PDF from the element
            html2pdf().from(element).set(options).save().then(() => {
                 displayMessage('Document exported as PDF.', 'saved'); // Use 'saved' type for success look
            }).catch(error => {
                 console.error('PDF export failed:', error);
                 displayMessage('PDF export failed. See console for details.', 'error');
            });

        } else {
            displayMessage('PDF export library (html2pdf.js) not found. Please add the script tag to editor.html.', 'error');
            console.error('html2pdf.js not loaded.');
        }

    } else {
        displayMessage('Unsupported export format.', 'warning');
    }
}