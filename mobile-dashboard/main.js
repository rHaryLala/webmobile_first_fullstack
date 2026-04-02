const container = document.getElementById("cards");
const refreshButton = document.getElementById("refresh");
const networkStatus = document.getElementById("network-status");
const syncStatus = document.getElementById("sync-status");
const realtimeStatus = document.getElementById("realtime-status");
const noteForm = document.getElementById("note-form");
const noteTitleInput = document.getElementById("note-title");
const noteContentInput = document.getElementById("note-content");

const API_URL = "http://localhost:3000/api/data";
const toWebSocketUrl = (apiUrl) => {
	const parsed = new URL(apiUrl);
	parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
	parsed.pathname = "/ws";
	parsed.search = "";
	parsed.hash = "";
	return parsed.toString();
};
const WS_URL = toWebSocketUrl(API_URL);
const WS_RECONNECT_DELAY = 2500;
const CACHE_KEY = "piano_notes_cache_v1";
const QUEUE_KEY = "piano_sync_queue_v1";
const SESSION_NETWORK_KEY = "piano_last_network_state";

let socket = null;
let reconnectTimer = null;

const escapeHtml = (value) =>
	String(value ?? "")
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&#39;");

const createCard = (note) => {
	const pendingTag = note.pending ? " (en attente de synchro)" : "";
	const safeTitle = escapeHtml(`${note.title ?? ""}${pendingTag}`);
	const safeContent = escapeHtml(note.content ?? "");
	const isPending = Boolean(note.pending);

	const actions = isPending
		? `<p class="card-hint">Edition et suppression disponibles apres synchronisation.</p>`
		: `<div class="card-actions">
			<button type="button" data-action="edit" data-id="${String(note.id)}">Modifier</button>
			<button type="button" class="card-danger" data-action="delete" data-id="${String(note.id)}">Supprimer</button>
		</div>`;

	return `
<article class="card">
	<h2>${safeTitle}</h2>
	<p>${safeContent}</p>
	${actions}
</article>
`;
};

const readStorage = (key, fallback) => {
	try {
		const value = localStorage.getItem(key);
		return value ? JSON.parse(value) : fallback;
	} catch {
		return fallback;
	}
};

const writeStorage = (key, value) => {
	localStorage.setItem(key, JSON.stringify(value));
};

const getCachedNotes = () => readStorage(CACHE_KEY, []);
const setCachedNotes = (notes) => writeStorage(CACHE_KEY, notes);
const getQueue = () => readStorage(QUEUE_KEY, []);
const setQueue = (queue) => writeStorage(QUEUE_KEY, queue);

const parseApiError = async (response) => {
	try {
		const payload = await response.json();
		if (payload && typeof payload.message === "string" && payload.message.trim()) {
			return payload.message;
		}
	} catch {
		// Ignore JSON parsing errors and fallback to generic message.
	}

	return `Erreur API ${response.status}`;
};

const apiRequest = async (url, options = {}) => {
	const response = await fetch(url, options);
	if (!response.ok) {
		throw new Error(await parseApiError(response));
	}

	if (response.status === 204) {
		return null;
	}

	return response.json();
};

const apiListNotes = () => apiRequest(API_URL);

const apiCreateNote = (payload) =>
	apiRequest(API_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload)
	});

const apiUpdateNote = (id, payload) =>
	apiRequest(`${API_URL}/${id}`, {
		method: "PUT",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload)
	});

const apiDeleteNote = (id) =>
	apiRequest(`${API_URL}/${id}`, {
		method: "DELETE"
	});

const normalizeId = (value) => String(value);

const setStatusBadge = (element, text, kind) => {
	if (!element) {
		return;
	}

	element.textContent = text;
	element.classList.remove("status-online", "status-offline", "status-connecting");
	if (kind) {
		element.classList.add(kind);
	}
};

const renderCards = (notes) => {
	if (!notes.length) {
		container.innerHTML = `
<article class="card">
	<h2>Aucune note</h2>
	<p>Ajoutez une note pour commencer.</p>
</article>
`;
		return;
	}

	container.innerHTML = notes.map((item) => createCard(item)).join("");
};

const updateNetworkStatus = () => {
	const online = navigator.onLine;
	setStatusBadge(networkStatus, online ? "En ligne" : "Hors ligne", online ? "status-online" : "status-offline");
	sessionStorage.setItem(SESSION_NETWORK_KEY, online ? "online" : "offline");
};

const updateRealtimeStatus = (state) => {
	if (state === "connected") {
		setStatusBadge(realtimeStatus, "Temps reel actif", "status-online");
		return;
	}

	if (state === "connecting") {
		setStatusBadge(realtimeStatus, "Connexion temps reel...", "status-connecting");
		return;
	}

	if (state === "unsupported") {
		setStatusBadge(realtimeStatus, "WebSocket non supporte", "status-offline");
		return;
	}

	setStatusBadge(realtimeStatus, "Temps reel inactif", "status-offline");
};

const updateSyncStatus = () => {
	const queue = getQueue();
	const pending = queue.length;
	syncStatus.textContent = pending ? `${pending} action(s) a synchroniser` : "Tout est synchronise";
};

const persistAndRenderNotes = (notes) => {
	setCachedNotes(notes);
	renderCards(notes);
	updateSyncStatus();
};

const getCachedNoteById = (noteId) => {
	const id = normalizeId(noteId);
	return getCachedNotes().find((note) => normalizeId(note.id) === id);
};

const removeNoteFromCache = (noteId) => {
	const id = normalizeId(noteId);
	const filtered = getCachedNotes().filter((note) => normalizeId(note.id) !== id);
	persistAndRenderNotes(filtered);
};

const mergeServerNote = (serverNote) => {
	const cached = getCachedNotes();
	const pendingIndex = serverNote.clientRequestId
		? cached.findIndex((note) => note.id === serverNote.clientRequestId)
		: -1;
	const existingIndex = cached.findIndex((note) => note.id === serverNote.id);

	let merged = [...cached];

	if (pendingIndex >= 0) {
		merged[pendingIndex] = { ...serverNote, pending: false };
	} else if (existingIndex >= 0) {
		merged[existingIndex] = { ...merged[existingIndex], ...serverNote, pending: false };
	} else {
		merged.push({ ...serverNote, pending: false });
	}

	persistAndRenderNotes(merged);
};

const handleSocketMessage = (event) => {
	try {
		const message = JSON.parse(event.data);
		if ((message?.type === "note_created" || message?.type === "note_updated") && message.payload) {
			mergeServerNote(message.payload);
			return;
		}

		if (message?.type === "note_deleted" && message.payload?.id !== undefined) {
			removeNoteFromCache(message.payload.id);
		}
	} catch {
		// Ignore malformed socket payloads.
	}
};

const scheduleReconnect = () => {
	if (reconnectTimer || !navigator.onLine) {
		return;
	}

	reconnectTimer = window.setTimeout(() => {
		reconnectTimer = null;
		connectWebSocket();
	}, WS_RECONNECT_DELAY);
};

const closeWebSocket = () => {
	if (!socket) {
		return;
	}

	if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
		socket.close();
	}

	socket = null;
};

const connectWebSocket = () => {
	if (!("WebSocket" in window)) {
		updateRealtimeStatus("unsupported");
		return;
	}

	if (!navigator.onLine) {
		updateRealtimeStatus("offline");
		return;
	}

	if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
		return;
	}

	updateRealtimeStatus("connecting");
	socket = new WebSocket(WS_URL);

	socket.addEventListener("open", () => {
		updateRealtimeStatus("connected");
	});

	socket.addEventListener("message", handleSocketMessage);

	socket.addEventListener("close", () => {
		socket = null;
		updateRealtimeStatus("offline");
		scheduleReconnect();
	});

	socket.addEventListener("error", () => {
		updateRealtimeStatus("offline");
	});
};

const syncQueuedActions = async () => {
	if (!navigator.onLine) {
		updateSyncStatus();
		return;
	}

	const queue = getQueue();
	if (!queue.length) {
		updateSyncStatus();
		return;
	}

	const remaining = [];
	let cachedNotes = getCachedNotes();

	for (const action of queue) {
		try {
			const serverNote = await apiCreateNote({
				title: action.title,
				content: action.content,
				clientRequestId: action.clientId
			});

			cachedNotes = cachedNotes.map((note) =>
				note.id === action.clientId || note.clientRequestId === action.clientId
					? { ...serverNote, pending: false }
					: note
			);
		} catch {
			remaining.push(action);
		}
	}

	setQueue(remaining);
	persistAndRenderNotes(cachedNotes);
};

const loadFromCacheFirst = () => {
	const cached = getCachedNotes();
	renderCards(cached);
	updateSyncStatus();
};

const fetchData = async () => {
	try {
		if (!navigator.onLine) {
			loadFromCacheFirst();
			return;
		}

		const data = await apiListNotes();
		const pendingQueue = getQueue();
		const optimisticPendingNotes = pendingQueue
			.filter((item) => !data.some((note) => note.clientRequestId === item.clientId))
			.map((item) => ({
				id: item.clientId,
				title: item.title,
				content: item.content,
				createdAt: item.createdAt,
				pending: true
			}));

		const merged = [...data, ...optimisticPendingNotes];
		persistAndRenderNotes(merged);
	} catch (error) {
		loadFromCacheFirst();
	}
};

const queueNoteForSync = (note) => {
	const queue = getQueue();
	queue.push(note);
	setQueue(queue);
	updateSyncStatus();
};

const addNoteOptimistically = (note) => {
	const cached = getCachedNotes();
	cached.push(note);
	persistAndRenderNotes(cached);
};

const ensureOnlineForMutations = () => {
	if (navigator.onLine) {
		return true;
	}

	window.alert("Cette action necessite une connexion internet.");
	return false;
};

const updateNoteFromUI = async (noteId) => {
	if (!ensureOnlineForMutations()) {
		return;
	}

	const note = getCachedNoteById(noteId);
	if (!note || note.pending) {
		return;
	}

	const titleInput = window.prompt("Modifier le titre", note.title ?? "");
	if (titleInput === null) {
		return;
	}

	const contentInput = window.prompt("Modifier le contenu", note.content ?? "");
	if (contentInput === null) {
		return;
	}

	const title = titleInput.trim();
	const content = contentInput.trim();
	if (!title || !content) {
		window.alert("Titre et contenu sont obligatoires.");
		return;
	}

	try {
		const updatedNote = await apiUpdateNote(note.id, { title, content });
		mergeServerNote(updatedNote);
	} catch (error) {
		window.alert(error instanceof Error ? error.message : "Echec de mise a jour.");
	}
};

const deleteNoteFromUI = async (noteId) => {
	if (!ensureOnlineForMutations()) {
		return;
	}

	const note = getCachedNoteById(noteId);
	if (!note || note.pending) {
		return;
	}

	const confirmed = window.confirm(`Supprimer la note \"${note.title ?? ""}\" ?`);
	if (!confirmed) {
		return;
	}

	try {
		await apiDeleteNote(note.id);
		removeNoteFromCache(note.id);
	} catch (error) {
		window.alert(error instanceof Error ? error.message : "Echec de suppression.");
	}
};

const handleCardAction = async (event) => {
	const button = event.target.closest("button[data-action]");
	if (!button) {
		return;
	}

	const noteId = button.dataset.id;
	if (!noteId) {
		return;
	}

	if (button.dataset.action === "edit") {
		await updateNoteFromUI(noteId);
		return;
	}

	if (button.dataset.action === "delete") {
		await deleteNoteFromUI(noteId);
	}
};

const submitNote = async (event) => {
	event.preventDefault();

	const title = noteTitleInput.value.trim();
	const content = noteContentInput.value.trim();
	if (!title || !content) {
		return;
	}

	const clientId = `local-${Date.now()}`;
	const newNote = {
		clientId,
		title,
		content,
		createdAt: new Date().toISOString()
	};

	addNoteOptimistically({
		id: clientId,
		title,
		content,
		createdAt: newNote.createdAt,
		pending: true
	});
	queueNoteForSync(newNote);

	noteForm.reset();

	if (navigator.onLine) {
		await syncQueuedActions();
		await fetchData();
	}
};

noteForm.addEventListener("submit", submitNote);
refreshButton.addEventListener("click", fetchData);
container.addEventListener("click", handleCardAction);
window.addEventListener("online", async () => {
	updateNetworkStatus();
	connectWebSocket();
	await syncQueuedActions();
	await fetchData();
});
window.addEventListener("offline", () => {
	updateNetworkStatus();
	closeWebSocket();
	updateRealtimeStatus("offline");
	updateSyncStatus();
});
window.addEventListener("beforeunload", closeWebSocket);

updateNetworkStatus();
updateRealtimeStatus("offline");
loadFromCacheFirst();
connectWebSocket();
syncQueuedActions();
fetchData();
