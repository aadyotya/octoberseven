pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js`;

// --- Configuration ---
// Your Firebase config object
const firebaseConfig = {
  apiKey: "AIzaSyCWBjzOpEOupbR_E319T7lB1mZJ4k0WE7c",
  authDomain: "octoberseven-9f547.firebaseapp.com",
  databaseURL: "https://octoberseven-9f547-default-rtdb.firebaseio.com",
  projectId: "octoberseven-9f547",
  storageBucket: "octoberseven-9f547.appspot.com",
  messagingSenderId: "104520694521",
  appId: "1:104520694521:web:dd10f37aa3d2a661e70028",
  measurementId: "G-F0FBEXHW1R"
};

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
let isPolite;
let candidateBuffer = [];
let receivedBuffers = [];
let receivedSize = 0;
let expectedFileSize = 0;

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const roomRef = database.ref(ROOM_ID);

// --- 1. Main Connection Logic ---
async function connect() {
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    roomRef.on('value', async (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();

        if (!isPolite && data.offer && !peerConnection.currentRemoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer.sdp));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await roomRef.update({ answer: { sdp: peerConnection.localDescription } });
            candidateBuffer.forEach(candidate => peerConnection.addIceCandidate(candidate));
            candidateBuffer = [];
        } else if (isPolite && data.answer && !peerConnection.currentRemoteDescription) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer.sdp));
            candidateBuffer.forEach(candidate => peerConnection.addIceCandidate(candidate));
            candidateBuffer = [];
        }

        if (data.candidate) {
            const candidate = new RTCIceCandidate(data.candidate);
            if (peerConnection.remoteDescription) {
                await peerConnection.addIceCandidate(candidate);
            } else {
                candidateBuffer.push(candidate);
            }
        }
    });

    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) roomRef.update({ candidate: candidate.toJSON() });
    };

    peerConnection.ondatachannel = (event) => setupDataChannel(event.channel);

    const snapshot = await roomRef.get();
    isPolite = !snapshot.exists();

    if (isPolite) {
        dataChannel = peerConnection.createDataChannel('data');
        setupDataChannel(dataChannel);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await roomRef.set({ offer: { sdp: peerConnection.localDescription } });
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
    if (dataChannel && dataChannel.readyState === 'open') {
        dataChannel.send(JSON.stringify({ type: 'file_info', name: file.name, size: file.size }));
        const chunkSize = 16384;
        for (let i = 0; i < fileBuffer.byteLength; i += chunkSize) {
            dataChannel.send(fileBuffer.slice(i, i + chunkSize));
        }
    }
});

async function renderPdf(pdfData, viewElement, docType) {
    const pdfDoc = await pdfjsLib.getDocument(pdfData).promise;
    viewElement.innerHTML = '';
    const highlight = docType === 'local' ? myHighlight : herHighlight;
    viewElement.appendChild(highlight);
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        viewElement.appendChild(canvas);
        const ctx = canvas.getContext('2d');
        page.render({ canvasContext: ctx, viewport: viewport });
    }
}

// --- 3. Highlighting and Data Messages ---
myPdfView.addEventListener('mousemove', (e) => {
    const rect = myPdfView.getBoundingClientRect();
    const y = e.clientY - rect.top + myPdfView.scrollTop;
    myHighlight.style.top = `${y - (myHighlight.clientHeight / 2)}px`;
    if (dataChannel && dataChannel.readyState === 'open') {
        const positionPercentage = y / myPdfView.scrollHeight;
        dataChannel.send(JSON.stringify({ type: 'scroll', y_percent: positionPercentage }));
    }
});

// NEW: Add this event listener for synchronized scrolling
myPdfView.addEventListener('scroll', () => {
    if (dataChannel && dataChannel.readyState === 'open') {
        const scrollableHeight = myPdfView.scrollHeight - myPdfView.clientHeight;
        if (scrollableHeight > 0) {
            const scrollPercentage = myPdfView.scrollTop / scrollableHeight;
            dataChannel.send(JSON.stringify({ type: 'sync_scroll', scroll_percent: scrollPercentage }));
        }
    }
});

function handleDataChannelMessage(event) {
    if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.type === 'scroll') {
            const highlightTop = msg.y_percent * herPdfView.scrollHeight;
            herHighlight.style.top = `${highlightTop - (herHighlight.clientHeight / 2)}px`;
        } else if (msg.type === 'file_info') {
            receivedBuffers = [];
            receivedSize = 0;
            expectedFileSize = msg.size;
            herFileStatus.textContent = `Receiving file: ${msg.name}...`;
            herFileStatus.style.display = 'block';
        } else if (msg.type === 'sync_scroll') { // NEW: Handle the sync_scroll message
            const scrollableHeight = herPdfView.scrollHeight - herPdfView.clientHeight;
            if (scrollableHeight > 0) {
                herPdfView.scrollTop = msg.scroll_percent * scrollableHeight;
            }
        }
    } else {
        receivedBuffers.push(event.data);
        receivedSize += event.data.byteLength;
        const progress = Math.round((receivedSize / expectedFileSize) * 100);
        herFileStatus.textContent = `Receiving file... ${progress}%`;
        if (receivedSize === expectedFileSize) {
            herFileStatus.textContent = 'Rendering her document...';
            const completeBuffer = new Blob(receivedBuffers);
            completeBuffer.arrayBuffer().then(buffer => {
                renderPdf(new Uint8Array(buffer), herPdfView, 'remote').then(() => {
                    herFileStatus.style.display = 'none';
                });
            });
        }
    }
}

// --- 4. Misc Features ---
document.getElementById('dark-mode-btn').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
});

// --- GO! ---
window.addEventListener('beforeunload', () => {
    if (isPolite) {
        roomRef.remove();
    }
});
connect();
