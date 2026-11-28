<?php
require __DIR__ . '/includes/auth.php';
require __DIR__ . '/includes/tasks.php';
require __DIR__ . '/includes/schedules.php';
require __DIR__ . '/includes/notes.php';
require __DIR__ . '/includes/audit.php';
require __DIR__ . '/includes/preferences.php';
require __DIR__ . '/includes/settings.php';

$currentUser = require_login();   // not logged in -> login.html

// no caching, Back shouldn't show the dashboard after logout
header('Cache-Control: no-store, no-cache, must-revalidate');

$tasks = get_tasks_for_user($conn, (int) $currentUser['id']);
$schedules = get_schedules_for_user($conn, (int) $currentUser['id']);
$notes = get_notes_for_user($conn, (int) $currentUser['id']);
$auditLog = get_audit_for_user($conn, (int) $currentUser['id']);
$preferences = get_preferences_for_user($conn, (int) $currentUser['id']);
$pomodoroPreferences = get_pomodoro_preferences_for_user($conn, (int) $currentUser['id']);
$announcements = get_active_announcements($conn, $currentUser['role']);

// cache busting: adds ?v=<file mtime> so the browser grabs new css/js as soon as it changes
function asset(string $path): string
{
    $file = __DIR__ . '/' . $path;
    return htmlspecialchars($path . (is_file($file) ? '?v=' . filemtime($file) : ''), ENT_QUOTES);
}
?>
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>StudyHub</title>
    <link rel="icon" href="assets/logo.svg" type="image/svg+xml" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
    />
    <link rel="stylesheet" href="<?= asset('css/style.css') ?>" />
    <script>
      /* set the theme before paint so it doesn't flash */
      (function () {
        var theme = "dark";
        try {
          var pref = localStorage.getItem("studyhub-theme") || "dark";
          theme =
            pref === "system"
              ? window.matchMedia &&
                window.matchMedia("(prefers-color-scheme: light)").matches
                ? "light"
                : "dark"
              : pref === "light"
                ? "light"
                : "dark";
        } catch (e) {}
        document.documentElement.setAttribute("data-theme", theme);
      })();
    </script>
  </head>
  <body>
    <!-- icons -->
    <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
      <defs>
        <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></symbol>
        <symbol id="i-calendar" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></symbol>
        <symbol id="i-note" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></symbol>
        <symbol id="i-users" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></symbol>
        <symbol id="i-settings" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></symbol>
        <symbol id="i-inbox" viewBox="0 0 24 24"><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></symbol>
        <symbol id="i-message" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></symbol>
        <symbol id="i-chart" viewBox="0 0 24 24"><path d="M3 3v18h18M8 17v-5M13 17V8M18 17v-9"/></symbol>
        <symbol id="i-list" viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></symbol>
        <symbol id="i-check-circle" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.5 2.5 4.5-5"/></symbol>
        <symbol id="i-flag" viewBox="0 0 24 24"><path d="M5 22V4M5 4h11l-2 4 2 4H5"/></symbol>
        <symbol id="i-hourglass" viewBox="0 0 24 24"><path d="M6 2h12M6 22h12M7 2v4a5 5 0 0 0 10 0V2M7 22v-4a5 5 0 0 1 10 0v4"/></symbol>
        <symbol id="i-alert" viewBox="0 0 24 24"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></symbol>
        <symbol id="i-play" viewBox="0 0 24 24"><path d="M7 4v16l13-8z"/></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></symbol>
        <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></symbol>
        <symbol id="i-chevron-down" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></symbol>
        <symbol id="i-logout" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></symbol>
        <symbol id="i-user" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></symbol>
        <symbol id="i-activity" viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></symbol>
        <symbol id="i-x" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></symbol>
        <symbol id="i-megaphone" viewBox="0 0 24 24"><path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12"/></symbol>
        <symbol id="i-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>
        <symbol id="i-arrow-left" viewBox="0 0 24 24"><path d="M19 12H5M11 6l-6 6 6 6"/></symbol>
        <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></symbol>
        <symbol id="i-edit" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></symbol>
        <symbol id="i-trash" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></symbol>
        <symbol id="i-link" viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></symbol>
      </defs>
    </svg>

    <header class="app-header" data-view="student teacher admin">
      <a class="app-brand" href="#dashboard" aria-label="StudyHub home">
        <img src="assets/logo.svg" alt="" width="32" height="32" />
        <span>StudyHub</span>
      </a>
      <p id="app-message" role="status" aria-live="polite" hidden></p>
      <form id="search-form" role="search" data-view="student">
        <label class="sr-only" for="global-search">Search tasks</label>
        <svg class="icon search-icon" aria-hidden="true"><use href="#i-search" /></svg>
        <input
          id="global-search"
          name="query"
          type="search"
          placeholder="Search tasks"
          autocomplete="off"
          role="combobox"
          aria-expanded="false"
          aria-controls="search-results"
          aria-autocomplete="list"
        />
        <div id="search-results" class="search-results" role="listbox" aria-label="Task search results" hidden></div>
        <p id="search-status" class="sr-only" role="status" aria-live="polite"></p>
      </form>

      <button type="button" id="add-task-btn" class="btn btn-primary" data-view="student">
        <svg class="icon" aria-hidden="true"><use href="#i-plus" /></svg>
        <span class="btn-label">Add task</span>
      </button>

      <button
        type="button"
        id="focus-toggle"
        class="btn"
        aria-pressed="false"
        data-view="student"
      >
        Focus mode
      </button>

      <details id="user-menu" class="user-menu" data-view="student teacher admin">
        <summary class="btn">
          <span class="avatar" id="user-initials" aria-hidden="true"></span>
          <span id="user-label"></span>
          <svg class="icon chevron" aria-hidden="true"><use href="#i-chevron-down" /></svg>
        </summary>
        <div class="user-menu-panel">
          <p class="user-menu-role">Signed in as <span id="user-role" class="status-pill status-todo"></span></p>
          <a href="#profile" class="user-menu-item" data-go="profile">
            <svg class="icon" aria-hidden="true"><use href="#i-user" /></svg>
            Profile
          </a>
          <a href="#settings" class="user-menu-item" data-go="settings" data-view="student">
            <svg class="icon" aria-hidden="true"><use href="#i-settings" /></svg>
            Settings
          </a>
          <button type="button" id="logout-btn" class="user-menu-item">
            <svg class="icon" aria-hidden="true"><use href="#i-logout" /></svg>
            Sign out
          </button>
        </div>
      </details>

      <!-- dev role switch (?dev=1) -->
      <div id="dev-role-switch" class="dev-only" style="display:none">
        <label for="dev-role">Simulate role:</label>
        <select id="dev-role">
          <option value="student">Student</option>
          <option value="teacher">Teacher</option>
          <option value="admin">Admin</option>
          <option value="super_admin">Super Admin</option>
          <option value="__clear__">Real Role (Clear Override)</option>
        </select>
      </div>
    </header>

    <nav
      class="primary-nav"
      aria-label="Primary"
      data-view="student teacher admin"
    >
      <ul>
        <li data-view="admin"><a href="#admin-dashboard"><svg class="icon" aria-hidden="true"><use href="#i-home" /></svg><span>Dashboard</span></a></li>
        <li data-view="admin"><a href="#users"><svg class="icon" aria-hidden="true"><use href="#i-users" /></svg><span>Users</span></a></li>
        <li data-view="admin"><a href="#logs"><svg class="icon" aria-hidden="true"><use href="#i-activity" /></svg><span>Logs</span></a></li>
        <li data-view="admin"><a href="#admin-settings"><svg class="icon" aria-hidden="true"><use href="#i-settings" /></svg><span>Settings</span></a></li>
        <li data-view="admin"><a href="#system-checks"><svg class="icon" aria-hidden="true"><use href="#i-check-circle" /></svg><span>System checks</span></a></li>
        <li data-view="teacher"><a href="#teacher-dashboard"><svg class="icon" aria-hidden="true"><use href="#i-home" /></svg><span>Dashboard</span></a></li>
        <li data-view="student">
          <a href="#dashboard" aria-current="page"><svg class="icon" aria-hidden="true"><use href="#i-home" /></svg><span>Dashboard</span></a>
        </li>
        <li data-view="teacher"><a href="#teacher-students"><svg class="icon" aria-hidden="true"><use href="#i-users" /></svg><span>Students</span></a></li>
        <li data-view="teacher"><a href="#teacher-submissions"><svg class="icon" aria-hidden="true"><use href="#i-inbox" /></svg><span>Submissions</span></a></li>
        <li data-view="teacher"><a href="#teacher-feedback"><svg class="icon" aria-hidden="true"><use href="#i-message" /></svg><span>Feedback &amp; Grades</span></a></li>
        <li data-view="teacher"><a href="#teacher-analytics"><svg class="icon" aria-hidden="true"><use href="#i-chart" /></svg><span>Class Analytics</span></a></li>
        <li data-view="teacher"><a href="#teacher-classroom"><svg class="icon" aria-hidden="true"><use href="#i-users" /></svg><span>Classroom</span></a></li>
        <li data-view="student"><a href="#tasks"><svg class="icon" aria-hidden="true"><use href="#i-check" /></svg><span>Tasks</span></a></li>
        <li data-view="student"><a href="#schedules"><svg class="icon" aria-hidden="true"><use href="#i-calendar" /></svg><span>Schedules</span></a></li>
        <li data-view="student"><a href="#notes"><svg class="icon" aria-hidden="true"><use href="#i-note" /></svg><span>Notes</span></a></li>
        <li data-view="student"><a href="#student-classroom"><svg class="icon" aria-hidden="true"><use href="#i-users" /></svg><span>Classroom</span></a></li>      </ul>
    </nav>

    <main id="app" data-view="student teacher admin">
      <section
        id="admin-dashboard"
        data-view="admin"
        aria-labelledby="admin-dashboard-title"
        hidden
      >
        <header class="page-head">
          <h2 id="admin-dashboard-title">Overview</h2>
          <p class="page-sub">Welcome back, <span id="admin-name">Admin</span></p>
        </header>

        <div class="announcements" aria-label="Announcements"></div>

        <!-- loadAdminOverview() fills this -->
        <div class="admin-stats" id="admin-overview" aria-live="polite">
          <article class="stat-card" data-stat="total">
            <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-users" /></svg></span>
            <h3>Accounts</h3>
            <strong id="admin-stat-total">—</strong>
          </article>
          <article class="stat-card" data-stat="student">
            <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-user" /></svg></span>
            <h3>Students</h3>
            <strong id="admin-stat-student">—</strong>
          </article>
          <article class="stat-card" data-stat="teacher">
            <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-note" /></svg></span>
            <h3>Teachers</h3>
            <strong id="admin-stat-teacher">—</strong>
          </article>
          <article class="stat-card" data-stat="staff">
            <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-shield" /></svg></span>
            <h3>Admins</h3>
            <strong id="admin-stat-staff">—</strong>
          </article>
          <article class="stat-card stat-attention" data-stat="pending">
            <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-hourglass" /></svg></span>
            <h3>Waiting for approval</h3>
            <strong id="admin-stat-pending">—</strong>
            <a href="#users" class="text-link stat-link" id="admin-review-pending" hidden>Review</a>
          </article>
          <article class="stat-card" data-stat="blocked">
            <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-alert" /></svg></span>
            <h3>Suspended or banned</h3>
            <strong id="admin-stat-blocked">—</strong>
          </article>
        </div>
        <p id="admin-overview-error" class="section-note" role="alert" hidden></p>

        <!-- loadAdminReports() fills this -->
        <section class="card report-chart-card" aria-labelledby="signins-title">
          <div class="report-chart-head">
            <h3 id="signins-title" class="card-title">Sign-ins, last 14 days</h3>
            <p class="card-sub" id="signins-total"></p>
          </div>
          <div id="signins-chart" class="bar-chart" role="img" aria-labelledby="signins-title signins-total"></div>
          <p id="signins-empty" class="chart-empty" hidden>No sign-ins in the last 14 days.</p>
          <details class="chart-table">
            <summary>Show as table</summary>
            <div class="table-wrapper">
              <table>
                <thead><tr><th>Day</th><th>Sign-ins</th></tr></thead>
                <tbody id="signins-table"></tbody>
              </table>
            </div>
          </details>
        </section>

        <h3 class="report-heading">Activity</h3>
        <div class="admin-stats report-stats">
          <article class="stat-card"><h3>Active users (7 days)</h3><strong id="report-active7">—</strong></article>
          <article class="stat-card"><h3>New accounts (7 days)</h3><strong id="report-new7">—</strong><small class="stat-sub" id="report-new30"></small></article>
          <article class="stat-card"><h3>Tasks created (7 days)</h3><strong id="report-tasks7">—</strong></article>
          <article class="stat-card"><h3>Task completion</h3><strong id="report-completion">—</strong><small class="stat-sub" id="report-tasks-total"></small></article>
          <article class="stat-card"><h3>Classes</h3><strong id="report-classes">—</strong></article>
          <article class="stat-card"><h3>Notes</h3><strong id="report-notes">—</strong></article>
        </div>

        <div id="report-security" hidden>
          <div class="report-heading-row">
            <h3 class="report-heading">Security, last 7 days</h3>
            <a href="#logs" class="text-link" id="report-open-security">Open security log</a>
          </div>
          <div class="admin-stats report-stats">
            <article class="stat-card"><h3>Failed sign-ins</h3><strong id="report-failed7">—</strong></article>
            <article class="stat-card"><h3>Blocked sign-ins</h3><strong id="report-blocked7">—</strong><small class="stat-sub">Suspended, banned, pending or locked out</small></article>
            <article class="stat-card"><h3>Refused admin actions</h3><strong id="report-denied7">—</strong></article>
          </div>
        </div>
      </section>

      <section
        id="users"
        data-view="admin"
        aria-labelledby="users-title"
        hidden
      >
        <header class="page-head">
          <div>
            <h2 id="users-title">Users</h2>
            <p class="page-sub" id="users-count" aria-live="polite"></p>
          </div>
          <button type="button" id="users-create-btn" class="btn btn-primary" hidden>
            <svg class="icon" aria-hidden="true"><use href="#i-plus" /></svg>
            Add account
          </button>
        </header>

        <div id="users-pending-note" class="notice-bar" hidden>
          <span id="users-pending-text"></span>
          <button type="button" class="btn" id="users-show-pending">Show them</button>
        </div>

        <form id="users-filters" class="users-filters" role="search" aria-label="Filter users">
          <div class="users-search">
            <label for="users-search">Search</label>
            <input id="users-search" name="search" type="search" placeholder="Name or email" autocomplete="off" />
          </div>
          <div>
            <label for="users-role">Role</label>
            <select id="users-role" name="role">
              <option value="">All roles</option>
              <option value="student">Students</option>
              <option value="teacher">Teachers</option>
              <option value="admin">Admins</option>
              <option value="super_admin">Super Admins</option>
            </select>
          </div>
          <div>
            <label for="users-status">Status</label>
            <select id="users-status" name="status">
              <option value="">Any status</option>
              <option value="active">Active</option>
              <option value="pending">Waiting for approval</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
            </select>
          </div>
        </form>

        <p id="users-message" class="form-message" role="status" aria-live="polite" hidden></p>

        <div class="table-wrapper">
          <table class="users-table">
            <caption class="sr-only">Accounts</caption>
            <thead>
              <tr>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last sign-in</th>
                <th><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody id="users-table-body"></tbody>
          </table>
        </div>
        <p id="users-empty" class="users-empty" hidden>No accounts match these filters.</p>
        <div id="users-pagination" class="users-pagination" aria-label="Pages"></div>

        <!-- manage account dialog (openUserDialog) -->
        <dialog id="user-dialog" class="admin-dialog" aria-labelledby="user-dialog-title">
          <div class="dialog-body">
            <div class="dialog-header">
              <div>
                <h3 id="user-dialog-title"></h3>
                <p id="user-dialog-meta" class="section-note"></p>
              </div>
              <button type="button" class="btn" data-close-dialog>Close</button>
            </div>
            <p id="user-dialog-message" class="form-message" role="status" aria-live="polite" hidden></p>
            <div id="user-dialog-content"></div>
          </div>
        </dialog>

        <!-- moderation: one user's tasks/classes/notes (openContentDialog) -->
        <dialog id="content-dialog" class="admin-dialog admin-dialog-wide" aria-labelledby="content-dialog-title">
          <div class="dialog-body">
            <div class="dialog-header">
              <div>
                <h3 id="content-dialog-title">Content</h3>
                <p class="section-note">
                  Opening this is recorded in the security log. You can remove items
                  that break the rules, but not edit them. The owner sees a note with
                  your reason.
                </p>
              </div>
              <button type="button" class="btn" data-close-dialog>Close</button>
            </div>
            <p id="content-dialog-message" class="form-message" role="status" aria-live="polite" hidden></p>
            <div class="log-tabs content-tabs" role="tablist" aria-label="Content type">
              <button type="button" role="tab" data-content-tab="tasks" aria-selected="true">Tasks <span data-count="tasks"></span></button>
              <button type="button" role="tab" data-content-tab="classes" aria-selected="false">Classes <span data-count="classes"></span></button>
              <button type="button" role="tab" data-content-tab="notes" aria-selected="false">Notes <span data-count="notes"></span></button>
            </div>
            <ul id="content-list" class="content-list"></ul>
          </div>
        </dialog>

        <!-- super admin: create account w/ temp password -->
        <dialog id="user-create-dialog" class="admin-dialog" aria-labelledby="user-create-title">
          <div class="dialog-body">
            <div class="dialog-header">
              <h3 id="user-create-title">Add account</h3>
              <button type="button" class="btn" data-close-dialog>Close</button>
            </div>
            <p class="section-note">
              The account gets a temporary password that you pass on. They must
              choose their own when they first sign in.
            </p>
            <p id="user-create-message" class="form-message" role="status" aria-live="polite" hidden></p>
            <form id="user-create-form" class="profile-form" novalidate>
              <div>
                <label for="create-name">Full name</label>
                <input id="create-name" name="name" maxlength="100" required />
              </div>
              <div>
                <label for="create-email">Email</label>
                <input id="create-email" name="email" type="email" maxlength="190" required />
              </div>
              <div>
                <label for="create-role">Role</label>
                <select id="create-role" name="role"></select>
              </div>
              <div class="form-actions">
                <button type="submit">Create account</button>
              </div>
            </form>
            <div id="user-create-result" hidden></div>
          </div>
        </dialog>
      </section>

      <section
        id="logs"
        data-view="admin"
        aria-labelledby="logs-title"
        hidden
      >
        <header class="page-head">
          <h2 id="logs-title">Logs</h2>
          <p class="page-sub" id="logs-count" aria-live="polite"></p>
        </header>

        <div class="log-tabs" role="tablist" aria-label="Log type">
          <button type="button" role="tab" id="logs-tab-activity" aria-selected="true" data-log-tab="activity">Activity</button>
          <button type="button" role="tab" id="logs-tab-security" aria-selected="false" data-log-tab="security" hidden>Security</button>
        </div>
        <p class="section-note" id="logs-scope-note"></p>

        <form id="logs-filters" class="users-filters logs-filters" role="search" aria-label="Filter log">
          <div class="users-search">
            <label for="logs-search">Search</label>
            <input id="logs-search" name="search" type="search" placeholder="Name, email or details" autocomplete="off" />
          </div>
          <div>
            <label for="logs-type">Type</label>
            <select id="logs-type" name="type"><option value="">All types</option></select>
          </div>
          <div>
            <label for="logs-period">When</label>
            <select id="logs-period" name="period">
              <option value="1">Last 24 hours</option>
              <option value="7" selected>Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="">All time</option>
            </select>
          </div>
        </form>

        <p id="logs-user-filter" class="filter-chip-row" hidden>
          Showing only <strong id="logs-user-name"></strong>
          <button type="button" class="btn" id="logs-clear-user">Show everyone</button>
        </p>
        <p id="logs-message" class="form-message is-error" role="alert" hidden></p>

        <div class="table-wrapper">
          <table class="logs-table">
            <caption class="sr-only" id="logs-caption">Log entries</caption>
            <thead id="logs-head"></thead>
            <tbody id="logs-body"></tbody>
          </table>
        </div>
        <p id="logs-empty" class="users-empty" hidden>Nothing matches these filters.</p>
        <div id="logs-pagination" class="users-pagination" aria-label="Pages"></div>
      </section>

      <section
        id="admin-settings"
        data-view="admin"
        aria-labelledby="admin-settings-title"
        hidden
      >
        <header class="page-head">
          <h2 id="admin-settings-title">Settings</h2>
          <p class="page-sub">App-wide settings</p>
        </header>

        <section class="content-card" aria-labelledby="ann-title">
          <div class="card-head-row">
            <div>
              <h3 id="ann-title">Announcements</h3>
              <p class="section-note">Shown at the top of people's dashboards. They can dismiss them.</p>
            </div>
            <button type="button" class="btn btn-primary" id="ann-new">
              <svg class="icon" aria-hidden="true"><use href="#i-plus" /></svg>
              New announcement
            </button>
          </div>

          <form id="ann-form" class="profile-form ann-form" novalidate hidden>
            <input type="hidden" name="id" />
            <div>
              <label for="ann-form-title">Title</label>
              <input id="ann-form-title" name="title" maxlength="120" required />
            </div>
            <div>
              <label for="ann-form-body">Message</label>
              <textarea id="ann-form-body" name="body" rows="3" maxlength="2000" required></textarea>
            </div>
            <div class="dialog-fields">
              <div>
                <label for="ann-form-audience">Who sees it</label>
                <select id="ann-form-audience" name="audience">
                  <option value="all">Everyone</option>
                  <option value="student">Students</option>
                  <option value="teacher">Teachers</option>
                </select>
              </div>
              <div>
                <label for="ann-form-importance">Importance</label>
                <select id="ann-form-importance" name="importance">
                  <option value="info">Information</option>
                  <option value="important">Important</option>
                </select>
              </div>
              <div>
                <label for="ann-form-starts">Show from (optional)</label>
                <input id="ann-form-starts" name="startsAt" type="datetime-local" />
              </div>
              <div>
                <label for="ann-form-ends">Show until (optional)</label>
                <input id="ann-form-ends" name="endsAt" type="datetime-local" />
              </div>
            </div>
            <div class="form-actions">
              <button type="button" class="btn" id="ann-cancel">Cancel</button>
              <button type="submit">Save announcement</button>
            </div>
          </form>

          <p id="ann-message" class="form-message" role="status" aria-live="polite" hidden></p>
          <ul id="ann-list" class="content-list ann-list"></ul>
        </section>

        <section class="content-card" id="signup-settings" aria-labelledby="signup-settings-title" hidden>
          <h3 id="signup-settings-title">Sign-ups</h3>
          <p class="section-note">Closing sign-ups doesn't affect existing accounts. Super Admins can still add accounts on the Users page.</p>
          <form id="signup-settings-form" class="switch-list" novalidate>
            <label class="switch-row">
              <input type="checkbox" name="allowSignups" />
              <span><strong>Allow new sign-ups</strong><small>Anyone can create a student account.</small></span>
            </label>
            <label class="switch-row">
              <input type="checkbox" name="allowTeacherSignups" />
              <span><strong>Allow teacher sign-ups</strong><small>New teacher accounts still wait for approval.</small></span>
            </label>
            <p id="signup-settings-message" class="form-message" role="status" aria-live="polite" hidden></p>
            <div class="form-actions">
              <button type="submit">Save sign-up settings</button>
            </div>
          </form>
        </section>

        <section class="content-card" id="backup-settings" aria-labelledby="backup-title" hidden>
          <h3 id="backup-title">Full backup</h3>
          <p class="section-note">
            Downloads the whole database as a .sql file you can restore with
            phpMyAdmin &rarr; Import. It includes everyone's data, password hashes
            and the logs, so keep it private. Each download is recorded in the
            security log.
          </p>
          <form method="post" action="api/backup.php" class="backup-form">
            <button type="submit" class="btn">Download backup (.sql)</button>
          </form>
        </section>
      </section>

      <section
        id="system-checks"
        data-view="admin"
        aria-labelledby="system-checks-title"
        hidden
      >
        <header class="page-head">
          <h2 id="system-checks-title">System checks</h2>
          <p class="page-sub">Automated tests of the app's rules, run in your browser</p>
        </header>

        <section id="admin-qa" class="content-card" aria-labelledby="admin-qa-title">
          <h3 id="admin-qa-title">Quality assurance</h3>
          <p class="section-note">
            These checks run when you sign in. Run them again whenever you want
            to refresh the results.
          </p>
          <button
            type="button"
            id="admin-qa-run"
            aria-describedby="admin-qa-last-run"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              focusable="false"
            >
              <path
                d="M20 7v5h-5M4 17v-5h5m10.2-1A7.5 7.5 0 0 0 6.1 6.1L4 8m16 8-2.1 1.9A7.5 7.5 0 0 1 4.8 13"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Run QA tests
          </button>
          <p id="admin-qa-last-run" role="status" aria-live="polite">
            Tests have not run yet.
          </p>
          <div class="qa-score-card">
            <p>
              <strong>Weighted Quality Score:</strong>
              <span id="admin-qa-quality-score">Calculating...</span>
            </p>
            <p>
              <small>Formula: Q = 0.30F + 0.20R + 0.20A + 0.15V + 0.15C</small>
            </p>
          </div>

          <h4>Category scores</h4>
          <div class="qa-category-scores" aria-live="polite">
            <p>F — Functional: <strong data-qa-category-score="F">—</strong></p>
            <p>R — Resilience: <strong data-qa-category-score="R">—</strong></p>
            <p>A — Auditability: <strong data-qa-category-score="A">—</strong></p>
            <p>V — Validation: <strong data-qa-category-score="V">—</strong></p>
            <p>C — Completeness: <strong data-qa-category-score="C">—</strong></p>
          </div>

          <div class="table-wrapper">
            <table>
              <caption>
                Automated admin verification results
              </caption>
              <thead>
                <tr>
                  <th>Test ID</th>
                  <th>Category</th>
                  <th>Precondition</th>
                  <th>Action</th>
                  <th>Expected Result</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody id="admin-qa-test-results-body"></tbody>
            </table>
          </div>
        </section>
      </section>

      <section
        id="teacher-dashboard"
        data-view="teacher"
        aria-labelledby="teacher-dashboard-title"
        hidden
      >
        <h2 id="teacher-dashboard-title">Teacher Dashboard</h2>
        <div class="announcements" aria-label="Announcements"></div>
        <div class="content-card">
          <h3>Welcome, Teacher!</h3>
          <p>Manage academic activities and monitor student progress.</p>
          <p class="section-note">
            Classroom activity and progress at a glance.
          </p>
        </div>
        <div class="teacher-kpis">
          <article class="metric-card" data-tone="info">
            <h3>Students</h3>
            <strong id="teacher-total-students">0</strong>
          </article>
          <article class="metric-card" data-tone="warning">
            <h3>Active assignments</h3>
            <strong id="teacher-active-assignments">0</strong>
          </article>
          <article class="metric-card" data-tone="success">
            <h3>Submissions</h3>
            <strong id="teacher-total-submissions">0</strong>
          </article>
          <article class="metric-card" data-tone="purple">
            <h3>Pending review</h3>
            <strong id="teacher-pending-reviews">0</strong>
          </article>
        </div>
        <div class="content-card">
          <h3>Recent submissions</h3>
          <div id="teacher-recent-submissions"></div>
        </div>
      </section>
      <section id="teacher-students" data-view="teacher" hidden>
        <h2>Students</h2>
        <p class="section-note">Students who have joined your classrooms.</p>
        <div class="content-card">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Submitted</th>
                  <th>Reviewed</th>
                </tr>
              </thead>
              <tbody id="teacher-student-rows"></tbody>
            </table>
          </div>
        </div>
      </section>
      <section id="teacher-submissions" data-view="teacher" hidden>
        <h2>Submission Review</h2>
        <div class="content-card">
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Assignment</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="teacher-submission-rows"></tbody>
            </table>
          </div>
        </div>
      </section>
      <section id="teacher-feedback" data-view="teacher" hidden>
        <h2>Feedback &amp; Grades</h2>
        <div class="content-card">
          <p class="section-note">
            Use Review submission to provide a score and feedback.
          </p>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Assignment</th>
                  <th>Score</th>
                  <th>Feedback</th>
                </tr>
              </thead>
              <tbody id="teacher-feedback-rows"></tbody>
            </table>
          </div>
        </div>
      </section>
      <section id="teacher-analytics" data-view="teacher" hidden>
        <h2>Class Analytics</h2>
        <div class="teacher-kpis">
          <article class="metric-card">
            <h3>Submission rate</h3>
            <strong id="teacher-submission-rate">0%</strong>
          </article>
          <article class="metric-card">
            <h3>Review completion</h3>
            <strong id="teacher-review-rate">0%</strong>
          </article>
          <article class="metric-card">
            <h3>Average grade</h3>
            <strong id="teacher-average-grade">—</strong>
          </article>
        </div>
        <div class="content-card">
          <h3>Assignment progress</h3>
          <div id="teacher-analytics-bars" class="distribution-bars"></div>
        </div>
      </section>
      <!-- teacher classroom (teacher_classroom.js): class list, or one class w/ tabs -->
      <section id="teacher-classroom" data-view="teacher" aria-labelledby="tc-title" hidden>
        <div id="tc-list-view">
          <div class="classroom-heading">
            <div>
              <h2 id="tc-title">Classroom</h2>
              <p class="section-note">Open a class to post updates, assign work and see who joined.</p>
            </div>
            <button type="button" class="btn-primary" id="tc-create-btn">
              <svg class="icon" aria-hidden="true"><use href="#i-plus" /></svg>Create class
            </button>
          </div>

          <div class="tc-toolbar" role="search">
            <label for="tc-search" class="sr-only">Search classes</label>
            <div class="tc-search">
              <svg class="icon" aria-hidden="true"><use href="#i-search" /></svg>
              <input id="tc-search" type="search" autocomplete="off"
                     placeholder="Search by class name, code, subject or section" />
            </div>
            <p id="tc-count" class="section-note" aria-live="polite"></p>
          </div>

          <div id="tc-class-grid" class="tc-grid" aria-busy="true"></div>
        </div>

        <div id="tc-detail-view" hidden>
          <nav class="tc-breadcrumb" aria-label="Breadcrumb">
            <button type="button" class="tc-back" data-tc-back>
              <svg class="icon" aria-hidden="true"><use href="#i-arrow-left" /></svg>All classes
            </button>
            <span class="tc-crumb-sep" aria-hidden="true">/</span>
            <span id="tc-crumb-current" aria-current="page"></span>
          </nav>

          <header id="tc-banner" class="tc-banner"></header>

          <div class="log-tabs tc-tabs" role="tablist" aria-label="Class sections">
            <button type="button" role="tab" id="tc-tab-stream" aria-controls="tc-panel-stream" aria-selected="true" data-tc-tab="stream">Stream</button>
            <button type="button" role="tab" id="tc-tab-classwork" aria-controls="tc-panel-classwork" aria-selected="false" tabindex="-1" data-tc-tab="classwork">Classwork <span class="tc-tab-count" id="tc-count-classwork"></span></button>
            <button type="button" role="tab" id="tc-tab-people" aria-controls="tc-panel-people" aria-selected="false" tabindex="-1" data-tc-tab="people">People <span class="tc-tab-count" id="tc-count-people"></span></button>
          </div>

          <div id="tc-panel-stream" class="tc-panel" role="tabpanel" aria-labelledby="tc-tab-stream" tabindex="0"></div>
          <div id="tc-panel-classwork" class="tc-panel" role="tabpanel" aria-labelledby="tc-tab-classwork" tabindex="0" hidden></div>
          <div id="tc-panel-people" class="tc-panel" role="tabpanel" aria-labelledby="tc-tab-people" tabindex="0" hidden></div>
        </div>

        <!-- create/edit class + delete confirms -->
        <dialog id="tc-dialog" class="admin-dialog tc-dialog" aria-labelledby="tc-dialog-title">
          <form id="tc-dialog-form" class="dialog-body" method="dialog" novalidate>
            <div class="dialog-header">
              <div>
                <h3 id="tc-dialog-title"></h3>
                <p id="tc-dialog-sub" class="section-note"></p>
              </div>
              <button type="button" class="tc-icon-btn" data-tc-dialog-close aria-label="Close">
                <svg class="icon" aria-hidden="true"><use href="#i-x" /></svg>
              </button>
            </div>
            <div id="tc-dialog-fields" class="tc-form-grid"></div>
            <p id="tc-dialog-error" class="form-message is-error" role="alert" hidden></p>
            <div class="tc-form-actions">
              <button type="button" class="btn" data-tc-dialog-close>Cancel</button>
              <button type="submit" id="tc-dialog-save">Save</button>
            </div>
          </form>
        </dialog>
      </section>
      <section id="student-classroom" data-view="student" hidden>
        <div class="classroom-heading">
          <div>
            <h2>Classroom</h2>
            <p class="section-note">Your classes and classroom updates.</p>
          </div>
          <button
            type="button"
            class="classroom-button classroom-primary"
            id="class-join-toggle"
          >
            + Join class
          </button>
        </div>
        <div
          id="student-classroom-notice"
          class="classroom-notice"
          role="status"
          aria-live="polite"
          hidden
        ></div>
        <form id="class-join-form" class="content-card classroom-form" hidden>
          <div>
            <label for="class-join-code">Class code</label
            ><input
              id="class-join-code"
              name="code"
              required
              maxlength="12"
              placeholder="Enter teacher's class code"
              autocomplete="off"
            />
          </div>
          <button type="submit">Join class</button>
          <button type="button" class="classroom-button" id="class-join-cancel">
            Cancel
          </button>
        </form>
        <div id="student-class-cards" class="classroom-grid"></div>
        <div id="student-class-detail" class="classroom-detail" hidden></div>
      </section>
      <section
        id="dashboard"
        data-view="student"
        aria-labelledby="dashboard-title"
      >
        <header class="page-head dashboard-wide">
          <h2 id="dashboard-title">Today</h2>
          <p id="dash-date" class="page-sub"></p>
        </header>

        <div class="announcements dashboard-wide" aria-label="Announcements"></div>

        <!-- next up (renderNextUp) -->
        <section id="next-up" class="card dashboard-wide" aria-labelledby="next-up-title">
          <h3 id="next-up-title" class="card-title">Next up</h3>
          <ol id="next-up-list" class="next-up-list"></ol>
          <a href="#tasks" class="text-link" data-go="tasks">See all tasks</a>
        </section>

        <!-- unit 3 summary, filled from JS -->
        <section id="dash-priority" class="dashboard-metric stat-card">
          <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-list" /></svg></span>
          <h3>Total tasks</h3>
          <strong id="summary-total">0</strong>
        </section>

        <section id="dash-tomorrow" class="dashboard-metric stat-card">
          <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-check-circle" /></svg></span>
          <h3>Finished</h3>
          <strong id="summary-completed">0</strong>
        </section>

        <section id="dash-notes" class="dashboard-metric stat-card">
          <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-calendar" /></svg></span>
          <h3>Upcoming</h3>
          <strong id="summary-upcoming">0 due within 7 days</strong>
        </section>

        <section id="dash-top-priority" class="dashboard-metric stat-card">
          <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-flag" /></svg></span>
          <h3>Top priority</h3>
          <strong id="summary-priority" class="clamp-2">No pending tasks</strong>
        </section>

        <section id="dash-focus" class="dashboard-metric stat-card">
          <span class="stat-icon" aria-hidden="true"><svg class="icon"><use href="#i-hourglass" /></svg></span>
          <h3>Estimated study time</h3>
          <strong id="summary-study-time">0.0 hours</strong>
        </section>

        <!-- unit 9: live metrics (renderMetrics) -->
        <section
          id="system-metrics"
          class="card dashboard-wide"
          aria-labelledby="system-metrics-title"
        >
          <div class="metrics-header">
            <h3 id="system-metrics-title" class="card-title">Metrics</h3>
            <span class="live-badge"
              ><span class="live-dot" aria-hidden="true"></span>Live</span
            >
          </div>

          <div class="metrics-kpi-grid">
            <article class="metric-card" data-tone="success">
              <h4><svg class="icon" aria-hidden="true"><use href="#i-check-circle" /></svg>Completion Rate</h4>
              <strong id="metric-completion-rate">0%</strong>
              <div class="metric-meter" aria-hidden="true">
                <span id="metric-completion-meter"></span>
              </div>
              <small>Finished vs total tasks</small>
            </article>
            <article class="metric-card" data-tone="neutral">
              <h4><svg class="icon" aria-hidden="true"><use href="#i-chart" /></svg>Average Study Time</h4>
              <strong id="metric-avg-time">0 min</strong>
              <small>Per active/pending task</small>
            </article>
            <article class="metric-card" data-tone="danger">
              <h4><svg class="icon" aria-hidden="true"><use href="#i-alert" /></svg>Overdue Rate</h4>
              <strong id="metric-overdue-rate">0%</strong>
              <div class="metric-meter" aria-hidden="true">
                <span id="metric-overdue-meter"></span>
              </div>
              <small>Past due pending items</small>
            </article>
            <article class="metric-card" data-tone="neutral">
              <h4><svg class="icon" aria-hidden="true"><use href="#i-play" /></svg>In Progress</h4>
              <strong id="metric-in-progress-count">0</strong>
              <small>Tasks being worked on now</small>
            </article>
          </div>

          <div class="visual-breakdown-container">
            <div class="breakdown-panel">
              <h4>Status Distribution</h4>
              <div
                id="status-distribution-bars"
                class="distribution-bars"
              ></div>
            </div>

            <div class="breakdown-panel">
              <h4>Priority Distribution</h4>
              <div
                id="priority-distribution-bars"
                class="distribution-bars"
              ></div>
            </div>
          </div>
        </section>

        <section id="dash-study" class="card study-card dashboard-wide" aria-labelledby="dash-study-title">
          <div>
            <h3 id="dash-study-title" class="card-title">Study today</h3>
            <p id="dash-study-summary" class="card-sub">0 minutes · 0 focus sessions</p>
          </div>
          <button type="button" id="dash-start-focus" class="btn btn-primary">
            <svg class="icon" aria-hidden="true"><use href="#i-clock" /></svg>
            Start focus
          </button>
        </section>

        <!-- the task form. only one, don't add another -->
        <form
          id="task-form"
          class="dashboard-wide"
          aria-labelledby="task-form-title"
          novalidate
        >
          <div class="form-head">
            <div class="form-intro">
              <h3 id="task-form-title" class="card-title">Add a task</h3>
              <p class="form-description">
                Capture the details now. You can update them whenever plans change.
              </p>
            </div>
            <p class="form-hint"><span class="req" aria-hidden="true">*</span> Required</p>
          </div>

          <div
            id="task-error-summary"
            class="error-summary"
            role="alert"
            tabindex="-1"
            hidden
          ></div>

          <!-- required -->
          <fieldset class="form-section">
            <legend>Core details</legend>

            <div class="field-title">
              <label for="task-title"
                >Task title <span class="req" aria-hidden="true">*</span></label
              >
              <input
                type="text"
                id="task-title"
                name="title"
                placeholder="e.g. Finish lab report"
                required
                minlength="3"
                maxlength="100"
                aria-describedby="task-title-error"
              />
              <span id="task-title-error" class="inline-error" aria-live="polite"></span>
            </div>

            <div class="field-subject">
              <label for="task-subject"
                >Subject <span class="req" aria-hidden="true">*</span></label
              >
              <input
                type="text"
                id="task-subject"
                name="subject"
                placeholder="e.g. Calculus II"
                required
                minlength="2"
                maxlength="80"
                aria-describedby="task-subject-error"
              />
              <span id="task-subject-error" class="inline-error" aria-live="polite"></span>
            </div>

            <div class="form-row">
              <div class="field-due">
                <label for="task-due"
                  >Due date <span class="req" aria-hidden="true">*</span></label
                >
                <input
                  type="date"
                  id="task-due"
                  name="dueDate"
                  required
                  min=""
                  aria-describedby="task-due-error"
                />
                <span id="task-due-error" class="inline-error" aria-live="polite"></span>
              </div>

              <div class="field-priority">
                <label for="task-priority"
                  >Priority <span class="req" aria-hidden="true">*</span></label
                >
                <select id="task-priority" name="priority" required aria-describedby="task-priority-error">
                  <option value="">Select priority</option>
                  <option value="Low">Low</option>
                  <option value="Medium" selected>Medium</option>
                  <option value="High">High</option>
                </select>
                <span id="task-priority-error" class="inline-error" aria-live="polite"></span>
              </div>
            </div>

            <div class="field-estimated">
              <label for="task-estimated"
                >Estimated hours <span class="req" aria-hidden="true">*</span></label
              >
              <input
                type="number"
                id="task-estimated"
                name="estimatedHours"
                min="0.25"
                max="100"
                step="0.25"
                value="1"
                required
                aria-describedby="task-estimated-error"
              />
              <span id="task-estimated-error" class="inline-error" aria-live="polite"></span>
            </div>
          </fieldset>

          <!-- optional -->
          <fieldset class="form-section">
            <legend>Optional details</legend>

            <div class="field-tags">
              <label for="task-tags">Tags</label>
              <input
                type="text"
                id="task-tags"
                name="tags"
                list="tag-suggestions"
                placeholder="e.g. homework, lab, urgent"
                aria-describedby="task-tags-error"
              />
              <datalist id="tag-suggestions">
                <option value="homework"></option>
                <option value="lab"></option>
                <option value="exam"></option>
                <option value="project"></option>
                <option value="reading"></option>
                <option value="urgent"></option>
                <option value="group-work"></option>
              </datalist>
              <span id="task-tags-error" class="inline-error" aria-live="polite"></span>
            </div>

            <!-- reminder -->
            <div class="reminder-group" id="reminder-group">
              <label class="reminder-toggle">
                <input type="checkbox" id="task-has-reminder" name="hasReminder" value="1" />
                <span class="toggle-ui">
                  <span class="toggle-track"></span>
                  <span class="toggle-thumb"></span>
                </span>
                <span class="toggle-label">Set a reminder</span>
              </label>

              <div class="field-reminder-date" id="reminder-date-field" hidden>
                <label for="task-reminder-date"
                  >Remind me on <span class="req" aria-hidden="true">*</span></label
                >
                <input
                  type="date"
                  id="task-reminder-date"
                  name="reminderDate"
                  min=""
                  aria-describedby="task-reminder-error"
                />
                <span id="task-reminder-error" class="inline-error" aria-live="polite"></span>
              </div>
            </div>

            <div class="field-notes">
              <label for="task-notes">Notes</label>
              <textarea
                id="task-notes"
                name="notes"
                rows="3"
                maxlength="500"
                placeholder="Optional details"
                aria-describedby="task-notes-error"
              ></textarea>
              <span id="task-notes-error" class="inline-error" aria-live="polite"></span>
            </div>
          </fieldset>

          <div class="form-actions">
            <button type="button" id="task-form-reset" class="btn">Clear form</button>
            <button type="submit" class="btn btn-primary">Add task</button>
          </div>
        </form>
      </section>

      <section
        id="tasks"
        data-view="student"
        aria-labelledby="tasks-title"
        hidden
      >
        <h2 id="tasks-title">Tasks</h2>
        <p id="workflow-message" role="status" aria-live="polite" hidden></p>

        <section class="content-card" aria-labelledby="task-controls-title">
          <h3 id="task-controls-title">Task controls</h3>

          <form id="task-controls">
            <div>
              <label for="status-filter">Status</label>
              <select id="status-filter">
                <option value="ALL">All</option>
                <option value="To do">To do</option>
                <option value="In progress">In progress</option>
                <option value="In review">In review</option>
                <option value="Done">Done</option>
              </select>
            </div>

            <div>
              <label for="priority-filter">Priority</label>
              <select id="priority-filter">
                <option value="ALL">All</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>

            <div>
              <label for="sort-key">Sort by</label>
              <select id="sort-key">
                <option value="dueDate">Due date</option>
                <option value="title">Title</option>
                <option value="subject">Subject</option>
                <option value="priority">Priority</option>
                <option value="createdAt">Created date</option>
              </select>
            </div>

            <div>
              <label for="sort-direction">Direction</label>
              <select id="sort-direction">
                <option value="asc">Ascending</option>
                <option value="desc">Descending</option>
              </select>
            </div>

            <div>
              <label for="page-size">Rows per page</label>
              <select id="page-size">
                <option value="5" selected>5</option>
                <option value="10">10</option>
                <option value="15">15</option>
              </select>
            </div>
          </form>
        </section>

        <section id="task-list" aria-labelledby="task-list-title">
          <div class="list-header">
            <div>
              <h3 id="task-list-title">Task list</h3>
              <p id="task-result-count" aria-live="polite"></p>
            </div>

            <button
              type="button"
              id="open-archives"
              aria-haspopup="dialog"
              aria-controls="archives-dialog"
            >
              Archives (0)
            </button>
          </div>

          <div class="table-wrapper">
            <table>
              <caption>
                StudyHub task records
              </caption>
              <thead>
                <tr>
                  <th>Task</th>
                  <th>Subject</th>
                  <th>Due</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Time left</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody id="task-table-body"></tbody>
            </table>
          </div>

          <div id="task-pagination" aria-label="Task pagination"></div>
        </section>

        <p id="task-empty-state" hidden>
          No tasks match the current search or filters.
        </p>

        <aside
          id="task-details"
          class="content-card"
          aria-labelledby="task-details-title"
        >
          <h3 id="task-details-title">Task details</h3>
          <p>Select a task to inspect its full record.</p>
        </aside>

        <dialog id="archives-dialog" aria-labelledby="archives-title">
          <div class="dialog-body">
            <div class="dialog-header">
              <h3 id="archives-title">Archives</h3>
              <button type="button" id="close-archives">Close</button>
            </div>

            <p class="section-note">
              Tasks that finished the whole workflow. Archived tasks can't be
              changed, but you can permanently delete ones you no longer need.
            </p>

            <p id="archive-status" class="archive-status" role="status" aria-live="polite" hidden></p>

            <p id="archive-empty-state">
              No archived tasks yet. Finish a task, then use Archive to file it
              here.
            </p>

            <div id="archive-table-wrapper" class="table-wrapper" hidden>
              <table>
                <caption>
                  Archived tasks
                </caption>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Subject</th>
                    <th>Due</th>
                    <th>Priority</th>
                    <th>Archived on</th>
                    <th>History</th>
                    <th><span class="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody id="archive-table-body"></tbody>
              </table>
            </div>
          </div>
        </dialog>
      </section>

      <section
        id="schedules"
        data-view="student"
        aria-labelledby="schedules-title"
        hidden
      >
        <h2 id="schedules-title">Schedules</h2>

        <div class="content-card">
          <h3 id="schedule-form-title">Add class</h3>
          <div id="schedule-error-summary" role="alert" hidden></div>

          <form id="schedule-form" novalidate>
            <input type="hidden" id="schedule-id" name="id" />

            <div>
              <label for="schedule-day">Day</label>
              <select id="schedule-day" name="day">
                <option value="Monday">Monday</option>
                <option value="Tuesday">Tuesday</option>
                <option value="Wednesday">Wednesday</option>
                <option value="Thursday">Thursday</option>
                <option value="Friday">Friday</option>
                <option value="Saturday">Saturday</option>
                <option value="Sunday">Sunday</option>
              </select>
            </div>

            <div>
              <label for="schedule-start">Start time</label>
              <input
                type="time"
                id="schedule-start"
                name="startTime"
                required
              />
            </div>

            <div>
              <label for="schedule-end">End time</label>
              <input type="time" id="schedule-end" name="endTime" required />
            </div>

            <div>
              <label for="schedule-class">Class</label>
              <input
                type="text"
                id="schedule-class"
                name="className"
                placeholder="e.g. Discrete Mathematics"
                required
              />
            </div>

            <div>
              <label for="schedule-code">Course code</label>
              <input
                type="text"
                id="schedule-code"
                name="courseCode"
                placeholder="e.g. CMPE 104"
              />
            </div>

            <div>
              <label for="schedule-instructor">Instructor</label>
              <input
                type="text"
                id="schedule-instructor"
                name="instructor"
                placeholder="e.g. Prof. Santos"
              />
            </div>

            <button type="submit" id="schedule-submit">Add class</button>
            <button type="button" id="schedule-cancel" hidden>
              Cancel edit
            </button>
          </form>
        </div>

        <div class="content-card">
          <div class="schedule-card-heading">
            <h3>Weekly class schedule</h3>
            <button
              type="button"
              id="schedule-actions-toggle"
              aria-controls="schedule-table"
              aria-pressed="false"
            >
              Show actions
            </button>
          </div>
          <div class="table-wrapper">
            <table id="schedule-table" class="schedule-actions-hidden">
              <caption>
                Weekly class schedule
              </caption>
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Time</th>
                  <th>Class</th>
                  <th>Course code</th>
                  <th>Instructor</th>
                  <th class="schedule-actions-column">Actions</th>
                </tr>
              </thead>
              <tbody id="schedule-table-body"></tbody>
            </table>
          </div>
        </div>
      </section>

      <section
        id="notes"
        data-view="student"
        aria-labelledby="notes-title"
        hidden
      >
        <h2 id="notes-title">Notes</h2>

        <div class="content-card">
          <h3 id="note-form-title">Add note</h3>
          <div id="note-error-summary" role="alert" hidden></div>

          <form id="note-form" novalidate>
            <input type="hidden" id="note-id" name="id" />

            <div>
              <label for="note-title">Title</label>
              <input
                type="text"
                id="note-title"
                name="title"
                placeholder="e.g. Electrical circuits"
                required
              />
            </div>

            <div class="field-wide">
              <label for="note-body">Note</label>
              <textarea
                id="note-body"
                name="body"
                rows="4"
                placeholder="Write your study note here"
                required
              ></textarea>
            </div>

            <div>
              <label for="note-remark">Reminder (optional)</label>
              <input
                type="text"
                id="note-remark"
                name="remark"
                placeholder="e.g. Review before the quiz"
              />
            </div>

            <button type="submit" id="note-submit">Add note</button>
            <button type="button" id="note-cancel" hidden>Cancel edit</button>
          </form>
        </div>

        <div class="content-card">
          <h3>Study notes</h3>
          <div id="note-list"></div>
          <p id="note-empty-state" hidden>No notes yet. Add one above.</p>
        </div>
      </section>

      <section
        id="focus"
        data-view="student"
        aria-labelledby="focus-title"
        hidden
      >
        <h2 id="focus-title">Focus</h2>
        <div class="content-card focus-panel pomodoro-panel">
          <div class="pomo-heading">
            <h3>Focus session</h3>
            <p>Pick one task, start the timer, and take a break when it rings.</p>
          </div>
          <div class="pomo-modes" role="group" aria-label="Timer mode">
            <button type="button" data-pomo-mode="focus" aria-pressed="true">
              Focus
            </button>
            <button type="button" data-pomo-mode="short" aria-pressed="false">
              Short break
            </button>
            <button type="button" data-pomo-mode="long" aria-pressed="false">
              Long break
            </button>
          </div>
          <div
            class="pomo-clock"
            id="pomo-clock"
            role="timer"
            aria-label="Time remaining"
          >
            <div class="pomo-clock-inner">
              <span id="pomo-phase-label">FOCUS SESSION</span>
              <strong id="pomo-time">25:00</strong>
              <span id="pomo-timer-status">Ready when you are</span>
            </div>
          </div>
          <div class="pomo-controls">
            <button type="button" id="pomo-start" class="pomo-primary">
              Start focusing
            </button>
            <button type="button" id="pomo-reset" class="pomo-secondary">
              Reset
            </button>
            <button type="button" id="pomo-skip" class="pomo-secondary">
              Skip
            </button>
          </div>
          <section class="pomo-settings" aria-label="Timer preferences">
            <button
              type="button"
              class="pomo-settings-toggle"
              id="pomo-settings-toggle"
              aria-expanded="false"
              aria-controls="pomo-settings-form"
            >
              <span class="pomo-settings-label"><svg class="icon" aria-hidden="true"><use href="#i-settings" /></svg>Customize timers</span>
              <svg class="icon chevron" aria-hidden="true"><use href="#i-chevron-down" /></svg>
            </button>
            <form id="pomo-settings-form" class="pomo-settings-form" hidden>
              <p>Choose your own study and break durations (1–180 minutes).</p>
              <div class="pomo-settings-fields">
                <label for="pomo-focus-duration"
                  >Focus <span>minutes</span
                  ><input
                    id="pomo-focus-duration"
                    name="focus"
                    type="number"
                    min="1"
                    max="180"
                    step="1"
                    value="25"
                    required
                /></label>
                <label for="pomo-short-duration"
                  >Short break <span>minutes</span
                  ><input
                    id="pomo-short-duration"
                    name="short"
                    type="number"
                    min="1"
                    max="180"
                    step="1"
                    value="5"
                    required
                /></label>
                <label for="pomo-long-duration"
                  >Long break <span>minutes</span
                  ><input
                    id="pomo-long-duration"
                    name="long"
                    type="number"
                    min="1"
                    max="180"
                    step="1"
                    value="15"
                    required
                /></label>
              </div>
              <div class="pomo-settings-actions">
                <button type="submit" class="pomo-primary">
                  Save durations</button
                ><button
                  type="button"
                  id="pomo-defaults"
                  class="pomo-secondary"
                >
                  Restore defaults
                </button>
              </div>
              <p class="pomo-settings-note">
                Saving resets the current countdown. Completed sessions and your
                study stats stay saved.
              </p>
            </form>
          </section>
          <div class="pomo-lower">
            <label for="pomo-intention"
              >What are you working on?
              <input
                id="pomo-intention"
                type="text"
                maxlength="100"
                placeholder="e.g. Review circuit analysis"
                autocomplete="off"
              />
            </label>
            <div class="pomo-stats">
              <div>
                <strong id="pomo-sessions">0</strong
                ><span>Focus sessions today</span>
              </div>
              <div>
                <strong id="pomo-minutes">0</strong
                ><span>Focused minutes today</span>
              </div>
              <div>
                <strong id="pomo-cycle">1 / 4</strong><span>Current cycle</span>
              </div>
            </div>
            <p
              class="pomo-hint"
              id="pomo-message"
              role="status"
              aria-live="polite"
            >
              Tip: After four focus sessions, take a longer break.
            </p>
          </div>
        </div>
      </section>

      <section
        id="profile"
        data-view="student teacher admin"
        aria-labelledby="profile-title"
        hidden
      >
        <header class="page-head">
          <h2 id="profile-title">Profile</h2>
          <p class="page-sub">Signed in as <span id="profile-role">—</span></p>
        </header>

        <div class="profile-grid">
          <section class="content-card" aria-labelledby="profile-details-title">
            <h3 id="profile-details-title">Your details</h3>
            <p class="section-note">Your email is also your username when you log in.</p>

            <form id="profile-details-form" class="profile-form" novalidate>
              <div>
                <label for="profile-name">Full name</label>
                <input id="profile-name" name="name" type="text" maxlength="100" autocomplete="name" required />
              </div>
              <div>
                <label for="profile-email">Email</label>
                <input id="profile-email" name="email" type="email" maxlength="190" autocomplete="email" required />
              </div>
              <div id="profile-email-password-field" hidden>
                <label for="profile-email-password">Current password</label>
                <input id="profile-email-password" name="currentPassword" type="password" autocomplete="current-password" aria-describedby="profile-email-password-hint" />
                <p id="profile-email-password-hint" class="field-hint">Needed to change your email.</p>
              </div>
              <p id="profile-details-message" class="form-message" role="status" aria-live="polite" hidden></p>
              <div class="form-actions">
                <button type="submit">Save details</button>
              </div>
            </form>
          </section>

          <section class="content-card" aria-labelledby="profile-password-title">
            <h3 id="profile-password-title">Change password</h3>
            <p id="profile-password-note" class="section-note">
              Changing your password signs you out on every other device.
            </p>

            <form id="profile-password-form" class="profile-form" novalidate>
              <div>
                <label for="profile-current-password">Current password</label>
                <input id="profile-current-password" name="currentPassword" type="password" autocomplete="current-password" required />
              </div>
              <div>
                <label for="profile-new-password">New password</label>
                <input id="profile-new-password" name="newPassword" type="password" autocomplete="new-password" minlength="8" maxlength="72" required aria-describedby="profile-new-password-hint" />
                <p id="profile-new-password-hint" class="field-hint">At least 8 characters.</p>
              </div>
              <div>
                <label for="profile-confirm-password">Confirm new password</label>
                <input id="profile-confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required />
              </div>
              <p id="profile-password-message" class="form-message" role="status" aria-live="polite" hidden></p>
              <div class="form-actions">
                <button type="submit">Change password</button>
              </div>
            </form>
          </section>
        </div>
      </section>

      <section
        id="settings"
        data-view="student"
        aria-labelledby="settings-title"
        hidden
      >
        <h2 id="settings-title">Settings</h2>

        <section
          id="appearance-settings"
          class="content-card"
          aria-labelledby="appearance-title"
        >
          <h3 id="appearance-title">Appearance</h3>
          <p class="section-note">
            Choose how StudyHub looks. Your choice is remembered on this device.
          </p>

          <fieldset class="theme-options">
            <legend class="sr-only">Color theme</legend>

            <label class="theme-option" for="theme-dark">
              <input type="radio" id="theme-dark" name="theme" value="dark" />
              Dark
            </label>

            <label class="theme-option" for="theme-light">
              <input type="radio" id="theme-light" name="theme" value="light" />
              Light
            </label>

            <label class="theme-option" for="theme-system">
              <input
                type="radio"
                id="theme-system"
                name="theme"
                value="system"
              />
              Match my device
            </label>
          </fieldset>
        </section>

        <!-- unit 8: data management -->
        <section
          id="system-data"
          class="content-card"
          aria-labelledby="system-data-title"
        >
          <h3 id="system-data-title">
            Unit 8: Persistence, Backup, & Audit Trail
          </h3>
          <p class="section-note">
            Your tasks, classes and notes are saved to your account. Export a
            JSON backup, import one to replace your current data, or reset to
            start fresh. Every change is recorded in the audit trail below.
          </p>

          <div
            id="storage-status-message"
            role="status"
            aria-live="polite"
            hidden
          ></div>

          <div class="persistence-controls">
            <button type="button" id="btn-export-json">Export JSON</button>

            <label for="import-json-file" class="button-file-label"
              >Select JSON to Import</label
            >
            <input
              type="file"
              id="import-json-file"
              accept=".json"
              class="sr-only"
            />

            <button type="button" id="btn-reset-data" class="btn-danger">
              Reset my data
            </button>
          </div>

          <div id="reset-confirm-box" class="sub-card" hidden>
            <label for="reset-confirm-input"
              >This permanently deletes all of your tasks, classes and notes and
              restores default settings. Type RESET to confirm.</label
            >
            <input
              type="text"
              id="reset-confirm-input"
              autocomplete="off"
              spellcheck="false"
            />
            <div class="task-actions">
              <button type="button" id="btn-confirm-reset" class="btn-danger">
                Delete everything
              </button>
              <button type="button" id="btn-cancel-reset">Cancel</button>
            </div>
          </div>

          <div id="import-preview-box" class="sub-card" hidden>
            <h4>Import Payload Preview</h4>
            <p id="import-preview-text"></p>
            <div class="task-actions">
              <button type="button" id="btn-confirm-import" class="btn-danger">
                Replace my data
              </button>
              <button type="button" id="btn-cancel-import">Cancel</button>
            </div>
          </div>

          <div class="audit-trail-container">
            <h4>System Audit Trail</h4>
            <div class="table-wrapper">
              <table>
                <caption>
                  Recent system actions (Unit 8)
                </caption>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Target</th>
                    <th>Details</th>
                  </tr>
                </thead>
                <tbody id="audit-log-body"></tbody>
              </table>
            </div>
          </div>
        </section>
      </section>

    </main>

    <!-- toasts -->
    <div id="toast-container" aria-live="polite" aria-atomic="true"></div>

    <script>
      /* stuff from the db for app.js */
      window.STUDYHUB_USER = <?= json_encode([
          'id'   => $currentUser['id'],
          'name' => $currentUser['name'],
          'username' => $currentUser['username'],
          'role' => $currentUser['role'],
          'mustChangePassword' => $currentUser['must_change_password'],
      ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>
    <script>
      window.STUDYHUB_TASKS = <?= json_encode($tasks, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>
    <script>
      window.STUDYHUB_SCHEDULES = <?= json_encode($schedules, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>
    <script>
      window.STUDYHUB_NOTES = <?= json_encode($notes, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>
    <script>
      window.STUDYHUB_AUDIT = <?= json_encode($auditLog, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>
    <script>
      window.STUDYHUB_PREFERENCES = <?= json_encode($preferences, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>
    <script>
      window.STUDYHUB_POMODORO = <?= json_encode($pomodoroPreferences, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
      /* live announcements for this role */
      window.STUDYHUB_ANNOUNCEMENTS = <?= json_encode($announcements, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) ?>;
    </script>
    <script src="<?= asset('js/auth.js') ?>" defer></script>
    <script src="<?= asset('js/app.js') ?>" defer></script>
    <script src="<?= asset('js/classroom.js') ?>" defer></script>
    <script src="<?= asset('js/teacher_classroom.js') ?>" defer></script>
    <script src="<?= asset('js/classroom_tasks.js') ?>" defer></script>
    <script src="<?= asset('js/pomodoro.js') ?>" defer></script>
  </body>
</html>
