// At the very top of script.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js`;
console.log("✅ Script loaded and PDF worker is set.");

// --- Configuration ---
// PASTE YOUR FIREBASE CONFIG OBJECT HERE
// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCWb...",
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
let isPolite; // To prevent WebRTC connection race conditions

// Initialize Firebase and Database
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("✅ Firebase initialized successfully.");
    }
} catch (e) {
    console.error("Firebase initialization failed:", e);
}

const database = firebase.database();
const roomRef = database.ref(ROOM_ID);
console.log("✅ Database reference created for room:", ROOM_ID);


// --- 1. Main Connection Logic ---
async function connect() {
    console.log("Attempting to connect...");

    try {
        const snapshot = await roomRef.get();
        // A simpler and more robust check for a 2-person room
        isPolite = !snapshot.exists();
        console.log(`This client is ${isPolite ? 'polite (first to join)' : 'impolite (second to join)'}.`);
    } catch (e) {
        console.error("Failed to check room status on Firebase:", e);
        return;
    }

    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    console.log("Peer connection object created.");

    // Listen for signaling messages from Firebase
    roomRef.on('value', async (snapshot) => {
        if (!snapshot.exists()) return;
        const data = snapshot.val();
        console.log("Received data from Firebase:", data);

        // If we are the impolite peer and an offer exists, we create an answer
        if (!isPolite && data.offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer.sdp));
            console.log("Impolite peer set remote offer.");
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            console.log("Impolite peer created answer, sending to Firebase.");
            await roomRef.update({ answer: { sdp: peerConnection.localDescription } });
        }

        // If we are the polite peer and an answer exists, we set it
        if (isPolite && data.answer) {
            console.log("Polite peer received answer.");
            await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer.sdp));
        }

        // Add any ICE candidates that are sent
        if (data.candidate) {
            console.log("Received new ICE candidate.");
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });

    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) {
            console.log("Generated new ICE candidate, sending to Firebase.");
            roomRef.update({ candidate: candidate.toJSON() });
        }
    };

    peerConnection.ondatachannel = (event) => setupDataChannel(event.channel);

    if (isPolite) {
        console.log("This is the polite client, creating data channel and offer...");
        dataChannel = peerConnection.createDataChannel('data');
        setupDataChannel(dataChannel);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        console.log("Offer created. Sending to Firebase.");
        await roomRef.set({ offer: { sdp: peerConnection.localDescription } });
    }
}

function setupDataChannel(channel) {
    console.log("Setting up data channel.");
    dataChannel = channel;
    dataChannel.onopen = () => {
        console.log("✅✅✅ DATA CHANNEL IS OPEN! ✅✅✅");
        connectionStatus.textContent = "Connected! ✅";
        connectionStatus.style.color = "#28a745";
    };
    dataChannel.onclose = () => {
        console.log("Data channel closed.");
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
        console.log("Sending file to partner...");
        dataChannel.send(JSON.stringify({ type: 'file_info', name: file.name }));
        dataChannel.send(fileBuffer);
    }
});

async function renderPdf(pdfData, viewElement, docType) {
    console.log(`Rendering PDF for ${docType} view.`);
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

function handleDataChannelMessage(event) {
    if (typeof event.data === 'string') {
        const msg = JSON.parse(event.data);
        if (msg.type === 'scroll') {
            const highlightTop = msg.y_percent * herPdfView.scrollHeight;
            herHighlight.style.top = `${highlightTop - (herHighlight.clientHeight / 2)}px`;
        } else if (msg.type === 'file_info') {
            herFileStatus.textContent = `Receiving file: ${msg.name}...`;
        }
    } else {
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
window.addEventListener('beforeunload', () => {
    if (isPolite) { // Only the first user cleans up the room
        roomRef.remove();
    }
});
connect();
