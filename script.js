// --- Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyCWBjzOpEOupbR_E319T7lB1mZJ4k0WE7c",
  authDomain: "octoberseven-9f547.firebaseapp.com",
  databaseURL: "https://octoberseven-9f547-default-rtdb.firebaseio.com",
  projectId: "octoberseven-9f547",
  storageBucket: "octoberseven-9f547.firebasestorage.app",
  messagingSenderId: "104520694521",
  appId: "1:104520694521:web:dd10f37aa3d2a661e70028",
  measurementId: "G-F0FBEXHW1R"
};

// You'll also need to add the Firebase script to your HTML, right before your script.js tag.
// <script src="https://www.gstatic.com/firebasejs/8.6.1/firebase-app.js"></script>
// <script src="https://www.gstatic.com/firebasejs/8.6.1/firebase-database.js"></script>

// --- App Constants ---
const ROOM_ID = "octoberseven";

// --- DOM Elements ---
const myPdfView = document.getElementById('my-pdf-view');
const herPdfView = document.getElementById('her-pdf-view');
const myHighlight = document.getElementById('my-highlight');
const herHighlight = document.getElementById('her-highlight');
const connectionStatus = document.getElementById('connection-status');
const herFileStatus = document.getElementById('her-file-status');

// --- Global State ---
let peerConnection;
let dataChannel;
let localPdfDoc;
let remotePdfDoc;
let isPolite; // To prevent WebRTC connection race conditions

// Initialize Firebase and Database
firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const roomRef = database.ref(ROOM_ID);

// --- 1. Main Connection Logic ---

async function connect() {
    // Determine who is "impolite" (the one who joins second)
    const snapshot = await roomRef.get();
    isPolite = snapshot.numChildren() < 2;

    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] // Public STUN server
    });

    // Listen for signaling messages from Firebase
    roomRef.on('child_added', async (snapshot) => {
        if (snapshot.key !== (isPolite ? 'offer' : 'answer')) return;
        const data = snapshot.val();
        if (data.sdp) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
            if (peerConnection.signalingState === 'have-remote-offer') {
                const answer = await peerConnection.createAnswer();
                await peerConnection.setLocalDescription(answer);
                await roomRef.child('answer').set({ sdp: peerConnection.localDescription });
            }
        } else if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data));
        }
    });

    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) roomRef.child(isPolite ? 'offer' : 'answer').child('candidates').push(candidate.toJSON());
    };

    peerConnection.ondatachannel = (event) => setupDataChannel(event.channel);
    
    if (isPolite) {
        dataChannel = peerConnection.createDataChannel('data');
        setupDataChannel(dataChannel);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await roomRef.child('offer').set({ sdp: peerConnection.localDescription });
    }
}

function setupDataChannel(channel) {
    dataChannel = channel;
    dataChannel.onopen = () => {
        connectionStatus.textContent = "Connected! ✅";
        connectionStatus.style.color = "#28a745";
    };
    dataChannel.onclose = () => {
        connectionStatus.textContent = "Disconnected";
        connectionStatus.style.color = "#dc3545";
    };
    dataChannel.onmessage = handleDataChannelMessage;
}

// --- 2. File Handling & Transfer ---

document.getElementById('my-pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;

    const fileBuffer = await file.arrayBuffer();
    renderPdf(new Uint8Array(fileBuffer), myPdfView, 'local');
    
    // Send the file if connected
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'file_info', name: file.name }));
        dataChannel.send(fileBuffer);
    }
});

async function renderPdf(pdfData, viewElement, docType) {
    const pdfDoc = await pdfjsLib.getDocument(pdfData).promise;
    if (docType === 'local') localPdfDoc = pdfDoc;
    else remotePdfDoc = pdfDoc;

    viewElement.innerHTML = ''; // Clear previous content (e.g., "Waiting...")
    const highlight = docType === 'local' ? myHighlight : herHighlight;
    viewElement.appendChild(highlight);
    
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        viewElement.appendChild(canvas);
        page.render({ canvasContext: ctx, viewport: viewport });
    }
}


// --- 3. Highlighting and Data Messages ---

myPdfView.addEventListener('mousemove', (e) => {
    const rect = myPdfView.getBoundingClientRect();
    const y = e.clientY - rect.top + myPdfView.scrollTop;
    const positionPercentage = y / myPdfView.scrollHeight;
    
    // Show my own highlight
    myHighlight.style.top = `${y - (myHighlight.clientHeight / 2)}px`;

    // Send position to partner
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'scroll', y_percent: positionPercentage }));
    }
});

function handleDataChannelMessage(event) {
    // Check if the message is a string (JSON metadata) or ArrayBuffer (file)
    if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.type === 'scroll') {
            const highlightTop = msg.y_percent * herPdfView.scrollHeight;
            herHighlight.style.top = `${highlightTop - (herHighlight.clientHeight / 2)}px`;
        } else if (msg.type === 'file_info') {
            herFileStatus.textContent = `Receiving file: ${msg.name}...`;
        }
    } else {
        // It's the file ArrayBuffer
        herFileStatus.textContent = 'Rendering her document...';
        renderPdf(new Uint8Array(event.data), herPdfView, 'remote').then(() => {
            herFileStatus.style.display = 'none';
        });
    }
}

// --- 4. Misc Features ---
document.getElementById('dark-mode-btn').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
});

// --- GO! ---
// Clean up the room on page leave to allow fresh connections next time
window.addEventListener('beforeunload', () => roomRef.remove());
connect();