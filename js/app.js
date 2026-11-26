// Workflow states in order
const WORKFLOW_PATH = ["To do", "In progress", "In review", "Done", "Archived"];

// Id of the archived task whose delete is waiting for confirmation (or null).
let archiveDeleteId = null;

// Progress excludes Archived (it's 100% by definition)
const PROGRESS_PATH = WORKFLOW_PATH.filter((status) => status !== "Archived");
function getDaysRemaining(task) {
  if (!task.dueDate) return Infinity;
  const due = new Date(task.dueDate + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due - today) / 86400000);
}

function getIsOverdue(task) {
  return !isFinished(task) && task.dueDate && getDaysRemaining(task) < 0;
}
(() => {
  const API_URL = "api/classroom.php";

  function byId(id) {
    return document.getElementById(id);
  }

  function showNotice(el, message, isError = false) {
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    el.dataset.tone = isError ? "error" : "success";
  }

  function hideNotice(el) {
    if (!el) return;
    el.textContent = "";
    el.hidden = true;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  let state = {
    role: "student",
    classrooms: [],
    posts: [],
    query: "",
  };

  async function postAction(payload) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      throw new Error(data.message || "Request failed.");
    }
    return data;
  }

  function ensureTeacherWorkspace() {
    const teacherSection = byId("teacher-classroom");
    if (!teacherSection) return null;

    let workspace = byId("teacher-classroom-workspace");
    if (!workspace) {
      workspace = document.createElement("div");
      workspace.id = "teacher-classroom-workspace";
      workspace.innerHTML = `
        <div class="content-card" style="margin-top: 1rem;">
          <label for="teacher-class-search"><strong>Search classes</strong></label>
          <input id="teacher-class-search" type="search" placeholder="Search by code, title, subject, or section..." />
        </div>
        <div id="teacher-class-list" class="classroom-grid" style="margin-top: 1rem;"></div>
        <form id="teacher-post-form" class="content-card classroom-form" style="margin-top: 1rem;">
          <h3>Post Class Announcement / Material</h3>
          <div>
            <label for="post-classroom-id">Select class</label>
            <select id="post-classroom-id" required></select>
          </div>
          <div>
            <label for="post-title">Post title</label>
            <input id="post-title" maxlength="150" required placeholder="e.g. Week 4 Lecture Slides" />
          </div>
          <div>
            <label for="post-content">Details / Instructions</label>
            <textarea id="post-content" rows="3" required placeholder="Write class announcement or study notes..."></textarea>
          </div>
          <div>
            <label for="post-link">Resource link (optional)</label>
            <input id="post-link" type="url" maxlength="255" placeholder="https://..." />
          </div>
          <button type="submit">Publish Post</button>
        </form>
        <div id="teacher-post-list" style="margin-top: 1rem;"></div>
      `;
      teacherSection.appendChild(workspace);

      const searchInput = byId("teacher-class-search");
      if (searchInput) {
        let timer = null;
        searchInput.addEventListener("input", () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            state.query = searchInput.value.trim();
            loadClassroom();
          }, 250);
        });
      }

      const postForm = byId("teacher-post-form");
      if (postForm) {
        postForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const teacherNotice = byId("classroom-notice");
          hideNotice(teacherNotice);
          try {
            const data = await postAction({
              action: "create_post",
              classroom_id: Number(byId("post-classroom-id")?.value || 0),
              title: byId("post-title")?.value.trim() || "",
              content: byId("post-content")?.value.trim() || "",
              resource_link: byId("post-link")?.value.trim() || "",
            });
            postForm.reset();
            showNotice(teacherNotice, data.message || "Announcement posted!", false);
            await loadClassroom();
          } catch (err) {
            showNotice(teacherNotice, err.message, true);
          }
        });
      }
    }
    return workspace;
  }

  function renderTeacherView() {
    const workspace = ensureTeacherWorkspace();
    if (!workspace) return;

    const listEl = byId("teacher-class-list");
    const selectEl = byId("post-classroom-id");
    const postListEl = byId("teacher-post-list");
    const teacherNotice = byId("classroom-notice");

    if (selectEl) {
      selectEl.innerHTML = state.classrooms.length
        ? state.classrooms
            .map(
              (c) =>
                `<option value="${escapeHtml(c.id)}">${escapeHtml(c.class_code)} — ${escapeHtml(c.title)}</option>`
            )
            .join("")
        : '<option value="">Create a class first</option>';
    }

    if (listEl) {
      if (!state.classrooms.length) {
        listEl.innerHTML = '<p class="section-note">No classes found.</p>';
      } else {
        listEl.innerHTML = state.classrooms
          .map(
            (cls) => `
            <article class="content-card">
              <h3>${escapeHtml(cls.title)}</h3>
              <p class="section-note">${escapeHtml(cls.subject)}${cls.section ? " • " + escapeHtml(cls.section) : ""}</p>
              <p><strong>Class code:</strong> <code>${escapeHtml(cls.class_code)}</code></p>
              <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">
                <button type="button" class="classroom-button" data-edit-class="${escapeHtml(cls.id)}">Edit</button>
                <button type="button" class="classroom-button" data-delete-class="${escapeHtml(cls.id)}">Delete</button>
              </div>
            </article>
          `
          )
          .join("");

        listEl.querySelectorAll("[data-edit-class]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = Number(btn.dataset.editClass);
            const cls = state.classrooms.find((c) => Number(c.id) === id);
            if (!cls) return;
            const newTitle = prompt("Edit class name:", cls.title);
            if (newTitle === null) return;
            const newSubject = prompt("Edit subject:", cls.subject);
            if (newSubject === null) return;
            const newSection = prompt("Edit section:", cls.section || "");
            if (newSection === null) return;
            try {
              const data = await postAction({
                action: "update_class",
                id,
                title: newTitle.trim(),
                subject: newSubject.trim(),
                section: newSection.trim(),
              });
              showNotice(teacherNotice, data.message || "Class updated.", false);
              await loadClassroom();
            } catch (err) {
              showNotice(teacherNotice, err.message, true);
            }
          });
        });

        listEl.querySelectorAll("[data-delete-class]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = Number(btn.dataset.deleteClass);
            if (!confirm("Delete this class and all of its posts?")) return;
            try {
              const data = await postAction({ action: "delete_class", id });
              showNotice(teacherNotice, data.message || "Class deleted.", false);
              await loadClassroom();
            } catch (err) {
              showNotice(teacherNotice, err.message, true);
            }
          });
        });
      }
    }

    if (postListEl) {
      if (!state.posts.length) {
        postListEl.innerHTML = '<p class="section-note">No announcements posted yet.</p>';
      } else {
        postListEl.innerHTML =
          "<h3>Posted Announcements & Materials</h3>" +
          state.posts
            .map((p) => {
              const cls = state.classrooms.find((c) => Number(c.id) === Number(p.classroom_id));
              return `
                <article class="content-card" style="margin-top:0.75rem;">
                  <p class="section-note">${escapeHtml(cls ? cls.class_code + " • " + cls.title : "Class #" + p.classroom_id)} • ${escapeHtml(p.created_at)}</p>
                  <h4>${escapeHtml(p.title)}</h4>
                  <p>${escapeHtml(p.content)}</p>
                  ${p.resource_link ? `<p><a href="${escapeHtml(p.resource_link)}" target="_blank" rel="noopener">Open resource link</a></p>` : ""}
                  <button type="button" class="classroom-button" data-delete-post="${escapeHtml(p.id)}">Delete Post</button>
                </article>
              `;
            })
            .join("");

        postListEl.querySelectorAll("[data-delete-post]").forEach((btn) => {
          btn.addEventListener("click", async () => {
            const id = Number(btn.dataset.deletePost);
            if (!confirm("Delete this post?")) return;
            try {
              const data = await postAction({ action: "delete_post", id });
              showNotice(teacherNotice, data.message || "Post deleted.", false);
              await loadClassroom();
            } catch (err) {
              showNotice(teacherNotice, err.message, true);
            }
          });
        });
      }
    }
  }

  function renderStudentView() {
    const studentCardsEl = byId("student-class-cards");
    const studentDetailEl = byId("student-class-detail");
    if (!studentCardsEl) return;

    if (!state.classrooms.length) {
      studentCardsEl.innerHTML =
        '<p class="section-note">You have not joined any classes yet. Click "+ Join class" and enter your teacher\'s code.</p>';
      if (studentDetailEl) studentDetailEl.hidden = true;
      return;
    }

    studentCardsEl.innerHTML = state.classrooms
      .map(
        (cls) => `
        <article class="content-card" data-class-id="${escapeHtml(cls.id)}">
          <h3>${escapeHtml(cls.title)}</h3>
          <p class="section-note">${escapeHtml(cls.subject)}${cls.section ? " • " + escapeHtml(cls.section) : ""}</p>
          <p><strong>Teacher:</strong> ${escapeHtml(cls.teacher_name || "Instructor")}</p>
          <p><strong>Code:</strong> <code>${escapeHtml(cls.class_code)}</code></p>
        </article>
      `
      )
      .join("");

    if (studentDetailEl) {
      studentDetailEl.hidden = false;
      if (!state.posts.length) {
        studentDetailEl.innerHTML =
          '<p class="section-note" style="margin-top:1rem;">No class announcements or materials posted yet.</p>';
      } else {
        studentDetailEl.innerHTML =
          '<h3 style="margin-top:1rem;">Class Updates & Materials</h3>' +
          state.posts
            .map((p) => {
              const cls = state.classrooms.find((c) => Number(c.id) === Number(p.classroom_id));
              return `
                <article class="content-card" style="margin-top:0.75rem;">
                  <p class="section-note">${escapeHtml(cls ? cls.title : "Class")} • Posted by ${escapeHtml(p.author_name || "Teacher")} • ${escapeHtml(p.created_at)}</p>
                  <h4>${escapeHtml(p.title)}</h4>
                  <p>${escapeHtml(p.content)}</p>
                  ${p.resource_link ? `<p><a href="${escapeHtml(p.resource_link)}" target="_blank" rel="noopener">Open resource link</a></p>` : ""}
                </article>
              `;
            })
            .join("");
      }
    }
  }

  async function loadClassroom() {
    try {
      const url = state.query
        ? `${API_URL}?q=${encodeURIComponent(state.query)}`
        : API_URL;
      const res = await fetch(url, { credentials: "same-origin" });
      const data = await res.json();
      if (!res.ok || !data.ok) return;

      state.role = data.role || "student";
      state.classrooms = Array.isArray(data.classrooms) ? data.classrooms : [];
      state.posts = Array.isArray(data.posts) ? data.posts : [];

      renderTeacherView();
      renderStudentView();
    } catch (err) {
      console.error("[classroom.js] load error:", err);
    }
  }

  function bindClassroomEvents() {
    const createToggleBtn = byId("class-create-toggle");
    const createForm = byId("class-create-form");
    const createCancelBtn = byId("class-create-cancel");
    const nameInput = byId("class-name");
    const sectionInput = byId("class-section");
    const subjectInput = byId("class-subject");
    const teacherNotice = byId("classroom-notice");

    const joinToggleBtn = byId("class-join-toggle");
    const joinForm = byId("class-join-form");
    const joinCancelBtn = byId("class-join-cancel");
    const joinCodeInput = byId("class-join-code");
    const studentNotice = byId("student-classroom-notice");

    if (createToggleBtn && createForm && !createToggleBtn.dataset.bound) {
      createToggleBtn.dataset.bound = "1";
      createToggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        createForm.hidden = !createForm.hidden;
        hideNotice(teacherNotice);
        if (!createForm.hidden && nameInput) nameInput.focus();
      });
    }

    if (createCancelBtn && createForm && !createCancelBtn.dataset.bound) {
      createCancelBtn.dataset.bound = "1";
      createCancelBtn.addEventListener("click", () => {
        createForm.reset();
        createForm.hidden = true;
        hideNotice(teacherNotice);
      });
    }

    if (createForm && !createForm.dataset.bound) {
      createForm.dataset.bound = "1";
      createForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideNotice(teacherNotice);
        try {
          const data = await postAction({
            action: "create_class",
            name: nameInput ? nameInput.value.trim() : "",
            section: sectionInput ? sectionInput.value.trim() : "",
            subject: subjectInput ? subjectInput.value.trim() : "",
          });
          createForm.reset();
          createForm.hidden = true;
          showNotice(
            teacherNotice,
            data.message || `Class created! Share code: ${data.class_code}`,
            false
          );
          await loadClassroom();
        } catch (err) {
          showNotice(teacherNotice, err.message, true);
        }
      });
    }

    if (joinToggleBtn && joinForm && !joinToggleBtn.dataset.bound) {
      joinToggleBtn.dataset.bound = "1";
      joinToggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        joinForm.hidden = !joinForm.hidden;
        hideNotice(studentNotice);
        if (!joinForm.hidden && joinCodeInput) joinCodeInput.focus();
      });
    }

    if (joinCancelBtn && joinForm && !joinCancelBtn.dataset.bound) {
      joinCancelBtn.dataset.bound = "1";
      joinCancelBtn.addEventListener("click", () => {
        joinForm.reset();
        joinForm.hidden = true;
        hideNotice(studentNotice);
      });
    }

    if (joinForm && !joinForm.dataset.bound) {
      joinForm.dataset.bound = "1";
      joinForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        hideNotice(studentNotice);
        try {
          const data = await postAction({
            action: "join_class",
            code: joinCodeInput ? joinCodeInput.value.trim() : "",
          });
          joinForm.reset();
          joinForm.hidden = true;
          showNotice(studentNotice, data.message || "Joined class!", false);
          await loadClassroom();
        } catch (err) {
          showNotice(studentNotice, err.message, true);
        }
      });
    }
  }

  bindClassroomEvents();
  document.addEventListener("DOMContentLoaded", () => {
    bindClassroomEvents();
    loadClassroom();
  });
  setTimeout(bindClassroomEvents, 300);
})();
function getDaysLabel(task) {
  if (isFinished(task)) return "Finished";
  if (!task.dueDate) return "No due date";
  const d = getDaysRemaining(task);
  if (d < 0) return `${Math.abs(d)} day(s) overdue`;
  if (d === 0) return "Due today";
  return `${d} day(s) left`;
}

function getStatusClass(status) {
  return "status-" + String(status).toLowerCase().replace(/\s+/g, "-");
}

function getStudyHours(task) {
  return (task.estimatedMinutes || 0) / 60;
}
// Check if a task is in a finished state
function isFinished(task) {
  return task.status === "Done" || task.status === "Archived";
}

// Allowed transitions per status
const TRANSITION_MATRIX = {
  "To do": {
    "In progress": {
      actionLabel: "Start",
      condition: "hasTaskBasics",
      row: true,
      emphasis: true,
    },
  },
  "In progress": {
    "In review": {
      actionLabel: "Submit for review",
      condition: "hasTaskBasics",
      row: true,
      emphasis: true,
    },
    "To do": {
      actionLabel: "Move back to To do",
      condition: "hasTaskBasics",
      row: false,
      emphasis: false,
    },
  },
  "In review": {
    Done: {
      actionLabel: "Mark done",
      condition: "hasTaskBasics",
      row: true,
      emphasis: true,
    },
    "In progress": {
      actionLabel: "Return for changes",
      condition: "hasTaskBasics",
      row: true,
      emphasis: false,
    },
  },
  Done: {
    Archived: {
      actionLabel: "Archive",
      condition: "isDone",
      row: true,
      emphasis: false,
    },
    "In progress": {
      actionLabel: "Reopen",
      condition: "hasTaskBasics",
      row: true,
      emphasis: false,
    },
  },
  /* Terminal state: nothing can leave Archived. */
  Archived: {},
};

const TRANSITION_CONDITIONS = {
  hasTaskBasics: (task) =>
    Boolean(
      String(task.title ?? "").trim() &&
      String(task.subject ?? "").trim() &&
      (task.dueDate || task.classroomAssignmentId),
    ),

  // For archiving a Done task — only needs title/subject (dueDate optional)
  isDone: (task) =>
    Boolean(
      String(task.title ?? "").trim() && String(task.subject ?? "").trim(),
    ),
};

const AUTH = window.StudyHubAuth;
const ROLES = AUTH.ROLES;

/* If the server says this session is no longer valid (account suspended,
   banned, or signed out everywhere), leave the page and explain why on the
   login screen instead of letting saves fail silently. */
const LOGIN_NOTICES = ["suspended", "banned", "pending", "signed_out"];
const nativeFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const response = await nativeFetch(...args);
  const url = String(args[0]?.url ?? args[0] ?? "");
  if (response.status === 401 && url.includes("api/")) {
    let code = "";
    try {
      code = (await response.clone().json()).code ?? "";
    } catch {
      /* not JSON: fall back to a plain redirect */
    }
    const notice = LOGIN_NOTICES.includes(code) ? `?notice=${code}` : "";
    window.location.replace(`login.html${notice}`);
  }
  // After an admin reset: everything is refused until a new password is chosen.
  if (response.status === 403 && url.includes("api/")) {
    try {
      if ((await response.clone().json()).code === "must_change_password") {
        showPasswordChangeRequired();
      }
    } catch {
      /* not JSON */
    }
  }
  return response;
};

// Dev role override: if ?dev=1 and a saved dev role exists, use it instead of real auth
let devRoleOverride = null;
if (new URLSearchParams(location.search).has("dev")) {
  devRoleOverride = sessionStorage.getItem("devRoleOverride");
  console.log(
    "[dev-startup] devRoleOverride from sessionStorage:",
    devRoleOverride,
  );
}

let currentUser = null;
try {
  currentUser = AUTH.getSessionUser();
} catch (error) {
  const message = document.querySelector("#app-message");
  if (message) {
    message.textContent = error.message;
    message.hidden = false;
  }
}

console.log("[dev-startup] currentUser before override:", currentUser?.role);

// Apply dev role override if present
if (devRoleOverride && currentUser) {
  currentUser = { ...currentUser, role: devRoleOverride };
  console.log("[dev-startup] currentUser after override:", currentUser.role);
}

let currentView = currentUser
  ? (ROLES[currentUser.role]?.view ?? "student")
  : "guest";
const session = {
  userId: currentUser?.id ?? null,
  displayName: currentUser?.displayName ?? "Guest",
  role: currentUser?.role ?? null,
};

const CAPABILITIES = {
  // Tasks
  TASK_VIEW_OWN: "task:view-own",
  TASK_CREATE: "task:create",
  TASK_EDIT_OWN: "task:edit-own",
  TASK_STATUS: "task:status",
  TASK_ARCHIVE: "task:archive",
  TASK_VIEW_ALL: "task:view-all",
  // Users / Admin
  USER_MANAGE: "user:manage",
  // Classrooms
  CLASS_CREATE: "class:create",
  CLASS_JOIN: "class:join",
  CLASS_GRADE: "class:grade",
  // Analytics / Dashboards
  ANALYTICS_VIEW: "analytics:view",
  // Features
  POMODORO_USE: "pomodoro:use",
};

const ROLE_PERMISSIONS = {
  student: new Set([
    CAPABILITIES.TASK_VIEW_OWN,
    CAPABILITIES.TASK_CREATE,
    CAPABILITIES.TASK_EDIT_OWN,
    CAPABILITIES.TASK_STATUS,
    CAPABILITIES.TASK_ARCHIVE,
    CAPABILITIES.CLASS_JOIN,
    CAPABILITIES.CLASS_CREATE,
    CAPABILITIES.POMODORO_USE,
  ]),
  teacher: new Set([
    CAPABILITIES.TASK_VIEW_OWN,
    CAPABILITIES.CLASS_CREATE,
    CAPABILITIES.CLASS_GRADE,
    CAPABILITIES.ANALYTICS_VIEW,
  ]),
  admin: new Set(Object.values(CAPABILITIES)),
  super_admin: new Set(Object.values(CAPABILITIES)),
};

/* NOTE: these browser-side checks only decide what to SHOW. The server
   (includes/permissions.php + includes/auth.php) is what actually enforces
   who may do what; never rely on this list for security. */

// Checks if current role has a capability
function allowed(capability) {
  return ROLE_PERMISSIONS[session.role]?.has(capability) ?? false;
}

// Ownership-aware check for record-scoped capabilities
function allowedOn(capability, task) {
  if (!allowed(capability)) return false;
  if (capability === CAPABILITIES.TASK_EDIT_OWN) return canEditTask(task);
  if (capability === CAPABILITIES.TASK_STATUS) return canEditTask(task);
  if (capability === CAPABILITIES.TASK_ARCHIVE) return task.status === "Done"; // allow archiving Done tasks
  return true; // non-ownership capabilities
}

if (!currentUser) {
  window.location.replace("login.html");
}

// Strip out UI elements not allowed for current view, then show page
function applyRoleView() {
  console.log(
    "[applyRoleView] currentView:",
    currentView,
    "currentUser.role:",
    currentUser?.role,
  );
  document.querySelectorAll("[data-view]").forEach((element) => {
    if (!element.dataset.view.split(/\s+/).includes(currentView)) {
      element.remove();
    }
  });

  const root = document.documentElement;
  root.dataset.appView = currentView;
  if (currentUser) root.dataset.role = currentUser.role;
  console.log(
    "[applyRoleView] root.dataset.appView set to:",
    root.dataset.appView,
    "root.dataset.role:",
    root.dataset.role,
  );

  if (currentUser) {
    setLabel("#user-label", currentUser.displayName);
    setLabel("#user-role", ROLES[currentUser.role]?.label ?? currentUser.role);
    setLabel("#user-initials", initialsOf(currentUser.displayName));
  }

  if (currentView === "admin") {
    setLabel("#admin-name", currentUser.displayName);
    const adminSection = document.querySelector("#admin-dashboard");
    if (adminSection) adminSection.hidden = false;
    document
      .querySelector(".primary-nav a")
      ?.setAttribute("aria-current", "page");
    loadAdminOverview();
    loadAdminReports();
  }

  if (currentView === "teacher") {
    const teacherSection = document.querySelector("#teacher-dashboard");
    if (teacherSection) teacherSection.hidden = false;
    document
      .querySelector('.primary-nav a[href="#teacher-dashboard"]')
      ?.setAttribute("aria-current", "page");
  }

  root.dataset.ready = "true";
}

function setLabel(selector, text) {
  const element = document.querySelector(selector);
  if (element) element.textContent = text;
}

// "Ana Bautista" -> "AB"
function initialsOf(name) {
  return (
    String(name ?? "")
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "?"
  );
}

/* Admin dashboard: usage report + sign-ins chart (api/admin.php "reports").
   NOTE: called from applyRoleView() at startup, so nothing here may touch a
   const declared further down this file before the first await. */
async function loadAdminReports() {
  let data;
  try {
    const response = await fetch("api/admin.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "reports" }),
    });
    data = await response.json();
  } catch {
    return;
  }
  if (!data?.ok) return;

  const { accounts, content, security, signIns } = data;
  setLabel("#report-active7", String(accounts.active7));
  setLabel("#report-new7", String(accounts.new7));
  setLabel("#report-new30", `${accounts.new30} in the last 30 days`);
  setLabel("#report-tasks7", String(content.tasksCreated7));
  setLabel("#report-completion", `${content.completionRate}%`);
  setLabel("#report-tasks-total", `of ${content.tasks} task${content.tasks === 1 ? "" : "s"} finished`);
  setLabel("#report-classes", String(content.classes));
  setLabel("#report-notes", String(content.notes));

  // Security figures only arrive for Super Admins (the server decides).
  const securityBlock = document.querySelector("#report-security");
  if (securityBlock) securityBlock.hidden = !security;
  if (security) {
    setLabel("#report-failed7", String(security.failed7));
    setLabel("#report-blocked7", String(security.blocked7));
    setLabel("#report-denied7", String(security.denied7));
  }

  renderSignInChart(signIns);
}

/* Single-series bar chart, plain HTML/CSS (no library).
   One hue, thin bars with 4px rounded tops on the baseline, recessive grid,
   direct labels only on the busiest day and today, a hover/focus tooltip on
   every day, and a table version for screen readers. */
function renderSignInChart(days) {
  const chart = document.querySelector("#signins-chart");
  if (!chart) return;
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const max = Math.max(...days.map((day) => day.count));
  setLabel("#signins-total", `${total} sign-in${total === 1 ? "" : "s"} in total`);
  document.querySelector("#signins-empty").hidden = total > 0;
  chart.hidden = total === 0;

  // A round top for the scale: 1, 2, 5, 10, 20, 50, ...
  const niceMax = (() => {
    if (max <= 4) return 4;
    const power = 10 ** Math.floor(Math.log10(max));
    return [1, 2, 5, 10].map((step) => step * power).find((value) => value >= max);
  })();

  const label = (iso, options) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, options);
  const lastIndex = days.length - 1;
  const busiest = days.findIndex((day) => day.count === max);

  const columns = days
    .map((day, index) => {
      const height = (day.count / niceMax) * 100;
      const isToday = index === lastIndex;
      const showValue = day.count > 0 && (index === busiest || isToday);
      const full = `${label(day.date, { weekday: "short", month: "short", day: "numeric" })}: ${day.count} sign-in${day.count === 1 ? "" : "s"}`;
      const axis = isToday ? "Today" : label(day.date, index === 0 ? { month: "short", day: "numeric" } : { day: "numeric" });
      return `
        <div class="bar-col" tabindex="0" data-tip="${escapeHTML(full)}" aria-label="${escapeHTML(full)}">
          <div class="bar-plot">
            ${showValue ? `<span class="bar-value">${day.count}</span>` : ""}
            <span class="bar-mark" style="height:${height}%"></span>
          </div>
          <span class="bar-x${isToday ? " is-today" : ""}">${escapeHTML(axis)}</span>
        </div>`;
    })
    .join("");

  chart.innerHTML = `
    <div class="bar-grid" aria-hidden="true">
      <span style="bottom:100%">${niceMax}</span>
      <span style="bottom:50%">${niceMax / 2}</span>
    </div>
    <div class="bar-cols">${columns}</div>
    <div class="chart-tooltip" role="presentation" hidden></div>`;

  document.querySelector("#signins-table").innerHTML = days
    .map(
      (day) =>
        `<tr><td>${escapeHTML(label(day.date, { weekday: "short", month: "short", day: "numeric" }))}</td><td>${day.count}</td></tr>`,
    )
    .join("");

  // Tooltip follows the hovered/focused day.
  const tooltip = chart.querySelector(".chart-tooltip");
  const show = (col) => {
    tooltip.textContent = col.dataset.tip;
    tooltip.hidden = false;
    const chartBox = chart.getBoundingClientRect();
    const colBox = col.getBoundingClientRect();
    const center = colBox.left - chartBox.left + colBox.width / 2;
    tooltip.style.left = `${Math.min(Math.max(center, 80), chartBox.width - 80)}px`;
    chart.querySelectorAll(".bar-col.is-active").forEach((c) => c.classList.remove("is-active"));
    col.classList.add("is-active");
  };
  const hide = () => {
    tooltip.hidden = true;
    chart.querySelectorAll(".bar-col.is-active").forEach((c) => c.classList.remove("is-active"));
  };
  chart.querySelectorAll(".bar-col").forEach((col) => {
    col.addEventListener("mouseenter", () => show(col));
    col.addEventListener("focus", () => show(col));
    col.addEventListener("blur", hide);
  });
  chart.addEventListener("mouseleave", hide);
}

/* Admin dashboard: account counts from api/admin.php (the server checks the role). */
async function loadAdminOverview() {
  const error = document.querySelector("#admin-overview-error");
  try {
    const response = await fetch("api/admin.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "overview" }),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "Could not load the overview.");

    const { byRole, byStatus } = data;
    setLabel("#admin-stat-total", String(data.total));
    setLabel("#admin-stat-student", String(byRole.student ?? 0));
    setLabel("#admin-stat-teacher", String(byRole.teacher ?? 0));
    setLabel(
      "#admin-stat-staff",
      String((byRole.admin ?? 0) + (byRole.super_admin ?? 0)),
    );
    setLabel("#admin-stat-pending", String(byStatus.pending ?? 0));
    setLabel(
      "#admin-stat-blocked",
      String((byStatus.suspended ?? 0) + (byStatus.banned ?? 0)),
    );
    // Only draw attention to approvals when someone is actually waiting.
    document
      .querySelector('[data-stat="pending"]')
      ?.classList.toggle("has-items", (byStatus.pending ?? 0) > 0);
    const review = document.querySelector("#admin-review-pending");
    if (review) review.hidden = !((byStatus.pending ?? 0) > 0);
    if (error) error.hidden = true;
  } catch (problem) {
    if (error) {
      error.textContent = problem.message;
      error.hidden = false;
    }
  }
}

const logoutButton = document.querySelector("#logout-btn");

if (logoutButton) {
  logoutButton.addEventListener("click", () => {
    try {
      AUTH.clearSession();
    } catch (error) {
      const message = document.querySelector("#app-message");
      if (message) {
        message.textContent = error.message;
        message.hidden = false;
      }
      return;
    }
    window.location.href = "logout.php";
  });
}

applyRoleView();

const state = {
  // Tasks, classes and notes are loaded from the database (index.php writes
  // window.STUDYHUB_TASKS / _SCHEDULES / _NOTES); there is no built-in sample data.
  records: [],

  query: "",

  filters: {
    status: "ALL",
    priority: "ALL",
  },

  sort: {
    key: "dueDate",
    direction: "asc",
  },

  page: 1,
  pageSize: 5,
  selectedRecord: null,
  editingRecord: null,
  archivedRecords: [],

  schedules: [],
  editingSchedule: null,

  notes: [],
  editingNote: null,

  auditLog: [],
  preferences: {
    theme: null,
  },
};

const STORAGE_KEY = "studyhub-state-v1";
const SCHEMA_VERSION = 1;
let pendingImport = null;
let persistenceBlocked = false;

function showStorageStatus(message, isError = false) {
  const status = document.querySelector("#storage-status-message");
  if (!status) return;

  status.textContent = message;
  status.hidden = !message;
  status.setAttribute("role", isError ? "alert" : "status");
}

function hasUniqueIds(items) {
  return (
    Array.isArray(items) &&
    items.every((item) => item && typeof item.id === "string" && item.id) &&
    new Set(items.map((item) => item.id)).size === items.length
  );
}

function isValidPayload(payload) {
  if (
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload) ||
    payload.schemaVersion !== SCHEMA_VERSION ||
    typeof payload.savedAt !== "string" ||
    Number.isNaN(Date.parse(payload.savedAt)) ||
    !["super_admin", "admin", "student", "teacher"].includes(payload.activeRole) ||
    (payload.preferences !== undefined &&
      (typeof payload.preferences !== "object" ||
        !["dark", "light", "system"].includes(payload.preferences.theme) ||
        !payload.preferences.filters ||
        !["ALL", ...WORKFLOW_PATH].includes(
          payload.preferences.filters.status,
        ) ||
        !["ALL", "High", "Medium", "Low"].includes(
          payload.preferences.filters.priority,
        ) ||
        !payload.preferences.sort ||
        ![
          "title",
          "subject",
          "dueDate",
          "createdAt",
          "priority",
          "status",
        ].includes(payload.preferences.sort.key) ||
        !["asc", "desc"].includes(payload.preferences.sort.direction) ||
        ![5, 10, 15].includes(payload.preferences.pageSize))) ||
    !Array.isArray(payload.records) ||
    !Array.isArray(payload.archivedRecords) ||
    !Array.isArray(payload.schedules) ||
    !Array.isArray(payload.notes) ||
    (payload.auditLog !== undefined && !Array.isArray(payload.auditLog))
  ) {
    return false;
  }

  const allTasks = [...payload.records, ...payload.archivedRecords];
  if (
    !hasUniqueIds(payload.records) ||
    !hasUniqueIds(payload.archivedRecords) ||
    new Set(allTasks.map((task) => task.id)).size !== allTasks.length ||
    allTasks.some(
      (task) =>
        typeof task.title !== "string" ||
        typeof task.subject !== "string" ||
        typeof task.description !== "string" ||
        typeof task.dueDate !== "string" ||
        !["High", "Medium", "Low"].includes(task.priority) ||
        !WORKFLOW_PATH.includes(task.status) ||
        typeof task.createdAt !== "string" ||
        !Number.isFinite(task.estimatedMinutes) ||
        !Array.isArray(task.workflowHistory),
    ) ||
    payload.schedules.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        ![
          "Monday",
          "Tuesday",
          "Wednesday",
          "Thursday",
          "Friday",
          "Saturday",
          "Sunday",
        ].includes(item.day) ||
        typeof item.startTime !== "string" ||
        typeof item.endTime !== "string" ||
        typeof item.className !== "string" ||
        typeof item.courseCode !== "string" ||
        typeof item.instructor !== "string",
    ) ||
    !hasUniqueIds(payload.schedules) ||
    payload.notes.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        typeof item.title !== "string" ||
        typeof item.body !== "string" ||
        typeof item.remark !== "string",
    ) ||
    !hasUniqueIds(payload.notes) ||
    (Array.isArray(payload.auditLog) &&
      payload.auditLog.some(
        (entry) =>
          !entry ||
          typeof entry.timestamp !== "string" ||
          Number.isNaN(Date.parse(entry.timestamp)) ||
          typeof entry.actor !== "string" ||
          typeof entry.action !== "string" ||
          typeof entry.targetId !== "string" ||
          typeof entry.details !== "string",
      ))
  ) {
    return false;
  }

  return true;
}

function applyPayload(payload) {
  state.records = payload.records;
  state.archivedRecords = payload.archivedRecords;
  state.schedules = payload.schedules;
  state.notes = payload.notes;
  if (Array.isArray(payload.auditLog)) {
    state.auditLog = payload.auditLog.slice(0, 200);
  }
  if (payload.preferences && typeof payload.preferences === 'object') {
    state.filters = { ...payload.preferences.filters };
    state.sort = { ...payload.preferences.sort };
    state.pageSize = payload.preferences.pageSize;
    state.preferences.theme = payload.preferences.theme;
  }
  state.query = "";
  state.page = 1;
  state.selectedRecord = null;
  state.editingRecord = null;
  state.editingSchedule = null;
  state.editingNote = null;
}

function createStoragePayload() {
  return {
    schemaVersion: SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    records: state.records,
    archivedRecords: state.archivedRecords,
    schedules: state.schedules,
    notes: state.notes,
    preferences: {
      theme: state.preferences.theme,
      filters: state.filters,
      sort: state.sort,
      pageSize: state.pageSize,
    },
    activeRole: session.role,
    // auditLog is now server-side (see window.STUDYHUB_AUDIT)
  };
}

function saveState() {
  if (!currentUser || persistenceBlocked) return false;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(createStoragePayload()));
    return true;
  } catch (error) {
    console.error("Unable to save StudyHub state.", error);
    showStorageStatus(
      "StudyHub could not save your data. Check browser storage settings; export a backup if possible.",
      true,
    );
    return false;
  }
}

function restoreState() {
  if (!currentUser) {
    persistenceBlocked = true;
    return;
  }

  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    console.error("Unable to read saved StudyHub state.", error);
    persistenceBlocked = true;
    showStorageStatus(
      "Saved data could not be read. The app is using safe defaults; check browser storage settings.",
      true,
    );
    return;
  }

  if (raw === null) return;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    console.error("Saved StudyHub data is malformed JSON.", error);
    persistenceBlocked = true;
    showStorageStatus(
      "Saved data is malformed. The app is using safe defaults and has left the saved data untouched so it can be recovered.",
      true,
    );
    return;
  }

  if (!isValidPayload(payload)) {
    persistenceBlocked = true;
    showStorageStatus(
      "Saved data is incomplete, invalid, or from an unsupported schema version. The app is using safe defaults and has left the saved data untouched.",
      true,
    );
    return;
  }

  applyPayload(payload);
}

restoreState();

/* Tasks from the database. PHP writes window.STUDYHUB_TASKS in index.php.
   The database is the source of truth: these replace anything in localStorage. */
if (Array.isArray(window.STUDYHUB_TASKS)) {
  state.records = window.STUDYHUB_TASKS.filter((t) => t.status !== "Archived");
  state.archivedRecords = window.STUDYHUB_TASKS.filter(
    (t) => t.status === "Archived",
  );
}

/* Schedules from the database. PHP writes window.STUDYHUB_SCHEDULES in index.php.
   They replace anything saved in localStorage. */
if (Array.isArray(window.STUDYHUB_SCHEDULES)) {
  state.schedules = window.STUDYHUB_SCHEDULES;
}

/* Notes from the database. PHP writes window.STUDYHUB_NOTES in index.php.
   They replace anything saved in localStorage. */
if (Array.isArray(window.STUDYHUB_NOTES)) {
  state.notes = window.STUDYHUB_NOTES;
}

/* Audit log from the database. PHP writes window.STUDYHUB_AUDIT in index.php.
   Replaces the localStorage-only audit trail. */
if (Array.isArray(window.STUDYHUB_AUDIT)) {
  state.auditLog = window.STUDYHUB_AUDIT;
}

/* User preferences from the database. PHP writes window.STUDYHUB_PREFERENCES in index.php.
   Replaces localStorage for theme, filters, sort, page size. */
if (
  window.STUDYHUB_PREFERENCES &&
  typeof window.STUDYHUB_PREFERENCES === "object"
) {
  state.preferences.theme = window.STUDYHUB_PREFERENCES.theme ?? "system";
  state.filters = window.STUDYHUB_PREFERENCES.filters ?? {
    status: "ALL",
    priority: "ALL",
  };
  state.sort = window.STUDYHUB_PREFERENCES.sort ?? {
    key: "dueDate",
    direction: "asc",
  };
  state.pageSize = window.STUDYHUB_PREFERENCES.pageSize ?? 10;
}

function normalize(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function canEditTask(task) {
  return !isFinished(task) && !task.classroomAssignmentId;
}

function showMessage(message) {
  const messageRegion = document.querySelector("#app-message");
  if (!messageRegion) return;

  messageRegion.textContent = message;
  messageRegion.hidden = false;

  // The message floats over the page, so clear it after a short read.
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => {
    messageRegion.hidden = true;
  }, 4500);
}

// Toast notification - shows a temporary message that auto-dismisses
function showToast(message, duration = 2000) {
  const container = document.querySelector("#toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "alert");
  toast.setAttribute("aria-live", "polite");
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("toast-show");
  });

  // Auto-dismiss
  setTimeout(() => {
    toast.classList.remove("toast-show");
    toast.classList.add("toast-hide");
    toast.addEventListener("transitionend", () => toast.remove(), {
      once: true,
    });
  }, duration);
}

/* Search helpers: every word typed must match somewhere in the task
   (title, subject, description, id, tags, priority, status or due date).
   Case, accents and extra spaces are ignored. */
function searchText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchTokens(query) {
  return searchText(query).split(" ").filter(Boolean);
}

/* Returns a relevance score, or -1 when the task does not match. */
function taskSearchScore(task, tokens) {
  if (!tokens.length) return 0;

  const title = searchText(task.title);
  const subject = searchText(task.subject);
  const others = [
    task.id,
    task.description,
    task.priority,
    task.status,
    task.dueDate,
    Array.isArray(task.tags) ? task.tags.join(" ") : task.tags,
  ].map(searchText);

  let score = 0;

  for (const token of tokens) {
    if (title.startsWith(token)) score += 100;
    else if (title.split(" ").some((word) => word.startsWith(token))) score += 80;
    else if (title.includes(token)) score += 60;
    else if (subject.includes(token)) score += 30;
    else if (others.some((value) => value.includes(token))) score += 10;
    else return -1;
  }

  return score;
}

/* Database search (GET api/tasks.php?q=...).
   The last answer is kept here. While the database is still answering a
   new query, the in-browser match above is used so typing stays instant. */
const dbTaskSearch = {
  query: null,       // the query this answer belongs to
  order: new Map(),  // task id -> rank (0 = best match)
  archived: 0,       // matching tasks that are in Archives
  pending: null,     // query being fetched right now
  timer: null,
  seq: 0,
};

function dbSearchReady(query) {
  return dbTaskSearch.query !== null && dbTaskSearch.query === query.trim();
}

function forgetDbSearch() {
  dbTaskSearch.query = null;
  dbTaskSearch.order = new Map();
  dbTaskSearch.archived = 0;
}

/* Ask the database which tasks match. Calls onDone() when the answer arrives
   (only if it is still the latest request). */
async function fetchDbSearch(query, onDone) {
  const q = query.trim();
  if (!q) {
    forgetDbSearch();
    onDone?.();
    return;
  }
  if (dbSearchReady(q) || dbTaskSearch.pending === q) return;

  const seq = ++dbTaskSearch.seq;
  dbTaskSearch.pending = q;
  try {
    const response = await fetch(`api/tasks.php?q=${encodeURIComponent(q)}`, {
      credentials: "same-origin",
    });
    const data = await response.json();
    if (seq !== dbTaskSearch.seq) return;   // a newer search was started
    if (!data.ok) throw new Error(data.message || "Search failed.");
    dbTaskSearch.query = q;
    dbTaskSearch.order = new Map(data.ids.map((id, rank) => [id, rank]));
    dbTaskSearch.archived = Number(data.archived) || 0;
    onDone?.();
  } catch (error) {
    console.warn("[search] database search failed, using local match:", error);
  } finally {
    if (seq === dbTaskSearch.seq) dbTaskSearch.pending = null;
  }
}

/* Debounced: wait until the person pauses typing. */
function scheduleDbSearch(query, onDone) {
  clearTimeout(dbTaskSearch.timer);
  dbTaskSearch.timer = setTimeout(() => fetchDbSearch(query, onDone), 200);
}

function matchesQuery(task) {
  const q = state.query.trim();
  if (!q) return true;
  if (dbSearchReady(q)) return dbTaskSearch.order.has(task.id);
  return taskSearchScore(task, searchTokens(q)) >= 0;
}

function matchesFilters(task) {
  const statusMatches =
    state.filters.status === "ALL" || task.status === state.filters.status;

  const priorityMatches =
    state.filters.priority === "ALL" ||
    task.priority === state.filters.priority;

  return statusMatches && priorityMatches;
}

function priorityRank(priority) {
  const ranks = {
    High: 3,
    Medium: 2,
    Low: 1,
  };

  return ranks[priority] ?? 0;
}

function compareRecords(a, b) {
  const { key, direction } = state.sort;
  let result = 0;

  if (key === "priority") {
    result = priorityRank(a.priority) - priorityRank(b.priority);
  } else if (key === "dueDate" || key === "createdAt") {
    result = new Date(a[key]) - new Date(b[key]);
  } else {
    result = String(a[key]).localeCompare(String(b[key]));
  }

  if (result === 0) {
    result = a.id.localeCompare(b.id);
  }

  return direction === "desc" ? -result : result;
}

function getVisibleRecords() {
  return [...state.records]
    .filter(matchesQuery)
    .filter(matchesFilters)
    .sort(compareRecords);
}

function getCurrentPageRecords(records) {
  const start = (state.page - 1) * state.pageSize;
  return records.slice(start, start + state.pageSize);
}

function getAvailableTransitions(task) {
  const transitions = Object.hasOwn(TRANSITION_MATRIX, task.status)
    ? TRANSITION_MATRIX[task.status]
    : {};

  return Object.entries(transitions).filter(([, transition]) =>
    TRANSITION_CONDITIONS[transition.condition](task),
  );
}

function getWorkflowProgress(status) {
  if (status === "Archived") return 100;

  const stageIndex = PROGRESS_PATH.indexOf(status);
  const finalStageIndex = PROGRESS_PATH.length - 1;

  if (stageIndex < 0) return null;

  return Math.round((stageIndex / finalStageIndex) * 100);
}

function evaluateTransition(task, nextStatus) {
  const availableTransitions = Object.hasOwn(TRANSITION_MATRIX, task.status)
    ? TRANSITION_MATRIX[task.status]
    : {};
  const transition = Object.hasOwn(availableTransitions, nextStatus)
    ? availableTransitions[nextStatus]
    : null;

  if (!transition) {
    return {
      allowed: false,
      message: `Transition from "${task.status}" to "${nextStatus}" is not allowed.`,
    };
  }

  const condition = TRANSITION_CONDITIONS[transition.condition];

  if (!condition(task)) {
    return {
      allowed: false,
      message: `Cannot ${transition.actionLabel.toLowerCase()}: required task details are missing.`,
    };
  }

  return { allowed: true, transition };
}

function attemptTransition(
  task,
  nextStatus,
  timestamp = new Date().toISOString(),
) {
  const result = evaluateTransition(task, nextStatus);

  if (!result.allowed) return result;

  const historyEntry = {
    timestamp,
    previousStatus: task.status,
    nextStatus,
    actionLabel: result.transition.actionLabel,
  };

  return {
    allowed: true,
    record: {
      ...task,
      status: nextStatus,
      workflowHistory: [...(task.workflowHistory ?? []), historyEntry],
    },
    historyEntry,
  };
}

function renderRecords(records) {
  const tableBody = document.querySelector("#task-table-body");

  if (!tableBody) return;

  const pageRecords = getCurrentPageRecords(records);

  tableBody.innerHTML = pageRecords
    .map((task) => {
      const overdue = getIsOverdue(task);

      return `
        <tr data-id="${task.id}">
          <td>${escapeHTML(task.title)}</td>
          <td>${escapeHTML(task.subject)}</td>
          <td>${escapeHTML(task.dueDate)}</td>
          <td>${escapeHTML(task.priority)}</td>
          <td><span class="status-pill ${getStatusClass(task.status)}">${escapeHTML(task.status)}</span></td>
          <td class="${overdue ? "badge-overdue" : ""}">${escapeHTML(getDaysLabel(task))}</td>
          <td>
            <div class="task-actions">
              <button type="button" data-action="view" data-id="${escapeHTML(task.id)}">View</button>
              ${allowedOn(CAPABILITIES.TASK_EDIT_OWN, task) && canEditTask(task) ? `<button type="button" data-action="edit" data-id="${escapeHTML(task.id)}">Edit</button>` : ""}
              ${getAvailableTransitions(task)
                .filter(([, transition]) => transition.row)
                .map(
                  ([nextStatus, transition]) => `
                    <button
                      type="button"
                      class="${transition.emphasis ? "primary-action" : ""}"
                      data-action="transition"
                      data-id="${escapeHTML(task.id)}"
                      data-next-status="${escapeHTML(nextStatus)}"
                    >${escapeHTML(transition.actionLabel)}</button>
                  `,
                )
                .join("")}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderSummary(records) {
  const total = records.length;
  const completed = records.filter(isFinished).length;
  const pending = records.filter((task) => !isFinished(task));

  const priorityTask = [...pending].sort((a, b) => {
    const priorityDifference =
      priorityRank(b.priority) - priorityRank(a.priority);
    if (priorityDifference !== 0) return priorityDifference;
    return new Date(a.dueDate) - new Date(b.dueDate);
  })[0];

  const upcomingCount = records.filter((task) => {
    const days = getDaysRemaining(task);
    return !isFinished(task) && days >= 0 && days <= 7;
  }).length;

  const totalStudyMinutes = records.reduce(
    (sum, task) => sum + task.estimatedMinutes,
    0,
  );

  setText("#summary-total", String(total));
  setText("#summary-completed", String(completed));
  setText("#summary-upcoming", `${upcomingCount} due within 7 days`);
  setText(
    "#summary-priority",
    priorityTask
      ? `${priorityTask.title} (${priorityTask.priority})`
      : "No pending tasks",
  );
  setText(
    "#summary-study-time",
    `${(totalStudyMinutes / 60).toFixed(1)} hours`,
  );
}

/* Dashboard "Next up": the three most urgent unfinished tasks. */
function getDueBadge(task) {
  if (!task.dueDate) return { text: "No due date", tone: "muted" };
  const days = getDaysRemaining(task);
  if (days < 0) {
    const n = Math.abs(days);
    return { text: `Overdue · ${n} day${n === 1 ? "" : "s"}`, tone: "danger" };
  }
  if (days === 0) return { text: "Due today", tone: "warning" };
  if (days === 1) return { text: "Due tomorrow", tone: "warning" };
  const date = new Date(task.dueDate + "T00:00:00").toLocaleDateString(
    undefined,
    { weekday: "short", month: "short", day: "numeric" },
  );
  return { text: `Due ${date}`, tone: "neutral" };
}

function renderNextUp() {
  const list = document.querySelector("#next-up-list");
  if (!list) return;

  const upcoming = state.records
    .filter((task) => !isFinished(task))
    .sort((a, b) => {
      const dueA = getDaysRemaining(a);
      const dueB = getDaysRemaining(b);
      if (dueA !== dueB) return dueA < dueB ? -1 : 1;
      return priorityRank(b.priority) - priorityRank(a.priority);
    })
    .slice(0, 3);

  if (!upcoming.length) {
    list.innerHTML = `
      <li class="next-up-empty">
        <p><strong>You're all caught up.</strong> Add a task to plan your next study session.</p>
      </li>`;
    return;
  }

  list.innerHTML = upcoming
    .map((task) => {
      const badge = getDueBadge(task);
      const [nextStatus, transition] =
        (allowedOn(CAPABILITIES.TASK_STATUS, task) &&
          getAvailableTransitions(task).find(([, t]) => t.row && t.emphasis)) ||
        [];
      return `
        <li class="next-up-item">
          <div class="next-up-text">
            <p class="next-up-title">${escapeHTML(task.title)}</p>
            <p class="next-up-meta">${escapeHTML(task.subject)} · ${escapeHTML(task.status)}</p>
          </div>
          <span class="due-badge" data-tone="${badge.tone}">${escapeHTML(badge.text)}</span>
          ${
            transition
              ? `<button type="button" class="btn" data-action="transition" data-id="${escapeHTML(task.id)}" data-next-status="${escapeHTML(nextStatus)}">${escapeHTML(transition.actionLabel)}</button>`
              : ""
          }
        </li>`;
    })
    .join("");
}

function percentOf(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

function computeMetrics(records) {
  const total = records.length;
  // Completion rate: finished tasks (Done or Archived) divided by all tasks.
  const done = records.filter(isFinished).length;
  // In-progress count: tasks whose current workflow status is "In progress".
  const inProgress = records.filter(
    (task) => task.status === "In progress",
  ).length;
  // Pending means any task not yet Done or Archived.
  const pending = records.filter((task) => !isFinished(task));
  // Overdue rate: overdue pending tasks divided by all pending tasks.
  const overdue = pending.filter(getIsOverdue).length;
  // Average study time: sum of pending estimated minutes divided by pending count.
  const pendingMinutes = pending.reduce(
    (sum, task) => sum + task.estimatedMinutes,
    0,
  );

  return {
    total,
    done,
    inProgress,
    pendingCount: pending.length,
    overdue,
    pendingMinutes,
    completionRate: percentOf(done, total),
    overdueRate: percentOf(overdue, pending.length),
    avgMinutes:
      pending.length > 0 ? Math.round(pendingMinutes / pending.length) : 0,
    byStatus: WORKFLOW_PATH.map((label) => ({
      label,
      count: records.filter((task) => task.status === label).length,
    })),
    byPriority: ["High", "Medium", "Low"].map((label) => ({
      label,
      count: records.filter((task) => task.priority === label).length,
    })),
  };
}

function runDashboardMetricAssertions() {
  const fixture = [
    {
      status: "Done",
      priority: "High",
      dueDate: "2999-01-01",
      estimatedMinutes: 30,
    },
    {
      status: "Archived",
      priority: "Medium",
      dueDate: "2999-01-01",
      estimatedMinutes: 60,
    },
    {
      status: "In progress",
      priority: "Low",
      dueDate: "2000-01-01",
      estimatedMinutes: 60,
    },
    {
      status: "To do",
      priority: "High",
      dueDate: "2999-01-01",
      estimatedMinutes: 30,
    },
  ];
  const metrics = computeMetrics(fixture);
  const emptyMetrics = computeMetrics([]);

  const checks = [
    metrics.total === 4,
    metrics.done === 2,
    metrics.completionRate === 50,
    metrics.pendingCount === 2,
    metrics.inProgress === 1,
    metrics.overdue === 1,
    metrics.overdueRate === 50,
    metrics.avgMinutes === 45,
    metrics.byStatus.reduce((sum, row) => sum + row.count, 0) === metrics.total,
    metrics.byPriority.reduce((sum, row) => sum + row.count, 0) ===
      metrics.total,
    emptyMetrics.total === 0 &&
      emptyMetrics.completionRate === 0 &&
      emptyMetrics.overdueRate === 0 &&
      emptyMetrics.avgMinutes === 0 &&
      [...emptyMetrics.byStatus, ...emptyMetrics.byPriority].every(
        (row) => row.count === 0,
      ),
  ];

  checks.forEach((passed, index) => {
    console.assert(passed, `Unit 9 metric assertion ${index + 1} failed.`);
  });
  console.log(
    `Unit 9 dashboard assertions completed (${checks.length} checks).`,
  );
}

const QA_WEIGHTS = {
  F: 0.3,
  R: 0.2,
  A: 0.2,
  V: 0.15,
  C: 0.15,
};

function computeQualityScore(results) {
  const grouped = Object.fromEntries(
    Object.keys(QA_WEIGHTS).map((category) => [category, []]),
  );

  results.forEach((entry) => {
    if (grouped[entry.category]) grouped[entry.category].push(entry.passed);
  });

  const categoryScore = (category) => {
    const checks = grouped[category];
    if (!checks || checks.length === 0) return 100;
    const passed = checks.filter(Boolean).length;
    return (passed / checks.length) * 100;
  };

  const score = Object.entries(QA_WEIGHTS).reduce(
    (total, [category, weight]) => total + categoryScore(category) * weight,
    0,
  );

  return Math.round(score);
}

function computeCategoryScores(results) {
  return Object.fromEntries(
    Object.keys(QA_WEIGHTS).map((category) => {
      const categoryResults = results.filter(
        (entry) => entry.category === category,
      );
      const passed = categoryResults.filter((entry) => entry.passed).length;
      const score = categoryResults.length
        ? Math.round((passed / categoryResults.length) * 100)
        : 100;
      return [category, score];
    }),
  );
}

function runQualityAssuranceSuite() {
  const originalBlocked = persistenceBlocked;

  const runTest = (
    testId,
    category,
    precondition,
    action,
    expected,
    evaluator,
  ) => {
    let passed = false;
    try {
      passed = Boolean(evaluator());
    } catch (error) {
      console.error(`QA test ${testId} failed to complete.`, error);
    }
    return {
      id: testId,
      category,
      precondition,
      action,
      expected,
      passed,
    };
  };

  const results = [
    runTest(
      "F-01",
      "F",
      "Fresh task list",
      "Attempt invalid transition: To do → Archived",
      "Rejected",
      () =>
        !evaluateTransition(
          {
            status: "To do",
            title: "Task",
            subject: "Math",
            dueDate: "2026-10-30",
          },
          "Archived",
        ).allowed,
    ),
    runTest(
      "F-02",
      "F",
      "Task with required fields",
      "Allow valid transition: To do → In progress",
      "Accepted",
      () =>
        evaluateTransition(
          {
            status: "To do",
            title: "Task",
            subject: "Math",
            dueDate: "2026-10-30",
          },
          "In progress",
        ).allowed,
    ),
    runTest(
      "R-01",
      "R",
      "Malformed stored JSON",
      "Restore state after parse failure",
      "Recovery mode enabled",
      () => {
        let originalStorageValue;
        let changedStorage = false;
        const statusElement = document.querySelector("#storage-status-message");
        const previousStatus = statusElement
          ? {
              text: statusElement.textContent,
              hidden: statusElement.hidden,
              role: statusElement.getAttribute("role"),
            }
          : null;
        try {
          originalStorageValue = localStorage.getItem(STORAGE_KEY);
          localStorage.setItem(STORAGE_KEY, "{bad json");
          changedStorage = true;
          persistenceBlocked = false;
          restoreState();
          return persistenceBlocked === true;
        } catch (error) {
          console.error("Unable to run QA storage-recovery check.", error);
          return false;
        } finally {
          persistenceBlocked = originalBlocked;
          if (changedStorage) {
            try {
              if (originalStorageValue === null) {
                localStorage.removeItem(STORAGE_KEY);
              } else {
                localStorage.setItem(STORAGE_KEY, originalStorageValue);
              }
            } catch (error) {
              console.error("Unable to restore storage after QA check.", error);
              throw new Error(
                "QA storage check could not restore saved data.",
                {
                  cause: error,
                },
              );
            }
          }
          if (statusElement && previousStatus) {
            statusElement.textContent = previousStatus.text;
            statusElement.hidden = previousStatus.hidden;
            if (previousStatus.role === null) {
              statusElement.removeAttribute("role");
            } else {
              statusElement.setAttribute("role", previousStatus.role);
            }
          }
        }
      },
    ),
    runTest(
      "A-01",
      "A",
      "Generic system event",
      "Log an audit entry",
      "Entry recorded with actor and timestamp",
      () => {
        const before = [...state.auditLog];
        try {
          logAudit("STATUS_CHANGE", "QA-TEST", "Admin QA pass");
          const entry = state.auditLog[0];
          return (
            state.auditLog.length === Math.min(before.length + 1, 200) &&
            entry.action === "STATUS_CHANGE" &&
            entry.targetId === "QA-TEST" &&
            entry.actor === session.displayName &&
            Number.isFinite(Date.parse(entry.timestamp))
          );
        } finally {
          state.auditLog = before;
        }
      },
    ),
    runTest(
      "V-01",
      "V",
      "Unsupported schema payload",
      "Validate imported data",
      "Rejected as invalid",
      () =>
        !isValidPayload({
          schemaVersion: 999,
          records: [],
          archivedRecords: [],
          schedules: [],
          notes: [],
          preferences: {
            theme: "light",
            filters: { status: "ALL", priority: "ALL" },
            sort: { key: "dueDate", direction: "asc" },
            pageSize: 10,
          },
          activeRole: "student",
          auditLog: [],
        }),
    ),
    runTest(
      "V-02",
      "V",
      "Duplicate task IDs in payload",
      "Reject invalid record set",
      "Rejected before import",
      () =>
        !isValidPayload({
          schemaVersion: 1,
          savedAt: new Date().toISOString(),
          records: [
            {
              id: "TASK-1",
              title: "X",
              subject: "Math",
              description: "First duplicate",
              dueDate: "2026-10-30",
              priority: "High",
              status: "To do",
              createdAt: "2026-10-16T00:00:00.000Z",
              estimatedMinutes: 30,
              workflowHistory: [],
            },
            {
              id: "TASK-1",
              title: "Y",
              subject: "Math",
              description: "Second duplicate",
              dueDate: "2026-10-30",
              priority: "High",
              status: "Done",
              createdAt: "2026-10-16T00:00:00.000Z",
              estimatedMinutes: 30,
              workflowHistory: [],
            },
          ],
          archivedRecords: [],
          schedules: [],
          notes: [],
          preferences: {
            theme: "light",
            filters: { status: "ALL", priority: "ALL" },
            sort: { key: "dueDate", direction: "asc" },
            pageSize: 10,
          },
          activeRole: "student",
          auditLog: [],
        }),
    ),
    runTest(
      "C-01",
      "C",
      "Empty task collection",
      "Compute dashboard totals",
      "Zero figures and no NaN/Infinity",
      () => {
        const empty = computeMetrics([]);
        return (
          empty.total === 0 &&
          empty.completionRate === 0 &&
          empty.overdueRate === 0 &&
          empty.avgMinutes === 0 &&
          Number.isFinite(empty.completionRate) &&
          Number.isFinite(empty.overdueRate) &&
          Number.isFinite(empty.avgMinutes)
        );
      },
    ),
  ];

  const score = computeQualityScore(results);
  return { results, score, categoryScores: computeCategoryScores(results) };
}

function renderAdminQA(suite) {
  if (!suite) return;

  const scoreElement = document.querySelector("#admin-qa-quality-score");
  const resultBody = document.querySelector("#admin-qa-test-results-body");
  const lastRun = document.querySelector("#admin-qa-last-run");

  if (scoreElement) {
    scoreElement.textContent = `${suite.score}%`;
  }

  Object.entries(suite.categoryScores).forEach(([category, score]) => {
    const element = document.querySelector(
      `[data-qa-category-score="${category}"]`,
    );
    if (element) element.textContent = `${score}%`;
  });

  if (lastRun) {
    const passedCount = suite.results.filter((entry) => entry.passed).length;
    lastRun.textContent = `Last run: ${new Date().toLocaleString()}. ${passedCount} of ${suite.results.length} checks passed.`;
  }

  if (!resultBody) return;

  resultBody.innerHTML = suite.results
    .map(
      (entry) => `
        <tr>
          <td>${escapeHTML(entry.id)}</td>
          <td>${escapeHTML(entry.category)}</td>
          <td>${escapeHTML(entry.precondition)}</td>
          <td>${escapeHTML(entry.action)}</td>
          <td>${escapeHTML(entry.expected)}</td>
          <td>
            <span class="status-pill ${entry.passed ? "status-done" : "status-archived"}">
              ${entry.passed ? "Pass" : "Fail"}
            </span>
          </td>
        </tr>
      `,
    )
    .join("");
}

document.querySelector("#admin-qa-run")?.addEventListener("click", () => {
  renderAdminQA(runQualityAssuranceSuite());
});

// Bar colours mapped by label (matches [data-tone] in style.css)
const BAR_TONES = {
  "To do": "neutral",
  "In progress": "info",
  "In review": "purple",
  Done: "success",
  Archived: "muted",
  High: "danger",
  Medium: "warning",
  Low: "info",
};

function renderDistributionBars(selector, rows, total) {
  const container = document.querySelector(selector);
  if (!container) return;

  container.innerHTML = rows
    .map(({ label, count }) => {
      const percent = percentOf(count, total);
      return `
        <div class="bar-row" data-tone="${BAR_TONES[label] ?? "brand"}">
          <span class="bar-label">${escapeHTML(label)}</span>
          <div class="bar-track" role="img" aria-label="${escapeHTML(label)}: ${count} of ${total} tasks (${percent}%)">
            <span class="bar-fill" style="width: ${percent}%"></span>
          </div>
          <span class="bar-count">${count} <small>${percent}%</small></span>
        </div>
      `;
    })
    .join("");
}

function setMeter(selector, percent) {
  const element = document.querySelector(selector);
  if (element) element.style.width = `${percent}%`;
}

function renderMetrics(records) {
  const m = computeMetrics(records);

  setText("#metric-completion-rate", `${m.completionRate}%`);
  setText("#metric-avg-time", `${m.avgMinutes} min`);
  setText("#metric-overdue-rate", `${m.overdueRate}%`);
  setText("#metric-in-progress-count", String(m.inProgress));
  setMeter("#metric-completion-meter", m.completionRate);
  setMeter("#metric-overdue-meter", m.overdueRate);

  renderDistributionBars("#status-distribution-bars", m.byStatus, m.total);
  renderDistributionBars("#priority-distribution-bars", m.byPriority, m.total);
}

function renderArchives() {
  setText("#open-archives", `Archives (${state.archivedRecords.length})`);

  const body = document.querySelector("#archive-table-body");
  if (!body) return;

  const archivedAt = (task) => task.workflowHistory?.at(-1)?.timestamp ?? "";
  /* Newest first. Reversing before the (stable) sort makes ties favor the
     task that was archived later. */
  const rows = [...state.archivedRecords]
    .reverse()
    .sort((a, b) => archivedAt(b).localeCompare(archivedAt(a)));

  const empty = document.querySelector("#archive-empty-state");
  const wrapper = document.querySelector("#archive-table-wrapper");
  if (empty) empty.hidden = rows.length > 0;
  if (wrapper) wrapper.hidden = rows.length === 0;

  body.innerHTML = rows
    .map((task) => {
      const history = task.workflowHistory ?? [];
      const when = archivedAt(task);

      /* Second step of a delete: the row turns into a confirmation. */
      if (archiveDeleteId === task.id) {
        return `
        <tr data-id="${escapeHTML(task.id)}" class="archive-confirm-row">
          <td colspan="7">
            <div class="archive-confirm">
              <p>
                <strong>Delete “${escapeHTML(task.title)}” permanently?</strong>
                Its history will be removed and it will no longer count toward
                your total tasks or completion rate. This can't be undone.
              </p>
              <div class="task-actions">
                <button type="button" data-archive-action="cancel">Cancel</button>
                <button type="button" class="btn-danger" data-archive-action="confirm" data-id="${escapeHTML(task.id)}">Delete permanently</button>
              </div>
            </div>
          </td>
        </tr>
      `;
      }

      return `
        <tr data-id="${escapeHTML(task.id)}">
          <td>${escapeHTML(task.title)}</td>
          <td>${escapeHTML(task.subject)}</td>
          <td>${escapeHTML(task.dueDate)}</td>
          <td>${escapeHTML(task.priority)}</td>
          <td class="nowrap">${when ? escapeHTML(new Date(when).toLocaleString()) : "—"}</td>
          <td>
            <details class="archive-history">
              <summary>History (${history.length})</summary>
              <ol>
                ${history
                  .map(
                    (entry) =>
                      `<li>${escapeHTML(new Date(entry.timestamp).toLocaleString())}: ${escapeHTML(entry.previousStatus)} &rarr; ${escapeHTML(entry.nextStatus)} (${escapeHTML(entry.actionLabel)})</li>`,
                  )
                  .join("")}
              </ol>
            </details>
          </td>
          <td>
            <button type="button" class="btn-danger" data-archive-action="delete" data-id="${escapeHTML(task.id)}" aria-label="Delete ${escapeHTML(task.title)}">Delete</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

/* ---------- Deleting archived tasks ---------- */

function setArchiveStatus(message, isError = false) {
  const status = document.querySelector("#archive-status");
  if (!status) return;
  status.textContent = message;
  status.hidden = !message;
  status.classList.toggle("is-error", isError);
}

// Re-render the archive table, then move keyboard focus somewhere sensible.
function rerenderArchives(focusSelector) {
  renderArchives();
  const body = document.querySelector("#archive-table-body");
  const target =
    (focusSelector && body?.querySelector(focusSelector)) ||
    body?.querySelector('[data-archive-action="delete"]') ||
    document.querySelector("#close-archives");
  target?.focus();
}

async function deleteArchivedTask(id) {
  const task = state.archivedRecords.find((record) => record.id === id);
  if (!task) return;

  if (!allowed(CAPABILITIES.TASK_ARCHIVE)) {
    setArchiveStatus("You don't have permission to delete tasks.", true);
    return;
  }

  const confirmButton = document.querySelector(
    '#archive-table-body [data-archive-action="confirm"]',
  );
  if (confirmButton) {
    confirmButton.disabled = true;
    confirmButton.textContent = "Deleting…";
  }

  /* Permanent, so the server goes first: the task only disappears here
     once the database has really removed it. */
  let message = "";
  try {
    const response = await fetch("api/tasks.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action: "delete", id }),
    });
    const data = await response.json();
    if (!data.ok) message = data.message || "Delete failed.";
  } catch {
    message = "Could not reach the server.";
  }

  if (message) {
    setArchiveStatus(`Could not delete the task: ${message}`, true);
    rerenderArchives('[data-archive-action="confirm"]');
    return;
  }

  state.archivedRecords = state.archivedRecords.filter(
    (record) => record.id !== id,
  );
  archiveDeleteId = null;
  refreshDbSearchAfterChange();
  logAudit("DELETE", id, `Deleted archived task: ${task.title}`);
  render();
  setArchiveStatus(`Deleted “${task.title}”.`);
  rerenderArchives();
}

document.querySelector("#archive-table-body")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-archive-action]");
  if (!button) return;

  const { archiveAction, id } = button.dataset;

  if (archiveAction === "delete") {
    archiveDeleteId = id;
    setArchiveStatus("");
    rerenderArchives('[data-archive-action="cancel"]');
  }

  if (archiveAction === "cancel") {
    const cancelledId = archiveDeleteId;
    archiveDeleteId = null;
    rerenderArchives(`[data-archive-action="delete"][data-id="${cancelledId}"]`);
  }

  if (archiveAction === "confirm") {
    deleteArchivedTask(id);
  }
});

function renderEmptyState(records) {
  const emptyState = document.querySelector("#task-empty-state");
  const taskList = document.querySelector("#task-list");

  if (!emptyState || !taskList) return;

  const isEmpty = records.length === 0;

  /* Keep the list header (and its Archives button) visible; only hide the
     table and pagination when there is nothing to show. */
  taskList.querySelector(".table-wrapper").hidden = isEmpty;
  taskList.querySelector("#task-pagination").hidden = isEmpty;
  taskList.querySelector("#task-result-count").hidden = isEmpty;

  emptyState.hidden = !isEmpty;
  if (isEmpty) {
    emptyState.textContent =
      state.records.length === 0
        ? "No active tasks. Finished tasks you archived are in Archives."
        : "No tasks match the current search or filters.";
  }
}

function renderDetails() {
  const details = document.querySelector("#task-details");

  if (!details) return;

  if (!state.selectedRecord) {
    details.innerHTML = `
      <h3 id="task-details-title">Task details</h3>
      <p>Select a task to inspect its full record.</p>
    `;
    return;
  }

  const task = state.records.find(
    (record) => record.id === state.selectedRecord,
  );

  if (!task) {
    state.selectedRecord = null;
    renderDetails();
    return;
  }

  const progress = getWorkflowProgress(task.status) ?? 0;
  const history = [...(task.workflowHistory ?? [])].reverse();
  const progressMarkup = `
          <label for="workflow-progress">${progress}% complete</label>
          <progress id="workflow-progress" max="100" value="${progress}">${progress}%</progress>
          <p>Step ${WORKFLOW_PATH.indexOf(task.status) + 1} of ${WORKFLOW_PATH.length}: ${escapeHTML(task.status)}.</p>
        `;
  const historyMarkup = history.length
    ? `<ol>
        ${history
          .map(
            (entry) => `
              <li>
                <time datetime="${escapeHTML(entry.timestamp)}">${escapeHTML(
                  new Date(entry.timestamp).toLocaleString(),
                )}</time>:
                ${escapeHTML(entry.previousStatus)} &rarr; ${escapeHTML(
                  entry.nextStatus,
                )} (${escapeHTML(entry.actionLabel)})
              </li>
            `,
          )
          .join("")}
      </ol>`
    : "<p>No status changes yet.</p>";
  const editing = state.editingRecord === task.id && canEditTask(task);
  const editMarkup = editing
    ? `
        <form id="task-edit-form" data-id="${escapeHTML(task.id)}">
          <label for="edit-title">Title</label>
          <input id="edit-title" name="title" required value="${escapeHTML(task.title)}" />
          <label for="edit-subject">Subject</label>
          <input id="edit-subject" name="subject" required value="${escapeHTML(task.subject)}" />
          <label for="edit-due-date">Due date</label>
          <input id="edit-due-date" name="dueDate" type="date" required value="${escapeHTML(task.dueDate)}" />
          <label for="edit-priority">Priority</label>
          <select id="edit-priority" name="priority">
            ${["Low", "Medium", "High"]
              .map(
                (priority) =>
                  `<option value="${priority}" ${task.priority === priority ? "selected" : ""}>${priority}</option>`,
              )
              .join("")}
          </select>
          <label for="edit-description">Description</label>
          <textarea id="edit-description" name="description" rows="3">${escapeHTML(task.description)}</textarea>
          <button type="submit">Save changes</button>
          <button type="button" data-action="cancel-edit">Cancel</button>
        </form>
      `
    : "";

  const transitionMarkup = editing
    ? ""
    : `<div class="task-actions detail-actions">
        ${getAvailableTransitions(task)
          .map(
            ([nextStatus, transition]) => `
              <button type="button" class="${transition.emphasis ? "primary-action" : ""}" data-action="transition" data-id="${escapeHTML(task.id)}" data-next-status="${escapeHTML(nextStatus)}">${escapeHTML(transition.actionLabel)}</button>
            `,
          )
          .join("")}
        ${allowedOn(CAPABILITIES.TASK_EDIT_OWN, task) && canEditTask(task) ? `<button type="button" data-action="edit" data-id="${escapeHTML(task.id)}">Edit task</button>` : ""}
      </div>`;

  details.innerHTML = `
    <h3 id="task-details-title">Task details</h3>
    <dl>
      <dt>ID</dt>
      <dd>${escapeHTML(task.id)}</dd>

      <dt>Title</dt>
      <dd>${escapeHTML(task.title)}</dd>

      <dt>Subject</dt>
      <dd>${escapeHTML(task.subject)}</dd>

      <dt>Description</dt>
      <dd>${escapeHTML(task.description)}</dd>

      <dt>Due date</dt>
      <dd>${escapeHTML(task.dueDate)}</dd>

      <dt>Priority</dt>
      <dd>${escapeHTML(task.priority)}</dd>

      <dt>Status</dt>
      <dd><span class="status-pill ${getStatusClass(task.status)}">${escapeHTML(task.status)}</span></dd>

      <dt>Created</dt>
      <dd>${escapeHTML(task.createdAt)}</dd>

      <dt>Estimated study time</dt>
      <dd>${getStudyHours(task).toFixed(1)} hours</dd>

      <dt>Time left</dt>
      <dd>${escapeHTML(getDaysLabel(task))}</dd>
    </dl>
    <section class="workflow-history" aria-labelledby="workflow-history-title">
      <h4 id="workflow-history-title">Progress</h4>
      ${progressMarkup}
      <h4>History</h4>
      ${historyMarkup}
    </section>
    ${transitionMarkup}
    ${editMarkup}
  `;
}

function renderPagination(totalRecords) {
  const pagination = document.querySelector("#task-pagination");
  if (!pagination) return;

  const totalPages = Math.max(1, Math.ceil(totalRecords / state.pageSize));

  if (state.page > totalPages) {
    state.page = totalPages;
  }

  pagination.innerHTML = `
    <button type="button" data-page-action="previous" ${state.page === 1 ? "disabled" : ""}>
      Previous
    </button>
    <span>Page ${state.page} of ${totalPages}</span>
    <button type="button" data-page-action="next" ${state.page === totalPages ? "disabled" : ""}>
      Next
    </button>
  `;
}

function renderResultCount(totalRecords) {
  const count = document.querySelector("#task-result-count");
  if (!count) return;

  if (totalRecords === 0) {
    count.textContent = "Showing 0 matching tasks.";
    return;
  }

  const start = (state.page - 1) * state.pageSize + 1;
  const end = Math.min(state.page * state.pageSize, totalRecords);

  count.textContent = `Showing ${start}-${end} of ${totalRecords} matching tasks.`;
}

function render() {
  const visibleRecords = getVisibleRecords();

  renderSummary(getAllTasks());
  renderNextUp();
  renderMetrics(getAllTasks());
  renderEmptyState(visibleRecords);
  renderRecords(visibleRecords);
  renderPagination(visibleRecords.length);
  renderResultCount(visibleRecords.length);
  renderDetails();
  renderArchives();
  renderAuditLog();
  renderSchedules();
  renderNotes();
  saveState();
}

// Returns active + archived tasks (archived live separately but count in totals)
function getAllTasks() {
  return [...state.records, ...state.archivedRecords];
}

function generateTaskId() {
  const numericIds = getAllTasks()
    .map((task) => Number(task.id.replace("TASK-", "")))
    .filter(Number.isFinite);

  const nextNumber = (numericIds.length ? Math.max(...numericIds) : 0) + 1;
  return `TASK-${String(nextNumber).padStart(3, "0")}`;
}

/* Send a change to the database (api/tasks.php).
   Returns the answer from PHP, or null if the save failed. */
async function saveToServer(payload) {
  try {
    const response = await fetch("api/tasks.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "Save failed.");
    refreshDbSearchAfterChange();
    return data;
  } catch (error) {
    showMessage(`Could not save to the database: ${error.message}`);
    return null;
  }
}

/* A task changed in the database, so the last search answer may be out of date. */
function refreshDbSearchAfterChange() {
  forgetDbSearch();
  dbTaskSearch.seq++;   // ignore any answer already on its way
  dbTaskSearch.pending = null;
  const q = state.query.trim() || searchInput?.value.trim() || "";
  if (q) fetchDbSearch(q, () => render());
}

/* Send a schedule change to the database (api/schedules.php).
   Returns the answer from PHP, or null if the save failed. */
async function saveScheduleToServer(payload) {
  try {
    const response = await fetch("api/schedules.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "Save failed.");
    return data;
  } catch (error) {
    showMessage(`Could not save to the database: ${error.message}`);
    return null;
  }
}

/* Send a note change to the database (api/notes.php).
   Returns the answer from PHP, or null if the save failed. */
async function saveNoteToServer(payload) {
  try {
    const response = await fetch("api/notes.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "Save failed.");
    return data;
  } catch (error) {
    showMessage(`Could not save to the database: ${error.message}`);
    return null;
  }
}

/* Send a preferences change to the database (api/preferences.php).
   Returns the answer from PHP, or null if the save failed. */
async function savePreferencesToServer(payload) {
  try {
    const response = await fetch("api/preferences.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "Save failed.");
    return data;
  } catch (error) {
    showMessage(`Could not save preferences: ${error.message}`);
    return null;
  }
}

function addTask(task) {
  if (!allowed(CAPABILITIES.TASK_CREATE)) {
    showMessage("You don't have permission to create tasks.");
    return false;
  }

  state.records = [...state.records, task];
  logAudit("CREATE", task.id, task.title);
  state.page = 1;
  render();

  /* Save in the database. PHP gives the task its real ID. */
  saveToServer({ action: "create", task }).then((data) => {
    if (data && data.id && data.id !== task.id) {
      state.records = state.records.map((record) =>
        record.id === task.id ? { ...record, id: data.id } : record,
      );
      render();
    }
  });
  return true;
}

function updateTask(id, updates) {
  const task = state.records.find((record) => record.id === id);

  if (!task || !allowedOn(CAPABILITIES.TASK_EDIT_OWN, task)) {
    showMessage("Completed tasks can't be edited.");
    return false;
  }

  if (!updates.title.trim() || !updates.subject.trim() || !updates.dueDate) {
    showMessage("Title, subject, and due date are required.");
    return false;
  }

  state.records = state.records.map((record) =>
    record.id === id ? { ...record, ...updates } : record,
  );
  state.editingRecord = null;
  logAudit("UPDATE", id, "Task details edited");
  showMessage(`${id} was updated.`);
  render();
  saveToServer({ action: "update", id, updates });
  return true;
}

function transitionTask(id, nextStatus) {
  const task = state.records.find((record) => record.id === id);

  if (!task) {
    showMessage(
      state.archivedRecords.some((record) => record.id === id)
        ? "Archived tasks can't be changed."
        : `Task "${id}" was not found.`,
    );
    return false;
  }

  const isArchiving = nextStatus === "Archived";
  const requiredCapability = isArchiving
    ? CAPABILITIES.TASK_ARCHIVE
    : CAPABILITIES.TASK_STATUS;

  if (!allowedOn(requiredCapability, task)) {
    showMessage("You don't have permission to change this task's status.");
    return false;
  }

  const result = attemptTransition(task, nextStatus);

  if (!result.allowed) {
    showWorkflowMessage(`${result.message} No change was made.`);
    return false;
  }

  const archiving = result.record.status === "Archived";

  if (archiving) {
    /* Archived is the end of the workflow: the task leaves the working list
       and is kept, history included, in the Archives table. */
    state.records = state.records.filter((record) => record.id !== id);
    state.archivedRecords = [...state.archivedRecords, result.record];

    if (state.selectedRecord === id) {
      state.selectedRecord = null;
      state.editingRecord = null;
    }
  } else {
    state.records = state.records.map((record) =>
      record.id === id ? result.record : record,
    );
  }

  logAudit(
    archiving ? "ARCHIVE" : "STATUS_CHANGE",
    id,
    `${result.historyEntry.previousStatus} → ${result.historyEntry.nextStatus}`,
  );
  showWorkflowMessage(
    `${id}: ${result.historyEntry.previousStatus} → ${result.historyEntry.nextStatus} (${result.historyEntry.actionLabel}).${archiving ? " Moved to Archives." : ""}`,
  );
  render();
  saveToServer({
    action: "status",
    id,
    status: result.record.status,
    actionLabel: result.historyEntry.actionLabel,
  });
  return true;
}

function logAudit(action, targetId, details) {
  const entry = {
    timestamp: new Date().toISOString(),
    actor: session.displayName,
    action,
    targetId,
    details,
  };

  state.auditLog = [entry, ...state.auditLog].slice(0, 200);
}

function renderAuditLog() {
  const body = document.querySelector("#audit-log-body");
  if (!body) return;

  body.innerHTML = state.auditLog.length
    ? state.auditLog
        .map(
          (entry) => `
            <tr>
              <td class="nowrap">${escapeHTML(new Date(entry.timestamp).toLocaleString())}</td>
              <td>${escapeHTML(entry.actor)}</td>
              <td>${escapeHTML(entry.action)}</td>
              <td>${escapeHTML(entry.targetId)}</td>
              <td>${escapeHTML(entry.details)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">No actions recorded yet.</td></tr>`;
}

const SCHEDULE_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

function formatTime(value) {
  const [h, m] = String(value).split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return value;
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function generateScheduleId() {
  const numbers = state.schedules
    .map((item) => Number(item.id.replace("SCH-", "")))
    .filter(Number.isFinite);
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `SCH-${String(next).padStart(3, "0")}`;
}

// Returns error string or "" if valid
function validateSchedule(entry, ignoreId = null) {
  if (!SCHEDULE_DAYS.includes(entry.day)) return "Choose a valid day.";
  if (!entry.startTime || !entry.endTime)
    return "Start and end time are required.";
  if (!entry.className) return "Class name is required.";
  if (entry.endTime <= entry.startTime)
    return "End time must be after the start time.";

  const clash = state.schedules.find(
    (item) =>
      item.id !== ignoreId &&
      item.day === entry.day &&
      entry.startTime < item.endTime &&
      entry.endTime > item.startTime,
  );

  if (clash) {
    return `This overlaps with ${clash.className} (${formatTime(clash.startTime)}–${formatTime(clash.endTime)}) on ${clash.day}.`;
  }

  return "";
}

function addSchedule(entry) {
  if (!allowed(CAPABILITIES.CLASS_CREATE)) return "Not permitted.";

  const error = validateSchedule(entry);
  if (error) return error;

  const record = { id: generateScheduleId(), ...entry };
  state.schedules = [...state.schedules, record];
  logAudit(
    "CREATE",
    record.id,
    `Schedule: ${record.className} (${record.day})`,
  );
  showMessage(`${record.id} was added.`);
  render();
  renderScheduleForm();

  /* Save in the database. PHP gives the schedule its real ID. */
  saveScheduleToServer({ action: "create", schedule: record }).then((data) => {
    if (data && data.id && data.id !== record.id) {
      state.schedules = state.schedules.map((s) =>
        s.id === record.id ? { ...s, id: data.id } : s,
      );
      render();
    }
  });

  return "";
}

function updateSchedule(id, updates) {
  if (!allowed(CAPABILITIES.CLASS_CREATE)) return "Not permitted.";

  const existing = state.schedules.find((item) => item.id === id);
  if (!existing) return `Schedule "${id}" was not found.`;

  const error = validateSchedule(updates, id);
  if (error) return error;

  state.schedules = state.schedules.map((item) =>
    item.id === id ? { ...item, ...updates } : item,
  );
  state.editingSchedule = null;
  logAudit("UPDATE", id, `Schedule: ${updates.className} (${updates.day})`);
  showMessage(`${id} was updated.`);
  render();
  renderScheduleForm();

  /* Save in the database. */
  saveScheduleToServer({ action: "update", id, updates });

  return "";
}

function deleteSchedule(id) {
  if (!allowed(CAPABILITIES.CLASS_CREATE)) return false;

  const existing = state.schedules.find((item) => item.id === id);
  if (!existing) {
    showMessage(`Schedule "${id}" was not found.`);
    return false;
  }

  const wasEditing = state.editingSchedule === id;
  state.schedules = state.schedules.filter((item) => item.id !== id);
  if (wasEditing) state.editingSchedule = null;
  logAudit("DELETE", id, `Schedule: ${existing.className} (${existing.day})`);
  showMessage(`${id} was deleted.`);
  render();
  if (wasEditing) renderScheduleForm();

  /* Save in the database. */
  saveScheduleToServer({ action: "delete", id });

  return true;
}

function renderScheduleForm() {
  const form = document.querySelector("#schedule-form");
  if (!form) return;

  const editing = state.schedules.find(
    (item) => item.id === state.editingSchedule,
  );
  const submit = document.querySelector("#schedule-submit");
  const cancel = document.querySelector("#schedule-cancel");
  const title = document.querySelector("#schedule-form-title");

  if (editing) {
    form.elements.id.value = editing.id;
    form.elements.day.value = editing.day;
    form.elements.startTime.value = editing.startTime;
    form.elements.endTime.value = editing.endTime;
    form.elements.className.value = editing.className;
    form.elements.courseCode.value = editing.courseCode;
    form.elements.instructor.value = editing.instructor;
  } else {
    form.reset();
    form.elements.id.value = "";
  }

  if (submit) submit.textContent = editing ? "Save changes" : "Add class";
  if (cancel) cancel.hidden = !editing;
  if (title)
    title.textContent = editing ? `Edit class (${editing.id})` : "Add class";
}

function renderSchedules() {
  const body = document.querySelector("#schedule-table-body");
  if (!body) return;

  const actions = (item) => `
    <td class="schedule-actions-column">
      <div class="task-actions">
        <button type="button" data-schedule-action="edit" data-id="${escapeHTML(item.id)}">Edit</button>
        <button type="button" class="btn-danger" data-schedule-action="delete" data-id="${escapeHTML(item.id)}">Delete</button>
      </div>
    </td>`;

  const rows = [];

  SCHEDULE_DAYS.forEach((day) => {
    const items = state.schedules
      .filter((item) => item.day === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));

    /* Sunday only appears when it has classes, like the original table. */
    if (!items.length && day === "Sunday") return;

    if (!items.length) {
      rows.push(`
        <tr>
          <th scope="row">${day}</th>
          <td colspan="5">No classes</td>
        </tr>`);
      return;
    }

    items.forEach((item, index) => {
      rows.push(`
        <tr>
          ${index === 0 ? `<th scope="rowgroup" rowspan="${items.length}">${day}</th>` : ""}
          <td class="nowrap">${formatTime(item.startTime)}–${formatTime(item.endTime)}</td>
          <td>${escapeHTML(item.className)}</td>
          <td>${escapeHTML(item.courseCode || "—")}</td>
          <td>${escapeHTML(item.instructor || "TBA")}</td>
          ${actions(item)}
        </tr>`);
    });
  });

  body.innerHTML = rows.join("");
}

function showScheduleError(message) {
  const box = document.querySelector("#schedule-error-summary");
  if (!box) return;
  box.textContent = message;
  box.hidden = !message;
}

const scheduleForm = document.querySelector("#schedule-form");

if (scheduleForm) {
  scheduleForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(scheduleForm);
    const entry = {
      day: String(data.get("day") ?? ""),
      startTime: String(data.get("startTime") ?? ""),
      endTime: String(data.get("endTime") ?? ""),
      className: String(data.get("className") ?? "").trim(),
      courseCode: String(data.get("courseCode") ?? "").trim(),
      instructor: String(data.get("instructor") ?? "").trim(),
    };

    const id = String(data.get("id") ?? "");
    const error = id ? updateSchedule(id, entry) : addSchedule(entry);

    showScheduleError(error);
  });
}

const scheduleCancel = document.querySelector("#schedule-cancel");

if (scheduleCancel) {
  scheduleCancel.addEventListener("click", () => {
    state.editingSchedule = null;
    showScheduleError("");
    renderScheduleForm();
  });
}

const scheduleBody = document.querySelector("#schedule-table-body");

const scheduleActionsToggle = document.querySelector(
  "#schedule-actions-toggle",
);
const scheduleTable = document.querySelector("#schedule-table");

if (scheduleActionsToggle && scheduleTable) {
  scheduleActionsToggle.addEventListener("click", () => {
    const showActions =
      scheduleTable.classList.toggle("schedule-actions-hidden") === false;
    scheduleActionsToggle.setAttribute("aria-pressed", String(showActions));
    scheduleActionsToggle.textContent = showActions
      ? "Hide actions"
      : "Show actions";
  });
}

if (scheduleBody) {
  scheduleBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-schedule-action]");
    if (!button) return;

    const { scheduleAction, id } = button.dataset;
    const item = state.schedules.find((entry) => entry.id === id);

    if (scheduleAction === "edit" && item) {
      state.editingSchedule = id;
      showScheduleError("");
      renderScheduleForm();
      document.querySelector("#schedule-class")?.focus();
    }

    if (scheduleAction === "delete" && item) {
      if (window.confirm(`Delete ${item.className} on ${item.day}?`)) {
        showScheduleError("");
        deleteSchedule(id);
      }
    }
  });
}

function generateNoteId() {
  const numbers = state.notes
    .map((item) => Number(item.id.replace("NOTE-", "")))
    .filter(Number.isFinite);
  const next = (numbers.length ? Math.max(...numbers) : 0) + 1;
  return `NOTE-${String(next).padStart(3, "0")}`;
}

function validateNote(entry) {
  if (!entry.title) return "A note title is required.";
  if (!entry.body) return "The note text is required.";
  return "";
}

function addNote(entry) {
  const error = validateNote(entry);
  if (error) return error;

  const record = { id: generateNoteId(), ...entry };
  state.notes = [...state.notes, record];
  logAudit("CREATE", record.id, `Note: ${record.title}`);
  showMessage(`${record.id} was added.`);
  render();
  renderNoteForm();

  /* Save in the database. PHP gives the note its real ID. */
  saveNoteToServer({ action: "create", note: record }).then((data) => {
    if (data && data.id && data.id !== record.id) {
      state.notes = state.notes.map((n) =>
        n.id === record.id ? { ...n, id: data.id } : n,
      );
      render();
    }
  });

  return "";
}

function updateNote(id, updates) {
  if (!state.notes.some((item) => item.id === id)) {
    return `Note "${id}" was not found.`;
  }

  const error = validateNote(updates);
  if (error) return error;

  state.notes = state.notes.map((item) =>
    item.id === id ? { ...item, ...updates } : item,
  );
  state.editingNote = null;
  logAudit("UPDATE", id, `Note: ${updates.title}`);
  showMessage(`${id} was updated.`);
  render();
  renderNoteForm();

  /* Save in the database. */
  saveNoteToServer({ action: "update", id, updates });

  return "";
}

function deleteNote(id) {
  const existing = state.notes.find((item) => item.id === id);
  if (!existing) {
    showMessage(`Note "${id}" was not found.`);
    return false;
  }

  const wasEditing = state.editingNote === id;
  state.notes = state.notes.filter((item) => item.id !== id);
  if (wasEditing) state.editingNote = null;
  logAudit("DELETE", id, `Note: ${existing.title}`);
  showMessage(`${id} was deleted.`);
  render();
  if (wasEditing) renderNoteForm();

  /* Save in the database. */
  saveNoteToServer({ action: "delete", id });

  return true;
}

// Loads form from state when edit target changes (not from render, preserves draft)
function renderNoteForm() {
  const form = document.querySelector("#note-form");
  if (!form) return;

  const editing = state.notes.find((item) => item.id === state.editingNote);

  if (editing) {
    form.elements.id.value = editing.id;
    form.elements.title.value = editing.title;
    form.elements.body.value = editing.body;
    form.elements.remark.value = editing.remark;
  } else {
    form.reset();
    form.elements.id.value = "";
  }

  const submit = document.querySelector("#note-submit");
  const cancel = document.querySelector("#note-cancel");
  const title = document.querySelector("#note-form-title");
  if (submit) submit.textContent = editing ? "Save changes" : "Add note";
  if (cancel) cancel.hidden = !editing;
  if (title)
    title.textContent = editing ? `Edit note (${editing.id})` : "Add note";
}

function renderNotes() {
  const list = document.querySelector("#note-list");
  if (!list) return;

  list.innerHTML = state.notes
    .map(
      (note) => `
        <article class="info-entry">
          <h4>${escapeHTML(note.title)}</h4>
          <p>${escapeHTML(note.body)}</p>
          ${note.remark ? `<p class="section-note">${escapeHTML(note.remark)}</p>` : ""}
          <div class="task-actions">
            <button type="button" data-note-action="edit" data-id="${escapeHTML(note.id)}">Edit</button>
            <button type="button" class="btn-danger" data-note-action="delete" data-id="${escapeHTML(note.id)}">Delete</button>
          </div>
        </article>`,
    )
    .join("");

  const empty = document.querySelector("#note-empty-state");
  if (empty) empty.hidden = state.notes.length > 0;
}

function showNoteError(message) {
  const box = document.querySelector("#note-error-summary");
  if (!box) return;
  box.textContent = message;
  box.hidden = !message;
}

const noteForm = document.querySelector("#note-form");

if (noteForm) {
  noteForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(noteForm);
    const entry = {
      title: String(data.get("title") ?? "").trim(),
      body: String(data.get("body") ?? "").trim(),
      remark: String(data.get("remark") ?? "").trim(),
    };

    const id = String(data.get("id") ?? "");
    showNoteError(id ? updateNote(id, entry) : addNote(entry));
  });
}

const noteCancel = document.querySelector("#note-cancel");

if (noteCancel) {
  noteCancel.addEventListener("click", () => {
    state.editingNote = null;
    showNoteError("");
    renderNoteForm();
  });
}

const noteList = document.querySelector("#note-list");

if (noteList) {
  noteList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-note-action]");
    if (!button) return;

    const { noteAction, id } = button.dataset;
    const item = state.notes.find((entry) => entry.id === id);
    if (!item) return;

    if (noteAction === "edit") {
      state.editingNote = id;
      showNoteError("");
      renderNoteForm();
      document.querySelector("#note-title")?.focus();
    }

    if (
      noteAction === "delete" &&
      window.confirm(`Delete the note "${item.title}"?`)
    ) {
      showNoteError("");
      deleteNote(id);
    }
  });
}

const taskList = document.querySelector("#task-list");

if (taskList) {
  taskList.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");

    if (actionButton) {
      const { action, id } = actionButton.dataset;

      if (action === "view") {
        const task = state.records.find((record) => record.id === id);
        if (!task) {
          showMessage(`Task "${id}" was not found.`);
          return;
        }
        state.selectedRecord = id;
        state.editingRecord = null;
        renderDetails();
      }

      if (action === "edit") {
        const task = state.records.find((record) => record.id === id);
        if (!task) {
          showMessage(`Task "${id}" was not found.`);
          return;
        }
        // Permission + ownership guard
        if (!allowedOn(CAPABILITIES.TASK_EDIT_OWN, task)) {
          showMessage("You don't have permission to edit this task.");
          return;
        }
        // Workflow state guard
        if (!canEditTask(task)) {
          showMessage("Completed tasks can't be edited.");
          return;
        }
        state.selectedRecord = id;
        state.editingRecord = id;
        renderDetails();
      }

      if (action === "cancel-edit") {
        state.editingRecord = null;
        renderDetails();
      }

      if (action === "transition") {
        transitionTask(id, actionButton.dataset.nextStatus);
      }

      return;
    }

    const pageButton = event.target.closest("[data-page-action]");

    if (pageButton) {
      const visibleRecords = getVisibleRecords();
      const totalPages = Math.max(
        1,
        Math.ceil(visibleRecords.length / state.pageSize),
      );

      if (pageButton.dataset.pageAction === "previous" && state.page > 1) {
        state.page -= 1;
      }

      if (pageButton.dataset.pageAction === "next" && state.page < totalPages) {
        state.page += 1;
      }

      render();
    }
  });
}

const taskDetails = document.querySelector("#task-details");

if (taskDetails) {
  taskDetails.addEventListener("submit", (event) => {
    if (event.target.id !== "task-edit-form") return;
    event.preventDefault();

    const formData = new FormData(event.target);
    updateTask(event.target.dataset.id, {
      title: String(formData.get("title") ?? "").trim(),
      subject: String(formData.get("subject") ?? "").trim(),
      dueDate: String(formData.get("dueDate") ?? ""),
      priority: String(formData.get("priority") ?? "Medium"),
      description: String(formData.get("description") ?? "").trim(),
    });
  });

  taskDetails.addEventListener("click", (event) => {
    const cancelButton = event.target.closest('[data-action="cancel-edit"]');
    if (cancelButton) {
      state.editingRecord = null;
      renderDetails();
      return;
    }

    const transitionButton = event.target.closest('[data-action="transition"]');
    if (transitionButton) {
      transitionTask(
        transitionButton.dataset.id,
        transitionButton.dataset.nextStatus,
      );
      return;
    }

    const actionButton = event.target.closest('[data-action="edit"]');
    if (!actionButton) return;

    const task = state.records.find(
      (record) => record.id === actionButton.dataset.id,
    );
    if (!task) return;

    // Permission + ownership guard
    if (!allowedOn(CAPABILITIES.TASK_EDIT_OWN, task)) {
      showMessage("You don't have permission to edit this task.");
      return;
    }
    // Workflow state guard
    if (!canEditTask(task)) {
      showMessage("Completed tasks can't be edited.");
      return;
    }

    state.selectedRecord = task.id;
    state.editingRecord = task.id;
    renderDetails();
  });
}

/* ============================================================
   Unit 4: Advanced Form Validation Engine for Task Form
   ============================================================ */

// Set min date for date inputs to today
function setMinDateToday() {
  const today = new Date().toISOString().split("T")[0];
  const dueInput = document.querySelector("#task-due");
  const reminderInput = document.querySelector("#task-reminder-date");
  if (dueInput) dueInput.min = today;
  if (reminderInput) reminderInput.min = today;
}

// Show/hide reminder date field based on checkbox
function initReminderToggle() {
  const checkbox = document.querySelector("#task-has-reminder");
  const reminderField = document.querySelector("#reminder-date-field");
  const reminderInput = document.querySelector("#task-reminder-date");

  if (checkbox && reminderField) {
    checkbox.addEventListener("change", () => {
      const show = checkbox.checked;
      reminderField.hidden = !show;
      reminderInput.required = show;
      if (!show) {
        reminderInput.value = "";
        clearInlineError("task-reminder-date");
      }
    });
  }
}

// Clear inline error for a field
function clearInlineError(fieldId) {
  const errorEl = document.querySelector(`#${fieldId}-error`);
  if (errorEl) errorEl.textContent = "";
  const field = document.getElementById(fieldId);
  if (field) field.removeAttribute("aria-invalid");
}

// Clear all inline errors
function clearAllInlineErrors() {
  document.querySelectorAll(".inline-error").forEach((el) => {
    el.textContent = "";
    const field = document.getElementById(el.id.replace(/-error$/, ""));
    if (field) field.removeAttribute("aria-invalid");
  });
}

// Set inline error for a field
function setInlineError(fieldId, message) {
  const errorEl = document.querySelector(`#${fieldId}-error`);
  if (errorEl) errorEl.textContent = message;
  const field = document.getElementById(fieldId);
  if (field) field.setAttribute("aria-invalid", "true");
}

// Show error summary with links to fields
function showErrorSummary(errors) {
  const summary = document.querySelector("#task-error-summary");
  if (!summary) return;

  if (!errors || errors.length === 0) {
    summary.hidden = true;
    summary.innerHTML = "";
    return;
  }

  const title = document.createElement("strong");
  const issueLabel = errors.length === 1 ? "issue" : "issues";
  title.textContent = `Fix ${errors.length} ${issueLabel} to add this task`;

  const description = document.createElement("p");
  description.textContent =
    "Choose an item below to jump to the field that needs attention.";

  const list = document.createElement("ul");
  errors.forEach((err) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `#${err.field}`;
    link.textContent = err.message;
    item.append(link);
    list.append(item);
  });

  summary.replaceChildren(title, description, list);
  summary.hidden = false;
  summary.focus();
}

// Hide error summary
function hideErrorSummary() {
  const summary = document.querySelector("#task-error-summary");
  if (summary) {
    summary.hidden = true;
    summary.replaceChildren();
  }
}

// Validation rules
function validateTaskForm(formData) {
  const errors = [];
  const now = new Date();
  const today = now.toISOString().split("T")[0];

  // Get all values
  const title = String(formData.get("title") ?? "").trim();
  const subject = String(formData.get("subject") ?? "").trim();
  const dueDate = String(formData.get("dueDate") ?? "");
  const priority = String(formData.get("priority") ?? "");
  const estimatedHours = String(formData.get("estimatedHours") ?? "");
  const tags = String(formData.get("tags") ?? "").trim();
  const hasReminder = formData.get("hasReminder") === "1";
  const reminderDate = String(formData.get("reminderDate") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();

  // --- Native HTML5 validation is handled by browser ---
  // We add custom JS rules below

  // --- JS Field Rules (4+) ---

  // 1. Title: required, no special characters only, reasonable length
  if (!title) {
    errors.push({ field: "task-title", message: "Title is required." });
    setInlineError("task-title", "Required.");
  } else if (title.length < 3) {
    errors.push({
      field: "task-title",
      message: "Title must be at least 3 characters.",
    });
    setInlineError("task-title", "At least 3 characters required.");
  } else if (title.length > 100) {
    errors.push({
      field: "task-title",
      message: "Title cannot exceed 100 characters.",
    });
    setInlineError("task-title", "Maximum 100 characters.");
  } else {
    clearInlineError("task-title");
  }

  // 2. Subject: required, alphanumeric + spaces, reasonable length
  if (!subject) {
    errors.push({ field: "task-subject", message: "Subject is required." });
    setInlineError("task-subject", "Required.");
  } else if (subject.length < 2) {
    errors.push({
      field: "task-subject",
      message: "Subject must be at least 2 characters.",
    });
    setInlineError("task-subject", "At least 2 characters required.");
  } else if (subject.length > 80) {
    errors.push({
      field: "task-subject",
      message: "Subject cannot exceed 80 characters.",
    });
    setInlineError("task-subject", "Maximum 80 characters.");
  } else {
    clearInlineError("task-subject");
  }

  // 3. Due date: required, must not be in the past
  if (!dueDate) {
    errors.push({ field: "task-due", message: "Due date is required." });
    setInlineError("task-due", "Required.");
  } else if (dueDate < today) {
    errors.push({
      field: "task-due",
      message: "Due date cannot be in the past.",
    });
    setInlineError("task-due", "Due date must be today or later.");
  } else {
    clearInlineError("task-due");
  }

  // 4. Priority: required
  if (!priority) {
    errors.push({ field: "task-priority", message: "Priority is required." });
    setInlineError("task-priority", "Required.");
  } else {
    clearInlineError("task-priority");
  }

  // 5. Estimated hours: required, must be valid number within range
  if (!estimatedHours) {
    errors.push({
      field: "task-estimated",
      message: "Estimated hours is required.",
    });
    setInlineError("task-estimated", "Required.");
  } else {
    const estHours = parseFloat(estimatedHours);
    if (isNaN(estHours) || estHours < 0.25 || estHours > 100) {
      errors.push({
        field: "task-estimated",
        message: "Estimated hours must be between 0.25 and 100.",
      });
      setInlineError("task-estimated", "Enter 0.25 to 100 hours.");
    } else {
      clearInlineError("task-estimated");
    }
  }

  // 4. Tags: validate format (comma-separated, no special chars except hyphen)
  if (tags && !/^[\w\s,-]+$/.test(tags)) {
    errors.push({
      field: "task-tags",
      message:
        "Tags can only contain letters, numbers, spaces, commas, and hyphens.",
    });
    setInlineError("task-tags", "Invalid characters in tags.");
  } else {
    clearInlineError("task-tags");
  }

  // --- Cross-field Rules (2+) ---

  // 5. Reminder date (if set) must not be in the past
  if (hasReminder && reminderDate && reminderDate < today) {
    errors.push({
      field: "task-reminder-date",
      message: "Reminder date cannot be in the past.",
    });
    setInlineError(
      "task-reminder-date",
      "Reminder date must be today or later.",
    );
  }

  // 6. Reminder date (if set) must be before or equal to due date
  if (hasReminder && reminderDate && dueDate && reminderDate > dueDate) {
    errors.push({
      field: "task-reminder-date",
      message: "Reminder date must be on or before the due date.",
    });
    setInlineError("task-reminder-date", "Reminder cannot be after due date.");
  } else {
    // Only clear if no other reminder-date error was set above
    if (!(hasReminder && reminderDate && reminderDate < today)) {
      clearInlineError("task-reminder-date");
    }
  }

  // --- Conditional Required Field ---

  // 7. Reminder date is required when reminder checkbox is checked
  if (hasReminder && !reminderDate) {
    errors.push({
      field: "task-reminder-date",
      message: "Reminder date is required when reminder is enabled.",
    });
    setInlineError("task-reminder-date", "Please select a reminder date.");
  }

  // --- Duplicate Detection ---

  // 7. Check for duplicate task (same title + subject + dueDate)
  const isDuplicate = state.records.some(
    (task) =>
      task.title.toLowerCase() === title.toLowerCase() &&
      task.subject.toLowerCase() === subject.toLowerCase() &&
      task.dueDate === dueDate,
  );

  if (isDuplicate) {
    errors.push({
      field: "task-title",
      message: "A task with this title, subject, and due date already exists.",
    });
    setInlineError("task-title", "Duplicate task detected.");
  }

  // Notes length
  if (notes.length > 500) {
    errors.push({
      field: "task-notes",
      message: "Notes cannot exceed 500 characters.",
    });
    setInlineError("task-notes", "Maximum 500 characters.");
  } else {
    clearInlineError("task-notes");
  }

  return errors;
}

const taskForm = document.querySelector("#task-form");

if (taskForm) {
  // Initialize on load
  setMinDateToday();
  initReminderToggle();

  // Reset button handler
  const resetBtn = document.querySelector("#task-form-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      taskForm.reset();
      clearAllInlineErrors();
      hideErrorSummary();
      setMinDateToday();
      const reminderField = document.querySelector("#reminder-date-field");
      if (reminderField) reminderField.hidden = true;
      const checkbox = document.querySelector("#task-has-reminder");
      if (checkbox) checkbox.checked = false;
    });
  }

  taskForm.addEventListener("submit", (event) => {
    event.preventDefault();

    // Clear previous errors
    clearAllInlineErrors();

    const formData = new FormData(taskForm);
    const errors = validateTaskForm(formData);

    if (errors.length > 0) {
      showErrorSummary(errors);
      return;
    }

    // Validation passed
    hideErrorSummary();

    const title = String(formData.get("title") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const dueDate = String(formData.get("dueDate") ?? "");
    const priority = String(formData.get("priority") ?? "Medium");
    const estimatedHours = parseFloat(
      String(formData.get("estimatedHours") ?? "1"),
    );
    const tags = String(formData.get("tags") ?? "").trim();
    const hasReminder = formData.get("hasReminder") === "1";
    const reminderDate = hasReminder
      ? String(formData.get("reminderDate") ?? "")
      : "";
    const notes = String(formData.get("notes") ?? "").trim();

    const added = addTask({
      id: generateTaskId(),
      title,
      subject,
      description: notes || "Added from the task form.",
      dueDate,
      priority,
      status: "To do",
      createdAt: new Date().toISOString(),
      estimatedMinutes: Math.round(estimatedHours * 60),
      workflowHistory: [],
      // Store extra fields
      tags: tags
        ? tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [],
      hasReminder,
      reminderDate: reminderDate || null,
    });

    if (added) {
      showToast(`Task "${title}" added successfully!`);
      taskForm.reset();
      // Reset min dates after form reset
      setMinDateToday();
      // Hide reminder field after reset
      const reminderField = document.querySelector("#reminder-date-field");
      if (reminderField) reminderField.hidden = true;
      const checkbox = document.querySelector("#task-has-reminder");
      if (checkbox) checkbox.checked = false;
    }
  });
}

/* ---------- Search: live dropdown with results / "no results" ---------- */
const searchInput = document.querySelector("#global-search");
const searchForm = document.querySelector("#search-form");
const searchResults = document.querySelector("#search-results");
const searchStatus = document.querySelector("#search-status");
const SEARCH_MAX_RESULTS = 6;

let searchHits = [];
let searchActiveIndex = -1;

function highlightMatch(text, tokens) {
  const value = String(text ?? "");
  if (!tokens.length) return escapeHTML(value);

  const pattern = new RegExp(
    `(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );

  return value
    .split(pattern)
    .map((part, index) =>
      index % 2 === 1
        ? `<mark>${escapeHTML(part)}</mark>`
        : escapeHTML(part),
    )
    .join("");
}

function setSearchOpen(isOpen) {
  if (!searchResults || !searchInput) return;
  searchResults.hidden = !isOpen;
  searchInput.setAttribute("aria-expanded", String(isOpen));
  if (!isOpen) {
    searchActiveIndex = -1;
    searchInput.removeAttribute("aria-activedescendant");
  }
}

function setActiveSearchItem(index) {
  const items = searchResults.querySelectorAll(".search-item");
  searchActiveIndex = items.length ? (index + items.length) % items.length : -1;

  items.forEach((item, i) => {
    const active = i === searchActiveIndex;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
    if (active) {
      searchInput.setAttribute("aria-activedescendant", item.id);
      item.scrollIntoView({ block: "nearest" });
    }
  });
}

function renderSearchDropdown() {
  if (!searchResults || !searchInput) return;

  const rawQuery = searchInput.value.trim();

  if (!rawQuery) {
    searchHits = [];
    searchResults.innerHTML = "";
    setSearchOpen(false);
    if (searchStatus) searchStatus.textContent = "";
    return;
  }

  const tokens = searchTokens(rawQuery);
  const fromDb = dbSearchReady(rawQuery);

  if (fromDb) {
    // Results (and their order) come from the database.
    searchHits = state.records
      .filter((task) => dbTaskSearch.order.has(task.id))
      .sort((a, b) => dbTaskSearch.order.get(a.id) - dbTaskSearch.order.get(b.id));
  } else {
    // Database answer not here yet: show a local preview meanwhile.
    searchHits = state.records
      .map((task) => ({ task, score: taskSearchScore(task, tokens) }))
      .filter((hit) => hit.score >= 0)
      .sort(
        (a, b) =>
          b.score - a.score || String(a.task.dueDate).localeCompare(String(b.task.dueDate)),
      )
      .map((hit) => hit.task);
  }

  if (!searchHits.length) {
    const archivedMatches = fromDb
      ? dbTaskSearch.archived
      : (state.archivedRecords || []).filter(
          (task) => taskSearchScore(task, tokens) >= 0,
        ).length;

    searchResults.innerHTML = `
      <div class="search-empty" role="option" aria-selected="false">
        <strong>No results found for “${escapeHTML(rawQuery)}”</strong>
        <span>${
          archivedMatches
            ? `${archivedMatches} matching ${archivedMatches === 1 ? "task is" : "tasks are"} in Archives.`
            : "Try a different keyword, subject, priority or status."
        }</span>
      </div>`;
    if (searchStatus) searchStatus.textContent = `No results found for ${rawQuery}.`;
    setSearchOpen(true);
    return;
  }

  const shown = searchHits.slice(0, SEARCH_MAX_RESULTS);

  searchResults.innerHTML =
    shown
      .map(
        (task, index) => `
      <div class="search-item" id="search-item-${index}" role="option" aria-selected="false" data-id="${escapeHTML(task.id)}">
        <span class="search-item-title">${highlightMatch(task.title, tokens)}</span>
        <span class="search-item-meta">
          ${escapeHTML(task.subject || "No subject")} · Due ${escapeHTML(task.dueDate || "—")} ·
          ${escapeHTML(task.priority)} ·
          <span class="status-pill ${getStatusClass(task.status)}">${escapeHTML(task.status)}</span>
        </span>
      </div>`,
      )
      .join("") +
    `<button type="button" class="search-all" data-search-all>
       See all ${searchHits.length} ${searchHits.length === 1 ? "result" : "results"} in Tasks
     </button>`;

  if (searchStatus) {
    searchStatus.textContent = `${searchHits.length} ${searchHits.length === 1 ? "result" : "results"} found.`;
  }

  setSearchOpen(true);
  setActiveSearchItem(-1);
  searchActiveIndex = -1;
}

/* Jump to one task: show it in the Tasks list, open its details, flash the row. */
function openTaskFromSearch(id) {
  const task = state.records.find((record) => record.id === id);
  if (!task) return;

  state.query = "";
  state.filters.status = "ALL";
  state.filters.priority = "ALL";
  const statusSelect = document.querySelector("#status-filter");
  const prioritySelect = document.querySelector("#priority-filter");
  if (statusSelect) statusSelect.value = "ALL";
  if (prioritySelect) prioritySelect.value = "ALL";

  const index = getVisibleRecords().findIndex((record) => record.id === id);
  state.page = index >= 0 ? Math.floor(index / state.pageSize) + 1 : 1;
  state.selectedRecord = id;
  state.editingRecord = null;

  searchInput.value = "";
  setSearchOpen(false);

  goToSection("tasks");
  render();

  const row = document.querySelector(`#task-table-body tr[data-id="${CSS.escape(id)}"]`);
  if (row) {
    row.scrollIntoView({ block: "center", behavior: "smooth" });
    row.classList.add("search-hit");
    setTimeout(() => row.classList.remove("search-hit"), 2200);
  }
}

/* Show every match in the Tasks list. */
function showAllSearchResults() {
  state.query = searchInput.value.trim();
  state.page = 1;
  setSearchOpen(false);
  goToSection("tasks");
  render();
  window.scrollTo({ top: 0 });
}

if (searchInput && searchResults) {
  searchInput.addEventListener("input", () => {
    renderSearchDropdown();

    // Ask the database; when it answers, redraw with its results.
    scheduleDbSearch(searchInput.value, () => {
      if (document.activeElement === searchInput) renderSearchDropdown();
      if (state.query.trim()) render();
    });

    // If the Tasks list is already on screen, filter it as the person types.
    const tasksVisible = !document.querySelector("#tasks")?.hidden;
    if (tasksVisible || !searchInput.value.trim()) {
      const next = searchInput.value.trim();
      if (state.query !== next) {
        state.query = next;
        state.page = 1;
        render();
      }
    }
  });

  searchInput.addEventListener("focus", () => {
    if (searchInput.value.trim()) renderSearchDropdown();
  });

  searchInput.addEventListener("keydown", (event) => {
    const open = !searchResults.hidden;

    if (event.key === "ArrowDown" && open) {
      event.preventDefault();
      setActiveSearchItem(searchActiveIndex + 1);
    } else if (event.key === "ArrowUp" && open) {
      event.preventDefault();
      setActiveSearchItem(searchActiveIndex - 1);
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setSearchOpen(false);
    }
  });

  searchResults.addEventListener("mousedown", (event) => {
    // keep focus in the input so the dropdown doesn't close before the click lands
    event.preventDefault();
  });

  searchResults.addEventListener("click", (event) => {
    if (event.target.closest("[data-search-all]")) {
      showAllSearchResults();
      return;
    }
    const item = event.target.closest(".search-item");
    if (item) openTaskFromSearch(item.dataset.id);
  });

  document.addEventListener("click", (event) => {
    if (searchForm && !searchForm.contains(event.target)) setSearchOpen(false);
  });
}

if (searchForm) {
  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!searchInput.value.trim()) return;

    if (searchActiveIndex >= 0 && searchHits[searchActiveIndex]) {
      openTaskFromSearch(searchHits[searchActiveIndex].id);
    } else if (searchHits.length) {
      showAllSearchResults();
    } else {
      renderSearchDropdown();
    }
  });
}

bindSelect("#status-filter", (value) => {
  state.filters.status = value;
});

bindSelect("#priority-filter", (value) => {
  state.filters.priority = value;
});

bindSelect("#sort-key", (value) => {
  state.sort.key = value;
});

bindSelect("#sort-direction", (value) => {
  state.sort.direction = value;
});

bindSelect("#page-size", (value) => {
  state.pageSize = Number(value);
});

function bindSelect(selector, updateState) {
  const element = document.querySelector(selector);

  if (!element) return;

  element.addEventListener("change", (event) => {
    updateState(event.target.value);
    state.page = 1;
    render();
  });
}

const nav = document.querySelector(".primary-nav");

/* Show one top-level section and mark its nav link as current. */
function goToSection(targetId) {
  if (!document.querySelector(`#app > section[id="${targetId}"]`)) return false;

  if (document.body.classList.contains("focus-mode")) {
    document.querySelector("#focus-toggle")?.click();
  }

  document.querySelectorAll("#app > section").forEach((section) => {
    section.hidden = section.id !== targetId;
  });

  nav?.querySelectorAll("a").forEach((navLink) => {
    if (navLink.getAttribute("href") === `#${targetId}`) {
      navLink.setAttribute("aria-current", "page");
    } else {
      navLink.removeAttribute("aria-current");
    }
  });

  // Let sections that load data on demand (e.g. Users) know they are visible.
  document.dispatchEvent(new CustomEvent("section:shown", { detail: targetId }));
  return true;
}

if (nav) {
  nav.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;

    event.preventDefault();
    if (goToSection(link.getAttribute("href").slice(1))) {
      window.scrollTo({ top: 0 });
    }
  });
}

/* In-page shortcuts such as "See all tasks" and the user menu's Settings link. */
document.addEventListener("click", (event) => {
  const shortcut = event.target.closest("[data-go]");
  if (!shortcut) return;
  event.preventDefault();
  document.querySelector("#user-menu")?.removeAttribute("open");
  if (goToSection(shortcut.dataset.go)) window.scrollTo({ top: 0 });
});

/* Close the user menu on outside click or Escape. */
const userMenu = document.querySelector("#user-menu");
if (userMenu) {
  document.addEventListener("click", (event) => {
    if (userMenu.open && !userMenu.contains(event.target)) {
      userMenu.removeAttribute("open");
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && userMenu.open) {
      userMenu.removeAttribute("open");
      userMenu.querySelector("summary")?.focus();
    }
  });
}

/* Header "Add task" jumps to the dashboard form. */
document.querySelector("#add-task-btn")?.addEventListener("click", () => {
  goToSection("dashboard");
  const form = document.querySelector("#task-form");
  if (!form) return;
  form.scrollIntoView({ behavior: "smooth", block: "start" });
  document.querySelector("#task-title")?.focus({ preventScroll: true });
});

/* Dashboard "Next up" status buttons reuse the normal workflow transition. */
document.querySelector("#next-up-list")?.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="transition"]');
  if (button) transitionTask(button.dataset.id, button.dataset.nextStatus);
});

/* Dashboard "Start focus" opens the focus timer. */
document.querySelector("#dash-start-focus")?.addEventListener("click", () => {
  const toggle = document.querySelector("#focus-toggle");
  if (toggle && toggle.getAttribute("aria-pressed") !== "true") toggle.click();
  window.scrollTo({ top: 0 });
});

setText(
  "#dash-date",
  new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }),
);

/* ---------- Profile (every role manages their OWN account) ---------- */

const profileUser = { ...(window.STUDYHUB_USER ?? {}) };

function setFormMessage(selector, text, isError = false) {
  const box = document.querySelector(selector);
  if (!box) return;
  box.textContent = text;
  box.hidden = !text;
  box.classList.toggle("is-error", isError);
}

async function postProfile(body) {
  const response = await fetch("api/profile.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return response.json();
}

// Mark the field the server complained about (and clear old marks).
function markField(form, fieldName) {
  form.querySelectorAll("[aria-invalid]").forEach((field) => {
    field.removeAttribute("aria-invalid");
  });
  const field = fieldName && form.elements[fieldName];
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus();
  }
}

const detailsForm = document.querySelector("#profile-details-form");
if (detailsForm) {
  const emailInput = detailsForm.elements.email;
  const emailPasswordField = document.querySelector("#profile-email-password-field");

  const fillDetails = () => {
    detailsForm.elements.name.value = profileUser.name ?? "";
    emailInput.value = profileUser.username ?? "";
    detailsForm.elements.currentPassword.value = "";
    if (emailPasswordField) emailPasswordField.hidden = true;
  };
  fillDetails();
  setLabel("#profile-role", ROLES[profileUser.role]?.label ?? profileUser.role ?? "—");

  // Only ask for the password once the email actually changes.
  emailInput.addEventListener("input", () => {
    const changed =
      emailInput.value.trim().toLowerCase() !== String(profileUser.username ?? "");
    if (emailPasswordField) emailPasswordField.hidden = !changed;
  });

  detailsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = detailsForm.querySelector('button[type="submit"]');
    const body = {
      action: "update_details",
      name: detailsForm.elements.name.value.trim(),
      email: emailInput.value.trim().toLowerCase(),
      currentPassword: detailsForm.elements.currentPassword.value,
    };
    if (!body.name) {
      markField(detailsForm, "name");
      return setFormMessage("#profile-details-message", "Enter your full name.", true);
    }

    button.disabled = true;
    try {
      const data = await postProfile(body);
      if (!data.ok) {
        markField(detailsForm, data.field);
        return setFormMessage("#profile-details-message", data.message, true);
      }
      markField(detailsForm, null);
      profileUser.name = data.name;
      profileUser.username = data.email;
      // Keep the header in sync with the new name.
      setLabel("#user-label", data.name);
      setLabel("#user-initials", initialsOf(data.name));
      setLabel("#admin-name", data.name);
      fillDetails();
      setFormMessage("#profile-details-message", data.message);
    } catch {
      setFormMessage("#profile-details-message", "Could not reach the server. Nothing was changed.", true);
    } finally {
      button.disabled = false;
    }
  });
}

const passwordForm = document.querySelector("#profile-password-form");
if (passwordForm) {
  passwordForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = passwordForm.querySelector('button[type="submit"]');
    const { currentPassword, newPassword, confirmPassword } = passwordForm.elements;

    if (!currentPassword.value) {
      markField(passwordForm, "currentPassword");
      return setFormMessage("#profile-password-message", "Enter your current password.", true);
    }
    if (newPassword.value.length < 8) {
      markField(passwordForm, "newPassword");
      return setFormMessage("#profile-password-message", "Your new password must be at least 8 characters.", true);
    }
    if (newPassword.value !== confirmPassword.value) {
      markField(passwordForm, "confirmPassword");
      return setFormMessage("#profile-password-message", "The new passwords don't match.", true);
    }

    button.disabled = true;
    try {
      const data = await postProfile({
        action: "change_password",
        currentPassword: currentPassword.value,
        newPassword: newPassword.value,
      });
      if (!data.ok) {
        markField(passwordForm, data.field);
        return setFormMessage("#profile-password-message", data.message, true);
      }
      markField(passwordForm, null);
      passwordForm.reset();
      profileUser.mustChangePassword = false;
      document.querySelector("#profile-password-note")?.classList.remove("is-required");
      setFormMessage("#profile-password-message", data.message);
    } catch {
      setFormMessage("#profile-password-message", "Could not reach the server. Nothing was changed.", true);
    } finally {
      button.disabled = false;
    }
  });
}

/* After an admin resets the password, the user must pick a new one.
   The server refuses everything else (403 "must_change_password") until then. */
function showPasswordChangeRequired() {
  if (!goToSection("profile")) return;
  const note = document.querySelector("#profile-password-note");
  if (note) {
    note.textContent =
      "An administrator reset your password. Enter the temporary password as your current password, then choose a new one to keep using StudyHub.";
    note.classList.add("is-required");
  }
  document.querySelector("#profile-current-password")?.focus();
}

if (profileUser.mustChangePassword) showPasswordChangeRequired();

/* ---------- Users (Admin / Super Admin) ----------
   The server decides what this viewer may do to each account and sends it as
   user.can (e.g. ["edit","suspend"]). The page only ever offers those actions;
   api/admin.php re-checks every request anyway. */

const usersState = { search: "", role: "", status: "", page: 1, users: [], viewer: null };
const ACCOUNT_STATUS_LABELS = {
  active: "Active",
  pending: "Waiting for approval",
  suspended: "Suspended",
  banned: "Banned",
};

async function postAdmin(body) {
  const response = await fetch("api/admin.php", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return response.json();
}

// "2026-11-26 11:05:35" (database time) -> "Nov 26, 2026"
function formatAccountDate(value, withTime = false) {
  if (!value) return "Never";
  const date = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return "—";
  return withTime
    ? date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function renderUserRow(user) {
  const reason = user.statusReason ? ` title="${escapeHTML(user.statusReason)}"` : "";
  const canApprove = user.can.includes("approve");
  return `
    <tr data-user-id="${user.id}">
      <td>
        <div class="user-cell">
          <span class="avatar avatar-sm" aria-hidden="true">${escapeHTML(initialsOf(user.name))}</span>
          <div>
            <strong>${escapeHTML(user.name)}</strong>${user.isMe ? ' <span class="you-tag">You</span>' : ""}
            <span class="user-email">${escapeHTML(user.email)}</span>
          </div>
        </div>
      </td>
      <td><span class="role-pill" data-role="${escapeHTML(user.role)}">${escapeHTML(user.roleLabel)}</span></td>
      <td><span class="account-status" data-status="${escapeHTML(user.status)}"${reason}>${escapeHTML(ACCOUNT_STATUS_LABELS[user.status] ?? user.status)}</span></td>
      <td class="nowrap">${escapeHTML(formatAccountDate(user.lastLogin, true))}</td>
      <td>
        <div class="task-actions row-actions">
          ${canApprove ? `<button type="button" class="primary-action" data-user-act="approve" data-id="${user.id}">Approve</button>` : ""}
          <button type="button" data-user-act="manage" data-id="${user.id}">${user.can.length ? "Manage" : "View"}</button>
        </div>
      </td>
    </tr>`;
}

async function loadUsers() {
  const body = document.querySelector("#users-table-body");
  if (!body) return;

  const [data, overview] = await Promise.all([
    postAdmin({
      action: "list_users",
      search: usersState.search,
      role: usersState.role,
      status: usersState.status,
      page: usersState.page,
    }),
    postAdmin({ action: "overview" }),
  ]);
  if (!data.ok) {
    setFormMessage("#users-message", data.message, true);
    return;
  }

  usersState.users = data.users;
  usersState.viewer = data.viewer;
  usersState.page = data.page;

  body.innerHTML = data.users.map(renderUserRow).join("");
  document.querySelector("#users-empty").hidden = data.users.length > 0;
  setLabel("#users-count", `${data.total} account${data.total === 1 ? "" : "s"}`);
  document.querySelector("#users-create-btn").hidden = !data.viewer.canCreate;

  // "2 accounts are waiting for approval" (hidden while already filtering by it).
  const pending = overview.ok ? overview.byStatus.pending ?? 0 : 0;
  const note = document.querySelector("#users-pending-note");
  note.hidden = pending === 0 || usersState.status === "pending";
  setLabel(
    "#users-pending-text",
    `${pending} account${pending === 1 ? " is" : "s are"} waiting for approval.`,
  );

  const pagination = document.querySelector("#users-pagination");
  pagination.innerHTML =
    data.pages > 1
      ? `<button type="button" data-users-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Previous</button>
         <span>Page ${data.page} of ${data.pages}</span>
         <button type="button" data-users-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Next</button>`
      : "";
}

// Refresh everything an account change can affect.
async function refreshAfterUserChange() {
  await loadUsers();
  loadAdminOverview();
}

/* ----- Manage dialog ----- */

const userDialog = document.querySelector("#user-dialog");
let dialogUserId = null;

function dialogSection(title, body, extraClass = "") {
  return `<section class="dialog-section ${extraClass}"><h4>${title}</h4>${body}</section>`;
}

function renderUserDialog(user) {
  setLabel("#user-dialog-title", user.name);
  setLabel(
    "#user-dialog-meta",
    `${user.email} · ${user.roleLabel} · ${ACCOUNT_STATUS_LABELS[user.status] ?? user.status}` +
      (user.statusReason ? ` (${user.statusReason})` : "") +
      ` · Joined ${formatAccountDate(user.createdAt)}`,
  );

  const can = new Set(user.can);
  const parts = [];

  // Shortcuts to this person's history (security log: Super Admin only).
  // Admins only see students' and teachers' activity, so only offer it where it exists.
  const showActivity =
    currentUser?.role === "super_admin" || ["student", "teacher"].includes(user.role);
  parts.push(
    `<div class="dialog-links">
       ${showActivity ? `<button type="button" class="btn" data-open-log="activity">View activity</button>` : ""}
       ${currentUser?.role === "super_admin" ? `<button type="button" class="btn" data-open-log="security">View security log</button>` : ""}
     </div>`,
  );

  if (!can.size) {
    parts.push(`<p class="locked-note">${escapeHTML(user.lockedReason || "You can't change this account.")}</p>`);
  }

  if (can.has("view_content")) {
    parts.push(
      dialogSection(
        "Content",
        `<p class="section-note">See this person's tasks, classes and notes, and remove anything that breaks the rules.</p>
         <div class="task-actions"><button type="button" data-open-content>Review content</button></div>`,
      ),
    );
  }

  if (can.has("approve")) {
    parts.push(
      dialogSection(
        "Approval",
        `<p class="section-note">This teacher signed up and is waiting for approval.</p>
         <div class="task-actions"><button type="button" class="primary-action" data-dialog-act="approve">Approve account</button></div>`,
      ),
    );
  }

  if (can.has("edit")) {
    parts.push(
      dialogSection(
        "Details",
        `<div class="dialog-fields">
           <div><label for="dlg-name">Full name</label><input id="dlg-name" data-field="name" maxlength="100" value="${escapeHTML(user.name)}" /></div>
           <div><label for="dlg-email">Email</label><input id="dlg-email" data-field="email" type="email" maxlength="190" value="${escapeHTML(user.email)}" /></div>
         </div>
         <div class="task-actions"><button type="button" data-dialog-act="edit">Save details</button></div>`,
      ),
    );
  }

  if (can.has("suspend") || can.has("ban") || can.has("reactivate")) {
    const restrict = can.has("suspend") || can.has("ban");
    parts.push(
      dialogSection(
        "Account status",
        (restrict
          ? `<div><label for="dlg-status-reason">Reason (shown to the user)</label>
               <input id="dlg-status-reason" data-field="reason" maxlength="255" placeholder="e.g. Posting spam in class" /></div>`
          : "") +
          `<div class="task-actions">
             ${can.has("suspend") ? `<button type="button" data-dialog-act="suspend">Suspend</button>` : ""}
             ${can.has("ban") ? `<button type="button" class="btn-danger" data-dialog-act="ban">Ban</button>` : ""}
             ${can.has("reactivate") ? `<button type="button" class="primary-action" data-dialog-act="reactivate">Reactivate</button>` : ""}
           </div>
           <p class="section-note">Suspend is temporary; ban is for serious cases. Both sign the user out at once.</p>`,
      ),
    );
  }

  if (can.has("reset_password")) {
    parts.push(
      dialogSection(
        "Password",
        `<div><label for="dlg-reset-reason">Reason</label>
           <input id="dlg-reset-reason" data-field="reason" maxlength="255" placeholder="e.g. Forgot password, asked in person" /></div>
         <div class="task-actions"><button type="button" data-dialog-act="reset_password">Reset password</button></div>
         <p class="section-note">Creates a temporary password. They are signed out and must choose a new one when they next sign in.</p>`,
      ),
    );
  }

  if (can.has("change_role")) {
    const options = (usersState.viewer?.assignableRoles ?? [])
      .map(
        (role) =>
          `<option value="${escapeHTML(role.value)}" ${role.value === user.role ? "selected" : ""}>${escapeHTML(role.label)}</option>`,
      )
      .join("");
    parts.push(
      dialogSection(
        "Role",
        `<div class="dialog-fields">
           <div><label for="dlg-role">Role</label><select id="dlg-role" data-field="role">${options}</select></div>
           <div><label for="dlg-role-reason">Note (optional)</label><input id="dlg-role-reason" data-field="reason" maxlength="200" /></div>
         </div>
         <div class="task-actions"><button type="button" data-dialog-act="change_role">Change role</button></div>`,
      ),
    );
  }

  if (can.has("delete")) {
    parts.push(
      dialogSection(
        "Delete account",
        `<p class="section-note">Permanently deletes this account and all of its tasks, classes and notes. The logs are kept. This can't be undone.</p>
         <div class="dialog-fields">
           <div><label for="dlg-delete-reason">Reason</label><input id="dlg-delete-reason" data-field="reason" maxlength="255" /></div>
           <div><label for="dlg-delete-confirm">Type <strong>${escapeHTML(user.email)}</strong> to confirm</label>
             <input id="dlg-delete-confirm" data-field="confirmEmail" autocomplete="off" spellcheck="false" /></div>
         </div>
         <div class="task-actions"><button type="button" class="btn-danger" data-dialog-act="delete">Delete account</button></div>`,
        "danger-zone",
      ),
    );
  }

  document.querySelector("#user-dialog-content").innerHTML = parts.join("");
}

function openUserDialog(id) {
  const user = usersState.users.find((u) => u.id === id);
  if (!user || !userDialog) return;
  dialogUserId = id;
  setFormMessage("#user-dialog-message", "");
  renderUserDialog(user);
  if (!userDialog.open) userDialog.showModal();
}

// Show a temporary password once, with a copy button.
function secretBox(password) {
  return `<div class="secret-box">
      <code id="secret-value">${escapeHTML(password)}</code>
      <button type="button" data-copy-secret>Copy</button>
    </div>`;
}

document.addEventListener("click", async (event) => {
  // Copy a temporary password.
  const copy = event.target.closest("[data-copy-secret]");
  if (copy) {
    const value = copy.parentElement.querySelector("code")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(value);
      copy.textContent = "Copied";
    } catch {
      window.getSelection()?.selectAllChildren(copy.parentElement.querySelector("code"));
      copy.textContent = "Press Ctrl+C";
    }
    return;
  }

  // Close buttons inside dialogs.
  const close = event.target.closest("[data-close-dialog]");
  if (close) close.closest("dialog")?.close();
});

// Clicking the dark backdrop closes a dialog.
document.querySelectorAll(".admin-dialog").forEach((dialog) => {
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
});

async function runUserAction(id, act, section) {
  const field = (name) => section?.querySelector(`[data-field="${name}"]`)?.value ?? "";
  const requests = {
    approve: { action: "approve" },
    edit: { action: "edit_user", name: field("name").trim(), email: field("email").trim() },
    suspend: { action: "set_status", status: "suspended", reason: field("reason") },
    ban: { action: "set_status", status: "banned", reason: field("reason") },
    reactivate: { action: "set_status", status: "active" },
    reset_password: { action: "reset_password", reason: field("reason") },
    change_role: { action: "change_role", role: field("role"), reason: field("reason") },
    delete: { action: "delete_user", reason: field("reason"), confirmEmail: field("confirmEmail") },
  };
  const body = requests[act];
  if (!body) return null;
  return postAdmin({ ...body, id });
}

document.querySelector("#user-dialog-content")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-dialog-act]");
  if (!button || dialogUserId === null) return;
  const act = button.dataset.dialogAct;
  const section = button.closest(".dialog-section");

  button.disabled = true;
  try {
    const data = await runUserAction(dialogUserId, act, section);
    if (!data?.ok) {
      setFormMessage("#user-dialog-message", data?.message ?? "Something went wrong.", true);
      if (data?.field) section?.querySelector(`[data-field="${data.field}"]`)?.focus();
      return;
    }

    if (act === "delete") {
      userDialog.close();
      setFormMessage("#users-message", data.message);
      await refreshAfterUserChange();
      return;
    }

    await refreshAfterUserChange();
    const fresh = usersState.users.find((u) => u.id === dialogUserId);
    if (fresh) renderUserDialog(fresh);
    setFormMessage("#user-dialog-message", data.message);

    // Temporary password: show it once, right under the message.
    if (data.temporaryPassword) {
      document
        .querySelector("#user-dialog-message")
        .insertAdjacentHTML("afterend", `<div id="user-dialog-secret">${secretBox(data.temporaryPassword)}</div>`);
    }
  } catch {
    setFormMessage("#user-dialog-message", "Could not reach the server. Nothing was changed.", true);
  } finally {
    button.disabled = false;
  }
});

// Forget a shown temporary password when the dialog closes.
userDialog?.addEventListener("close", () => {
  document.querySelector("#user-dialog-secret")?.remove();
  dialogUserId = null;
});

/* ----- Table: approve, manage, paging ----- */

document.querySelector("#users-table-body")?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-act]");
  if (!button) return;
  const id = Number(button.dataset.id);

  if (button.dataset.userAct === "manage") {
    openUserDialog(id);
    return;
  }
  if (button.dataset.userAct === "approve") {
    button.disabled = true;
    const data = await runUserAction(id, "approve");
    setFormMessage("#users-message", data?.message ?? "Something went wrong.", !data?.ok);
    await refreshAfterUserChange();
  }
});

document.querySelector("#users-pagination")?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-users-page]");
  if (!button) return;
  usersState.page = Number(button.dataset.usersPage);
  loadUsers();
});

/* ----- Filters ----- */

const usersFilters = document.querySelector("#users-filters");
if (usersFilters) {
  let searchTimer = null;
  usersFilters.addEventListener("submit", (event) => event.preventDefault());
  usersFilters.addEventListener("input", (event) => {
    if (event.target.name !== "search") return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      usersState.search = event.target.value.trim();
      usersState.page = 1;
      loadUsers();
    }, 250);
  });
  usersFilters.addEventListener("change", (event) => {
    if (event.target.name === "role" || event.target.name === "status") {
      usersState[event.target.name] = event.target.value;
      usersState.page = 1;
      loadUsers();
    }
  });
}

function showPendingUsers() {
  usersState.status = "pending";
  usersState.page = 1;
  const select = document.querySelector("#users-status");
  if (select) select.value = "pending";
  if (!goToSection("users")) return;
}

document.querySelector("#users-show-pending")?.addEventListener("click", () => {
  showPendingUsers(); // goToSection fires section:shown, which reloads the list
});
document.querySelector("#admin-review-pending")?.addEventListener("click", (event) => {
  event.preventDefault();
  showPendingUsers(); // goToSection fires section:shown, which loads the list
});

document.addEventListener("section:shown", (event) => {
  if (event.detail === "users") loadUsers();
});

/* ----- Create account (Super Admin) ----- */

const createDialog = document.querySelector("#user-create-dialog");
const createForm = document.querySelector("#user-create-form");

document.querySelector("#users-create-btn")?.addEventListener("click", () => {
  if (!createDialog || !createForm) return;
  createForm.reset();
  createForm.hidden = false;
  document.querySelector("#user-create-result").hidden = true;
  setFormMessage("#user-create-message", "");
  createForm.elements.role.innerHTML = (usersState.viewer?.assignableRoles ?? [])
    .map((role) => `<option value="${escapeHTML(role.value)}">${escapeHTML(role.label)}</option>`)
    .join("");
  createDialog.showModal();
});

createForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = createForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const data = await postAdmin({
      action: "create_user",
      name: createForm.elements.name.value.trim(),
      email: createForm.elements.email.value.trim(),
      role: createForm.elements.role.value,
    });
    if (!data.ok) {
      setFormMessage("#user-create-message", data.message, true);
      if (data.field) createForm.elements[data.field]?.focus();
      return;
    }
    createForm.hidden = true;
    setFormMessage("#user-create-message", data.message);
    const result = document.querySelector("#user-create-result");
    result.innerHTML = secretBox(data.temporaryPassword);
    result.hidden = false;
    await refreshAfterUserChange();
  } catch {
    setFormMessage("#user-create-message", "Could not reach the server. Nothing was changed.", true);
  } finally {
    button.disabled = false;
  }
});

// Forget the shown password when the create dialog closes.
createDialog?.addEventListener("close", () => {
  const result = document.querySelector("#user-create-result");
  if (result) result.innerHTML = "";
});

/* ---------- Announcements on dashboards (every role) ----------
   Text only (escaped), newest/important first. Dismissing remembers the
   announcement's version, so an edited announcement shows again. */

const DISMISSED_KEY = `studyhub-dismissed-announcements-${currentUser?.id ?? "guest"}`;

function readDismissed() {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function renderAnnouncements() {
  const dismissed = readDismissed();
  const visible = (window.STUDYHUB_ANNOUNCEMENTS ?? []).filter(
    (a) => dismissed[a.id] !== a.version,
  );
  const html = visible
    .map(
      (a) => `<div class="announcement" data-importance="${a.importance === "important" ? "important" : "info"}" role="note">
        <svg class="icon" aria-hidden="true"><use href="#${a.importance === "important" ? "i-alert" : "i-megaphone"}" /></svg>
        <div class="announcement-text">
          <strong>${a.importance === "important" ? '<span class="sr-only">Important: </span>' : ""}${escapeHTML(a.title)}</strong>
          <p>${escapeHTML(a.body)}</p>
        </div>
        <button type="button" class="announcement-dismiss" data-dismiss-announcement="${a.id}" aria-label="Dismiss announcement: ${escapeHTML(a.title)}">
          <svg class="icon" aria-hidden="true"><use href="#i-x" /></svg>
        </button>
      </div>`,
    )
    .join("");
  document.querySelectorAll(".announcements").forEach((box) => {
    box.innerHTML = html;
  });
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-dismiss-announcement]");
  if (!button) return;
  const id = Number(button.dataset.dismissAnnouncement);
  const announcement = (window.STUDYHUB_ANNOUNCEMENTS ?? []).find((a) => a.id === id);
  if (!announcement) return;
  const dismissed = readDismissed();
  dismissed[id] = announcement.version;
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch {
    /* storage blocked: it just hides for this visit */
  }
  renderAnnouncements();
});

renderAnnouncements();

/* ---------- Admin Settings: announcements, sign-ups, backup ----------
   Sign-ups + backup cards are Super Admin only (the server refuses others). */

const annForm = document.querySelector("#ann-form");
let annItems = [];
let annConfirmDelete = null;

const ANN_STATE_LABELS = { live: "Live", scheduled: "Scheduled", ended: "Ended" };
const ANN_AUDIENCE_LABELS = { all: "Everyone", student: "Students", teacher: "Teachers" };

// "2026-12-01 08:00:00" -> "2026-12-01T08:00" for <input type="datetime-local">
const toLocalInput = (value) => (value ? String(value).replace(" ", "T").slice(0, 16) : "");

function renderAnnouncementList() {
  const list = document.querySelector("#ann-list");
  if (!list) return;
  if (!annItems.length) {
    list.innerHTML = `<li class="content-empty">No announcements yet.</li>`;
    return;
  }
  list.innerHTML = annItems
    .map((a) => {
      const window_ = [
        a.startsAt ? `from ${formatAccountDate(a.startsAt, true)}` : "",
        a.endsAt ? `until ${formatAccountDate(a.endsAt, true)}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      const meta = [ANN_AUDIENCE_LABELS[a.audience], a.importance === "important" ? "Important" : "", window_, `by ${a.author}`]
        .filter(Boolean)
        .join(" · ");
      const confirming = annConfirmDelete === a.id;
      return `<li class="content-item">
        <div class="content-main">
          <strong>${escapeHTML(a.title)} <span class="ann-state" data-state="${escapeHTML(a.state)}">${escapeHTML(ANN_STATE_LABELS[a.state] ?? a.state)}</span></strong>
          <span class="content-meta">${escapeHTML(meta)}</span>
          <p class="content-body">${escapeHTML(a.body)}</p>
        </div>
        <div class="task-actions">
          <button type="button" data-ann-edit="${a.id}">Edit</button>
          <button type="button" class="${confirming ? "btn-danger" : ""}" data-ann-delete="${a.id}">${confirming ? "Confirm delete" : "Delete"}</button>
        </div>
      </li>`;
    })
    .join("");
}

async function loadAnnouncementsAdmin() {
  const data = await postAdmin({ action: "list_announcements" });
  if (!data.ok) return setFormMessage("#ann-message", data.message, true);
  annItems = data.announcements;
  renderAnnouncementList();
}

function openAnnouncementForm(item = null) {
  if (!annForm) return;
  annForm.reset();
  annForm.elements.id.value = item?.id ?? "";
  annForm.elements.title.value = item?.title ?? "";
  annForm.elements.body.value = item?.body ?? "";
  annForm.elements.audience.value = item?.audience ?? "all";
  annForm.elements.importance.value = item?.importance ?? "info";
  annForm.elements.startsAt.value = toLocalInput(item?.startsAt);
  annForm.elements.endsAt.value = toLocalInput(item?.endsAt);
  annForm.hidden = false;
  setFormMessage("#ann-message", "");
  annForm.elements.title.focus();
}

document.querySelector("#ann-new")?.addEventListener("click", () => openAnnouncementForm());
document.querySelector("#ann-cancel")?.addEventListener("click", () => {
  annForm.hidden = true;
});

annForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const f = annForm.elements;
  const button = annForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const data = await postAdmin({
      action: "save_announcement",
      id: Number(f.id.value) || 0,
      title: f.title.value.trim(),
      body: f.body.value.trim(),
      audience: f.audience.value,
      importance: f.importance.value,
      startsAt: f.startsAt.value,
      endsAt: f.endsAt.value,
    });
    if (!data.ok) {
      setFormMessage("#ann-message", data.message, true);
      if (data.field) f[data.field]?.focus();
      return;
    }
    annForm.hidden = true;
    setFormMessage("#ann-message", data.message);
    await loadAnnouncementsAdmin();
  } finally {
    button.disabled = false;
  }
});

document.querySelector("#ann-list")?.addEventListener("click", async (event) => {
  const edit = event.target.closest("[data-ann-edit]");
  if (edit) {
    openAnnouncementForm(annItems.find((a) => a.id === Number(edit.dataset.annEdit)));
    return;
  }
  const del = event.target.closest("[data-ann-delete]");
  if (!del) return;
  const id = Number(del.dataset.annDelete);
  if (annConfirmDelete !== id) {
    // First click arms it; second click deletes.
    annConfirmDelete = id;
    renderAnnouncementList();
    document.querySelector(`[data-ann-delete="${id}"]`)?.focus();
    return;
  }
  annConfirmDelete = null;
  const data = await postAdmin({ action: "delete_announcement", id });
  setFormMessage("#ann-message", data.message, !data.ok);
  await loadAnnouncementsAdmin();
});

const signupForm = document.querySelector("#signup-settings-form");

async function loadGlobalSettings() {
  const data = await postAdmin({ action: "get_settings" });
  if (!data.ok || !signupForm) return;
  signupForm.elements.allowSignups.checked = data.settings.allowSignups;
  signupForm.elements.allowTeacherSignups.checked = data.settings.allowTeacherSignups;
}

signupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = await postAdmin({
    action: "save_settings",
    allowSignups: signupForm.elements.allowSignups.checked,
    allowTeacherSignups: signupForm.elements.allowTeacherSignups.checked,
  });
  setFormMessage("#signup-settings-message", data.message, !data.ok);
});

if (document.querySelector("#admin-settings")) {
  const isSuper = currentUser?.role === "super_admin";
  document.querySelector("#signup-settings").hidden = !isSuper;
  document.querySelector("#backup-settings").hidden = !isSuper;
  document.addEventListener("section:shown", (event) => {
    if (event.detail !== "admin-settings") return;
    loadAnnouncementsAdmin();
    if (isSuper) loadGlobalSettings();
  });
}

/* ---------- Moderation: review one user's content ----------
   View + remove with a reason, never edit. The server checks rank, ownership
   of each item, logs the viewing, and tells the owner about each removal. */

const contentDialog = document.querySelector("#content-dialog");
const contentState = { userId: 0, canDelete: false, tab: "tasks", data: null, confirming: null };

function contentItemHTML(kind, item) {
  const confirming = contentState.confirming === `${kind}:${item.id}`;
  let title = "";
  let meta = "";
  let body = "";
  if (kind === "tasks") {
    title = item.title;
    meta = [item.subject, item.status, item.priority + " priority", item.dueDate ? `Due ${item.dueDate}` : ""]
      .filter(Boolean)
      .join(" · ");
    body = item.description;
  } else if (kind === "classes") {
    title = item.title;
    meta = [`${item.day} ${item.time}`, item.courseCode, item.instructor].filter(Boolean).join(" · ");
  } else {
    title = item.title;
    meta = item.remark ? `Reminder: ${item.remark}` : "";
    body = item.body;
  }

  const action = !contentState.canDelete
    ? ""
    : confirming
      ? `<div class="content-confirm">
           <label for="content-reason">Reason (the owner will see it)</label>
           <input id="content-reason" data-content-reason maxlength="255" placeholder="e.g. Offensive language" />
           <div class="task-actions">
             <button type="button" data-content-cancel>Cancel</button>
             <button type="button" class="btn-danger" data-content-remove="${kind}:${item.id}">Remove</button>
           </div>
         </div>`
      : `<button type="button" class="content-remove-btn" data-content-ask="${kind}:${item.id}">Remove</button>`;

  return `<li class="content-item${confirming ? " is-confirming" : ""}">
      <div class="content-main">
        <strong>${escapeHTML(title)}</strong>
        ${meta ? `<span class="content-meta">${escapeHTML(meta)}</span>` : ""}
        ${body ? `<p class="content-body">${escapeHTML(body)}</p>` : ""}
      </div>
      ${action}
    </li>`;
}

function renderContentList() {
  const data = contentState.data;
  if (!data) return;
  ["tasks", "classes", "notes"].forEach((kind) => {
    const count = contentDialog.querySelector(`[data-count="${kind}"]`);
    if (count) count.textContent = `(${data[kind].length})`;
  });
  contentDialog.querySelectorAll("[data-content-tab]").forEach((tab) => {
    tab.setAttribute("aria-selected", String(tab.dataset.contentTab === contentState.tab));
  });
  const items = data[contentState.tab];
  const empty = { tasks: "No tasks.", classes: "No classes.", notes: "No notes." }[contentState.tab];
  document.querySelector("#content-list").innerHTML = items.length
    ? items.map((item) => contentItemHTML(contentState.tab, item)).join("")
    : `<li class="content-empty">${empty}</li>`;
  contentDialog.querySelector("[data-content-reason]")?.focus();
}

async function openContentDialog(user) {
  if (!contentDialog) return;
  contentState.userId = user.id;
  contentState.canDelete = user.can.includes("delete_content");
  contentState.tab = "tasks";
  contentState.confirming = null;
  contentState.data = null;
  setLabel("#content-dialog-title", `${user.name}'s content`);
  setFormMessage("#content-dialog-message", "Loading…");
  document.querySelector("#content-list").innerHTML = "";
  contentDialog.showModal();

  const data = await postAdmin({ action: "user_content", id: user.id });
  if (!data.ok) {
    setFormMessage("#content-dialog-message", data.message, true);
    return;
  }
  setFormMessage("#content-dialog-message", "");
  contentState.data = data;
  renderContentList();
}

contentDialog?.addEventListener("click", async (event) => {
  const tab = event.target.closest("[data-content-tab]");
  if (tab) {
    contentState.tab = tab.dataset.contentTab;
    contentState.confirming = null;
    renderContentList();
    return;
  }
  const ask = event.target.closest("[data-content-ask]");
  if (ask) {
    contentState.confirming = ask.dataset.contentAsk;
    setFormMessage("#content-dialog-message", "");
    renderContentList();
    return;
  }
  if (event.target.closest("[data-content-cancel]")) {
    contentState.confirming = null;
    renderContentList();
    return;
  }
  const remove = event.target.closest("[data-content-remove]");
  if (!remove) return;

  const [kind, rawId] = remove.dataset.contentRemove.split(":");
  const itemId = Number(rawId);
  const reason = contentDialog.querySelector("[data-content-reason]")?.value ?? "";
  remove.disabled = true;
  const data = await postAdmin({
    action: "delete_content",
    id: contentState.userId,
    type: { tasks: "task", classes: "class", notes: "note" }[kind],
    itemId,
    reason,
  });
  if (!data.ok) {
    remove.disabled = false;
    setFormMessage("#content-dialog-message", data.message, true);
    contentDialog.querySelector("[data-content-reason]")?.focus();
    return;
  }
  // Drop it locally (re-fetching would log another "viewed" entry).
  contentState.data[kind] = contentState.data[kind].filter((item) => item.id !== itemId);
  contentState.confirming = null;
  renderContentList();
  setFormMessage("#content-dialog-message", data.message);
  loadAdminReports();
});

// Manage dialog -> Review content.
document.querySelector("#user-dialog-content")?.addEventListener("click", (event) => {
  if (!event.target.closest("[data-open-content]")) return;
  const user = usersState.users.find((u) => u.id === dialogUserId);
  userDialog.close();
  if (user) openContentDialog(user);
});

/* ---------- Logs (Admin / Super Admin) ----------
   Activity = what people did (tasks, classes, notes, imports).
   Security = sign-ins and account changes; Super Admin only (server-enforced). */

const isSuperAdmin = currentUser?.role === "super_admin";
const logsState = { tab: "activity", search: "", type: "", period: "7", page: 1, userId: 0, userName: "" };

const ACTIVITY_LABELS = {
  CREATE: "Created",
  UPDATE: "Edited",
  DELETE: "Deleted",
  STATUS_CHANGE: "Changed status",
  ARCHIVE: "Archived",
  IMPORT: "Imported a backup",
  RESET: "Reset their data",
  MODERATION_DELETE: "Removed by an admin",
};
// (announcement + settings events are added to SECURITY_LABELS below)
const SECURITY_LABELS = {
  LOGIN: "Signed in",
  LOGOUT: "Signed out",
  SIGNUP: "Signed up",
  LOGIN_FAILED: "Failed sign-in",
  LOGIN_BLOCKED: "Blocked sign-in",
  LOGIN_LOCKED: "Locked out",
  SESSION_ENDED: "Signed out automatically",
  PERMISSION_DENIED: "Refused action",
  NAME_CHANGED: "Changed name",
  EMAIL_CHANGED: "Changed email",
  PASSWORD_CHANGED: "Changed password",
  PASSWORD_CHECK_FAILED: "Wrong current password",
  PASSWORD_RESET: "Password reset",
  USER_APPROVED: "Account approved",
  STATUS_CHANGE: "Status changed",
  ROLE_CHANGE: "Role changed",
  USER_EDITED: "Account edited",
  USER_CREATED: "Account created",
  USER_DELETED: "Account deleted",
  CONTENT_VIEWED: "Content reviewed",
  CONTENT_DELETED: "Content removed",
  ANNOUNCEMENT_SAVED: "Announcement saved",
  ANNOUNCEMENT_DELETED: "Announcement removed",
  SETTINGS_CHANGED: "Settings changed",
  BACKUP_DOWNLOADED: "Backup downloaded",
};
// Events worth a second look get a warning tint (always with their text label).
const ALERT_EVENTS = new Set([
  "LOGIN_FAILED",
  "LOGIN_BLOCKED",
  "LOGIN_LOCKED",
  "PERMISSION_DENIED",
  "PASSWORD_CHECK_FAILED",
]);

function personCell(person) {
  if (!person) return `<span class="muted-cell">Not signed in</span>`;
  return `<span class="person"><strong>${escapeHTML(person.name)}</strong>${
    person.email ? `<span class="user-email">${escapeHTML(person.email)}</span>` : ""
  }</span>`;
}

function logTime(value) {
  const date = new Date(String(value).replace(" ", "T"));
  return `<time datetime="${escapeHTML(value)}" title="${escapeHTML(date.toLocaleString())}">${escapeHTML(
    date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }),
  )}</time>`;
}

// "task TASK-41" -> "Task TASK-41"; whole-app actions (imports, resets) -> "All data".
function logItem(target) {
  const text = String(target ?? "").trim();
  if (!text || text.startsWith("app ")) return "All data";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function renderLogRows(rows) {
  const head = document.querySelector("#logs-head");
  const body = document.querySelector("#logs-body");
  if (logsState.tab === "activity") {
    head.innerHTML = "<tr><th>When</th><th>Who</th><th>Action</th><th>Item</th><th>Details</th></tr>";
    body.innerHTML = rows
      .map(
        (r) => `<tr>
          <td class="nowrap">${logTime(r.time)}</td>
          <td>${personCell(r.user)}</td>
          <td class="nowrap">${escapeHTML(ACTIVITY_LABELS[r.type] ?? r.type)}</td>
          <td class="nowrap">${escapeHTML(logItem(r.target))}</td>
          <td class="log-details">${escapeHTML(r.details ?? "")}</td>
        </tr>`,
      )
      .join("");
  } else {
    // IP sits under the time: six columns don't fit beside the sidebar.
    head.innerHTML = "<tr><th>When</th><th>Event</th><th>By</th><th>Account</th><th>Details</th></tr>";
    body.innerHTML = rows
      .map(
        (r) => `<tr>
          <td class="nowrap">${logTime(r.time)}${r.ip ? `<span class="log-ip" title="IP address">${escapeHTML(r.ip)}</span>` : ""}</td>
          <td><span class="log-event" data-tone="${ALERT_EVENTS.has(r.type) ? "alert" : "neutral"}">${escapeHTML(SECURITY_LABELS[r.type] ?? r.type)}</span></td>
          <td>${personCell(r.actor)}</td>
          <td>${personCell(r.target)}</td>
          <td class="log-details">${escapeHTML(r.details ?? "")}</td>
        </tr>`,
      )
      .join("");
  }
}

async function loadLogs() {
  if (!document.querySelector("#logs-body")) return;
  const data = await postAdmin({
    action: logsState.tab === "activity" ? "activity_log" : "security_log",
    search: logsState.search,
    type: logsState.type,
    period: logsState.period,
    userId: logsState.userId,
    page: logsState.page,
  });
  const message = document.querySelector("#logs-message");
  if (!data.ok) {
    message.textContent = data.message;
    message.hidden = false;
    return;
  }
  message.hidden = true;
  logsState.page = data.page;

  renderLogRows(data.rows);
  document.querySelector("#logs-empty").hidden = data.rows.length > 0;
  setLabel("#logs-count", `${data.total} entr${data.total === 1 ? "y" : "ies"}`);

  // Type filter: the types that actually occur, with readable names.
  const labels = logsState.tab === "activity" ? ACTIVITY_LABELS : SECURITY_LABELS;
  document.querySelector("#logs-type").innerHTML =
    `<option value="">All types</option>` +
    data.types
      .map(
        (t) =>
          `<option value="${escapeHTML(t)}" ${t === logsState.type ? "selected" : ""}>${escapeHTML(labels[t] ?? t)}</option>`,
      )
      .join("");

  document.querySelector("#logs-pagination").innerHTML =
    data.pages > 1
      ? `<button type="button" data-logs-page="${data.page - 1}" ${data.page <= 1 ? "disabled" : ""}>Previous</button>
         <span>Page ${data.page} of ${data.pages}</span>
         <button type="button" data-logs-page="${data.page + 1}" ${data.page >= data.pages ? "disabled" : ""}>Next</button>`
      : "";
}

function setLogTab(tab) {
  logsState.tab = tab === "security" && isSuperAdmin ? "security" : "activity";
  logsState.type = "";
  logsState.page = 1;
  document.querySelectorAll("[data-log-tab]").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.logTab === logsState.tab));
  });
  setLabel(
    "#logs-scope-note",
    logsState.tab === "security"
      ? "Sign-ins, failed sign-ins and every change to an account. Only Super Admins can see this log."
      : isSuperAdmin
        ? "What everyone did with their tasks, classes and notes."
        : "What students and teachers did with their tasks, classes and notes.",
  );
  setLabel("#logs-caption", logsState.tab === "security" ? "Security log" : "Activity log");
}

function setLogUser(id, name) {
  logsState.userId = id || 0;
  logsState.userName = name || "";
  logsState.page = 1;
  document.querySelector("#logs-user-filter").hidden = !logsState.userId;
  setLabel("#logs-user-name", logsState.userName);
}

// Open the Logs page on a given tab, optionally for one person.
function openLogs(tab, userId = 0, userName = "") {
  setLogTab(tab);
  setLogUser(userId, userName);
  if (userId) {
    // A person's history is more useful without the 7-day limit.
    logsState.period = "";
    const period = document.querySelector("#logs-period");
    if (period) period.value = "";
  }
  goToSection("logs"); // fires section:shown -> loadLogs()
}

if (document.querySelector("#logs")) {
  document.querySelector("#logs-tab-security").hidden = !isSuperAdmin;
  setLogTab("activity");

  document.querySelector(".log-tabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-log-tab]");
    if (!button) return;
    setLogTab(button.dataset.logTab);
    loadLogs();
  });

  const logsFilters = document.querySelector("#logs-filters");
  let logsSearchTimer = null;
  logsFilters.addEventListener("submit", (event) => event.preventDefault());
  logsFilters.addEventListener("input", (event) => {
    if (event.target.name !== "search") return;
    clearTimeout(logsSearchTimer);
    logsSearchTimer = setTimeout(() => {
      logsState.search = event.target.value.trim();
      logsState.page = 1;
      loadLogs();
    }, 250);
  });
  logsFilters.addEventListener("change", (event) => {
    if (event.target.name === "type" || event.target.name === "period") {
      logsState[event.target.name] = event.target.value;
      logsState.page = 1;
      loadLogs();
    }
  });

  document.querySelector("#logs-clear-user")?.addEventListener("click", () => {
    setLogUser(0, "");
    loadLogs();
  });
  document.querySelector("#logs-pagination")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-logs-page]");
    if (!button) return;
    logsState.page = Number(button.dataset.logsPage);
    loadLogs();
  });
  document.querySelector("#report-open-security")?.addEventListener("click", (event) => {
    event.preventDefault();
    openLogs("security");
  });

  // Manage dialog -> this person's history.
  document.querySelector("#user-dialog")?.addEventListener("click", (event) => {
    const link = event.target.closest("[data-open-log]");
    if (!link) return;
    const user = usersState.users.find((u) => u.id === dialogUserId);
    userDialog.close();
    if (user) openLogs(link.dataset.openLog, user.id, user.name);
  });

  document.addEventListener("section:shown", (event) => {
    if (event.detail === "logs") loadLogs();
  });
}

const archivesDialog = document.querySelector("#archives-dialog");
const openArchivesButton = document.querySelector("#open-archives");

if (archivesDialog && openArchivesButton) {
  const closeArchives = () => {
    if (typeof archivesDialog.close === "function") archivesDialog.close();
    else archivesDialog.removeAttribute("open");
  };

  openArchivesButton.addEventListener("click", () => {
    if (archivesDialog.hasAttribute("open")) return;
    // Start fresh: no half-finished delete or old status from last time.
    archiveDeleteId = null;
    setArchiveStatus("");
    renderArchives();

    if (typeof archivesDialog.showModal === "function")
      archivesDialog.showModal();
    else archivesDialog.setAttribute("open", "");
  });

  document
    .querySelector("#close-archives")
    ?.addEventListener("click", closeArchives);

  /* A click on the dark backdrop lands on the <dialog> itself, not on its content. */
  archivesDialog.addEventListener("click", (event) => {
    if (event.target === archivesDialog) closeArchives();
  });
}

const focusToggle = document.querySelector("#focus-toggle");

if (focusToggle) {
  focusToggle.addEventListener("click", () => {
    const isPressed = focusToggle.getAttribute("aria-pressed") === "true";
    const nextPressed = !isPressed;
    focusToggle.setAttribute("aria-pressed", String(nextPressed));
    focusToggle.textContent = nextPressed ? "Exit focus" : "Focus mode";
    document.body.classList.toggle("focus-mode", nextPressed);
  });
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function showTaskError(message) {
  const errorSummary = document.querySelector("#task-error-summary");
  if (!errorSummary) return;

  errorSummary.textContent = message;
  errorSummary.hidden = false;
}

function hideTaskError() {
  const errorSummary = document.querySelector("#task-error-summary");
  if (!errorSummary) return;

  errorSummary.hidden = true;
  errorSummary.textContent = "";
}

function showWorkflowMessage(message) {
  const messageRegion = document.querySelector("#workflow-message");
  if (!messageRegion) return;

  messageRegion.textContent = message;
  messageRegion.hidden = false;

  // Fade out after a few seconds; a newer message restarts the timer.
  clearTimeout(showWorkflowMessage.timer);
  messageRegion.classList.remove("is-leaving");
  showWorkflowMessage.timer = setTimeout(() => {
    messageRegion.classList.add("is-leaving");
    showWorkflowMessage.timer = setTimeout(() => {
      messageRegion.hidden = true;
      messageRegion.classList.remove("is-leaving");
    }, 250);
  }, 4000);
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function runStableIdAssertions() {
  const originalRecords = state.records.map((record) => ({ ...record }));
  const originalIds = originalRecords.map((record) => record.id);

  console.assert(
    new Set(originalIds).size === originalIds.length,
    "Assertion 1 failed: every task must have a unique stable ID.",
  );

  const sortedIds = [...originalRecords]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((record) => record.id);

  console.assert(
    originalIds.every((id) => sortedIds.includes(id)) &&
      sortedIds.every((id) => originalIds.includes(id)),
    "Assertion 2 failed: sorting changed the set of stable IDs.",
  );

  const deletedId = originalRecords[0]?.id;
  const recordsAfterDelete = deletedId
    ? originalRecords.filter((record) => record.id !== deletedId)
    : [];

  console.assert(
    deletedId
      ? !recordsAfterDelete.some((record) => record.id === deletedId) &&
          recordsAfterDelete.every((record) => originalIds.includes(record.id))
      : recordsAfterDelete.length === 0,
    "Assertion 3 failed: deleting one record affected other stable IDs.",
  );

  console.log("Unit 3 stable-ID assertions completed.");
}

function runWorkflowTransitionAssertions() {
  const illegalCases = [
    ["To do", "Done"],
    ["To do", "In review"],
    ["In progress", "Done"],
    ["In progress", "Archived"],
    ["In review", "To do"],
    ["In review", "Archived"],
    ["Done", "To do"],
    ["Done", "In review"],
    ["Archived", "Done"],
    ["Archived", "In progress"],
    ["To do", "To do"],
    ["Done", "Done"],
    ["Archived", "Archived"],
    ["In progress", "Blocked"],
    ["To do", "toString"],
    ["To do", "__proto__"],
  ];

  illegalCases.forEach(([status, nextStatus], index) => {
    const record = {
      id: `WORKFLOW-TEST-${index + 1}`,
      title: "Workflow test",
      subject: "Workflow testing",
      description: "Record used to verify rejected transitions.",
      dueDate: "2026-12-31",
      status,
      workflowHistory: [],
    };
    const before = JSON.stringify(record);
    const result = attemptTransition(
      record,
      nextStatus,
      "2026-10-02T00:00:00.000Z",
    );

    console.assert(
      !result.allowed && JSON.stringify(record) === before,
      `Workflow assertion ${index + 1} failed: rejected ${status} → ${nextStatus} changed the record.`,
    );
  });

  const legalCases = [
    ["To do", "In progress"],
    ["In progress", "In review"],
    ["In progress", "To do"],
    ["In review", "Done"],
    ["In review", "In progress"],
    ["Done", "Archived"],
    ["Done", "In progress"],
  ];

  legalCases.forEach(([status, nextStatus], index) => {
    const record = {
      id: `WORKFLOW-OK-${index + 1}`,
      title: "Workflow test",
      subject: "Workflow testing",
      description: "Record used to verify allowed transitions.",
      dueDate: "2026-12-31",
      status,
      workflowHistory: [],
    };
    const result = attemptTransition(
      record,
      nextStatus,
      "2026-10-02T00:00:00.000Z",
    );

    console.assert(
      result.allowed &&
        result.record.status === nextStatus &&
        result.record.workflowHistory.length === 1 &&
        record.status === status,
      `Workflow assertion failed: allowed ${status} → ${nextStatus} did not apply cleanly.`,
    );
  });

  console.log(
    `Workflow assertions completed (${illegalCases.length} rejected, ${legalCases.length} allowed).`,
  );
}

const THEME_KEY = "studyhub-theme";
const THEME_CHOICES = {
  dark: "Dark",
  light: "Light",
  system: "Match my device",
};

function getStoredTheme() {
  if (Object.hasOwn(THEME_CHOICES, state.preferences.theme)) {
    return state.preferences.theme;
  }

  try {
    const stored = localStorage.getItem(THEME_KEY);
    return Object.hasOwn(THEME_CHOICES, stored) ? stored : "dark";
  } catch {
    return "dark"; /* storage blocked (private mode etc.) */
  }
}

function storeTheme(choice) {
  state.preferences.theme = choice;
  try {
    localStorage.setItem(THEME_KEY, choice);
  } catch {
    showStorageStatus(
      "Theme changed for this session, but browser storage could not save it.",
      true,
    );
  }
  saveState();
}

const lightQuery = window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: light)")
  : null;

function resolveTheme(choice) {
  if (choice === "system")
    return lightQuery && lightQuery.matches ? "light" : "dark";
  return choice === "light" ? "light" : "dark";
}

function applyTheme(choice) {
  document.documentElement.setAttribute("data-theme", resolveTheme(choice));
}

const themeOptions = document.querySelectorAll('input[name="theme"]');

if (themeOptions.length) {
  const current = getStoredTheme();
  state.preferences.theme = current;
  themeOptions.forEach((input) => {
    input.checked = input.value === current;
  });

  themeOptions.forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked || !Object.hasOwn(THEME_CHOICES, input.value)) return;
      storeTheme(input.value);
      applyTheme(input.value);
      showMessage(`Theme set to ${THEME_CHOICES[input.value]}.`);
    });
  });

  /* While on "Match my device", follow OS changes live. */
  if (lightQuery) {
    lightQuery.addEventListener("change", () => {
      if (getStoredTheme() === "system") applyTheme("system");
    });
  }
}

function updateThemeControls() {
  themeOptions.forEach((input) => {
    input.checked = input.value === state.preferences.theme;
  });
  applyTheme(state.preferences.theme);
}

function updatePreferenceControls() {
  const controls = [
    ["#status-filter", state.filters.status],
    ["#priority-filter", state.filters.priority],
    ["#sort-key", state.sort.key],
    ["#sort-direction", state.sort.direction],
    ["#page-size", String(state.pageSize)],
  ];
  controls.forEach(([selector, value]) => {
    const control = document.querySelector(selector);
    if (control) control.value = value;
  });
}

function closeImportPreview() {
  pendingImport = null;
  const preview = document.querySelector("#import-preview-box");
  if (preview) preview.hidden = true;
}

/* Import and Reset replace everything in the database (api/data.php), then
   reload the page so it shows exactly what the database now holds. */
const FLASH_KEY = "studyhub-flash";

async function replaceDataOnServer(body, button, busyLabel) {
  const buttons = document.querySelectorAll(
    "#system-data button, #system-data .button-file-label",
  );
  const originalLabel = button?.textContent;
  buttons.forEach((b) => b.setAttribute("aria-disabled", "true"));
  buttons.forEach((b) => (b.disabled = true));
  if (button) button.textContent = busyLabel;

  try {
    const response = await fetch("api/data.php", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message || "The server refused the change.");
    return data;
  } catch (error) {
    showStorageStatus(
      `${error.message || "Could not reach the server."} Your data was not changed.`,
      true,
    );
    buttons.forEach((b) => {
      b.disabled = false;
      b.removeAttribute("aria-disabled");
    });
    if (button) button.textContent = originalLabel;
    return null;
  }
}

// Reload into the new data, carrying a one-line confirmation across the reload.
function reloadWithMessage(message, theme) {
  try {
    sessionStorage.setItem(FLASH_KEY, message);
    if (theme) localStorage.setItem(THEME_KEY, theme);
    // Drop the old browser copy so nothing stale is mixed back in.
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked: the reload still shows the new data */
  }
  window.location.reload();
}

function showFlashMessage() {
  try {
    const message = sessionStorage.getItem(FLASH_KEY);
    if (message) {
      sessionStorage.removeItem(FLASH_KEY);
      showMessage(message);
    }
  } catch {
    /* storage blocked */
  }
}

function runPersistenceAssertions() {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const valid = createStoragePayload();

  console.assert(
    isValidPayload(valid),
    "Persistence assertion 1 failed: a valid payload was rejected.",
  );
  console.assert(
    (() => {
      try {
        return isValidPayload(JSON.parse("{"));
      } catch {
        return false;
      }
    })() === false,
    "Persistence assertion 2 failed: malformed JSON was not rejected.",
  );

  const wrongVersion = clone(valid);
  wrongVersion.schemaVersion += 1;
  console.assert(
    !isValidPayload(wrongVersion),
    "Persistence assertion 3 failed: an unsupported schema version was accepted.",
  );

  const missingCollection = clone(valid);
  delete missingCollection.notes;
  console.assert(
    !isValidPayload(missingCollection),
    "Persistence assertion 4 failed: a missing required collection was accepted.",
  );

  // A complete, valid task used only by the checks below.
  const testTask = {
    id: "TASK-TEST",
    title: "Persistence test task",
    subject: "Testing",
    description: "",
    dueDate: "2026-12-31",
    priority: "Medium",
    status: "To do",
    createdAt: "2026-01-01T00:00:00",
    estimatedMinutes: 30,
    workflowHistory: [],
  };

  // Control: the test task on its own is valid, so the rejections below are
  // caused only by the duplicate ID / missing field.
  const singleTask = clone(valid);
  singleTask.records = [clone(testTask)];
  console.assert(
    isValidPayload(singleTask),
    "Persistence assertion 5a failed: a valid single task was rejected.",
  );

  const duplicateIds = clone(valid);
  duplicateIds.records = [clone(testTask), clone(testTask)];
  console.assert(
    !isValidPayload(duplicateIds),
    "Persistence assertion 5 failed: duplicate record IDs were accepted.",
  );

  const missingTaskField = clone(valid);
  missingTaskField.records = [clone(testTask)];
  delete missingTaskField.records[0].title;
  console.assert(
    !isValidPayload(missingTaskField),
    "Persistence assertion 6 failed: a task with a missing field was accepted.",
  );

  const emptyPayload = clone(valid);
  for (const collection of [
    "records",
    "archivedRecords",
    "schedules",
    "notes",
    "auditLog",
  ]) {
    emptyPayload[collection] = [];
  }
  console.assert(
    isValidPayload(emptyPayload),
    "Persistence assertion 7 failed: valid empty collections were rejected.",
  );

  const originalState = clone(state);
  const expectedIds = valid.records.map((record) => record.id);
  applyPayload(valid);
  const restoreSucceeded =
    JSON.stringify(state.records.map((record) => record.id)) ===
    JSON.stringify(expectedIds);
  Object.assign(state, originalState);
  console.assert(
    restoreSucceeded,
    "Persistence assertion 8 failed: valid data did not restore into state.",
  );
  console.log("Unit 8 persistence assertions completed (8 checks).");
}

document.querySelector("#btn-export-json")?.addEventListener("click", () => {
  const payload = createStoragePayload();
  const file = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `studyhub-backup-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  showStorageStatus("JSON backup exported.");
});

document
  .querySelector("#import-json-file")
  ?.addEventListener("change", async (event) => {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    closeImportPreview();

    try {
      const payload = JSON.parse(await file.text());
      if (!isValidPayload(payload)) {
        throw new Error(
          "The file is malformed, incomplete, or uses an unsupported schema version.",
        );
      }

      pendingImport = payload;
      const count = payload.records.length + payload.archivedRecords.length;
      const previewText = document.querySelector("#import-preview-text");
      const preview = document.querySelector("#import-preview-box");
      if (previewText) {
        previewText.textContent = `This backup from ${new Date(payload.savedAt).toLocaleString()} has ${count} task(s) (${payload.records.length} active, ${payload.archivedRecords.length} archived), ${payload.schedules.length} class(es) and ${payload.notes.length} note(s). Importing it permanently replaces all of your current tasks, classes and notes.`;
      }
      if (preview) preview.hidden = false;
      showStorageStatus(
        "Import validated. Review the preview before replacing data.",
      );
    } catch (error) {
      console.error("Unable to read the selected StudyHub backup.", error);
      showStorageStatus(
        `Import was not prepared: ${error.message || "the file could not be read."}`,
        true,
      );
    } finally {
      input.value = "";
    }
  });

document.querySelector("#btn-confirm-import")?.addEventListener("click", async (event) => {
  if (!pendingImport || !isValidPayload(pendingImport)) {
    showStorageStatus("There is no valid import to confirm.", true);
    closeImportPreview();
    return;
  }

  showStorageStatus("Importing backup…");
  const result = await replaceDataOnServer(
    { action: "import", data: pendingImport },
    event.currentTarget,
    "Importing…",
  );
  if (!result) return;

  const { tasks, schedules, notes } = result.counts;
  reloadWithMessage(
    `Backup imported: ${tasks} task(s), ${schedules} class(es) and ${notes} note(s).`,
    result.theme,
  );
});

document.querySelector("#btn-cancel-import")?.addEventListener("click", () => {
  closeImportPreview();
  showStorageStatus("Import cancelled. Current data was not changed.");
});

document.querySelector("#btn-reset-data")?.addEventListener("click", () => {
  const box = document.querySelector("#reset-confirm-box");
  const input = document.querySelector("#reset-confirm-input");
  if (box) box.hidden = false;
  if (input) {
    input.value = "";
    input.focus();
  }
  showStorageStatus(
    "Export a backup first if you may need to recover this data. Type RESET to continue.",
  );
});

document.querySelector("#btn-cancel-reset")?.addEventListener("click", () => {
  const box = document.querySelector("#reset-confirm-box");
  const input = document.querySelector("#reset-confirm-input");
  if (box) box.hidden = true;
  if (input) input.value = "";
  showStorageStatus("Reset cancelled. Current data was not changed.");
});

document.querySelector("#btn-confirm-reset")?.addEventListener("click", async (event) => {
  const input = document.querySelector("#reset-confirm-input");
  if (input?.value !== "RESET") {
    showStorageStatus('Type "RESET" exactly to confirm the data reset.', true);
    input?.focus();
    return;
  }

  closeImportPreview();
  showStorageStatus("Resetting your data…");
  const result = await replaceDataOnServer(
    { action: "reset" },
    event.currentTarget,
    "Resetting…",
  );
  if (!result) return;

  reloadWithMessage(
    "Your data was reset. All tasks, classes and notes were deleted and settings restored to defaults.",
    result.theme,
  );
});

// Initial render
runPersistenceAssertions();
runDashboardMetricAssertions();
updatePreferenceControls();
render();
showFlashMessage();
if (currentView === "admin") {
  renderAdminQA(runQualityAssuranceSuite());
}
runStableIdAssertions();
runWorkflowTransitionAssertions();

const CLASSROOMS_KEY = "studyhub-classes-v1";
const LEGACY_CLASSROOM_KEY = "studyhub-classroom-v1";

function syncClassroomAssignments() {
  if (currentView !== "student" || !session.userId) return false;

  let classes;
  try {
    const raw = localStorage.getItem(CLASSROOMS_KEY);
    classes = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(classes)) {
      throw new Error("Saved classrooms must be a list.");
    }
  } catch (error) {
    console.error("Unable to load classroom assignments into Tasks.", error);
    showMessage("Classroom assignments could not be loaded into Tasks.");
    return false;
  }

  const priorAssignedTasks = getAllTasks().filter(
    (task) => task.classroomAssignmentId,
  );
  const priorByAssignment = new Map(
    priorAssignedTasks.map((task) => [task.classroomAssignmentId, task]),
  );
  const archivedAssignments = new Set(
    state.archivedRecords
      .filter((task) => task.classroomAssignmentId)
      .map((task) => task.classroomAssignmentId),
  );
  const assignedTasks = [];

  for (const item of classes) {
    if (
      !item ||
      !Array.isArray(item.studentIds) ||
      !item.studentIds.includes(session.userId) ||
      !Array.isArray(item.posts)
    ) {
      continue;
    }

    for (const post of item.posts) {
      if (
        !post ||
        post.type !== "Assignment" ||
        typeof post.id !== "string" ||
        !post.id ||
        typeof post.title !== "string"
      ) {
        continue;
      }

      const assignmentId = `${item.id}:${post.id}`;
      const previous = priorByAssignment.get(assignmentId);
      assignedTasks.push({
        id: previous?.id ?? `CLASS-${item.id}-${post.id}`,
        title: post.title,
        subject: item.subject || item.name || "Classroom assignment",
        description: post.body || "",
        dueDate: post.dueDate || "",
        priority: previous?.priority ?? "Medium",
        status: previous?.status ?? "To do",
        createdAt: post.createdAt || new Date().toISOString(),
        estimatedMinutes: previous?.estimatedMinutes ?? 30,
        workflowHistory: previous?.workflowHistory ?? [],
        classroomAssignmentId: assignmentId,
        classroomId: item.id,
        classroomName: item.name || "",
        teacherName: item.teacherName || "",
      });
    }
  }

  const currentAssignmentIds = new Set(
    assignedTasks.map((task) => task.classroomAssignmentId),
  );
  state.records = [
    ...state.records.filter((task) => !task.classroomAssignmentId),
    ...assignedTasks.filter(
      (task) => !archivedAssignments.has(task.classroomAssignmentId),
    ),
  ];
  state.archivedRecords = [
    ...state.archivedRecords.filter(
      (task) =>
        !task.classroomAssignmentId ||
        currentAssignmentIds.has(task.classroomAssignmentId),
    ),
    ...assignedTasks.filter((task) =>
      archivedAssignments.has(task.classroomAssignmentId),
    ),
  ];
  return true;
}

function readClassrooms() {
  try {
    const saved = localStorage.getItem(CLASSROOMS_KEY);
    if (saved === null) return [];
    const classes = JSON.parse(saved);
    if (!Array.isArray(classes)) {
      throw new Error("Saved classrooms must be a list.");
    }
    return classes;
  } catch (error) {
    console.error("Unable to load classroom data for teacher views.", error);
    showMessage("Classroom data could not be loaded.");
    return [];
  }
}

function getTeacherStudentNames() {
  try {
    const users = JSON.parse(localStorage.getItem("studyhub-users") || "[]");
    return new Map(
      users
        .filter((user) => user && typeof user.id === "string")
        .map((user) => [user.id, user.displayName || user.name || "Student"]),
    );
  } catch (error) {
    console.error("Unable to load classroom student names.", error);
    return new Map();
  }
}

function classroomStudentName(id, names) {
  return (
    names.get(id) ||
    (id === "student-001" ? "Student" : `Student (${id.slice(0, 8)})`)
  );
}

function clearLegacyTeacherSamples() {
  try {
    const raw = localStorage.getItem(LEGACY_CLASSROOM_KEY);
    if (raw === null) return;
    const saved = JSON.parse(raw);
    if (
      !saved ||
      !Array.isArray(saved.students) ||
      !Array.isArray(saved.assignments) ||
      !Array.isArray(saved.submissions)
    ) {
      return;
    }

    const cleaned = {
      ...saved,
      students: saved.students.filter(
        (student) =>
          !(
            (student?.id === "STU-001" && student.name === "Student") ||
            (student?.id === "STU-002" && student.name === "Student 002") ||
            (student?.id === "STU-003" && student.name === "Student 003")
          ),
      ),
      assignments: saved.assignments.filter(
        (assignment) =>
          !(
            assignment?.id === "ASG-001" &&
            assignment.title === "Circuit Analysis Practice" &&
            assignment.subject === "Fundamentals of Electrical Circuits"
          ),
      ),
      submissions: saved.submissions.filter(
        (submission) =>
          !(
            submission?.id === "SUB-001" &&
            submission.assignmentId === "ASG-001" &&
            submission.studentId === "STU-002" &&
            submission.response ===
              "Sample demonstration response for circuit analysis practice."
          ),
      ),
    };
    if (
      cleaned.students.length !== saved.students.length ||
      cleaned.assignments.length !== saved.assignments.length ||
      cleaned.submissions.length !== saved.submissions.length
    ) {
      localStorage.setItem(LEGACY_CLASSROOM_KEY, JSON.stringify(cleaned));
    }
  } catch (error) {
    console.error("Unable to clear built-in teacher sample data.", error);
    showMessage("Built-in teacher sample data could not be cleared.");
  }
}

function renderClassroom() {
  const classes = readClassrooms().filter(
    (classroom) => classroom?.teacherId === session.userId,
  );
  const studentNames = getTeacherStudentNames();
  const students = new Map();
  const assignments = [];
  const submissions = [];

  for (const classroom of classes) {
    const studentIds = Array.isArray(classroom.studentIds)
      ? [
          ...new Set(
            classroom.studentIds.filter((id) => typeof id === "string"),
          ),
        ]
      : [];
    const posts = Array.isArray(classroom.posts) ? classroom.posts : [];
    const classSubmissions = Array.isArray(classroom.submissions)
      ? classroom.submissions
      : [];

    for (const studentId of studentIds) {
      if (!students.has(studentId)) {
        students.set(studentId, {
          id: studentId,
          name: classroomStudentName(studentId, studentNames),
          submitted: 0,
          reviewed: 0,
        });
      }
    }

    for (const post of posts) {
      if (
        !post ||
        post.type !== "Assignment" ||
        typeof post.id !== "string" ||
        typeof post.title !== "string"
      ) {
        continue;
      }

      const assignment = {
        classId: classroom.id,
        className: classroom.name || "Classroom",
        postId: post.id,
        title: post.title,
        studentCount: studentIds.length,
        submissions: [],
      };

      for (const submission of classSubmissions) {
        if (
          !submission ||
          submission.postId !== post.id ||
          typeof submission.studentId !== "string" ||
          !studentIds.includes(submission.studentId)
        ) {
          continue;
        }

        const hasScore =
          submission.score !== null &&
          submission.score !== undefined &&
          submission.score !== "" &&
          Number.isFinite(Number(submission.score));
        const student = students.get(submission.studentId);
        const normalized = {
          ...submission,
          classId: classroom.id,
          className: assignment.className,
          assignmentId: post.id,
          assignmentTitle: post.title,
          studentName:
            student?.name ||
            classroomStudentName(submission.studentId, studentNames),
          reviewed: hasScore,
        };
        assignment.submissions.push(normalized);
        submissions.push(normalized);
        if (student) {
          student.submitted += 1;
          if (hasScore) student.reviewed += 1;
        }
      }

      assignments.push(assignment);
    }
  }

  const reviewed = submissions.filter((submission) => submission.reviewed);
  const studentList = [...students.values()];
  setText("#teacher-total-students", studentList.length);
  setText("#teacher-active-assignments", assignments.length);
  setText("#teacher-total-submissions", submissions.length);
  setText("#teacher-pending-reviews", submissions.length - reviewed.length);
  const recent = document.querySelector("#teacher-recent-submissions");
  if (recent)
    recent.innerHTML = submissions.length
      ? [...submissions]
          .sort(
            (a, b) =>
              (Date.parse(b.submittedAt) || 0) -
              (Date.parse(a.submittedAt) || 0),
          )
          .slice(0, 5)
          .map(
            (submission) =>
              `<div class="teacher-list-item"><strong>${escapeHTML(submission.studentName)}</strong><p>${escapeHTML(submission.assignmentTitle)} · ${escapeHTML(submission.className)} · ${submission.reviewed ? "Reviewed" : "Pending review"}</p></div>`,
          )
          .join("")
      : "<p>No submissions yet.</p>";
 const apiStudents = (window.classroomState && Array.isArray(window.classroomState.students))
        ? window.classroomState.students
        : [];
      const effectiveStudents = (Array.isArray(studentList) && studentList.length)
        ? studentList
        : apiStudents;
      const sr = document.querySelector("#teacher-student-rows");
      if (sr) {
        sr.innerHTML =
          effectiveStudents
            .map(
              (student) =>
                `<tr><td>${escapeHTML(student.name)}</td><td>${student.submitted ?? 0}</td><td>${student.reviewed ?? 0}</td></tr>`
            )
            .join("") ||
          '<tr><td colspan="3">No students have joined your classrooms yet.</td></tr>';
      }
  const subr = document.querySelector("#teacher-submission-rows");
  if (subr)
    subr.innerHTML =
      submissions
        .slice()
        .sort(
          (a, b) =>
            (Date.parse(b.submittedAt) || 0) - (Date.parse(a.submittedAt) || 0),
        )
        .map((submission) => {
          const submittedAt = Date.parse(submission.submittedAt);
          const submittedLabel = Number.isNaN(submittedAt)
            ? "Unknown date"
            : new Date(submittedAt).toLocaleString();
          return `<tr><td>${escapeHTML(submission.studentName)}</td><td>${escapeHTML(submission.className)}</td><td>${escapeHTML(submission.assignmentTitle)}</td><td>${escapeHTML(submittedLabel)}</td><td>${submission.reviewed ? "Reviewed" : "Pending review"}</td><td><details><summary>${submission.reviewed ? "View grade" : "Review submission"}</summary><p>${escapeHTML(submission.response)}</p><form class="teacher-grade-form" data-class-submission-id="${escapeHTML(submission.id)}" data-class-id="${escapeHTML(submission.classId)}"><div><label>Score (0–100)</label><input type="number" name="score" min="0" max="100" required value="${submission.reviewed ? escapeHTML(submission.score) : ""}"></div><div><label>Feedback</label><textarea name="feedback" rows="2" maxlength="1000">${escapeHTML(submission.feedback || "")}</textarea></div><button type="submit">Save review</button></form></details></td></tr>`;
        })
        .join("") || '<tr><td colspan="6">No submissions yet.</td></tr>';
  const fr = document.querySelector("#teacher-feedback-rows");
  if (fr)
    fr.innerHTML =
      reviewed
        .map(
          (submission) =>
            `<tr><td>${escapeHTML(submission.studentName)}</td><td>${escapeHTML(submission.className)}</td><td>${escapeHTML(submission.assignmentTitle)}</td><td>${escapeHTML(submission.score)}/100</td><td>${escapeHTML(submission.feedback || "—")}</td></tr>`,
        )
        .join("") ||
      '<tr><td colspan="5">No reviewed submissions yet.</td></tr>';
  const possible = assignments.reduce(
    (total, assignment) => total + assignment.studentCount,
    0,
  );
  setText(
    "#teacher-submission-rate",
    `${possible ? Math.min(100, Math.round((submissions.length / possible) * 100)) : 0}%`,
  );
  setText(
    "#teacher-review-rate",
    `${submissions.length ? Math.round((reviewed.length / submissions.length) * 100) : 0}%`,
  );
  setText(
    "#teacher-average-grade",
    reviewed.length
      ? `${Math.round(reviewed.reduce((sum, s) => sum + Number(s.score), 0) / reviewed.length)}/100`
      : "—",
  );
  const bars = document.querySelector("#teacher-analytics-bars");
  if (bars)
    bars.innerHTML =
      assignments
        .map((assignment) => {
          const count = assignment.submissions.length;
          const pct = assignment.studentCount
            ? Math.min(100, Math.round((count / assignment.studentCount) * 100))
            : 0;
          return `<div class="bar-row"><span class="bar-label">${escapeHTML(assignment.title)} · ${escapeHTML(assignment.className)}</span><div class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></div><span class="bar-count">${count}/${assignment.studentCount}</span></div>`;
        })
        .join("") || "<p>No assignments yet.</p>";
}

document.querySelector("#app")?.addEventListener("submit", (e) => {
  const form = e.target;
  if (form.matches("[data-class-submission-id]") && currentView === "teacher") {
    e.preventDefault();
    const data = new FormData(form);
    const score = Number(data.get("score"));
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      showMessage("Enter a score from 0 to 100.");
      return;
    }

    try {
      const classes = readClassrooms();
      const classroom = classes.find(
        (item) =>
          item?.id === form.dataset.classId &&
          item.teacherId === session.userId,
      );
      const submission = classroom?.submissions?.find(
        (item) => item.id === form.dataset.classSubmissionId,
      );
      if (!classroom || !submission) {
        showMessage("That classroom submission could not be found.");
        return;
      }

      submission.score = score;
      submission.feedback = String(data.get("feedback") || "").trim();
      localStorage.setItem(CLASSROOMS_KEY, JSON.stringify(classes));
    } catch (error) {
      console.error("Unable to save classroom submission review.", error);
      showMessage("The submission review could not be saved.");
      return;
    }

    window.dispatchEvent(new Event("studyhub:classrooms-updated"));
    showMessage("Submission reviewed and graded.");
  }
});
window.addEventListener("storage", (e) => {
  if (e.key === CLASSROOMS_KEY) {
    if (currentView === "teacher") renderClassroom();
    if (syncClassroomAssignments()) render();
  }
});
window.addEventListener("studyhub:classrooms-updated", () => {
  if (currentView === "teacher") {
    renderClassroom();
  }
  if (syncClassroomAssignments()) render();
});
if (syncClassroomAssignments()) render();
clearLegacyTeacherSamples();
renderClassroom();

// Dev role switch (only visible with ?dev=1)
if (new URLSearchParams(location.search).has("dev")) {
  const devSwitch = document.querySelector("#dev-role-switch");
  const devSelect = document.querySelector("#dev-role");
  if (devSwitch && devSelect) {
    devSwitch.style.display = "flex";
    // Set dropdown to current effective role (real or override)
    devSelect.value = session.role;
    devSelect.addEventListener("change", () => {
      const role = devSelect.value;
      if (role === "__clear__") {
        // Clear override, return to real role
        sessionStorage.removeItem("devRoleOverride");
        // Also sync in-memory session immediately so guards work NOW
        const realUser = AUTH.getSessionUser();
        if (realUser) {
          session.role = realUser.role;
          currentUser = { ...realUser };
        }
        showMessage("Dev override cleared. Reloading as real role…");
      } else {
        // Persist dev role override so it survives page reload
        sessionStorage.setItem("devRoleOverride", role);
        // IMMEDIATELY sync in-memory session so allowed() works NOW (before reload)
        session.role = role;
        currentUser = { ...currentUser, role };
        showMessage(`Dev role → ${role}. Guards active. Reloading in 10s…`);
      }
      // Small delay so you can test immediate guards, then FORCE reload
      setTimeout(() => {
        try {
          // Use location.reload() to force navigation even if URL unchanged
          console.log("[dev-switch] Forcing reload...");
          location.reload();
        } catch (e) {
          console.error("[dev-switch] Reload failed:", e);
          showMessage("Reload failed. Check console.");
        }
      }, 15000);
    });
  }
}
