// js/teacher_classroom.js
// The teacher's Classroom page. Two views inside #teacher-classroom:
//   1. Class list  - search (database) + one card per class + "Create class"
//   2. One class   - banner with the class code, then tabs:
//        Stream     announcements / materials (api/classroom.php)
//        Classwork  assigned tasks + turned-in progress (api/classroom_tasks.php)
//        People     students who joined
// Grading stays on the Submissions page (js/classroom_tasks.js); "Review"
// buttons here jump there, filtered to this class.
(function () {
  "use strict";

  var CLASS_API = "api/classroom.php";
  var TASK_API = "api/classroom_tasks.php";

  var state = {
    loaded: false,
    classes: [],      // from classroom.php (respects the search box)
    posts: [],
    students: [],     // one row per (student, class)
    tasks: [],        // from classroom_tasks.php
    submissions: [],
    query: "",
    openClassId: null,
    tab: "stream",
    searchTimer: null,
    searchSeq: 0
  };

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function icon(name) {
    return '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '" /></svg>';
  }

  function toast(message) {
    if (typeof window.showToast === "function") window.showToast(message, 3200);
  }

  function initials(name) {
    var parts = String(name || "?").trim().split(/\s+/);
    return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }

  function plural(n, word, many) {
    return n + " " + (n === 1 ? word : many || word + "s");
  }

  // "2026-11-26 23:19:09" -> "Nov 26, 2026"
  function niceDate(value) {
    if (!value) return "";
    var d = new Date(String(value).replace(" ", "T"));
    if (isNaN(d)) return String(value);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function daysUntil(dateStr) {
    var due = new Date(dateStr + "T00:00:00");
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((due - today) / 86400000);
  }

  function duePill(dateStr) {
    if (!dateStr) return '<span class="tc-pill">No due date</span>';
    var d = daysUntil(dateStr);
    var label = "Due " + niceDate(dateStr);
    if (d < 0) return '<span class="tc-pill tc-pill--danger">Past due · ' + esc(niceDate(dateStr)) + "</span>";
    if (d === 0) return '<span class="tc-pill tc-pill--warning">Due today</span>';
    if (d <= 2) return '<span class="tc-pill tc-pill--warning">' + esc(label) + "</span>";
    return '<span class="tc-pill">' + esc(label) + "</span>";
  }

  function points(value) {
    var n = Number(value);
    return (Number.isInteger(n) ? String(n) : n.toFixed(1)) + " pts";
  }

  /* ---------- Server ---------- */

  function getJson(url) {
    return fetch(url, { credentials: "same-origin" }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data || !data.ok) throw new Error((data && data.message) || "Could not load the classroom.");
        return data;
      });
    });
  }

  function post(url, payload) {
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data || !data.ok) throw new Error((data && data.message) || "Something went wrong.");
        return data;
      });
    });
  }

  function loadAll() {
    var classUrl = CLASS_API + (state.query ? "?q=" + encodeURIComponent(state.query) : "");
    return Promise.all([getJson(classUrl), getJson(TASK_API)])
      .then(function (results) {
        var c = results[0];
        var t = results[1];
        state.classes = c.classrooms || [];
        state.posts = c.posts || [];
        state.students = c.students || [];
        state.tasks = t.tasks || [];
        state.submissions = t.submissions || [];
        state.loaded = true;
        render();
      })
      .catch(function (err) {
        $("tc-class-grid").innerHTML = emptyState("Could not load your classes", err.message, "");
        $("tc-class-grid").removeAttribute("aria-busy");
      });
  }

  // Search goes to the database (api/classroom.php?q=...), debounced.
  function searchClasses(query) {
    state.query = query;
    var seq = ++state.searchSeq;
    var url = CLASS_API + (query ? "?q=" + encodeURIComponent(query) : "");
    return getJson(url)
      .then(function (data) {
        if (seq !== state.searchSeq) return;   // a newer search already started
        state.classes = data.classrooms || [];
        renderList();
      })
      .catch(function (err) {
        toast(err.message);
      });
  }

  // After grading/assigning, the dashboard numbers on other pages need refreshing too.
  function syncOtherPages() {
    if (window.classroomTasks && typeof window.classroomTasks.reload === "function") {
      window.classroomTasks.reload();
    }
  }

  /* ---------- Derived data ---------- */

  function findClass(id) {
    for (var i = 0; i < state.classes.length; i++) {
      if (String(state.classes[i].id) === String(id)) return state.classes[i];
    }
    return null;
  }

  function classTasks(id) {
    return state.tasks
      .filter(function (t) { return String(t.classroom_id) === String(id); })
      .sort(function (a, b) {
        // Upcoming first, then past due, then no due date.
        if (!a.due_date && !b.due_date) return b.id - a.id;
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        var da = daysUntil(a.due_date);
        var db = daysUntil(b.due_date);
        if ((da < 0) !== (db < 0)) return da < 0 ? 1 : -1;
        return da < 0 ? db - da : da - db;
      });
  }

  function classPosts(id) {
    return state.posts.filter(function (p) { return String(p.classroom_id) === String(id); });
  }

  function classStudents(id) {
    var seen = {};
    return state.students
      .filter(function (s) {
        if (String(s.classroom_id) !== String(id) || seen[s.id]) return false;
        seen[s.id] = true;
        return true;
      })
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }

  function submissionsFor(taskId) {
    return state.submissions.filter(function (s) { return String(s.task_id) === String(taskId); });
  }

  function pendingCount(classId) {
    return state.submissions.filter(function (s) {
      return String(s.classroom_id) === String(classId) && s.status !== "graded";
    }).length;
  }

  /* ---------- Rendering: shared ---------- */

  function emptyState(title, text, actionHtml) {
    return (
      '<div class="tc-empty">' +
      "<strong>" + esc(title) + "</strong>" +
      (text ? "<p>" + esc(text) + "</p>" : "") +
      (actionHtml || "") +
      "</div>"
    );
  }

  function render() {
    var open = state.openClassId && findClass(state.openClassId);
    if (state.openClassId && !open) state.openClassId = null;   // deleted / filtered away
    $("tc-list-view").hidden = Boolean(open);
    $("tc-detail-view").hidden = !open;
    if (open) renderDetail(open);
    else renderList();
  }

  /* ---------- Rendering: class list ---------- */

  function renderList() {
    var grid = $("tc-class-grid");
    var count = $("tc-count");
    grid.removeAttribute("aria-busy");

    if (!state.classes.length) {
      count.textContent = "";
      grid.innerHTML = state.query
        ? emptyState(
            'No classes match "' + state.query + '"',
            "Try a class code like CLS-WEB221, a subject, or a section.",
            '<button type="button" class="btn" data-tc-clear-search>Clear search</button>'
          )
        : emptyState(
            "You have no classes yet",
            "Create a class, then share its code so students can join.",
            '<button type="button" class="btn-primary" data-tc-create>' + icon("plus") + "Create your first class</button>"
          );
      return;
    }

    count.textContent = state.query
      ? plural(state.classes.length, "class", "classes") + ' found for "' + state.query + '"'
      : plural(state.classes.length, "class", "classes");

    grid.innerHTML = state.classes
      .map(function (c) {
        var students = classStudents(c.id).length;
        var tasks = classTasks(c.id).length;
        var pending = pendingCount(c.id);
        var meta = [c.subject, c.section].filter(Boolean).map(esc).join(" · ");
        return (
          '<article class="tc-card">' +
          '  <div class="tc-card-head">' +
          '    <h3 class="tc-card-title"><button type="button" class="tc-card-open" data-tc-open="' + esc(c.id) + '">' +
                 esc(c.title) + "</button></h3>" +
          '    <p class="tc-card-meta">' + (meta || "&nbsp;") + "</p>" +
          "  </div>" +
          '  <dl class="tc-card-stats">' +
          "    <div><dt>Students</dt><dd>" + students + "</dd></div>" +
          "    <div><dt>Tasks</dt><dd>" + tasks + "</dd></div>" +
          '    <div><dt>To review</dt><dd class="' + (pending ? "tc-attention" : "") + '">' + pending + "</dd></div>" +
          "  </dl>" +
          '  <div class="tc-card-foot">' +
          '    <span class="tc-code" title="Class code">' + esc(c.class_code) + "</span>" +
          '    <span class="tc-card-go" aria-hidden="true">Open' + icon("arrow-right") + "</span>" +
          "  </div>" +
          "</article>"
        );
      })
      .join("");
  }

  /* ---------- Rendering: one class ---------- */

  function renderDetail(c) {
    $("tc-crumb-current").textContent = c.title;

    var meta = [c.subject, c.section].filter(Boolean).map(esc).join(" · ");
    $("tc-banner").innerHTML =
      '<div class="tc-banner-main">' +
      (meta ? '<p class="tc-eyebrow">' + meta + "</p>" : "") +
      '<h2 id="tc-class-title" tabindex="-1">' + esc(c.title) + "</h2>" +
      '<div class="tc-code-row">' +
      '  <span class="tc-code-label">Class code</span>' +
      '  <span class="tc-code tc-code--lg">' + esc(c.class_code) + "</span>" +
      '  <button type="button" class="btn tc-btn-sm" data-tc-copy="' + esc(c.class_code) + '">' + icon("copy") +
      '<span>Copy</span></button>' +
      "</div>" +
      "</div>" +
      '<div class="tc-banner-actions">' +
      '  <button type="button" class="btn" data-tc-edit-class>' + icon("edit") + "Edit</button>" +
      '  <button type="button" class="btn tc-btn-danger" data-tc-delete-class>' + icon("trash") + "Delete class</button>" +
      "</div>";

    var tasks = classTasks(c.id);
    var people = classStudents(c.id);
    $("tc-count-classwork").textContent = tasks.length ? String(tasks.length) : "";
    $("tc-count-people").textContent = people.length ? String(people.length) : "";

    renderStream(c);
    renderClasswork(c, tasks);
    renderPeople(c, people);
    showTab(state.tab, false);
  }

  function composer(kind, c) {
    if (kind === "post") {
      return (
        '<div class="tc-composer" data-tc-composer="post">' +
        '  <button type="button" class="tc-composer-trigger" data-tc-expand="post">' +
        '    <span class="tc-avatar" aria-hidden="true">' + icon("megaphone") + "</span>" +
        "    <span>Share an announcement or material with " + esc(c.title) + "…</span>" +
        "  </button>" +
        '  <form class="tc-form-grid tc-composer-form" data-tc-form="post" hidden novalidate>' +
        '    <div class="tc-field tc-field--full"><label for="tc-post-title">Title</label>' +
        '      <input id="tc-post-title" name="title" maxlength="150" required placeholder="e.g. Week 4 lecture slides" /></div>' +
        '    <div class="tc-field tc-field--full"><label for="tc-post-content">Message</label>' +
        '      <textarea id="tc-post-content" name="content" rows="4" required placeholder="What do students need to know?"></textarea></div>' +
        '    <div class="tc-field tc-field--full"><label for="tc-post-link">Resource link <span class="tc-optional">optional</span></label>' +
        '      <input id="tc-post-link" name="resource_link" type="url" maxlength="255" placeholder="https://…" /></div>' +
        '    <p class="form-message is-error tc-field--full" role="alert" hidden></p>' +
        '    <div class="tc-form-actions">' +
        '      <button type="button" class="btn" data-tc-collapse="post">Cancel</button>' +
        '      <button type="submit">Post to class</button>' +
        "    </div>" +
        "  </form>" +
        "</div>"
      );
    }
    return (
      '  <form class="tc-form-grid tc-composer-form tc-card-box" data-tc-form="task" hidden novalidate>' +
      '    <h4 class="tc-field--full">New task for ' + esc(c.title) + "</h4>" +
      '    <div class="tc-field tc-field--full"><label for="tc-task-title">Title</label>' +
      '      <input id="tc-task-title" name="title" maxlength="150" required placeholder="e.g. Lab exercise 3" /></div>' +
      '    <div class="tc-field"><label for="tc-task-due">Due date <span class="tc-optional">optional</span></label>' +
      '      <input id="tc-task-due" name="due_date" type="date" /></div>' +
      '    <div class="tc-field"><label for="tc-task-max">Points</label>' +
      '      <input id="tc-task-max" name="max_score" type="number" min="1" max="1000" step="1" value="100" required /></div>' +
      '    <div class="tc-field tc-field--full"><label for="tc-task-desc">Instructions</label>' +
      '      <textarea id="tc-task-desc" name="description" rows="4" required placeholder="What should students submit?"></textarea></div>' +
      '    <p class="form-message is-error tc-field--full" role="alert" hidden></p>' +
      '    <div class="tc-form-actions">' +
      '      <button type="button" class="btn" data-tc-collapse="task">Cancel</button>' +
      '      <button type="submit">Assign task</button>' +
      "    </div>" +
      "  </form>"
    );
  }

  function renderStream(c) {
    var posts = classPosts(c.id);
    var list = posts.length
      ? '<ul class="tc-list">' +
        posts
          .map(function (p) {
            var link = p.resource_link
              ? '<a class="tc-link-chip" href="' + esc(p.resource_link) + '" target="_blank" rel="noopener noreferrer">' +
                icon("link") + "<span>" + esc(p.resource_link.replace(/^https?:\/\//i, "")) + "</span></a>"
              : "";
            return (
              '<li class="tc-post">' +
              '  <div class="tc-post-head">' +
              '    <span class="tc-avatar" aria-hidden="true">' + esc(initials(p.author_name)) + "</span>" +
              '    <div class="tc-post-who"><strong>' + esc(p.author_name || "Teacher") + "</strong>" +
              '      <span class="section-note">' + esc(niceDate(p.created_at)) + "</span></div>" +
              '    <button type="button" class="tc-icon-btn tc-icon-btn--danger" data-tc-delete-post="' + esc(p.id) +
                   '" aria-label="Delete post: ' + esc(p.title) + '">' + icon("trash") + "</button>" +
              "  </div>" +
              '  <h4 class="tc-post-title">' + esc(p.title) + "</h4>" +
              '  <p class="tc-post-body">' + esc(p.content) + "</p>" +
              link +
              "</li>"
            );
          })
          .join("") +
        "</ul>"
      : emptyState("Nothing posted yet", "Announcements and materials you share appear here for your students.", "");

    $("tc-panel-stream").innerHTML = composer("post", c) + list;
  }

  function renderClasswork(c, tasks) {
    var classSize = classStudents(c.id).length;
    var list = tasks.length
      ? '<ul class="tc-list">' +
        tasks
          .map(function (t) {
            var subs = submissionsFor(t.id);
            var turnedIn = subs.length;
            var toReview = subs.filter(function (s) { return s.status !== "graded"; }).length;
            var total = Math.max(classSize, Number(t.class_student_count || 0));
            var pct = total ? Math.min(100, Math.round((turnedIn / total) * 100)) : 0;
            return (
              '<li class="tc-task">' +
              '  <div class="tc-task-main">' +
              '    <h4 class="tc-task-title">' + esc(t.title) + "</h4>" +
              '    <div class="tc-task-meta">' + duePill(t.due_date) + '<span class="tc-pill">' + esc(points(t.max_score)) + "</span></div>" +
              '    <p class="tc-task-desc">' + esc(t.description) + "</p>" +
              "  </div>" +
              '  <div class="tc-task-side">' +
              '    <div class="tc-progress" aria-label="' + turnedIn + " of " + total + ' students turned in">' +
              '      <div class="tc-progress-label"><strong>' + turnedIn + "/" + total + "</strong> turned in</div>" +
              '      <div class="tc-progress-track"><span style="width:' + pct + '%"></span></div>' +
              "    </div>" +
              '    <div class="tc-task-actions">' +
              '      <button type="button" class="btn tc-btn-sm" data-tc-review="' + esc(c.id) + '"' + (turnedIn ? "" : " disabled") + ">" +
                     (toReview ? toReview + " to review" : "View submissions") + "</button>" +
              '      <button type="button" class="tc-icon-btn tc-icon-btn--danger" data-tc-delete-task="' + esc(t.id) +
                     '" aria-label="Delete task: ' + esc(t.title) + '">' + icon("trash") + "</button>" +
              "    </div>" +
              "  </div>" +
              "</li>"
            );
          })
          .join("") +
        "</ul>"
      : emptyState("No tasks assigned yet", "Tasks you assign show up for every student in this class.", "");

    $("tc-panel-classwork").innerHTML =
      '<div class="tc-panel-head">' +
      "  <div><h3>Classwork</h3>" +
      '  <p class="section-note">' + (tasks.length ? plural(tasks.length, "task") + " · upcoming first" : "Assign work and track who turned it in.") + "</p></div>" +
      '  <button type="button" class="btn-primary" data-tc-expand="task">' + icon("plus") + "Assign task</button>" +
      "</div>" +
      composer("task", c) +
      list;
  }

  function renderPeople(c, people) {
    var tasks = classTasks(c.id);
    var body = people.length
      ? '<ul class="tc-list tc-people">' +
        people
          .map(function (s) {
            var mine = state.submissions.filter(function (x) {
              return String(x.student_id) === String(s.id) && String(x.classroom_id) === String(c.id);
            });
            var graded = mine.filter(function (x) { return x.status === "graded"; }).length;
            return (
              '<li class="tc-person">' +
              '  <span class="tc-avatar" aria-hidden="true">' + esc(initials(s.name)) + "</span>" +
              '  <span class="tc-person-name">' + esc(s.name) + "</span>" +
              '  <span class="section-note">' + mine.length + "/" + tasks.length + " turned in · " + graded + " graded</span>" +
              "</li>"
            );
          })
          .join("") +
        "</ul>"
      : emptyState(
          "No students yet",
          "Students join by entering the class code " + c.class_code + " on their Classroom page.",
          '<button type="button" class="btn" data-tc-copy="' + esc(c.class_code) + '">' + icon("copy") + "<span>Copy code</span></button>"
        );

    $("tc-panel-people").innerHTML =
      '<div class="tc-panel-head"><div><h3>Students</h3>' +
      '<p class="section-note">' + (people.length ? plural(people.length, "student") + " joined" : "Share the class code to invite students.") + "</p></div></div>" +
      body;
  }

  /* ---------- Navigation ---------- */

  function openClass(id, tab) {
    state.openClassId = String(id);
    state.tab = tab || "stream";
    render();
    window.scrollTo({ top: 0 });
    var heading = $("tc-class-title");
    if (heading) heading.focus({ preventScroll: true });
  }

  function backToList() {
    var lastId = state.openClassId;
    state.openClassId = null;
    render();
    var btn = document.querySelector('[data-tc-open="' + lastId + '"]');
    if (btn) btn.focus();
  }

  function showTab(name, focus) {
    state.tab = name;
    ["stream", "classwork", "people"].forEach(function (t) {
      var tab = $("tc-tab-" + t);
      var panel = $("tc-panel-" + t);
      var on = t === name;
      tab.setAttribute("aria-selected", on ? "true" : "false");
      tab.tabIndex = on ? 0 : -1;
      panel.hidden = !on;
    });
    if (focus) $("tc-tab-" + name).focus();
  }

  /* ---------- Forms ---------- */

  function formError(form, message) {
    var el = form.querySelector(".form-message");
    if (!el) return;
    el.textContent = message || "";
    el.hidden = !message;
  }

  function fieldError(form, input, message) {
    formError(form, message);
    input.setAttribute("aria-invalid", "true");
    input.addEventListener("input", function clear() {
      input.removeAttribute("aria-invalid");
      input.removeEventListener("input", clear);
    });
    input.focus();
  }

  function busy(form, isBusy, label) {
    var btn = form.querySelector('button[type="submit"]');
    if (!btn) return;
    if (isBusy) {
      btn.dataset.label = btn.textContent;
      btn.textContent = label || "Saving…";
    } else if (btn.dataset.label) {
      btn.textContent = btn.dataset.label;
    }
    btn.disabled = isBusy;
  }

  function expand(kind) {
    var form = document.querySelector('[data-tc-form="' + kind + '"]');
    if (!form) return;
    form.hidden = false;
    var trigger = document.querySelector('[data-tc-expand="' + kind + '"]');
    if (trigger) trigger.hidden = true;   // the open form replaces its button
    var first = form.querySelector("input, textarea");
    if (first) first.focus();
  }

  function collapse(kind) {
    var form = document.querySelector('[data-tc-form="' + kind + '"]');
    if (!form) return;
    form.reset();
    formError(form, "");
    form.hidden = true;
    var trigger = document.querySelector('[data-tc-expand="' + kind + '"]');
    if (trigger) {
      trigger.hidden = false;
      trigger.focus();
    }
  }

  function submitPost(form) {
    var f = form.elements;
    var data = {
      action: "create_post",
      classroom_id: Number(state.openClassId),
      title: f.title.value.trim(),
      content: f.content.value.trim(),
      resource_link: f.resource_link.value.trim()
    };
    if (!data.title) return fieldError(form, f.title, "Give the post a title.");
    if (!data.content) return fieldError(form, f.content, "Write a message for your students.");
    formError(form, "");
    busy(form, true, "Posting…");
    post(CLASS_API, data)
      .then(function () {
        toast("Posted to the class.");
        state.tab = "stream";
        return loadAll();
      })
      .catch(function (err) {
        busy(form, false);
        formError(form, err.message);
      });
  }

  function submitTask(form) {
    var f = form.elements;
    var data = {
      action: "create_task",
      classroom_id: Number(state.openClassId),
      title: f.title.value.trim(),
      due_date: f.due_date.value,
      max_score: f.max_score.value,
      description: f.description.value.trim()
    };
    if (!data.title) return fieldError(form, f.title, "Give the task a title.");
    if (!(Number(data.max_score) >= 1)) return fieldError(form, f.max_score, "Points must be at least 1.");
    if (!data.description) return fieldError(form, f.description, "Add instructions so students know what to submit.");
    formError(form, "");
    busy(form, true, "Assigning…");
    post(TASK_API, data)
      .then(function () {
        toast("Task assigned.");
        state.tab = "classwork";
        syncOtherPages();
        return loadAll();
      })
      .catch(function (err) {
        busy(form, false);
        formError(form, err.message);
      });
  }

  /* ---------- Dialog (create / edit class, confirm deletes) ---------- */

  var dialogSave = null;

  function openDialog(opts) {
    var dialog = $("tc-dialog");
    $("tc-dialog-title").textContent = opts.title;
    $("tc-dialog-sub").textContent = opts.subtitle || "";
    $("tc-dialog-sub").hidden = !opts.subtitle;
    $("tc-dialog-fields").innerHTML = opts.fieldsHtml || "";
    $("tc-dialog-error").hidden = true;
    var save = $("tc-dialog-save");
    save.textContent = opts.saveLabel || "Save";
    save.disabled = false;
    save.classList.toggle("tc-btn-danger-solid", Boolean(opts.danger));
    dialogSave = opts.onSave;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    var first = $("tc-dialog-fields").querySelector("input, textarea");
    (first || save).focus();
  }

  function closeDialog() {
    var dialog = $("tc-dialog");
    if (dialog.open) dialog.close();
    dialogSave = null;
  }

  function dialogFail(message) {
    var el = $("tc-dialog-error");
    el.textContent = message;
    el.hidden = false;
    $("tc-dialog-save").disabled = false;
  }

  function classFields(c) {
    c = c || {};
    return (
      '<div class="tc-field tc-field--full"><label for="tc-f-title">Class name</label>' +
      '<input id="tc-f-title" name="title" maxlength="150" required placeholder="e.g. Data Structures" value="' + esc(c.title) + '" /></div>' +
      '<div class="tc-field"><label for="tc-f-subject">Subject</label>' +
      '<input id="tc-f-subject" name="subject" maxlength="100" placeholder="e.g. CMPE 201" value="' + esc(c.subject) + '" /></div>' +
      '<div class="tc-field"><label for="tc-f-section">Section <span class="tc-optional">optional</span></label>' +
      '<input id="tc-f-section" name="section" maxlength="60" placeholder="e.g. BSIT 2-A" value="' + esc(c.section) + '" /></div>'
    );
  }

  function readClassFields() {
    return {
      title: $("tc-f-title").value.trim(),
      subject: $("tc-f-subject").value.trim(),
      section: $("tc-f-section").value.trim()
    };
  }

  function createClassDialog() {
    openDialog({
      title: "Create class",
      subtitle: "Students join with the code you get after creating it.",
      saveLabel: "Create class",
      fieldsHtml: classFields(),
      onSave: function () {
        var f = readClassFields();
        if (!f.title) return dialogFail("Enter a class name.");
        return post(CLASS_API, { action: "create_class", title: f.title, subject: f.subject, section: f.section })
          .then(function (data) {
            closeDialog();
            toast("Class created. Share code " + data.class_code + " with your students.");
            return loadAll().then(function () { openClass(data.id, "people"); });
          });
      }
    });
  }

  function editClassDialog(c) {
    openDialog({
      title: "Edit class",
      subtitle: "The class code stays the same.",
      saveLabel: "Save changes",
      fieldsHtml: classFields(c),
      onSave: function () {
        var f = readClassFields();
        if (!f.title) return dialogFail("Enter a class name.");
        if (!f.subject) return dialogFail("Enter a subject.");
        return post(CLASS_API, { action: "update_class", id: Number(c.id), title: f.title, subject: f.subject, section: f.section })
          .then(function () {
            closeDialog();
            toast("Class updated.");
            return loadAll();
          });
      }
    });
  }

  function confirmDialog(title, message, saveLabel, run) {
    openDialog({
      title: title,
      fieldsHtml: '<p class="tc-field--full tc-confirm-text">' + esc(message) + "</p>",
      saveLabel: saveLabel,
      danger: true,
      onSave: run
    });
  }

  /* ---------- Events ---------- */

  function copyCode(code, btn) {
    var done = function () {
      var label = btn.querySelector("span");
      if (!label) return;
      var old = label.textContent;
      label.textContent = "Copied";
      setTimeout(function () { label.textContent = old; }, 1600);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(done, function () { toast("Class code: " + code); });
    } else {
      toast("Class code: " + code);
    }
  }

  function bind() {
    var section = $("teacher-classroom");
    if (!section || section.dataset.tcBound) return;
    section.dataset.tcBound = "1";

    $("tc-create-btn").addEventListener("click", createClassDialog);

    $("tc-search").addEventListener("input", function (e) {
      var q = e.target.value.trim();
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(function () { searchClasses(q); }, 250);
    });

    section.addEventListener("click", function (e) {
      var el = e.target.closest("button, a");
      if (!el || !section.contains(el)) return;
      var c = state.openClassId ? findClass(state.openClassId) : null;

      if (el.hasAttribute("data-tc-open")) return openClass(el.getAttribute("data-tc-open"));
      if (el.hasAttribute("data-tc-back")) return backToList();
      if (el.hasAttribute("data-tc-create")) return createClassDialog();
      if (el.hasAttribute("data-tc-clear-search")) {
        $("tc-search").value = "";
        $("tc-search").focus();
        return searchClasses("");
      }
      if (el.hasAttribute("data-tc-tab")) return showTab(el.getAttribute("data-tc-tab"), false);
      if (el.hasAttribute("data-tc-copy")) return copyCode(el.getAttribute("data-tc-copy"), el);
      if (el.hasAttribute("data-tc-expand")) return expand(el.getAttribute("data-tc-expand"));
      if (el.hasAttribute("data-tc-collapse")) return collapse(el.getAttribute("data-tc-collapse"));
      if (el.hasAttribute("data-tc-dialog-close")) return closeDialog();

      if (el.hasAttribute("data-tc-edit-class") && c) return editClassDialog(c);

      if (el.hasAttribute("data-tc-delete-class") && c) {
        return confirmDialog(
          "Delete " + c.title + "?",
          "This removes the class, its posts, its tasks and every student submission. Students lose access. This cannot be undone.",
          "Delete class",
          function () {
            return post(CLASS_API, { action: "delete_class", id: Number(c.id) }).then(function () {
              closeDialog();
              toast("Class deleted.");
              state.openClassId = null;
              syncOtherPages();
              return loadAll();
            });
          }
        );
      }

      if (el.hasAttribute("data-tc-delete-post")) {
        var postId = Number(el.getAttribute("data-tc-delete-post"));
        return confirmDialog("Delete this post?", "Students will no longer see it.", "Delete post", function () {
          return post(CLASS_API, { action: "delete_post", id: postId }).then(function () {
            closeDialog();
            toast("Post deleted.");
            return loadAll();
          });
        });
      }

      if (el.hasAttribute("data-tc-delete-task")) {
        var taskId = Number(el.getAttribute("data-tc-delete-task"));
        var subs = submissionsFor(taskId).length;
        return confirmDialog(
          "Delete this task?",
          subs
            ? "This also deletes " + plural(subs, "student submission") + " and their grades. This cannot be undone."
            : "Students will no longer see it. This cannot be undone.",
          "Delete task",
          function () {
            return post(TASK_API, { action: "delete_task", id: taskId }).then(function () {
              closeDialog();
              toast("Task deleted.");
              syncOtherPages();
              return loadAll();
            });
          }
        );
      }

      if (el.hasAttribute("data-tc-review")) {
        if (window.classroomTasks) window.classroomTasks.showSubmissions(el.getAttribute("data-tc-review"));
        var link = document.querySelector('.primary-nav a[href="#teacher-submissions"]');
        if (link) link.click();
      }
    });

    section.addEventListener("submit", function (e) {
      var form = e.target;
      if (form.matches('[data-tc-form="post"]')) {
        e.preventDefault();
        submitPost(form);
      } else if (form.matches('[data-tc-form="task"]')) {
        e.preventDefault();
        submitTask(form);
      }
    });

    // Tabs: arrow keys move between them (WAI-ARIA tabs pattern).
    section.querySelector(".tc-tabs").addEventListener("keydown", function (e) {
      var order = ["stream", "classwork", "people"];
      var i = order.indexOf(state.tab);
      if (e.key === "ArrowRight") i = (i + 1) % order.length;
      else if (e.key === "ArrowLeft") i = (i + order.length - 1) % order.length;
      else if (e.key === "Home") i = 0;
      else if (e.key === "End") i = order.length - 1;
      else return;
      e.preventDefault();
      showTab(order[i], true);
    });

    // Dialog save: one handler, the current dialog decides what it does.
    $("tc-dialog-form").addEventListener("submit", function (e) {
      e.preventDefault();
      if (!dialogSave) return closeDialog();
      $("tc-dialog-error").hidden = true;
      $("tc-dialog-save").disabled = true;
      var result = dialogSave();
      if (result && typeof result.then === "function") {
        result.catch(function (err) { dialogFail(err.message); });
      }
    });
  }

  // Load when the teacher opens the Classroom page; refresh on every visit
  // (grades may have changed on the Submissions page). Keeps the open class.
  document.addEventListener("section:shown", function (e) {
    if (e.detail !== "teacher-classroom") return;
    bind();
    loadAll();
  });

  document.addEventListener("DOMContentLoaded", function () {
    bind();
    var section = $("teacher-classroom");
    if (section && !section.hidden) loadAll();
  });
})();
