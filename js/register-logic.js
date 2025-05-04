// register-logic.js
import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
// import { ref } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
// Importar funciones comunes y de base de datos necesarias
import { showMessage, setLoading, goToPage, LIMIT_TYPE_REGISTRATION, sanitizePlate, getTodayDateString, hideLoadingOverlay, populateTipoSelect, setupRatingInput } from './common.js';
import { getOrCreateUserLimit, updateLimitTransaction, saveReviewMultiPath } from './database-logic.js';

const TAG = "RegisterLogic";

let currentUserId = null;
let currentUserEmail = null;
let currentLimitData = null;
let authInitialized = false;

// --- *** LISTA BÁSICA DE PALABRAS PROHIBIDAS *** ---
// ¡¡DEBES AMPLIAR ESTA LISTA SIGNIFICATIVAMENTE!!
// Considera variaciones, plurales, regionalismos (Costa Rica), etc.
const palabrasProhibidas = [
                             // Groserías comunes y vulgares
                             "puta", "puto", "put@","put0",
                             "picha", "pene", "verga", "verg4", "verg@",
                             "mierda", "m1erda", "mierd@", "mierd4",
                             "cabron", "cabrón", "cabro", "malparido", "hijueputa", "hpta", "hp", "hdp",
                             "culo", "cul0", "cul@", "culiao", "culiá", "culiado",
                             "playo", "marica", "maricón", "marik", "marikón", "marik@", "mar1ca",
                             "coño", "joder", "gilipollas", "caca", "pipi", "carajo",
                             "gonorrea", "gonorre@", "gonorri", "gonorri@",
                             "mamabicho", "mamaguevo", "mamón", "mamona", "pendejo", "pendeja",

                             // Insultos comunes
                             "zorra", "z0rr4", "zorr@",
                             "tarado",  "asqueroso", "asquerosa", "perra", "perr@", "perr0",

                             // Discriminación (con MUCHO cuidado en su uso)
                             "naco", "negro de", "sidoso", "mogolico", "mongolico", "retrasado", "retrasad@", "autista", "autisto",
                             "maricón", "marica", "homofóbico", "homofoba", "homofobo", "machorra",
                             "indio de", "gitano de", "cholo", "sudaca", "moro de", "judío de", "judi@",

                             // Violencia / crímenes / drogas
                             "asesinar", "violar", "violador", "violación", "pedofilo", "pederasta",
                             "droga", "drogas", "drogadicto", "narcotraficante", "coca", "perico", "porro",

                             // Anglicismos ofensivos
                             "fuck", "fuk", "f*ck", "fck", "fucken", "fucking",
                             "shit", "sh1t", "sh*t", "sht",
                             "bitch", "b1tch", "biatch", "b!tch", "b*tch",
                             "cunt", "pussy", "dick", "d1ck", "d!ck", "cock", "asshole", "ass", "a$$", "bastard", "motherfucker",

                             // Versiones alternativas y leet
                             "pvt@", "c4br0n", "m4lparido", "g0n0rr34", "b4b0s0", "b4st4rd0", "j0d3r", "s#it", "s!d0s0", "z0rr@", "m4m0n", "m4m4b1ch0"
                           ];
// --- *** FIN LISTA *** ---


document.addEventListener('DOMContentLoaded', () => {
    console.log(`${TAG}: DOM Loaded`);
    // --- Referencias DOM ---
    const userInfoElement = document.getElementById('userInfo');
    const logoutButton = document.getElementById('logoutButton');
    const registerReviewForm = document.getElementById('registerReviewForm');
    const registrationLimitSpan = document.getElementById('registrationLimit');
    const submitReviewBtn = document.getElementById('submitReviewBtn');
    const loadingOverlay = document.getElementById('loadingOverlay');
    const registerTipoSelect = document.getElementById('registerTipo');
    const registerRatingDiv = document.getElementById('registerRating');

    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    document.querySelectorAll('button[id]').forEach(btn => { if(btn.textContent && !btn.hasAttribute('data-original-content')) btn.setAttribute('data-original-content', btn.innerHTML); });

    // --- Poblar Tipos y Setup Rating ---
    const tipos = ["PAR", "MOT", "CL", "C", "CB", "HB", "AB", "AP", "CP", "CRC", "D", "EE", "GB", "GP", "HP", "LB", "LP", "PB", "PE", "PJ", "PP", "R", "RL", "S", "SJB", "SJP", "SM", "TA", "TAX", "TC", "TE", "TG", "TH", "TL", "TP", "TSJ", "OTROS"];
    populateTipoSelect('registerTipo', tipos);
    if(registerRatingDiv) { setupRatingInput('registerRating'); } else { console.warn("Rating container 'registerRating' not found."); }

    // --- Auth Guard (Lógica igual que en consult-logic) ---
    onAuthStateChanged(auth, async (user) => {
        console.log(`>>> ${TAG}: onAuthStateChanged START. User: ${user ? user.uid : 'null'}, Initialized Flag: ${authInitialized}`);
        if (user) { /* ... (guardar user, llamar loadPageData si !authInitialized, ocultar overlay) ... */
             currentUserId = user.uid; currentUserEmail = user.email;
             if (userInfoElement) userInfoElement.textContent = `Usuario: ${user.email || user.uid}`;
             if (logoutButton) logoutButton.style.display = 'inline-block';
             if (!authInitialized) {
                 authInitialized = true; console.log(`>>> ${TAG}: First user confirmation, loading page data...`);
                 try { showMessage('registerMessage', ''); await loadPageData(); console.log(`>>> ${TAG}: Page data loaded.`); hideLoadingOverlay(); }
                 catch (error) { console.error(`!!! ${TAG}: Error loading initial page data:`, error); showMessage('registerMessage', `Error inicial: ${error.message}`, true); hideLoadingOverlay(); }
             } else { hideLoadingOverlay(); }
        } else { /* ... (redirigir si authInitialized, esperar/fallback si !authInitialized) ... */
             console.log(`>>> ${TAG}: User object is NULL.`);
             if (authInitialized) { console.log(`>>> ${TAG}: Auth confirmed NULL after init. Redirecting.`); goToPage('index.html'); }
             else { console.log(`>>> ${TAG}: Initial NULL user state. Waiting...`); authInitialized = true; setTimeout(() => { const uc = auth.currentUser; if (!uc && window.location.pathname.includes('register.html')) goToPage('index.html'); else hideLoadingOverlay(); }, 1500); }
        }
        console.log(`>>> ${TAG}: onAuthStateChanged END.`);
    });

    // --- Carga Inicial y Límites ---
    async function loadPageData() { if (!currentUserId) return; try { await loadCurrentUserLimits_Register(); } catch (error) { showMessage('registerMessage', error.message, true); }}
    async function loadCurrentUserLimits_Register() {
         if (!currentUserId) throw new Error("Usuario no disponible"); console.log(`>>> ${TAG}: Loading limits for ${currentUserId}...`);
         try { currentLimitData = await getOrCreateUserLimit(currentUserId, getTodayDateString()); console.log(`>>> ${TAG}: Limits loaded:`, currentLimitData); updateLimitDisplay_Register(); }
         catch(e){ console.error("Error loading register limits", e); throw new Error("Error cargando límites."); }
    }
    function updateLimitDisplay_Register() {
        const remaining = currentLimitData?.counts?.[LIMIT_TYPE_REGISTRATION] ?? 0; console.log(`>>> ${TAG}: Updating limit display. Remaining: ${remaining}`);
        if (registrationLimitSpan) registrationLimitSpan.textContent = remaining; if (submitReviewBtn) submitReviewBtn.disabled = remaining <= 0;
    }

    // --- Lógica Registro Reseña ---
     async function handleRegisterReview(event) {
         event.preventDefault();
         if (!currentUserId) { showMessage('registerMessage', 'Debes iniciar sesión.', true); return; }

         const tipo = registerReviewForm.tipo.value;
         const placaRaw = registerReviewForm.placa.value;
         const placa = sanitizePlate(placaRaw); // Limpiar/Limitar placa
         const ratingElement = registerReviewForm.querySelector('input[name="rating"]:checked');
         const rating = ratingElement ? parseInt(ratingElement.value) : 0;
         const comentario = registerReviewForm.comentario.value.trim();
         registerReviewForm.placa.value = placa; // Actualizar UI con placa limpia

         console.log(`${TAG}: Submitting review. Tipo=${tipo}, Placa=${placa}, Rating=${rating}`);

         // --- Validaciones Básicas ---
         if (!tipo || !placa || rating < 1 || rating > 5) { showMessage('registerMessage', 'Tipo, Placa y Evaluación (1-5) requeridos.', true); return; }
         if (placa.length === 0 || placa.length > 6) { showMessage('registerMessage', 'Placa inválida (1-6 caracteres).', true); return; }
         if (comentario.length > 200) { showMessage('registerMessage', 'Comentario demasiado largo (máx 200).', true); return; }

         // --- *** INICIO FILTRO DE CONTENIDO *** ---
         if (comentario) { // Solo filtrar si hay comentario
             const comentarioLower = comentario.toLowerCase();
             // Usar some() para verificar si alguna palabra prohibida está contenida
             const contieneProhibida = palabrasProhibidas.some(palabra => {
                 // Chequeo simple de subcadena (ignora mayúsculas/minúsculas)
                 return comentarioLower.includes(palabra.toLowerCase());
                 // Alternativa más robusta (pero no perfecta) con límites de palabra:
                 // const regex = new RegExp(`\\b${palabra.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i'); // Escapar caracteres regex y añadir límites \b, 'i' = case-insensitive
                 // return regex.test(comentario);
             });

             if (contieneProhibida) {
                  console.warn(`${TAG}: Forbidden word found in comment.`);
                  // Mostrar mensaje de error claro y un poco más largo
                  showMessage('registerMessage', 'Tu comentario contiene lenguaje inapropiado y no puede ser enviado. Por favor, modifícalo.', true, 7000);
                  return; // Detener el envío
             }
         }
         // --- *** FIN FILTRO DE CONTENIDO *** ---

         // Refrescar y verificar límite ANTES de transacción
         try { await loadCurrentUserLimits_Register(); } catch (limitError) { showMessage('registerMessage', limitError.message, true); return; }
         const remainingBefore = currentLimitData?.counts?.[LIMIT_TYPE_REGISTRATION] ?? 0;
         console.log(`>>> ${TAG}: Checking limit BEFORE TXN. Remaining: ${remainingBefore}`);
         if (remainingBefore <= 0) { showMessage('registerMessage', 'Límite de registros alcanzado.', true); return; }

         // --- Proceder con el envío ---
         setLoading('submitReviewBtn', true); showMessage('registerMessage', '');
         try {
             // 1. Decrementar límite (Pasando currentLimitData)
             console.log(`>>> ${TAG}: Attempting limit decrement. Passing expected data: ${JSON.stringify(currentLimitData)}`);
             const { success: decremented, snapshot: limitSnapshot } = await updateLimitTransaction(currentUserId, LIMIT_TYPE_REGISTRATION, -1, currentLimitData);
             currentLimitData = limitSnapshot.val(); updateLimitDisplay_Register(); // Actualizar siempre
             console.log(`>>> ${TAG}: Decrement success: ${decremented}`);
             if (!decremented) throw new Error("Límite de registros alcanzado o error al verificar.");

             // 2. Guardar Reseña
             console.log(`>>> ${TAG}: Saving review...`);
             await saveReviewMultiPath(currentUserId, tipo, placa, rating, comentario); // Llamar a DB Logic

             console.log("Review submitted successfully");
             showMessage('registerMessage', '¡Reseña enviada con éxito!', false);
             registerReviewForm.reset(); // Limpia form y dispara reset visual de estrellas

             // --- LLAMAR AL INTERSTICIAL NATIVO (Si existe) ---
             console.log(`${TAG}: Attempting to show Interstitial Ad via AndroidInterface.`);
             if (window.AndroidInterface?.showInterstitial) {
                 try { window.AndroidInterface.showInterstitial(); console.log(`${TAG}: Called AndroidInterface.showInterstitial()`); }
                 catch (err) { console.error("Error calling AndroidInterface.showInterstitial:", err); }
             } else { console.warn("AndroidInterface or showInterstitial function not found."); }
             // --- FIN LLAMADA INTERSTICIAL ---

         } catch (error) { console.error("Submit Review Error:", error); showMessage('registerMessage', `Error al enviar: ${error.message}`, true); try{await loadCurrentUserLimits_Register();} catch(e){} } // Recargar límite en error
         finally { setLoading('submitReviewBtn', false); }
     } // Fin handleRegisterReview

    // --- Logout ---
    function handleLogout() { signOut(auth).catch(error => console.error("Logout error", error)); }

    // --- Listeners UI ---
    if (logoutButton) logoutButton.addEventListener('click', handleLogout);
    if (registerReviewForm) registerReviewForm.addEventListener('submit', handleRegisterReview);
    document.querySelectorAll('#mainNav button').forEach(button => { button.addEventListener('click', (e) => goToPage(e.target.getAttribute('data-page'))); });

}); // Fin DOMContentLoaded