pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js`;

// --- Configuration ---
const SERVER_URL = 'https://aadyotya-study-server.onrender.com';
const MY_ID = `user_${Math.random().toString(36).substr(2, 9)}`;

// --- DOM Elements ---
const myPdfView = document.getElementById('my-pdf-view');
const herPdfView = document.getElementById('her-pdf-view');
const myHighlight = document.getElementById('my-highlight');
const herHighlight = document.getElementById('her-highlight');
const connectionStatus = document.getElementById('connection-status');
const herFileStatus = document.getElementById('her-file-status');
const emojiBtn = document.querySelector('.emoji-btn');
const emojiPicker = document.querySelector('.emoji-picker');
const emojiOptions = document.querySelectorAll('.emoji-option');
const myEmojiContainer = document.getElementById('my-emoji-container');
const herEmojiContainer = document.getElementById('her-emoji-container');
// NEW: Chat elements
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const chatMessages = document.getElementById('chat-messages');

// --- Global State ---
let myState = {
    fileName: null,
    y_percent: 0,
    scroll_percent: 0,
    emoji: null
};
let lastHerEmojiId = null;
let lastMessageCount = 0; // NEW: To track chat history

// --- 1. Main Application Logic ---
async function sendUpdate() {
    try {
        await fetch(`${SERVER_URL}/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: MY_ID, data: myState })
        });
    } catch (error) {
        console.error("Failed to send update:", error);
    }
}

async function getStatus() {
    try {
        const response = await fetch(`${SERVER_URL}/status?userId=${MY_ID}`);
        const { otherUser } = await response.json();

        if (otherUser) {
            connectionStatus.textContent = "Connected! ✅";
            connectionStatus.style.color = "#28a745";
            herFileStatus.textContent = otherUser.fileName ? `She is viewing: ${otherUser.fileName}` : 'She has connected.';
            
            const highlightTop = otherUser.y_percent * herPdfView.scrollHeight;
            herHighlight.style.top = `${highlightTop - (herHighlight.clientHeight / 2)}px`;

            const scrollableHeight = herPdfView.scrollHeight - herPdfView.clientHeight;
            if (scrollableHeight > 0) {
                herPdfView.scrollTop = otherUser.scroll_percent * scrollableHeight;
            }

            if (otherUser.emoji && otherUser.emoji.id !== lastHerEmojiId) {
                triggerEmojiRain(otherUser.emoji.char, herEmojiContainer);
                lastHerEmojiId = otherUser.emoji.id;
            }
        } else {
            connectionStatus.textContent = "Waiting for partner...";
            connectionStatus.style.color = "#ff8c00";
        }
    } catch (error) {
        connectionStatus.textContent = "Server offline";
        connectionStatus.style.color = "#dc3545";
    }
}

// NEW: Function to get and display chat messages
async function getChatHistory() {
    try {
        const response = await fetch(`${SERVER_URL}/chat`);
        const messages = await response.json();

        if (messages.length > lastMessageCount) {
            chatMessages.innerHTML = '';
            messages.forEach(msg => {
                const msgEl = document.createElement('div');
                msgEl.classList.add('chat-message');
                msgEl.textContent = msg.text;
                if (msg.senderId === MY_ID) {
                    msgEl.classList.add('my-message');
                } else {
                    msgEl.classList.add('her-message');
                }
                chatMessages.appendChild(msgEl);
            });
            chatMessages.scrollTop = chatMessages.scrollHeight;
            lastMessageCount = messages.length;
        }
    } catch (error) {
        console.error("Failed to get chat history:", error);
    }
}

// Start polling the server for all updates
setInterval(() => {
    getStatus();
    getChatHistory(); // NEW: Also check for new chat messages
}, 1000);

// --- 2. File Handling ---
document.getElementById('my-pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;
    myState.fileName = file.name;
    sendUpdate();
    const fileBuffer = await file.arrayBuffer();
    renderPdf(new Uint8Array(fileBuffer), myPdfView);
});

document.getElementById('her-pdf-upload-local').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;
    const fileBuffer = await file.arrayBuffer();
    renderPdf(new Uint8Array(fileBuffer), herPdfView);
});

async function renderPdf(pdfData, viewElement) {
    const pdfDoc = await pdfjsLib.getDocument(pdfData).promise;
    viewElement.innerHTML = '';
    const highlight = viewElement.id === 'my-pdf-view' ? myHighlight : herHighlight;
    viewElement.appendChild(highlight);
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.67 });
        const canvas = document.createElement('canvas');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        viewElement.appendChild(canvas);
        page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport });
    }
}

// --- 3. Sending Position Data ---
myPdfView.addEventListener('mousemove', (e) => {
    const rect = myPdfView.getBoundingClientRect();
    const y = e.clientY - rect.top + myPdfView.scrollTop;
    myHighlight.style.top = `${y - (myHighlight.clientHeight / 2)}px`;
    myState.y_percent = y / myPdfView.scrollHeight;
    sendUpdate();
});

myPdfView.addEventListener('scroll', () => {
    const scrollableHeight = myPdfView.scrollHeight - myPdfView.clientHeight;
    if (scrollableHeight > 0) {
        myState.scroll_percent = myPdfView.scrollTop / scrollableHeight;
        sendUpdate();
    }
});

// --- 4. Emoji Feature Logic ---
emojiBtn.addEventListener('click', () => {
    emojiPicker.classList.toggle('show');
});

emojiOptions.forEach(option => {
    option.addEventListener('click', () => {
        const emoji = option.textContent;
        triggerEmojiRain(emoji, myEmojiContainer);
        myState.emoji = { char: emoji, id: Date.now() };
        sendUpdate();
        emojiPicker.classList.remove('show');
    });
});

function triggerEmojiRain(emoji, container) {
    const rainCount = 20;
    for (let i = 0; i < rainCount; i++) {
        const emojiEl = document.createElement('div');
        emojiEl.classList.add('raining-emoji');
        emojiEl.textContent = emoji;
        emojiEl.style.left = `${Math.random() * 100}%`;
        emojiEl.style.fontSize = `${Math.random() * 1.5 + 1}rem`;
        const duration = Math.random() * 2 + 3;
        const delay = Math.random() * 2;
        emojiEl.style.animationName = 'rainFall';
        emojiEl.style.animationDuration = `${duration}s`;
        emojiEl.style.animationDelay = `${delay}s`;
        emojiEl.style.animationTimingFunction = 'linear';
        container.appendChild(emojiEl);
        setTimeout(() => {
            emojiEl.remove();
        }, (duration + delay) * 1000);
    }
}

// --- 5. NEW: Chat Logic ---
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (text) {
        const message = {
            senderId: MY_ID,
            text: text
        };
        await fetch(`${SERVER_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message)
        });
        chatInput.value = '';
        getChatHistory();
    }
});

// --- 6. Misc Features ---
document.getElementById('dark-mode-btn').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
});
