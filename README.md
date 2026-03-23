# Aide-memoire Piano - Mobile-First Full-Stack JS

Application web simple pour pianiste, construite en JavaScript full-stack :
- Frontend mobile-first avec Vite
- Backend Node.js avec Express
- Connexion API frontend <-> backend
- Design minimaliste bleu marine (sans box-shadow)

## Structure du projet

- mobile-dashboard/ : frontend SPA
- backend/ : API Node.js
- README.md : documentation du projet

## Fonctionnalites

- Affichage de cartes aide-memoire pour la pratique du piano
- Chargement des donnees depuis l'API Node.js
- Bouton Rafraichir pour recharger les cartes
- Interface responsive mobile-first

## Stack technique

- Frontend : HTML, CSS, JavaScript (ES6), Vite
- Backend : Node.js, Express, CORS

## Installation et execution

### 1) Backend

Dans le dossier backend :

```powershell
npm.cmd install
node server.js
```

API disponible sur :
http://localhost:3000/api/data

### 2) Frontend

Dans le dossier mobile-dashboard :

```powershell
npm.cmd install
npm.cmd run dev
```

Application disponible sur :
http://localhost:5174

Note : Vite peut choisir un autre port (ex: 5173, 5174...) si un port est deja occupe.

## Captures d'ecran

### Vue mobile

![Vue mobile](mobile-dashboard/screenshots/app-mobile.png)

### Vue desktop

![Vue desktop](mobile-dashboard/screenshots/app-desktop.png)

## Workflow de l'application

1. Le frontend charge la page et execute main.js.
2. main.js appelle l'endpoint backend http://localhost:3000/api/data.
3. Le backend renvoie les cartes aide-memoire au format JSON.
4. Le frontend injecte ces donnees dans l'interface.
5. Le bouton Rafraichir relance la requete API.

## Fichiers importants

- Frontend principal : mobile-dashboard/index.html
- Styles : mobile-dashboard/style.css
- Logique frontend : mobile-dashboard/main.js
- API backend : backend/server.js
