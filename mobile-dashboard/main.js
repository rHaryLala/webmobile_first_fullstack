const container = document.getElementById("cards");
const refreshButton = document.getElementById("refresh");

const createCard = (title, content) => {
	return `
<div class="card">
	<h2>${title}</h2>
	<p>${content}</p>
</div>
`;
};

const fetchData = async () => {
	try {
		const res = await fetch("http://localhost:3000/api/data");
		const data = await res.json();
		container.innerHTML = data.map((item) => createCard(item.title, item.content)).join("");
	} catch (error) {
		container.innerHTML = createCard("Erreur API", "Impossible de charger les notes pour le moment.");
	}
};

refreshButton.addEventListener("click", fetchData);
fetchData();
