// firebase-init.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import { firebaseConfig } from './firebase-config.js';

let app, auth, db;

try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getDatabase(app);
    console.info("Firebase Initialized Successfully."); // Usar info
} catch (error) {
    console.error("Firebase initialization CRITICAL error:", error);
    alert("Error crítico al inicializar servicios. La aplicación no funcionará.");
}

// Exportar instancias para que otros módulos las usen
export { auth, db };