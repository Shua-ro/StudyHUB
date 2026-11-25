/* StudyHub auth shim.
   PHP now handles login, signup, logout, and the session.
   index.php writes window.STUDYHUB_USER. This file only passes that data to app.js. */
(() => {
  const ROLES = {
    admin: { label: "Administrator", view: "admin" },
    student: { label: "Student", view: "student" },
    teacher: { label: "Teacher", view: "teacher" },
  };

  /* Return the user that PHP gave us, or null. */
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

  /* The server owns the session now. logout.php clears it. */
  function clearSession() {}

  /* Show/Hide password buttons (used by login.php and signup.php). */
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
