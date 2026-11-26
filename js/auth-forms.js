/* StudyHub login/signup form handler (static pages).
   Sends JSON to the server endpoints and shows any error message. */
(() => {
  const form = document.querySelector("#auth-form");
  if (!form) return;
  const mode = form.dataset.mode; // "login" or "signup"
  const box = document.querySelector("#auth-message");
  const button = form.querySelector('button[type="submit"]');

  // type: "error" (default) or "info" (neutral, e.g. "waiting for approval")
  function show(text, type = "error") {
    box.textContent = text;
    box.hidden = !text;
    box.classList.toggle("is-info", type === "info");
  }

  /* Why the user landed on the login page (set by the server, see
     includes/auth.php). Only known codes are shown; anything else is ignored. */
  const NOTICES = {
    suspended:
      "Your account has been suspended. Log in to see the reason, or contact an administrator.",
    banned: "This account has been banned.",
    pending: "Your account is waiting for an administrator to approve it.",
    signed_out: "You were signed out. Please log in again.",
  };
  const notice = new URLSearchParams(location.search).get("notice");
  if (mode === "login" && Object.hasOwn(NOTICES, notice ?? "")) {
    show(NOTICES[notice], notice === "signed_out" || notice === "pending" ? "info" : "error");
  }

  /* Sign-up page: reflect the Super Admin's switches (the server enforces
     them anyway; this just avoids filling in a form that will be refused). */
  if (mode === "signup") {
    fetch("api/signup.php")
      .then((res) => res.json())
      .then((open) => {
        if (!open.allowSignups) {
          form.hidden = true;
          show("Sign-ups are closed right now. Ask an administrator for an account.", "info");
          return;
        }
        if (!open.allowTeacherSignups) {
          const teacher = form.querySelector('input[name="role"][value="teacher"]');
          if (teacher) {
            teacher.disabled = true;
            teacher.closest(".role-option")?.classList.add("is-disabled");
            const label = teacher.nextElementSibling;
            if (label) label.textContent = "Teacher (closed)";
          }
        }
      })
      .catch(() => {
        /* if this check fails, the server still decides on submit */
      });
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

      // Teacher signups wait for approval: stay here and explain.
      if (out.pending) {
        form.reset();
        return show(out.message, "info");
      }
      window.location.href = out.redirect || "index.php";
    } catch (err) {
      show("Cannot reach the server. Is Apache/MySQL running?");
    } finally {
      button.disabled = false;
    }
  });
})();
