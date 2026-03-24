const container = document.getElementById("cards");
const refreshButton = document.getElementById("refresh");
const networkStatus = document.getElementById("network-status");
const syncStatus = document.getElementById("sync-status");
const noteForm = document.getElementById("note-form");
const noteTitleInput = document.getElementById("note-title");
const noteContentInput = document.getElementById("note-content");

const API_URL = "http://localhost:3000/api/data";
const CACHE_KEY = "piano_notes_cache_v1";
const QUEUE_KEY = "piano_sync_queue_v1";
const SESSION_NETWORK_KEY = "piano_last_network_state";

const createCard = (title, content) => {
	return `
<div class="card">
	<h2>${title}</h2>
	<p>${content}</p>
</div>
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

const renderCards = (notes) => {
	if (!notes.length) {
		container.innerHTML = createCard("Aucune note", "Ajoutez une note pour commencer.");
		return;
	}

	container.innerHTML = notes
		.map((item) => {
			const pendingTag = item.pending ? " (en attente de synchro)" : "";
			return createCard(`${item.title}${pendingTag}`, item.content);
		})
		.join("");
};

const updateNetworkStatus = () => {
	const online = navigator.onLine;
	networkStatus.textContent = online ? "En ligne" : "Hors ligne";
	networkStatus.classList.toggle("status-online", online);
	networkStatus.classList.toggle("status-offline", !online);
	sessionStorage.setItem(SESSION_NETWORK_KEY, online ? "online" : "offline");
};

const updateSyncStatus = () => {
	const queue = getQueue();
	const pending = queue.length;
	syncStatus.textContent = pending ? `${pending} action(s) a synchroniser` : "Tout est synchronise";
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
			const response = await fetch(API_URL, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ title: action.title, content: action.content })
			});

			if (!response.ok) {
				throw new Error("sync failed");
			}

			const serverNote = await response.json();
			cachedNotes = cachedNotes.map((note) =>
				note.id === action.clientId
					? { ...serverNote, pending: false }
					: note
			);
		} catch {
			remaining.push(action);
		}
	}

	setCachedNotes(cachedNotes);
	setQueue(remaining);
	renderCards(cachedNotes);
	updateSyncStatus();
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

		const res = await fetch(API_URL);
		const data = await res.json();
		const pendingQueue = getQueue();
		const optimisticPendingNotes = pendingQueue.map((item) => ({
			id: item.clientId,
			title: item.title,
			content: item.content,
			createdAt: item.createdAt,
			pending: true
		}));

		const merged = [...data, ...optimisticPendingNotes];
		setCachedNotes(merged);
		renderCards(merged);
		updateSyncStatus();
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
	setCachedNotes(cached);
	renderCards(cached);
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
window.addEventListener("online", async () => {
	updateNetworkStatus();
	await syncQueuedActions();
	await fetchData();
});
window.addEventListener("offline", () => {
	updateNetworkStatus();
	updateSyncStatus();
});

updateNetworkStatus();
loadFromCacheFirst();
syncQueuedActions();
fetchData();
