const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

app.get('/api/data', (req, res) => {
  res.json([
    { title: "Echauffement", content: "5 min gammes majeures en mains separees, tempo lent." },
    { title: "Technique", content: "Arpeges Do-Sol-Re, viser un son regulier et detendu." },
    { title: "Morceau", content: "Travailler 8 mesures difficiles en boucle puis recoller." },
    { title: "Rythme", content: "Compter a voix haute sur passages syncopes avant tempo normal." }
  ]);
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});
