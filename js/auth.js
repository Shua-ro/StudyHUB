// passes window.STUDYHUB_USER (from index.php) to app.js. PHP handles the actual session
(() => {
  const ROLES = {
    super_admin: { label: "Super Admin", view: "admin" },
    admin: { label: "Admin", view: "admin" },
    student: { label: "Student", view: "student" },
    teacher: { label: "Teacher", view: "teacher" },
  };

  function getSessionUser() {
    const u = window.STUDYHUB_USER;
    if (!u) return null;
    return {
      id: String(u.id),
      username: u.username ?? "",
      displayName: u.name,
      role: u.role in ROLES ? u.role : "student",
    };
  }

  // logout.php handles it
  function clearSession() {}

  // show/hide password buttons (login + signup)
  function setUpPasswordToggles() {
    document.querySelectorAll("[data-password-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const input = document.querySelector(button.dataset.passwordToggle);
        if (!input) return;
        const show = input.type === "password";
        input.type = show ? "text" : "password";
        button.textContent = show ? "Hide" : "Show";
        button.setAttribute("aria-label", `${show ? "Hide" : "Show"} password`);
      });
    });
  }

  window.StudyHubAuth = { ROLES, clearSession, getSessionUser };
  setUpPasswordToggles();
})();
