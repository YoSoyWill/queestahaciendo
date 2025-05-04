// auth-logic.js
import { auth } from './firebase-init.js';
// Importar comunes
import { showMessage, setLoading, goToPage, hideLoadingOverlay, showConfirmationModal, hideConfirmationModal, PRIVACY_POLICY_URL } from './common.js';
// Importar Firebase Auth funcs (incluir deleteUser y signOut)
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, deleteUser, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
// Importar DB logic funcs para borrado
import { hasReviews, deleteUserData } from './database-logic.js';

const TAG = "AuthLogic";

// --- Variables Globales para Flujo Borrado Cuenta ---
// Usamos window para que myreviews-logic pueda acceder a ellas
window.globalAuthError = null;
window.globalSuccessMessage = null;
window.needsAccountDeleteConfirmation = false;
// --- Fin Variables Globales ---

// --- Referencias Globales a Elementos de Mensaje (para showGlobalMessage) ---
// Se asignan en DOMContentLoaded
let loginMessageElement, signupMessageElement, resetMessageElement, myReviewsMessageElement, consultMessageElement, registerMessageElement;

document.addEventListener('DOMContentLoaded', () => {
    console.log(`${TAG}: DOM Loaded`);
    // --- Referencias DOM ---
    loginMessageElement = document.getElementById('loginMessage');
    signupMessageElement = document.getElementById('signupMessage');
    resetMessageElement = document.getElementById('resetMessage');
    myReviewsMessageElement = document.getElementById('myReviewsMessage'); // Puede ser null
    consultMessageElement = document.getElementById('consultMessage'); // Puede ser null
    registerMessageElement = document.getElementById('registerMessage'); // Puede ser null

    const loginSection = document.getElementById('loginSection');
    const signupSection = document.getElementById('signupSection');
    const resetSection = document.getElementById('resetSection');
    const sections = [loginSection, signupSection, resetSection].filter(Boolean);
    const loadingOverlay = document.getElementById('loadingOverlay');

    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    // --- Función para Mostrar/Ocultar Secciones Auth ---
    function showAuthPageInternal(sectionIdToShow) {
        console.log(`${TAG}: Showing auth section ${sectionIdToShow}`);
        sections.forEach(section => { if (section) { const isActive = section.id === sectionIdToShow; section.style.display = isActive ? 'block' : 'none'; section.classList.toggle('active', isActive); } });
        showMessage('loginMessage', ''); showMessage('signupMessage', ''); showMessage('resetMessage', ''); // Limpiar mensajes
    }

    // --- Guardar Texto Original Botones ---
    document.querySelectorAll('.auth-container button[id]').forEach(btn => { if (btn.textContent && !btn.hasAttribute('data-original-content')) btn.setAttribute('data-original-content', btn.innerHTML); });

    // --- Listener Principal de Estado de Autenticación ---
    onAuthStateChanged(auth, (user) => {
        console.log(`${TAG}: onAuthStateChanged triggered. User: ${user ? user.uid : 'null'}`);
        hideLoadingOverlay(); // Ocultar overlay al resolver estado inicial

        if (user && (window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) {
            console.log(`${TAG}: User (${user.uid}) on index page, redirecting...`);
            goToPage('consult.html');
        } else if (!user && !(window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) {
            console.log(`${TAG}: User logged out on protected page, redirecting...`);
            goToPage('index.html');
        } else if (!user) {
            console.log(`${TAG}: No user logged in. Ensuring login section is visible.`);
            const isActiveSection = sections.some(s => s?.style.display === 'block' && s.classList.contains('active'));
             if(!isActiveSection) { showAuthPageInternal('loginSection'); }
        }
    }); // Fin onAuthStateChanged

    // --- Listeners Formularios ---
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const resetForm = document.getElementById('resetForm');
    if (loginForm) loginForm.addEventListener('submit', handleLoginSubmit); else console.error(`${TAG}: Login form not found!`);
    if (signupForm) signupForm.addEventListener('submit', handleSignUpSubmit); else console.error(`${TAG}: Sign up form not found!`);
    if (resetForm) resetForm.addEventListener('submit', handleResetSubmit); else console.error(`${TAG}: Reset form not found!`);

    // --- Navegación Interna y Política ---
    document.getElementById('goToSignUpBtn')?.addEventListener('click', () => showAuthPageInternal('signupSection'));
    document.getElementById('goToLoginFromSignUpBtn')?.addEventListener('click', () => showAuthPageInternal('loginSection'));
    document.getElementById('goToPasswordResetBtn')?.addEventListener('click', () => showAuthPageInternal('resetSection'));
    document.getElementById('goToLoginFromResetBtn')?.addEventListener('click', () => showAuthPageInternal('loginSection'));
    document.querySelectorAll('.privacyPolicyLink')?.forEach(link => { link.addEventListener('click', () => window.open(PRIVACY_POLICY_URL, '_blank')); });

    // --- Setup Password Toggles ---
    setupPasswordToggle('loginPassword', 'loginToggle');
    setupPasswordToggle('signupPassword', 'signupToggle');
    setupPasswordToggle('confirmPassword', 'confirmToggle');

    console.log(`${TAG}: Event listeners setup complete.`);

}); // Fin DOMContentLoaded


// --- Implementaciones Funciones Auth ---
function handleLoginSubmit(e) {
    e.preventDefault(); const form = e.target; const email = form.email.value.trim(); const password = form.password.value;
    if (!email || !password) { showMessage('loginMessage', 'Requeridos.', true); return; }
    setLoading('loginButton', true); showMessage('loginMessage', '');
    signInWithEmailAndPassword(auth, email, password)
        .then(uc => console.log(`${TAG}: Login OK ${uc.user.email}`))
        .catch(error => handleAuthError(error, 'loginMessage'))
        .finally(() => setLoading('loginButton', false));
}
function handleSignUpSubmit(e) {
     e.preventDefault(); const form = e.target; const email = form.email.value.trim(); const password = form.password.value; const confirm = form.confirmPassword.value;
     if (!email || !password || !confirm) { showMessage('signupMessage', 'Campos requeridos.', true); return; }
     if (password !== confirm) { showMessage('signupMessage', 'Contraseñas no coinciden.', true); return; }
     if (password.length < 6) { showMessage('signupMessage', 'Contraseña débil (mín 6).', true); return; }
     setLoading('signupButton', true); showMessage('signupMessage', '');
     createUserWithEmailAndPassword(auth, email, password)
        .then(uc => console.log(`${TAG}: SignUp OK ${uc.user.email}`))
        .catch(error => handleAuthError(error, 'signupMessage'))
        .finally(() => setLoading('signupButton', false));
}
function handleResetSubmit(e) {
     e.preventDefault(); const form = e.target; const email = form.email.value.trim();
     if (!email) { showMessage('resetMessage', 'Ingresa tu correo.', true); return; }
     setLoading('resetButton', true); showMessage('resetMessage', '');
     sendPasswordResetEmail(auth, email)
        .then(() => { console.log(`${TAG}: Pwd reset sent to ${email}`); showMessage('resetMessage', 'Correo enviado. Revisa tu bandeja.', false); })
        .catch(error => handleAuthError(error, 'resetMessage'))
        .finally(() => setLoading('resetButton', false));
}
function handleAuthError(error, messageElementId) {
    console.error(`Auth Error (${messageElementId}):`, error.code, error.message);
    let userMessage = `Error inesperado (${error.code}). Intenta de nuevo.`;
    switch (error.code) { /* ... (casos de error como antes) ... */ }
    showMessage(messageElementId, userMessage, true);
}
    // --- Función para Mostrar/Ocultar Secciones de Auth (COMPLETA) ---
    function showAuthPageInternal(sectionIdToShow) {
        console.log(`${TAG}: Showing auth section ${sectionIdToShow}`);
        let sectionFound = false;
        sections.forEach(section => {
            if (section) { // Verificar que el elemento exista
                const isActive = section.id === sectionIdToShow;
                // Usar display block/none o clases CSS para mostrar/ocultar
                section.style.display = isActive ? 'block' : 'none';
                section.classList.toggle('active', isActive); // Añadir/quitar clase 'active'
                if (isActive) sectionFound = true;
            }
        });
        if (!sectionFound) console.error(`${TAG}: Auth Section ID "${sectionIdToShow}" not found!`);
        // Limpiar mensajes de las otras secciones al cambiar
        showMessage('loginMessage', '');
        showMessage('signupMessage', '');
        showMessage('resetMessage', '');
    }
    // --- Fin showAuthPageInternal ---

// --- Lógica Toggle Contraseña ---
function setupPasswordToggle(inputId, toggleId) {
    const passwordInput = document.getElementById(inputId); const toggle = document.getElementById(toggleId);
    if (passwordInput && toggle) {
        toggle.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
            passwordInput.setAttribute('type', type);
            toggle.textContent = type === 'password' ? '👁️' : '🔒';
            toggle.setAttribute('title', type === 'password' ? 'Mostrar contraseña' : 'Ocultar contraseña');
        });
    } else { console.warn(`${TAG}: Toggle elements not found: #${inputId} or #${toggleId}`); }
}

// --- Lógica de Eliminación de Cuenta (Exportadas) ---
export async function requestAccountDeletion() {
    const user = auth.currentUser;
    if (!user) { showGlobalMessage("Debes iniciar sesión.", true); return; }
    window.globalAuthError = null; window.globalSuccessMessage = null; window.needsAccountDeleteConfirmation = false;
    updateGlobalMessages(); // Limpiar UI
    console.log(`${TAG}: Requesting account deletion check for ${user.uid}`);
    try {
        // Indicar carga (puede ser en botón de myreviews o global)
        // setLoading('deleteAccountBtn', true); // Comentado si se maneja en myreviews-logic
        const userHasReviews = await hasReviews(user.uid);
        if (userHasReviews) {
            console.warn(`${TAG}: User has reviews, deletion blocked.`);
            window.globalAuthError = "No puedes borrar tu cuenta porque tienes reseñas enviadas. Bórralas primero desde 'Mis Reseñas'.";
            window.needsAccountDeleteConfirmation = false;
        } else {
            console.log(`${TAG}: User has no reviews. Setting flag for confirmation.`);
            window.globalAuthError = null;
            window.needsAccountDeleteConfirmation = true;
        }
    } catch (error) {
         console.error(`${TAG}: Error checking for reviews:`, error);
         window.globalAuthError = `Error al verificar reseñas: ${error.message}`;
         window.needsAccountDeleteConfirmation = false;
    } finally {
         // setLoading('deleteAccountBtn', false);
         updateGlobalMessages(); // Actualizar UI (mostrar error o permitir modal)
    }
}

export async function confirmAccountDeletion() {
     const user = auth.currentUser;
     if (!user) {
         // Si no hay usuario por alguna razón, mostrar mensaje global y ocultar modal
         showGlobalMessage("Error: No se encontró la sesión de usuario.", true);
         hideConfirmationModal();
         return;
     }

     console.log(`${TAG}: Confirming account deletion for ${user.uid}`);
     // Resetear flags/mensajes previos (excepto los del modal)
     window.globalAuthError = null; window.globalSuccessMessage = null; window.needsAccountDeleteConfirmation = false;
     updateGlobalMessages(); // Limpiar mensajes de la página principal
     setLoading('modalConfirmBtn', true); // Poner loading en botón del modal

     try {
         // 1. Borrar Datos del Usuario en RTDB
         console.log(`${TAG}: Deleting user RTDB data for ${user.uid}...`);
         await deleteUserData(user.uid);
         console.log(`${TAG}: User RTDB data deleted.`);

         // 2. Borrar Cuenta de Firebase Auth
         console.log(`${TAG}: Attempting to delete user account from Auth...`);
         await deleteUser(user); // INTENTAR BORRAR AUTH
         console.log(`${TAG}: User account deleted successfully.`);

         // --- ÉXITO TOTAL ---
         setLoading('modalConfirmBtn', false); // Quitar loading
         hideConfirmationModal(); // Cerrar modal
         // Mostrar alerta final de éxito ANTES de que onAuthStateChanged redirija
         alert("Tu cuenta y datos asociados han sido eliminados exitosamente.");
         // onAuthStateChanged detectará user=null y redirigirá a index.html

     } catch (error) {
          console.error(`${TAG}: Account deletion failed:`, error);
          setLoading('modalConfirmBtn', false); // Quitar loading en error
          hideConfirmationModal(); // Cerrar modal

          // --- MANEJO DE ERROR ESPECÍFICO ---
          if (error.code === 'auth/requires-recent-login') {
               console.warn(`${TAG}: Deletion failed - Requires recent login.`);
               // Mostrar alerta clara al usuario explicándole qué hacer
               alert(
                   "Error de Seguridad\n\n" +
                   "Para eliminar tu cuenta, debes haber iniciado sesión recientemente.\n\n" +
                   "Por favor:\n" +
                   "1. Cierra sesión usando el botón 'Salir'.\n" +
                   "2. Vuelve a iniciar sesión con tu correo y contraseña.\n" +
                   "3. Ve a 'Mis Reseñas' e intenta eliminar tu cuenta de nuevo inmediatamente."
               );
               // NO cerramos sesión aquí para que el usuario pueda hacerlo manualmente
               // window.globalAuthError = "Re-autenticación requerida para borrar cuenta."; // Mensaje opcional para div
          } else {
               // Otro error inesperado durante el borrado
               window.globalAuthError = `Error al eliminar cuenta: ${error.message}.`;
          }
          updateGlobalMessages(); // Mostrar error en el div de mensajes de la página actual
          // --- FIN MANEJO ERROR ---
     }
} // Fin confirmAccountDeletion

// --- Helpers Mensajes Globales ---
function showGlobalMessage(message, isError = false) {
     // Busca el div de mensajes en el orden más probable
     const messageDiv = document.getElementById('myReviewsMessage') || document.getElementById('consultMessage') || document.getElementById('registerMessage') || document.getElementById('loginMessage') || document.getElementById('signupMessage') || document.getElementById('resetMessage');
     if (messageDiv) { showMessage(messageDiv.id, message, isError); }
     else { console.warn("showGlobalMessage: No suitable message div found!"); alert((isError ? "Error: " : "") + message); }
}
function updateGlobalMessages() {
    if (window.globalAuthError) { showGlobalMessage(window.globalAuthError, true); window.globalAuthError = null; }
    if (window.globalSuccessMessage) { showGlobalMessage(window.globalSuccessMessage, false); window.globalSuccessMessage = null; }
}
// --- Fin Lógica Borrado ---