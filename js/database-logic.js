// database-logic.js
import { db } from './firebase-init.js';
import { ref, get, set, push, update, remove, runTransaction, query, orderByChild, equalTo, limitToFirst } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-database.js";
import {
    DB_NODE_REVIEWS, DB_NODE_USER_LIMITS, DB_NODE_USER_REVIEWS, DB_NODE_REPORTED_REVIEWS,
    LIMIT_TYPE_REGISTRATION, LIMIT_TYPE_CONSULTATION, DAILY_CONSULTATION_LIMIT, DAILY_REGISTRATION_LIMIT,
    getTodayDateString // Asume que esta función está en common.js y es importada donde se usa database-logic
} from './common.js';

const TAG = "DatabaseLogic"; // Para logs consistentes

// --- Lógica Límites ---
export async function getOrCreateUserLimit(userId, todayDate) {
    if (!userId || !todayDate) throw new Error("UserID y Fecha requeridos para getOrCreateUserLimit");
    console.log(`${TAG}: getOrCreateUserLimit: Fetching limits for user ${userId}, date ${todayDate}`);
    const userLimitRef = ref(db, `${DB_NODE_USER_LIMITS}/${userId}`);
    try {
        const snapshot = await get(userLimitRef);
        const currentLimitData = snapshot.val();
        if (currentLimitData && currentLimitData.date === todayDate) {
            console.log(`${TAG}: getOrCreateUserLimit: Found existing limits for today.`);
            // Asegurar estructura interna 'counts' y valores por defecto si faltan
            if (!currentLimitData.counts) currentLimitData.counts = {};
            currentLimitData.counts[LIMIT_TYPE_REGISTRATION] = currentLimitData.counts[LIMIT_TYPE_REGISTRATION] ?? DAILY_REGISTRATION_LIMIT;
            currentLimitData.counts[LIMIT_TYPE_CONSULTATION] = currentLimitData.counts[LIMIT_TYPE_CONSULTATION] ?? DAILY_CONSULTATION_LIMIT;
            return currentLimitData;
        } else {
            console.log(`${TAG}: getOrCreateUserLimit: No limits found for today or date mismatch (${currentLimitData?.date}). Creating/Resetting...`);
            const defaultCounts = { [LIMIT_TYPE_REGISTRATION]: DAILY_REGISTRATION_LIMIT, [LIMIT_TYPE_CONSULTATION]: DAILY_CONSULTATION_LIMIT };
            const newLimit = { date: todayDate, counts: defaultCounts };
            await set(userLimitRef, newLimit);
            console.info(`${TAG}: getOrCreateUserLimit: Limit created/reset for ${userId} on ${todayDate}`);
            return newLimit;
        }
    } catch (error) {
         console.error(`${TAG}: getOrCreateUserLimit Error: ${error.message}`, error);
         throw new Error(`Error al acceder a los límites: ${error.message}`);
    }
}

// Transacción robusta usando expected data
export async function updateLimitTransaction(userId, type, change, expectedCurrentData) {
    if (!userId || !type || typeof change !== 'number') throw new Error(`Parámetros inválidos`);
    const userLimitRef = ref(db, `${DB_NODE_USER_LIMITS}/${userId}`);
    const todayDate = getTodayDateString();
    const TAG_TXN = `${TAG} TXN [${type}]`;
    let success = false;
    console.log(`${TAG_TXN}: Starting for user ${userId}, change ${change}. Expected: ${JSON.stringify(expectedCurrentData)}`);

    try {
        const transactionResult = await runTransaction(userLimitRef, (currentData) => {
            console.log(`${TAG_TXN}: Running function. Server initialData: ${JSON.stringify(currentData)}`);
            let dataToUse = currentData;
            let dataWasInitializedOrCorrected = false;

            // Si datos del servidor son inválidos (null o fecha vieja), intentar usar los esperados
            if (dataToUse === null || dataToUse.date !== todayDate) {
                console.warn(`${TAG_TXN}: Server data null/old (${dataToUse?.date}). Checking expected data...`);
                if (expectedCurrentData && expectedCurrentData.date === todayDate) {
                    console.warn(`${TAG_TXN}: Using expected data provided by caller as base.`);
                    dataToUse = JSON.parse(JSON.stringify(expectedCurrentData)); // Copia profunda
                    dataWasInitializedOrCorrected = true;
                } else {
                     console.error(`${TAG_TXN}: Aborting. Server data invalid AND expected data invalid/missing.`);
                     return; // Abortar transacción
                }
            }
            // Asegurar mapa 'counts' en la data que se usará
            if (!dataToUse.counts) {
                 console.warn(`${TAG_TXN}: 'counts' map missing in dataToUse, initializing.`);
                 dataToUse.counts = { [LIMIT_TYPE_REGISTRATION]: 0, [LIMIT_TYPE_CONSULTATION]: 0 };
                 dataWasInitializedOrCorrected = true;
             }

            const defaultLimitForType = type === LIMIT_TYPE_REGISTRATION ? DAILY_REGISTRATION_LIMIT : DAILY_CONSULTATION_LIMIT;
            // Obtener contador actual, considerando si inicializamos counts recién
            const currentCount = dataToUse.counts[type] ?? (dataWasInitializedOrCorrected ? (change > 0 ? 0 : defaultLimitForType) : defaultLimitForType) ;

            console.log(`${TAG_TXN}: Using Count=${currentCount} for type ${type}. Change=${change}`);

            // Verificar si se puede decrementar (solo si no acabamos de inicializar counts en esta misma ejecución)
            if (change < 0 && !dataWasInitializedOrCorrected && currentCount <= 0) {
                console.warn(`${TAG_TXN}: Aborting decrement, limit is ${currentCount} <= 0.`);
                return; // Abortar
            }

            // Aplicar cambio y asegurar que no sea negativo
            const newCount = currentCount + change;
            dataToUse.counts[type] = Math.max(0, newCount); // Usar Math.max para simplificar

            console.log(`${TAG_TXN}: Setting new count for ${type} to ${dataToUse.counts[type]}. Returning data.`);
            return dataToUse; // Confirmar transacción
        });

        success = transactionResult.committed;
        console.info(`${TAG_TXN}: Transaction ${success ? 'committed' : 'aborted'}. Final snapshot: ${JSON.stringify(transactionResult.snapshot.val())}`);
        return { success: success, snapshot: transactionResult.snapshot }; // Devolver resultado

    } catch (error) {
         console.error(`${TAG_TXN}: Transaction failed with error: ${error.message}`, error);
         throw new Error(`Error al actualizar límite: ${error.message}`);
    }
} // Fin updateLimitTransaction


// --- Lógica Reseñas ---
export async function saveReviewMultiPath(userId, tipo, placa, rating, comentario) {
    if (!userId || !tipo || !placa || !rating) throw new Error("Datos incompletos reseña");
    const matricula = `${tipo}-${placa}`;
    const timestamp = Date.now();
    const reviewData = { userId, tipo, placa, matricula, evaluacion: rating, comentario: comentario || null, timestamp };
    const newReviewRef = push(ref(db, `${DB_NODE_REVIEWS}/${matricula}`));
    const pushId = newReviewRef.key;
    if (!pushId) throw new Error("No se pudo generar ID reseña");
    const reviewDataWithId = { ...reviewData, id: pushId }; // Guardar ID en user_reviews
    const updates = {};
    updates[`/${DB_NODE_REVIEWS}/${matricula}/${pushId}`] = reviewData;
    updates[`/${DB_NODE_USER_REVIEWS}/${userId}/${pushId}`] = reviewDataWithId;
    try { await update(ref(db), updates); console.info(`${TAG}: Review ${pushId} saved`); return pushId; }
    catch(error) { console.error(`${TAG}: saveReviewMultiPath Error: ${error.message}`, error); throw new Error(`Error al guardar reseña: ${error.message}`); }
}

export async function getReviewsByMatricula(matricula) {
    if (!matricula) return [];
    console.log(`${TAG}: Getting reviews for matricula: ${matricula}`);
    const reviewsRef = ref(db, `${DB_NODE_REVIEWS}/${matricula}`);
    try {
        const snapshot = await get(query(reviewsRef, orderByChild('timestamp')));
        console.log(`${TAG}: Snapshot exists for ${matricula}: ${snapshot.exists()}`);
        if (!snapshot.exists()) return [];
        const reviews = [];
        snapshot.forEach(childSnapshot => { const review = childSnapshot.val(); if (review && typeof review === 'object') { review.id = childSnapshot.key; reviews.push(review); } else { console.warn(`${TAG}: Invalid data at review path: ${childSnapshot.key}`); }});
        console.log(`${TAG}: Returning ${reviews.length} reviews for ${matricula}`);
        return reviews.reverse();
    } catch (error) { console.error(`${TAG}: getReviewsByMatricula Error: ${error.message}`, error); throw new Error(`Error al obtener reseñas: ${error.message}`); }
}

export async function getReviewsByAuthorId(userId) {
     if (!userId) return [];
     console.log(`${TAG}: Fetching reviews for author ${userId}`);
     const userReviewsRef = ref(db, `${DB_NODE_USER_REVIEWS}/${userId}`);
     try {
         const snapshot = await get(query(userReviewsRef, orderByChild('timestamp')));
         if (!snapshot.exists()) { console.info(`${TAG}: No reviews found for ${userId}`); return []; }
         const reviews = [];
         snapshot.forEach(childSnapshot => { const review = childSnapshot.val(); if (review && typeof review === 'object') { review.id = childSnapshot.key; reviews.push(review); } else { console.warn(`${TAG}: Invalid data in user_reviews path: ${childSnapshot.key}`); }});
         console.info(`${TAG}: Found ${reviews.length} reviews for author ${userId}`);
         return reviews.reverse();
     } catch (error) { console.error(`${TAG}: getReviewsByAuthorId Error: ${error.message}`, error); throw new Error(`Error al obtener mis reseñas: ${error.message}`); }
}

export async function deleteReviewMultiPath(userId, matricula, reviewId) {
     if (!userId || !matricula || !reviewId) throw new Error("Datos incompletos para borrar reseña");
     console.info(`${TAG}: Deleting review ${reviewId} for user ${userId}, matricula ${matricula}`);
     const updates = {};
     updates[`/${DB_NODE_REVIEWS}/${matricula}/${reviewId}`] = null;
     updates[`/${DB_NODE_USER_REVIEWS}/${userId}/${reviewId}`] = null;
     try { await update(ref(db), updates); console.info(`${TAG}: Review ${reviewId} deleted.`); }
     catch (error) { console.error(`${TAG}: deleteReviewMultiPath Error: ${error.message}`, error); throw new Error(`Error al borrar reseña: ${error.message}`); }
}

// --- Lógica Reportes ---
export async function saveReport(reportingUserId, reportedReview) {
     if (!reportingUserId || !reportedReview?.id || !reportedReview.matricula) throw new Error("Datos incompletos reporte");
     const reportData = { reviewId: reportedReview.id, matricula: reportedReview.matricula, reportingUserId: reportingUserId, reportedUserId: reportedReview.userId || null, commentContent: reportedReview.comentario || null, timestamp: Date.now() };
     console.log(`${TAG}: Saving report for review ${reportedReview.id}`);
     const reportsRef = ref(db, DB_NODE_REPORTED_REVIEWS);
     try { await set(push(reportsRef), reportData); console.info(`${TAG}: Report saved for review ${reportedReview.id}`); }
     catch (error) { console.error(`${TAG}: saveReport Error: ${error.message}`, error); throw new Error(`Error al guardar reporte: ${error.message}`); }
}

// --- Funciones Borrado de Cuenta ---
/** Verifica si un usuario tiene reseñas */
export async function hasReviews(userId) {
    if (!userId) return false;
    console.log(`${TAG}: Checking if user ${userId} has reviews...`);
    const userReviewsRef = ref(db, `${DB_NODE_USER_REVIEWS}/${userId}`);
    try {
        // *** CORRECCIÓN: Usar query() correctamente ***
        // Crear la consulta pasando la referencia Y la condición de límite
        const limitedQuery = query(userReviewsRef, limitToFirst(1));
        // Ejecutar get() sobre la consulta creada
        const snapshot = await get(limitedQuery);
        // *** FIN CORRECCIÓN ***

        const exists = snapshot.exists();
        console.log(`${TAG}: User ${userId} has reviews: ${exists}`);
        return exists;
    } catch (error) {
        console.error(`${TAG}: Error checking user reviews for ${userId}: ${error.message}`, error);
        return true; // Asumir true en error por seguridad
    }
}
/** Borra datos de usuario de RTDB */
export async function deleteUserData(userId) {
     if (!userId) throw new Error("UserID requerido");
     console.info(`${TAG}: Deleting RTDB data for ${userId}`);
     const updates = {};
     updates[`/${DB_NODE_USER_LIMITS}/${userId}`] = null;
     updates[`/${DB_NODE_USER_REVIEWS}/${userId}`] = null;
     try { await update(ref(db), updates); console.info(`${TAG}: User RTDB data deleted for ${userId}.`); }
     catch (error) { console.error(`${TAG}: Error deleting RTDB data for ${userId}: ${error.message}`, error); throw new Error(`Error al borrar datos: ${error.message}`); }
}