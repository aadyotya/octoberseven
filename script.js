pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js`;

// --- Configuration ---
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
const MY_ID = `user_${Math.random().toString(36).substr(2, 9)}`; // Creates a unique ID for this session

// --- DOM Elements ---
const myPdfView = document.getElementById('my-pdf-view');
const herPdfView = document.getElementById('her-pdf-view');
const myHighlight = document.getElementById('my-highlight');
const herHighlight = document.getElementById('her-highlight');
const connectionStatus = document.getElementById('connection-status');
const herFileStatus = document.getElementById('her-file-status');

// --- Initialize Firebase ---
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();
const roomRef = database.ref(ROOM_ID);

// --- 1. Main Logic ---

// Listen for any data changes in the room
roomRef.on('value', (snapshot) => {
    const allUsersData = snapshot.val();
    if (!allUsersData) return;

    connectionStatus.textContent = "Connected! ✅";
    connectionStatus.style.color = "#28a745";

    // Find the other user's data
    let otherUserId = null;
    for (const userId in allUsersData) {
        if (userId !== MY_ID) {
            otherUserId = userId;
            break;
        }
    }

    if (otherUserId) {
        const herData = allUsersData[otherUserId];
        if (herData.fileName) {
            herFileStatus.textContent = `She is viewing: ${herData.fileName}`;
        }

        // Update her highlight position based on her cursor
        if (herData.y_percent) {
            const highlightTop = herData.y_percent * herPdfView.scrollHeight;
            herHighlight.style.top = `${highlightTop - (herHighlight.clientHeight / 2)}px`;
        }

        // Update your view of her document's scroll position
        if (herData.scroll_percent) {
            const scrollableHeight = herPdfView.scrollHeight - herPdfView.clientHeight;
            if (scrollableHeight > 0) {
                herPdfView.scrollTop = herData.scroll_percent * scrollableHeight;
            }
        }
    }
});

// --- 2. File Handling ---
document.getElementById('my-pdf-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== 'application/pdf') return;

    // Send my file name to the database so she can see what I'm reading
    roomRef.child(MY_ID).child('fileName').set(file.name);
    
    const fileBuffer = await file.arrayBuffer();
    // Render my PDF in my view, and a copy in her view for me to see
    renderPdf(new Uint8Array(fileBuffer), myPdfView);
    renderPdf(new Uint8Array(fileBuffer), herPdfView); // Note: We render our own doc in her pane
});

async function renderPdf(pdfData, viewElement) {
    const pdfDoc = await pdfjsLib.getDocument(pdfData).promise;
    viewElement.innerHTML = ''; // Clear previous content
    const highlight = viewElement.id === 'my-pdf-view' ? myHighlight : herHighlight;
    viewElement.appendChild(highlight);
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        viewElement.appendChild(canvas);
        page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport });
    }
}


// --- 3. Sending My Position Data ---

// Send my cursor position
myPdfView.addEventListener('mousemove', (e) => {
    const rect = myPdfView.getBoundingClientRect();
    const y = e.clientY - rect.top + myPdfView.scrollTop;
    myHighlight.style.top = `${y - (myHighlight.clientHeight / 2)}px`;
    const positionPercentage = y / myPdfView.scrollHeight;
    // Send my cursor position to Firebase
    roomRef.child(MY_ID).child('y_percent').set(positionPercentage);
});

// Send my scroll position
myPdfView.addEventListener('scroll', () => {
    const scrollableHeight = myPdfView.scrollHeight - myPdfView.clientHeight;
    if (scrollableHeight > 0) {
        const scrollPercentage = myPdfView.scrollTop / scrollableHeight;
        // Send my scroll position to Firebase
        roomRef.child(MY_ID).child('scroll_percent').set(scrollPercentage);
    }
});


// --- 4. Misc Features ---
document.getElementById('dark-mode-btn').addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
});

// --- GO! ---
// Announce my presence
roomRef.child(MY_ID).set({ online: true });
// Clean up my data when I leave
window.addEventListener('beforeunload', () => {
    roomRef.child(MY_ID).remove();
});
