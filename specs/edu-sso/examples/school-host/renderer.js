const titleEl = document.getElementById("title");
const studentEl = document.getElementById("student");
const greetingEl = document.getElementById("greeting");
const closeBtn = document.getElementById("close");
const home = document.getElementById("home");
const grid = document.getElementById("grid");
const errorEl = document.getElementById("error");

let appsCache = [];

async function init() {
  const student = await window.host.getStudent();
  studentEl.textContent = `${student.name} · ${student.email}`;
  greetingEl.textContent = `Hello, ${student.name}!`;

  appsCache = await window.host.listApps();
  grid.innerHTML = appsCache
    .map(
      (a) => `
        <button class="card" data-id="${a.id}">
          <span class="icon">${a.icon ?? "📦"}</span>
          <span class="card-name">${a.name}</span>
        </button>
      `
    )
    .join("");
  grid.querySelectorAll(".card").forEach((el) => {
    el.addEventListener("click", () => {
      hideError();
      window.host.openApp(el.dataset.id);
    });
  });

  closeBtn.addEventListener("click", () => window.host.closeApp());

  window.host.onOpened((id) => {
    const a = appsCache.find((x) => x.id === id);
    home.style.display = "none";
    closeBtn.style.display = "inline-block";
    titleEl.textContent = `School Host · ${a?.name ?? id}`;
  });

  window.host.onClosed(() => {
    home.style.display = "block";
    closeBtn.style.display = "none";
    titleEl.textContent = "School Host";
  });

  window.host.onError((msg) => {
    showError(`Failed to open: ${msg}`);
  });
}

function showError(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = "block";
}

function hideError() {
  errorEl.style.display = "none";
}

init().catch((err) => {
  console.error(err);
  showError(`Initialization error: ${err.message}`);
});
