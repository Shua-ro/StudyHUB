// login/signup form, posts JSON and shows errors
(() => {
  const form = document.querySelector("#auth-form");
  if (!form) return;
  const mode = form.dataset.mode; // "login" or "signup"
  const box = document.querySelector("#auth-message");
  const button = form.querySelector('button[type="submit"]');

  // type: "error" or "info" (like waiting for approval)
  function show(text, type = "error") {
    box.textContent = text;
    box.hidden = !text;
    box.classList.toggle("is-info", type === "info");
  }

  // why they ended up on the login page (server sets it, see auth.php). unknown codes get ignored
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

  // signup page: match the super admin's switches. server checks anyway,
  // this just saves filling out a form that'll get rejected
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
        /* whatever, server still checks on submit */
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

      // teachers have to wait for approval, so stay here and say so
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
