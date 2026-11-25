/* StudyHub login/signup form handler (static pages).
   Sends JSON to the server endpoints and shows any error message. */
(() => {
  const form = document.querySelector("#auth-form");
  if (!form) return;
  const mode = form.dataset.mode; // "login" or "signup"
  const box = document.querySelector("#auth-message");
  const button = form.querySelector('button[type="submit"]');

  function show(text) {
    box.textContent = text;
    box.hidden = !text;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    show("");

    const data = Object.fromEntries(new FormData(form));
    data.username = (data.username || "").trim().toLowerCase();

    if (!data.username || !data.password) return show("Enter your username and password.");
    if (mode === "signup") {
      if (!data.name || !data.name.trim()) return show("Enter your full name.");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(data.username)) return show("Enter a valid email address.");
      if (data.password.length < 8) return show("Password must be at least 8 characters.");
      if (data.password !== data.confirm) return show("Passwords do not match.");
      delete data.confirm;
    }

    button.disabled = true;
    try {
      const res = await fetch(`api/${mode}.php`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return show(out.error || "Something went wrong. Please try again.");
      window.location.href = out.redirect || "index.php";
    } catch (err) {
      show("Cannot reach the server. Is Apache/MySQL running?");
    } finally {
      button.disabled = false;
    }
  });
})();
