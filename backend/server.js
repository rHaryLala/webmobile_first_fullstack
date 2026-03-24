const express = require('express');
const cors = require('cors');
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

app.get('/api/data', (req, res) => {
  res.json(notesData);
});

app.post('/api/data', (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';

  if (!title || !content) {
    return res.status(400).json({ message: 'title et content sont obligatoires.' });
  }

  const newNote = {
    id: nextId++,
    title,
    content,
    createdAt: new Date().toISOString()
  };

  notesData.push(newNote);
  return res.status(201).json(newNote);
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
