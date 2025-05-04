// common.js

// --- Constantes ---
export const DAILY_CONSULTATION_LIMIT = 5;
export const DAILY_REGISTRATION_LIMIT = 5;
export const LIMIT_TYPE_CONSULTATION = "consultation";
export const LIMIT_TYPE_REGISTRATION = "registration";
export const DB_NODE_REVIEWS = "reviews";
export const DB_NODE_USER_LIMITS = "user_daily_limits";
export const DB_NODE_USER_REVIEWS = "user_reviews";
export const DB_NODE_REPORTED_REVIEWS = "reported_reviews";
export const PRIVACY_POLICY_URL = "https://sites.google.com/view/queestahaciendo/inicio";


// --- Funciones UI ---
export function showMessage(elementId, message, isError = false, duration = 5000) {
    const element = document.getElementById(elementId);
    if (!element) { console.warn(`showMessage: Element ID "${elementId}" not found.`); return; }
    clearTimeout(element.timeoutId); // Limpiar timeout anterior si existe
    element.textContent = message || '';
    element.className = 'message'; // Reset base class
    if (message) {
        element.classList.add(isError ? 'error' : 'success');
        element.style.display = 'block';
        element.timeoutId = setTimeout(() => { // Guardar ID de timeout
            if (element.textContent === message) {
                element.textContent = ''; element.style.display = 'none'; element.className = 'message';
            }
        }, duration);
    } else {
        element.style.display = 'none';
    }
}

export function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        console.log("Hiding loading overlay...");
        overlay.classList.add('hidden');
        setTimeout(() => { if (overlay && overlay.classList.contains('hidden')) overlay.style.display = 'none'; }, 300);
    } else { /* console.warn("hideLoadingOverlay: Overlay element not found."); */ }
}

export function setLoading(buttonId, isLoading) {
    const button = document.getElementById(buttonId);
    if (!button) { console.warn(`setLoading: Button ID "${buttonId}" not found.`); return; }
    button.disabled = isLoading;
    if (!button.hasAttribute('data-original-content')) {
        button.setAttribute('data-original-content', button.innerHTML);
    }
    const originalContent = button.getAttribute('data-original-content');
    button.innerHTML = isLoading ? `<span class="spinner"></span> Cargando...` : (originalContent || 'Acción');
}
// --- Funciones para Modal de Confirmación ---

let confirmCallback = null; // Variable para guardar el callback de confirmación

/**
 * Muestra el modal de confirmación con un mensaje y acciones.
 * @param {string} title - Título del modal.
 * @param {string} message - Mensaje de confirmación.
 * @param {string} confirmText - Texto para el botón de confirmar (ej: "Eliminar").
 * @param {function} onConfirm - Función a ejecutar si el usuario confirma.
 */
export function showConfirmationModal(title, message, confirmText = "Confirmar", onConfirm) {
    const modalOverlay = document.getElementById('confirmationModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const confirmBtn = document.getElementById('modalConfirmBtn');
    const cancelBtn = document.getElementById('modalCancelBtn');

    if (!modalOverlay || !modalTitle || !modalMessage || !confirmBtn || !cancelBtn) {
        console.error("Elementos del modal no encontrados!");
        // Como fallback, usar el confirm nativo si el modal falla
        if (window.confirm(`${title}\n\n${message}`)) {
            onConfirm();
        }
        return;
    }

    // Actualizar contenido
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    confirmBtn.textContent = confirmText;
    // Guardar texto original por si setLoading se usa aquí
    confirmBtn.setAttribute('data-original-text', confirmText);
    cancelBtn.setAttribute('data-original-text', 'Cancelar'); // Guardar también para Cancelar

    // Guardar el callback
    confirmCallback = onConfirm;

    // Añadir listeners (asegurarse de remover los anteriores si existieran)
    confirmBtn.replaceWith(confirmBtn.cloneNode(true)); // Clonar para remover listeners viejos
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    // Obtener referencias a los nuevos botones clonados
    const newConfirmBtn = document.getElementById('modalConfirmBtn');
    const newCancelBtn = document.getElementById('modalCancelBtn');

    newConfirmBtn.addEventListener('click', handleModalConfirm);
    newCancelBtn.addEventListener('click', hideConfirmationModal); // Cancelar solo oculta

    // Mostrar modal
    modalOverlay.style.display = 'flex'; // Mostrar como flex para centrar
    setTimeout(() => { // Pequeño delay para asegurar que display aplique antes de la clase
         modalOverlay.classList.add('visible');
    }, 10); // 10ms es suficiente
}

// Función interna llamada al presionar confirmar
function handleModalConfirm() {
    if (typeof confirmCallback === 'function') {
        try {
            // Opcional: Mostrar loading en el botón confirmar
            setLoading('modalConfirmBtn', true);
            // Ejecutar la acción de confirmación
            confirmCallback();
        } catch (e) {
             console.error("Error executing modal confirm callback:", e);
             // Podrías mostrar un error genérico aquí si la acción falla
             // showMessage('algún-id-de-mensaje-modal', 'Ocurrió un error.', true);
             setLoading('modalConfirmBtn', false); // Quitar loading en error
        } finally {
             // Ocultar modal y limpiar callback DESPUÉS de ejecutar (o fallar)
             // Se podría quitar el loading aquí si la acción confirmada no lo hace
              // setLoading('modalConfirmBtn', false); // Quitar aquí o en la acción confirmada
             // No ocultar modal aquí, la acción confirmada puede querer mostrar mensaje antes
              // hideConfirmationModal();
             // Limpiar callback para la próxima vez
             confirmCallback = null;
        }
    } else {
         console.error("Modal confirm callback is not a function!");
         hideConfirmationModal(); // Ocultar si no hay callback
    }
}


// Función para ocultar el modal
export function hideConfirmationModal() {
    const modalOverlay = document.getElementById('confirmationModal');
    const confirmBtn = document.getElementById('modalConfirmBtn'); // Para resetear loading
    if (modalOverlay) {
        modalOverlay.classList.remove('visible');
         // Opcional: resetear botón y quitar del DOM después de animación
         setTimeout(() => {
             if (modalOverlay && !modalOverlay.classList.contains('visible')) {
                 modalOverlay.style.display = 'none';
                 // Resetear botón por si se quedó en estado "Cargando..."
                 if (confirmBtn) setLoading('modalConfirmBtn', false);
             }
        }, 300); // Tiempo de transición CSS
    }
    // Limpiar callback al cerrar
    confirmCallback = null;
}


// --- Funciones Fecha/Formato ---
export function getTodayDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatTimestamp(timestamp) {
    if (!timestamp || typeof timestamp !== 'number' || timestamp <= 0) return "Fecha desconocida";
    try {
        const date = new Date(timestamp);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = String(date.getFullYear()).slice(-2);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) { console.error("Error formatting timestamp:", timestamp, e); return "Fecha inválida"; }
}

// --- Navegación ---
export function goToPage(url) {
    if (!url || typeof url !== 'string') { console.error("Invalid URL for goToPage:", url); return; }
    const currentPath = window.location.pathname;
    const targetPath = url.startsWith('/') ? url : (window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1) + url);
    const currentFullPath = window.location.href;
    const targetFullPath = new URL(url, window.location.href).href;
    const targetIsIndex = (url === 'index.html');

    if (window.location.href === targetFullPath || currentPath.endsWith(targetPath) || (currentPath === '/' && targetIsIndex)) {
         console.log(`Already on ${url}, navigation skipped.`); return;
    }
    console.log(`Navigating from ${currentPath} to ${url}`); window.location.href = url;
}

// --- Validación y Sanitización ---
 export function sanitizePlate(plate) {
     if (typeof plate !== 'string') return '';
     return plate.replace(/[^a-zA-Z0-9]/g, '').substring(0, 6).toUpperCase();
 }

 // --- Helper para Select Options (Tipos) ---
 export function populateTipoSelect(selectElementId, tiposArray) {
     const select = document.getElementById(selectElementId);
     if (!select) { console.error(`populateTipoSelect: Element ID "${selectElementId}" not found.`); return; }
     while (select.options.length > 1) { select.remove(1); }
     tiposArray.forEach(tipo => {
         const option = document.createElement('option'); option.value = tipo; option.text = getTipoDescription(tipo);
         select.appendChild(option);
     });
 }

 function getTipoDescription(tipoCode) {
    const descriptions = { "PAR": "PAR (Particular)", "MOT": "MOT (Motocicleta)", "TAX": "TAX (Taxi)", "BUS": "BUS (Autobús Ruta)", "C": "C (Carga)", "CL": "CL (Carga Liviana)", "CB": "CB (Buseta)", "S": "S (Servicio Especial)", "AB": "AB (Autobús Interurbano)", /* ... Añade más ... */ "OTROS": "Otros" };
    return descriptions[tipoCode] || tipoCode;
 }

 // --- Helper para Rating Input (Visual + Funcional) ---
 export function setupRatingInput(containerId) {
    const container = document.getElementById(containerId);
    if (!container) { console.warn(`setupRatingInput: Container #${containerId} not found.`); return; }
    const radios = container.querySelectorAll('input[type="radio"]');
    const labels = container.querySelectorAll('label');
    const TAG_RATING = "RatingInput"; // Tag para logs

    console.log(`${TAG_RATING}: Setting up for #${containerId}`);

    function updateStarsVisual(selectedValue) {
         console.log(`${TAG_RATING}: Updating visual to ${selectedValue}`);
         labels.forEach((label) => {
            const radio = label.querySelector('input[type="radio"]');
            const starSpan = label.querySelector('.star-label');
            if (radio && starSpan) {
                 const starValue = parseInt(radio.value);
                 const isSelected = starValue <= selectedValue;
                 starSpan.classList.toggle('selected', isSelected);
                 // Limpiar hover explícitamente al cambiar selección
                 starSpan.classList.remove('hover');
                 // console.log(`${TAG_RATING}: Star ${starValue} selected: ${isSelected}`); // Log detallado opcional
            } else {
                 console.warn(`${TAG_RATING}: Missing radio or starSpan in label.`);
            }
        });
    }

    labels.forEach(label => {
        const radio = label.querySelector('input[type="radio"]');
        const starSpan = label.querySelector('.star-label');
        if (!radio || !starSpan) return;
        const ratingValue = parseInt(radio.value);

        // Listener para selección final
        radio.addEventListener('change', () => {
            if (radio.checked) {
                console.log(`${TAG_RATING}: Change event - Radio ${ratingValue} selected.`);
                updateStarsVisual(ratingValue);
            }
        });

        // Listeners para hover visual
         label.addEventListener('mouseover', () => {
             labels.forEach((lbl) => {
                  const r = lbl.querySelector('input[type="radio"]');
                  const s = lbl.querySelector('.star-label');
                  if(r && s) {
                       const currentHoverValue = parseInt(r.value);
                       s.classList.toggle('hover', currentHoverValue <= ratingValue);
                       // Quitar 'selected' temporalmente durante hover para ver efecto claro
                       // OJO: Esto puede ser confuso si el usuario hace clic mientras está en hover
                       // Alternativa: no quitar selected y confiar en que el color hover sea diferente/más brillante
                       // s.classList.remove('selected');
                  }
             });
         });

         label.addEventListener('mouseout', () => {
              labels.forEach(lbl => { const s = lbl.querySelector('.star-label'); if(s) s.classList.remove('hover'); });
              // Restaurar visual basado en el checkeado
              const checkedRadio = container.querySelector('input[type="radio"]:checked');
              updateStarsVisual(checkedRadio ? parseInt(checkedRadio.value) : 0);
         });

         // Marcar estado inicial
         if(radio.checked) { updateStarsVisual(ratingValue); }
    });

    // Resetear visual al resetear form
    const form = container.closest('form');
     if (form) {
         form.addEventListener('reset', () => {
             console.log(`${TAG_RATING}: Reset event detected.`);
             labels.forEach(label => { const s = label.querySelector('.star-label'); if(s) { s.classList.remove('selected'); s.classList.remove('hover'); } });
         });
     }
 } // Fin setupRatingInput


// --- FUNCIÓN PARA GENERAR ESTRELLAS (ASEGÚRATE QUE ESTÉ AQUÍ Y CON 'export') ---
export function renderStars(rating, maxStars = 5) {
    const r = Math.round(parseFloat(rating || 0) * 2) / 2;
    const fullStars = Math.floor(r);
    const halfStar = (r - fullStars) >= 0.5;
    let emptyStars = maxStars - fullStars - (halfStar ? 1 : 0);
    emptyStars = Math.max(0, emptyStars);
    let starsHTML = '';
    for (let i = 0; i < fullStars; i++) starsHTML += '★'; // Llena
    if (halfStar) starsHTML += '★'; // Llena para .5
    for (let i = 0; i < emptyStars; i++) starsHTML += '☆'; // Vacía
    return starsHTML;
}
// --- FIN FUNCIÓN renderStars ---