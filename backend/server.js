const express = require('express');
const cors = require('cors');
const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');
const app = express();

app.use(cors());
app.use(express.json());

const notesData = [
  { id: 1, title: "Echauffement", content: "5 min gammes majeures en mains separees, tempo lent." },
  { id: 2, title: "Technique", content: "Arpeges Do-Sol-Re, viser un son regulier et detendu." },
  { id: 3, title: "Morceau", content: "Travailler 8 mesures difficiles en boucle puis recoller." },
  { id: 4, title: "Rythme", content: "Compter a voix haute sur passages syncopes avant tempo normal." }
];
let nextId = notesData.length + 1;

const parseNoteId = (rawId) => Number.parseInt(rawId, 10);

const findNoteIndexById = (id) => notesData.findIndex((note) => note.id === id);

const parseAndValidateNote = (body) => {
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const content = typeof body?.content === 'string' ? body.content.trim() : '';

  if (!title || !content) {
    return {
      ok: false,
      error: 'title et content sont obligatoires.'
    };
  }

  return {
    ok: true,
    value: { title, content }
  };
};

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const broadcastEvent = (type, payload) => {
  const message = JSON.stringify({
    type,
    payload,
    sentAt: new Date().toISOString()
  });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
};

wss.on('connection', (socket) => {
  socket.send(
    JSON.stringify({
      type: 'connection_ready',
      payload: { message: 'WebSocket connected' },
      sentAt: new Date().toISOString()
    })
  );
});

app.get('/api/data', (req, res) => {
  res.json(notesData);
});

app.get('/api/data/:id', (req, res) => {
  const id = parseNoteId(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: 'id invalide.' });
  }

  const note = notesData.find((item) => item.id === id);
  if (!note) {
    return res.status(404).json({ message: 'note introuvable.' });
  }

  return res.json(note);
});

app.post('/api/data', (req, res) => {
  const parsedNote = parseAndValidateNote(req.body);
  const clientRequestId =
    typeof req.body?.clientRequestId === 'string' ? req.body.clientRequestId.trim() : '';

  if (!parsedNote.ok) {
    return res.status(400).json({ message: parsedNote.error });
  }

  const { title, content } = parsedNote.value;

  const newNote = {
    id: nextId++,
    title,
    content,
    createdAt: new Date().toISOString(),
    ...(clientRequestId ? { clientRequestId } : {})
  };

  notesData.push(newNote);
  broadcastEvent('note_created', newNote);
  return res.status(201).json(newNote);
});

app.put('/api/data/:id', (req, res) => {
  const id = parseNoteId(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: 'id invalide.' });
  }

  const parsedNote = parseAndValidateNote(req.body);
  if (!parsedNote.ok) {
    return res.status(400).json({ message: parsedNote.error });
  }

  const index = findNoteIndexById(id);
  if (index === -1) {
    return res.status(404).json({ message: 'note introuvable.' });
  }

  const updatedNote = {
    ...notesData[index],
    title: parsedNote.value.title,
    content: parsedNote.value.content,
    updatedAt: new Date().toISOString()
  };

  notesData[index] = updatedNote;
  broadcastEvent('note_updated', updatedNote);
  return res.json(updatedNote);
});

app.delete('/api/data/:id', (req, res) => {
  const id = parseNoteId(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ message: 'id invalide.' });
  }

  const index = findNoteIndexById(id);
  if (index === -1) {
    return res.status(404).json({ message: 'note introuvable.' });
  }

  const removedNote = notesData.splice(index, 1)[0];
  broadcastEvent('note_deleted', { id: removedNote.id });
  return res.status(204).send();
});

server.listen(3000, () => {
  console.log("Server running on port 3000");
});
