// myreviews-logic.js
import { auth } from './firebase-init.js'; // Solo auth necesario aquí
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { showMessage, setLoading, formatTimestamp, goToPage, hideLoadingOverlay, showConfirmationModal, hideConfirmationModal, renderStars } from './common.js';
import { getReviewsByAuthorId, deleteReviewMultiPath } from './database-logic.js';
// Importar funciones de auth-logic para BORRADO DE CUENTA
import { requestAccountDeletion, confirmAccountDeletion } from './auth-logic.js';

const TAG = "MyReviewsLogic";

let currentUserId = null;
let currentUserEmail = null;
let authInitialized = false;

document.addEventListener('DOMContentLoaded', () => {
    console.log(`${TAG}: DOM Loaded`);
    // --- Referencias DOM ---
    const userInfoElement = document.getElementById('userInfo');
    const logoutButton = document.getElementById('logoutButton');
    const listDiv = document.getElementById('myReviewsList');
    const messageDiv = document.getElementById('myReviewsMessage');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const deleteAccountBtn = document.getElementById('deleteAccountBtn'); // Botón borrar cuenta

    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    document.querySelectorAll('button[id][data-original-text]').forEach(btn => { if(btn.textContent && !btn.hasAttribute('data-original-text')) btn.setAttribute('data-original-content', btn.innerHTML); });

    // --- Auth Guard (Lógica igual que en consult/register) ---
    onAuthStateChanged(auth, async (user) => {
        console.log(`>>> ${TAG}: onAuthStateChanged START. User: ${user ? user.uid : 'null'}, Initialized: ${authInitialized}`);
        if (user) {
            currentUserId = user.uid; currentUserEmail = user.email;
            if (userInfoElement) userInfoElement.textContent = `Usuario: ${user.email || user.uid}`;
            if (logoutButton) logoutButton.style.display = 'inline-block';
            if (!authInitialized) {
                authInitialized = true; console.log(`>>> ${TAG}: First confirmation, loading reviews...`);
                try { showMessage('myReviewsMessage', ''); await loadMyReviews(); hideLoadingOverlay(); }
                catch (error) { console.error(`!!! ${TAG}: Error loading initial reviews:`, error); if(listDiv) listDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`; hideLoadingOverlay(); }
            } else { hideLoadingOverlay(); }
        } else {
             console.log(`>>> ${TAG}: User object is NULL.`);
             if (authInitialized) { console.log(`>>> ${TAG}: Auth NULL after init. Redirecting.`); goToPage('index.html'); }
             else { console.log(`>>> ${TAG}: Initial NULL state. Waiting...`); authInitialized = true; setTimeout(() => { const uc = auth.currentUser; if (!uc && window.location.pathname.includes('my_reviews.html')) goToPage('index.html'); else hideLoadingOverlay(); }, 1500); }
        }
        console.log(`>>> ${TAG}: onAuthStateChanged END.`);
    });

    // --- Cargar Mis Reseñas ---
    async function loadMyReviews() {
        if (!currentUserId) { showMessage('myReviewsMessage', 'Error: Usuario no identificado.', true); if(listDiv) listDiv.innerHTML = ''; return; }
        showMessage('myReviewsMessage', ''); if(listDiv) listDiv.innerHTML = '<div style="text-align:center; padding:20px;"><span class="spinner"></span> Cargando tus reseñas...</div>';
        try {
            console.log(`>>> ${TAG}: Calling getReviewsByAuthorId for ${currentUserId}`);
            const reviews = await getReviewsByAuthorId(currentUserId);
            console.log(`>>> ${TAG}: Received ${reviews.length} reviews.`);
            displayMyReviews(reviews);
        } catch (error) { console.error(`${TAG}: Error loading my reviews:`, error); if(listDiv) listDiv.innerHTML = `<p class="error" style="text-align:center;">Error al cargar: ${error.message}</p>`; }
    } // Fin loadMyReviews

    // --- Mostrar Mis Reseñas ---
    function displayMyReviews(reviews) {
        console.log(`>>> ${TAG}: displayMyReviews called with ${reviews.length} reviews.`);
        if (!listDiv) { console.error("Element 'myReviewsList' not found!"); return; }
        listDiv.innerHTML = '';
        if (reviews.length === 0) { listDiv.innerHTML = '<p style="text-align:center; padding: 20px;">Aún no has enviado ninguna reseña.</p>'; return; }
        const ul = document.createElement('ul'); ul.className = 'reviews-list';
        reviews.forEach(review => {
            const li = document.createElement('li'); li.className = 'review-item';
            const ratingHTML = `<span class="stars">${renderStars(review.evaluacion || 0)}</span>`;
            const commentHTML = (review.comentario || '(Sin comentario)').replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const matriculaHTML = review.matricula ? `<h4>Placa: ${review.matricula} (${review.tipo || 'N/A'})</h4>` : '<h4>Placa: N/A</h4>';
            li.innerHTML = `
                <div style="flex-grow: 1; margin-right: 10px;">
                     ${matriculaHTML}
                     <div class="review-rating">${ratingHTML}</div>
                     <p>${commentHTML}</p>
                     <div class="review-meta">Enviado: ${formatTimestamp(review.timestamp)}</div>
                </div>
                <button class="delete-review-btn" data-review-id="${review.id || ''}" data-matricula="${review.matricula || ''}" title="Eliminar esta reseña">
                     <svg xmlns="http://www.w3.org/2000/svg" height="1em" viewBox="0 0 448 512" fill="currentColor"><path d="M135.2 17.7L128 32H32C14.3 32 0 46.3 0 64S14.3 96 32 96H416c17.7 0 32-14.3 32-32s-14.3-32-32-32H320l-7.2-14.3C307.4 6.8 296.3 0 284.2 0H163.8c-12.1 0-23.2 6.8-28.6 17.7zM416 128H32L53.2 467c1.6 25.3 22.6 45 47.9 45H346.9c25.3 0 46.3-19.7 47.9-45L416 128z"/></svg>
                </button>
            `;
            if (review.id && review.matricula) { ul.appendChild(li); } else { console.warn(`${TAG}: Skipping review item due to missing id or matricula`, review); }
        });
        listDiv.appendChild(ul);
    } // Fin displayMyReviews

    // --- Borrar Reseña Individual ---
    async function handleDeleteReviewClick(event) {
         if (!currentUserId) { showMessage('myReviewsMessage', 'Debes iniciar sesión.', true); return; }
         const button = event.target.closest('.delete-review-btn'); if (!button) return;
         const reviewId = button.getAttribute('data-review-id'); const matricula = button.getAttribute('data-matricula');
         if (!reviewId || !matricula) { showMessage('myReviewsMessage', 'Error al identificar reseña.', true); return; }
         // Usar Modal para Confirmar Borrado de Reseña
         showConfirmationModal( "Confirmar Eliminación", `¿Eliminar reseña para ${matricula}?`, "Eliminar Reseña",
             async () => { // onConfirm
                 console.log(`Deleting review: ${reviewId}`);
                 setLoading('modalConfirmBtn', true); showMessage('myReviewsMessage', 'Eliminando...', false, 99999);
                 const originalButtonContent = button.innerHTML; button.disabled = true; button.innerHTML = '<span class="spinner"></span>';
                 try {
                     await deleteReviewMultiPath(currentUserId, matricula, reviewId);
                     showMessage('myReviewsMessage', 'Reseña eliminada.', false);
                     const itemToRemove = button.closest('.review-item');
                     if (itemToRemove) { itemToRemove.style.transition = 'opacity 0.3s ease-out'; itemToRemove.style.opacity = '0'; setTimeout(() => { itemToRemove.remove(); if (listDiv && !listDiv.querySelector('.review-item')) { listDiv.innerHTML = '<p>Aún no has enviado ninguna reseña.</p>'; } }, 300); }
                     hideConfirmationModal();
                 } catch (error) { console.error("Error deleting review:", error); showMessage('myReviewsMessage', `Error: ${error.message}`, true); button.disabled = false; button.innerHTML = originalButtonContent; hideConfirmationModal(); }
             },
             () => { // onCancel (opcional)
                 console.log("Review deletion cancelled by user.");
             }
         ); // Fin showConfirmationModal
    } // Fin handleDeleteReviewClick

    // --- Borrar Cuenta Completa ---
    async function handleDeleteAccountClick() {
         console.log(`${TAG}: Delete Account button clicked.`);
         setLoading('deleteAccountBtn', true); // Loading en botón de la página
         showMessage('myReviewsMessage','Verificando si tienes reseñas...', false, 99999);

         // Llama a función exportada de auth-logic para verificar
         await requestAccountDeletion();

         setLoading('deleteAccountBtn', false); // Quitar loading después del check

         // Verificar resultado usando las variables globales actualizadas por auth-logic
         if (window.needsAccountDeleteConfirmation === true) {
              console.log(`${TAG}: Account deletion needs confirmation. Showing modal.`);
              window.needsAccountDeleteConfirmation = false; // Resetear flag ANTES de mostrar modal
              showConfirmationModal( "Eliminar Cuenta Permanentemente", "Esta acción borrará tu cuenta y datos asociados (límites, lista 'Mis Reseñas'). ¿Estás ABSOLUTAMENTE seguro?", "Sí, Eliminar Mi Cuenta",
                  () => {
                      console.log(`${TAG}: User confirmed account deletion. Calling confirmAccountDeletion.`);
                      // Llamar a la función de borrado final (exportada de auth-logic)
                      confirmAccountDeletion(); // Esta maneja su propio loading modal y mensajes/redirect
                  },
                  () => { // onCancel
                      console.log(`${TAG}: Account deletion cancelled by user in modal.`);
                      showMessage('myReviewsMessage', 'Borrado de cuenta cancelado.'); // Mensaje opcional
                  }
              );
         } else if (window.globalAuthError) {
              console.log(`${TAG}: Account deletion blocked or errored: ${window.globalAuthError}`);
              showMessage('myReviewsMessage', window.globalAuthError, true); // Mostrar error
              window.globalAuthError = null; // Limpiar
         } else {
             console.warn(`${TAG}: requestAccountDeletion finished unexpectedly.`);
             showMessage('myReviewsMessage', 'No se pudo iniciar el proceso de borrado.', true);
         }
    } // Fin handleDeleteAccountClick

    // --- Logout ---
    function handleLogout() { signOut(auth).catch(error => console.error("Logout error", error)); }

    // --- Listeners UI ---
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    // Listener delegado para botones de borrar reseñas
    if (listDiv) { listDiv.addEventListener('click', function(event) { if (event.target.closest('.delete-review-btn')) { handleDeleteReviewClick(event); } }); }
    else { console.error(`${TAG}: myReviewsList container not found!`); }
    // Listener para botón borrar cuenta
    if (deleteAccountBtn) { deleteAccountBtn.addEventListener('click', handleDeleteAccountClick); }
    else { console.warn(`${TAG}: deleteAccountBtn not found.`); }
    // Navegación
    document.querySelectorAll('#mainNav button').forEach(button => { button.addEventListener('click', (e) => goToPage(e.target.getAttribute('data-page'))); });

}); // Fin DOMContentLoaded