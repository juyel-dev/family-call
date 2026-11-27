(() => {
  "use strict";

  const views = Array.from(document.querySelectorAll("[data-view]"));
  const navButtons = Array.from(document.querySelectorAll("[data-page]"));
  const dialog = document.getElementById("call-dialog");
  const dialogTitle = document.getElementById("dialog-title");
  const dialogMessage = document.getElementById("dialog-message");
  const toast = document.getElementById("toast");
  let toastTimer;

  function showPage(pageName) {
    views.forEach((view) => {
      const active = view.dataset.view === pageName;
      view.classList.toggle("is-visible", active);
      view.hidden = !active;
    });

    navButtons.forEach((button) => {
      const active = button.dataset.page === pageName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-current", active ? "page" : "false");
    });
  }

  function showCallUnavailable(contact, callType) {
    const mode = callType === "video" ? "video" : "audio";
    dialogTitle.textContent = (mode === "video" ? "Video" : "Audio") + " call not ready";
    dialogMessage.textContent = "The " + mode + " call to " + contact +
      " cannot start yet. The secure call service and device connection still need to be configured.";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else window.alert(dialogMessage.textContent);
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  navButtons.forEach((button) => button.addEventListener("click", () => showPage(button.dataset.page)));
  document.querySelectorAll("[data-go]").forEach((button) => {
    button.addEventListener("click", () => showPage(button.dataset.go));
  });
  document.querySelectorAll("[data-call]").forEach((button) => {
    button.addEventListener("click", () => showCallUnavailable(button.dataset.contact, button.dataset.call));
  });
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  window.addEventListener("online", () => showToast("Internet connection restored."));
  window.addEventListener("offline", () => showToast("You are offline."));
  showPage("call");
})();
