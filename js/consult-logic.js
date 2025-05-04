// consult-logic.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { ref } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js"; // Solo ref si DB logic hace todo
// Importar TODO lo necesario de common.js
import { showMessage, setLoading, formatTimestamp, goToPage, LIMIT_TYPE_CONSULTATION, sanitizePlate, getTodayDateString, hideLoadingOverlay, populateTipoSelect, renderStars, showConfirmationModal, hideConfirmationModal } from './common.js';
// Importar TODO lo necesario de database-logic.js
import { getOrCreateUserLimit, updateLimitTransaction, getReviewsByMatricula, saveReport } from './database-logic.js';

const TAG = "ConsultLogic";

// Variables de estado globales para esta página
let currentUserId = null;
let currentUserEmail = null;
let currentLimitData = null;
let authInitialized = false;

// Esperar a que el DOM esté completamente cargado
document.addEventListener('DOMContentLoaded', () => {
    console.log(`${TAG}: DOM Loaded`);
    // --- Obtener Referencias a Elementos DOM ---
    const userInfoElement = document.getElementById('userInfo');
    const logoutButton = document.getElementById('logoutButton');
    const consultForm = document.getElementById('consultForm');
    const consultResultsDiv = document.getElementById('consultResults');
    const consultLimitSpan = document.getElementById('consultationLimit');
    const consultBtn = document.getElementById('consultBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const consultTipoSelect = document.getElementById('consultTipo'); // Necesario para poblar

    // Mostrar overlay al inicio
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    // Guardar texto original botones para estado de carga
    document.querySelectorAll('button[id]').forEach(btn => {
        if(btn.textContent && !btn.hasAttribute('data-original-content')) {
            btn.setAttribute('data-original-content', btn.innerHTML);
        }
    });

    // --- Poblar Selector de Tipos ---
    // (Misma lista que en Register, idealmente vendría de una constante en common.js)
    const tipos = ["PAR", "MOT", "CL", "C", "CB", "HB", "AB", "AP", "CP", "CRC", "D", "EE", "GB", "GP", "HP", "LB", "LP", "PB", "PE", "PJ", "PP", "R", "RL", "S", "SJB", "SJP", "SM", "TA", "TAX", "TC", "TE", "TG", "TH", "TL", "TP", "TSJ", "OTROS"];
    if (consultTipoSelect) {
        populateTipoSelect('consultTipo', tipos); // Usar helper
    } else {
        console.error(`${TAG}: Elemento 'consultTipo' no encontrado!`);
    }

    // --- Listener de Autenticación (Auth Guard) ---
    onAuthStateChanged(auth, async (user) => {
        console.log(`>>> ${TAG}: onAuthStateChanged START. User: ${user ? user.uid : 'null'}, Initialized: ${authInitialized}`);
        if (user) {
            // --- Usuario Logueado ---
            currentUserId = user.uid; currentUserEmail = user.email;
            if (userInfoElement) { userInfoElement.textContent = `Usuario: ${user.email || user.uid}`; } else { console.error(`!!! ${TAG}: userInfoElement NOT FOUND!`); }
            if (logoutButton) logoutButton.style.display = 'inline-block';
            // Cargar datos solo la primera vez
            if (!authInitialized) {
                authInitialized = true; console.log(`>>> ${TAG}: First user confirmation, loading page data...`);
                try { showMessage('consultMessage', ''); await loadPageData(); console.log(`>>> ${TAG}: Page data loaded.`); hideLoadingOverlay(); console.log(`>>> ${TAG}: Loading overlay hidden.`); }
                catch (error) { console.error(`!!! ${TAG}: Error loading initial page data:`, error); showMessage('consultMessage', `Error inicial: ${error.message}`, true); hideLoadingOverlay(); }
            } else { hideLoadingOverlay(); } // Ocultar si ya estaba init
        } else {
            // --- Usuario No Logueado ---
             console.log(`>>> ${TAG}: User object is NULL.`);
             if (authInitialized) { console.log(`>>> ${TAG}: Auth confirmed NULL after init. Redirecting.`); goToPage('index.html'); }
             else {
                 console.log(`>>> ${TAG}: Initial NULL user state. Waiting...`); authInitialized = true;
                 setTimeout(() => { const uc = auth.currentUser; console.log(`>>> ${TAG}: Fallback check. User: ${uc ? uc.uid : 'null'}`); if (!uc && window.location.pathname.includes('consult.html')) goToPage('index.html'); else hideLoadingOverlay(); }, 1500);
             }
        }
        console.log(`>>> ${TAG}: onAuthStateChanged END.`);
    }); // Fin onAuthStateChanged

    // --- Carga Inicial y Límites ---
    async function loadPageData() { if (!currentUserId) return; try { await loadCurrentUserLimits_Consult(); } catch (error) { showMessage('consultMessage', error.message, true); }}
    async function loadCurrentUserLimits_Consult() {
        if (!currentUserId) throw new Error("Usuario no disponible"); console.log(`>>> ${TAG}: Loading limits for ${currentUserId}...`);
        try { currentLimitData = await getOrCreateUserLimit(currentUserId, getTodayDateString()); console.log(`>>> ${TAG}: Limits loaded:`, currentLimitData); updateLimitDisplay_Consult(); }
        catch(e){ console.error("Error loading consult limits", e); throw new Error("Error cargando límites."); }
    }
    function updateLimitDisplay_Consult() {
        const remaining = currentLimitData?.counts?.[LIMIT_TYPE_CONSULTATION] ?? 0; console.log(`>>> ${TAG}: Updating limit display. Remaining: ${remaining}`);
        if (consultLimitSpan) consultLimitSpan.textContent = remaining; if (consultBtn) consultBtn.disabled = remaining <= 0;
    }

     // --- Lógica de Consulta ---
     async function handleConsult(event) {
         event.preventDefault(); console.log(">>> handleConsult: Form submitted.");
         if (!currentUserId) { showMessage('consultMessage', 'Debes iniciar sesión.', true); return; }
         const tipo = consultForm.tipo.value; const placaRaw = consultForm.placa.value; const placa = sanitizePlate(placaRaw);
         consultForm.placa.value = placa; console.log(`>>> handleConsult: Consulting Tipo=${tipo}, Placa=${placa}`);
         if (!tipo || !placa || placa.length === 0 || placa.length > 6) { showMessage('consultMessage', 'Tipo y Placa (1-6 caracteres) requeridos.', true); return; }

         // Refrescar límite ANTES de la transacción
         try { await loadCurrentUserLimits_Consult(); } catch (limitError) { showMessage('consultMessage', limitError.message, true); return; }
         const remainingBefore = currentLimitData?.counts?.[LIMIT_TYPE_CONSULTATION] ?? 0;
         console.log(`>>> handleConsult: Checking limit BEFORE TXN. Local data shows Remaining: ${remainingBefore}`);
         if (remainingBefore <= 0) { showMessage('consultMessage', 'Límite de consultas alcanzado.', true); return; }

         setLoading('consultBtn', true); showMessage('consultMessage', '');
         if (consultResultsDiv) consultResultsDiv.innerHTML = '<p>Consultando...</p>'; // Mostrar 'Consultando...'

         try {
             console.log(`>>> handleConsult: Attempting limit decrement. Passing expected data: ${JSON.stringify(currentLimitData)}`);
             const { success: decremented, snapshot: limitSnapshot } = await updateLimitTransaction(currentUserId, LIMIT_TYPE_CONSULTATION, -1, currentLimitData);
             currentLimitData = limitSnapshot.val(); // Actualizar caché local con resultado REAL
             updateLimitDisplay_Consult(); // Actualizar UI con resultado REAL

             if (!decremented) {
                 console.warn(">>> handleConsult: Limit decrement FAILED or ABORTED (committed: false).");
                 const remainingAfter = currentLimitData?.counts?.[LIMIT_TYPE_CONSULTATION] ?? 0;
                 showMessage('consultMessage', remainingAfter <= 0 ? 'Límite de consultas alcanzado.' : 'Error al verificar límite. Intenta de nuevo.', true);
                 if (consultResultsDiv) consultResultsDiv.innerHTML = ''; // Limpiar "Consultando..."
             } else {
                 console.log(`>>> handleConsult: Limit decremented successfully. Fetching reviews...`);
                 const matricula = `${tipo}-${placa}`;
                 const reviews = await getReviewsByMatricula(matricula); // Llamar a DB Logic
                 console.log(`>>> handleConsult: Received ${reviews.length} reviews.`);
                 displayConsultResults(matricula, reviews); // Mostrar resultados
             }
         } catch (error) { console.error(">>> handleConsult: Error during process:", error); showMessage('consultMessage', `Error: ${error.message}`, true); if (consultResultsDiv) consultResultsDiv.innerHTML = `<p class="error">Error: ${error.message}</p>`; try { await loadCurrentUserLimits_Consult(); } catch(e){} }
         finally { setLoading('consultBtn', false); }
     } // Fin handleConsult

     // --- Mostrar Resultados ---
     function displayConsultResults(matricula, reviews) {
        const TAG_DISPLAY = `${TAG} Display`;
        console.log(`${TAG_DISPLAY}: Rendering for ${matricula}. Reviews: ${reviews?.length ?? 0}`);
        // Obtener resultsDiv aquí, DENTRO de la función
        const resultsDiv = document.getElementById('consultResults');
        if (!resultsDiv) { console.error(`!!! ${TAG_DISPLAY}: Element 'consultResults' NOT FOUND!`); return; }
        console.log(`${TAG_DISPLAY}: Found resultsDiv element.`);
        resultsDiv.innerHTML = ''; // Limpiar

        const header = document.createElement('h3'); header.textContent = `Resultados para: ${matricula}`; resultsDiv.appendChild(header);
        if (!reviews || reviews.length === 0) { resultsDiv.innerHTML += '<p>No se encontraron registros.</p>'; return; }

        // Calcular promedio
        let totalRating = 0; let ratingCount = 0; const comments = [];
        reviews.forEach(r => { if (r?.evaluacion > 0) { totalRating += r.evaluacion; ratingCount++; } if (r?.comentario && r.id) comments.push(r); });
        const averageRating = ratingCount > 0 ? (totalRating / ratingCount) : 0;
        const avgDiv = document.createElement('div'); avgDiv.className = 'rating-summary';
        avgDiv.innerHTML = `<p><span class="stars">${renderStars(averageRating)}</span> <span>${averageRating.toFixed(1)} (${ratingCount} calif.)</span></p>`;
        resultsDiv.appendChild(avgDiv); console.log(`${TAG_DISPLAY}: Avg Rating: ${averageRating.toFixed(1)}`);

        // Mostrar comentarios
        const commentsTitle = document.createElement('h4'); commentsTitle.textContent = `Comentarios (${comments.length})`; resultsDiv.appendChild(commentsTitle);
        if (comments.length > 0) {
            const commentsList = document.createElement('ul'); commentsList.className = 'comments-list';
            comments.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            comments.forEach((review, index) => {
                 console.log(`${TAG_DISPLAY}: Creating item ${index}, ID: ${review.id}`);
                 const li = document.createElement('li'); li.className = 'comment-item';
                 const commentText = (review.comentario || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
                 const ratingHTML = `<span class="stars">${renderStars(review.evaluacion || 0)}</span>`;
                 li.innerHTML = `
                     <div class="comment-rating">${ratingHTML}</div>
                     <p class="comment-text">"${commentText}"</p>
                     <div class="comment-meta">Enviado: ${formatTimestamp(review.timestamp || 0)}</div>
                     <button class="report-btn" data-review-id="${review.id || ''}" data-matricula="${matricula}" data-comment="${commentText.replace(/"/g, '&quot;')}" data-reported-user="${review.userId || ''}">Reportar</button>`;
                 if (!review.id) console.warn(`${TAG_DISPLAY}: Review missing ID!`, review);
                 commentsList.appendChild(li);
            });
            resultsDiv.appendChild(commentsList);
            console.log(`${TAG_DISPLAY}: Rendered ${comments.length} comments.`);
        } else { resultsDiv.innerHTML += '<p>No hay comentarios.</p>'; }
     } // Fin displayConsultResults

     // --- Reportar Comentario (Añadir Logs) ---
        async function handleReportClick(button) {
            console.log(">>> consult-logic.js: handleReportClick START. Button:", button); // LOG INICIO
            if (!currentUserId) { showMessage('consultMessage', 'Debes iniciar sesión.', true); return; }

            const reportedReviewData = {
                id: button.getAttribute('data-review-id'),
                matricula: button.getAttribute('data-matricula'),
                comentario: button.getAttribute('data-comment'),
                userId: button.getAttribute('data-reported-user')
            };
            console.log(">>> consult-logic.js: handleReportClick - Extracted data:", reportedReviewData); // LOG DATOS

            if (!reportedReviewData.id || !reportedReviewData.matricula) {
                 console.error("!!! consult-logic.js: handleReportClick - ERROR: Missing review ID or matricula in data attributes."); // LOG ERROR DATOS
                 showMessage('consultMessage', 'Error al identificar el comentario a reportar.', true);
                 return;
            }

            const confirmMessage = `¿Seguro que quieres reportar este comentario?\n\n"${reportedReviewData.comentario || '(Sin texto)'}"`;
            const confirmTitle = "Confirmar Reporte";
            const confirmBtnText = "Reportar";

            // --- LOG ANTES DE LLAMAR AL MODAL ---
            console.log(`>>> consult-logic.js: handleReportClick - Preparing to call showConfirmationModal.`);

            showConfirmationModal(
                confirmTitle,
                confirmMessage,
                confirmBtnText,
                async () => { // onConfirm callback
                    console.log(`>>> consult-logic.js: Modal Confirm Callback START for review ${reportedReviewData.id}`);
                    setLoading('modalConfirmBtn', true); // Usar ID correcto del botón modal
                    showMessage('consultMessage', 'Enviando reporte...', false, 99999);
                    try {
                        await saveReport(currentUserId, reportedReviewData);
                        console.log(`>>> consult-logic.js: Modal Confirm Callback - saveReport successful.`);
                        showMessage('consultMessage', 'Comentario reportado. Gracias.', false);
                        hideConfirmationModal();
                    } catch (error) {
                        console.error("!!! consult-logic.js: Modal Confirm Callback - Error submitting report:", error);
                        showMessage('consultMessage', `Error al reportar: ${error.message}`, true);
                         hideConfirmationModal();
                    }
                    // finally { setLoading('modalConfirmBtn', false); } // hideConfirmationModal ya debería resetear el botón
                } // Fin onConfirm
            ); // Fin showConfirmationModal

            console.log(">>> consult-logic.js: handleReportClick END (after calling showConfirmationModal)."); // LOG FIN
        } // Fin handleReportClick


    // --- Logout ---
    function handleLogout() { signOut(auth).catch(error => console.error("Logout error", error)); }

    // --- Listeners UI ---
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    if (consultForm) consultForm.addEventListener('submit', handleConsult);
    // Listener delegado para botones de reporte
    if (consultResultsDiv) {
         console.log(`${TAG}: Adding delegated listener for report buttons to resultsDiv.`);
         consultResultsDiv.addEventListener('click', function(event) {
             const reportButton = event.target.closest('.report-btn');
             if (reportButton) { console.log(`${TAG}: Delegated listener caught report click! Button:`, reportButton); handleReportClick(reportButton); }
         });
    } else { console.error(`${TAG}: consultResults container not found! Report listener NOT added.`); }
    // Navegación Principal
    document.querySelectorAll('#mainNav button').forEach(button => { button.addEventListener('click', (e) => goToPage(e.target.getAttribute('data-page'))); });

 }); // Fin DOMContentLoaded