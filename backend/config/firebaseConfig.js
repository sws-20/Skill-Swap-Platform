import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBUMI6CgEVrnfsTVBXZx3uZDsBh5oUY-1w",
    authDomain: "skill-swap-platform-53823.firebaseapp.com",
    projectId: "skill-swap-platform-53823",
    storageBucket: "skill-swap-platform-53823.appspot.com",
    appId: "1:527524796826:web:8b7f50476ba72c8ebe0223",
    databaseURL: "https://skill-swap-platform-53823-default-rtdb.firebaseio.com"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const database = getDatabase(app);

// Explicitly set persistence to LOCAL (browserLocalPersistence)
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log("Persistence set to LOCAL");
    })
    .catch((error) => {
        console.error("Persistence error:", error);
    });
