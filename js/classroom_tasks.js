// class tasks + submissions: teacher dashboard numbers, students, submissions, grades,
// analytics, and the student task list
(function () {
  var API_URL = "api/classroom_tasks.php";

  var taskState = {
    role: "student",
    classrooms: [],
    students: [],
    tasks: [],
    submissions: [],
    metrics: {},
    selectedClassId: "",
    subClassFilter: "",
    subStatusFilter: "",
    fbClassFilter: "",
    fbStatusFilter: ""
  };

  window.classroomTaskState = taskState;

  function byId(id) {
    return document.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function injectStyles() {
    if (byId("ctask-polish-styles")) return;
    var style = document.createElement("style");
    style.id = "ctask-polish-styles";
    style.textContent = [
      ".ctask-pill { display:inline-flex; align-items:center; gap:0.35rem; padding:0.2rem 0.6rem; border-radius:999px; font-size:0.78rem; font-weight:600; background:rgba(255,255,255,0.07); color:inherit; }",
      ".ctask-pill--green { background:rgba(46,229,157,0.16); color:#2ee59d; }",
      ".ctask-pill--amber { background:rgba(251,191,36,0.16); color:#fbbf24; }",
      ".ctask-pill--red { background:rgba(248,113,113,0.16); color:#f87171; }",
      ".ctask-pill--muted { background:rgba(255,255,255,0.06); opacity:0.85; }",
      ".ctask-filter-bar { display:flex; flex-wrap:wrap; gap:0.75rem; align-items:center; margin-bottom:1rem; padding:0.75rem 1rem; border-radius:12px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); }",
      ".ctask-filter-bar select { width:auto; min-width:190px; }",
      ".ctask-workspace-banner { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:1rem; padding:1rem 1.25rem; border-radius:14px; background:linear-gradient(135deg, rgba(46,229,157,0.12), rgba(46,229,157,0.03)); border:1px solid rgba(46,229,157,0.35); margin-bottom:1rem; }",
      ".ctask-meter-track { width:100%; height:10px; border-radius:999px; background:rgba(255,255,255,0.08); overflow:hidden; margin-top:0.4rem; }",
      ".ctask-meter-fill { display:block; height:100%; border-radius:999px; background:linear-gradient(90deg, #2ee59d, #10b981); transition:width 0.3s ease; }",
      ".ctask-class-card-active { outline:2px solid #2ee59d !important; box-shadow:0 0 0 4px rgba(46,229,157,0.12); }"
    ].join("\n");
    document.head.appendChild(style);
  }

  function showToast(message, isError) {
    var toast = byId("ctask-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "ctask-toast";
      toast.style.cssText = [
        "position:fixed",
        "bottom:1.25rem",
        "right:1.25rem",
        "z-index:10000",
        "padding:0.75rem 1.1rem",
        "border-radius:10px",
        "font-size:0.9rem",
        "font-weight:600",
        "box-shadow:0 12px 30px rgba(0,0,0,0.45)",
        "transition:opacity 0.2s ease"
      ].join(";");
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.background = isError ? "#7f1d1d" : "#065f46";
    toast.style.color = "#ecfdf5";
    toast.style.border = isError ? "1px solid #f87171" : "1px solid #2ee59d";
    toast.style.opacity = "1";
    toast.hidden = false;

    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      toast.style.opacity = "0";
      setTimeout(function () {
        toast.hidden = true;
      }, 220);
    }, 3200);
  }

  function showNotice(el, message, isError) {
    if (el) {
      el.textContent = message;
      el.hidden = false;
      el.dataset.tone = isError ? "error" : "success";
    }
    showToast(message, isError);
  }

  function postTaskAction(payload) {
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data || !data.ok) {
          throw new Error((data && data.message) ? data.message : "Request failed.");
        }
        return data;
      });
    });
  }

  function ensureModalRoot() {
    var overlay = byId("ctask-modal-overlay");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "ctask-modal-overlay";
    overlay.hidden = true;
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:9999",
      "background:rgba(0,0,0,0.74)",
      "display:none",
      "align-items:center",
      "justify-content:center",
      "padding:1rem"
    ].join(";");

    overlay.innerHTML = [
      '<div id="ctask-modal-card" class="content-card classroom-form" style="width:100%;max-width:520px;margin:0;box-shadow:0 20px 50px rgba(0,0,0,0.65);">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;gap:1rem;">',
      '    <h3 id="ctask-modal-title" style="margin:0;"></h3>',
      '    <button type="button" id="ctask-modal-close" class="classroom-button" aria-label="Close">✕</button>',
      "  </div>",
      '  <p id="ctask-modal-subtitle" class="section-note" style="margin:0;"></p>',
      '  <p id="ctask-modal-error" class="section-note" style="display:none;color:#f87171;margin:0;"></p>',
      '  <div id="ctask-modal-body" style="display:grid;gap:0.85rem;"></div>',
      '  <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:0.5rem;">',
      '    <button type="button" id="ctask-modal-cancel" class="classroom-button">Cancel</button>',
      '    <button type="button" id="ctask-modal-save" class="classroom-button classroom-primary">Save</button>',
      "  </div>",
      "</div>"
    ].join("\n");

    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal();
    });
    byId("ctask-modal-close").addEventListener("click", closeModal);
    byId("ctask-modal-cancel").addEventListener("click", closeModal);

    return overlay;
  }

  function closeModal() {
    var overlay = byId("ctask-modal-overlay");
    if (!overlay) return;
    overlay.hidden = true;
    overlay.style.display = "none";
  }

  function setModalError(msg) {
    var errEl = byId("ctask-modal-error");
    if (!errEl) return;
    if (!msg) {
      errEl.style.display = "none";
      errEl.textContent = "";
    } else {
      errEl.style.display = "block";
      errEl.textContent = msg;
    }
  }

  function openModal(opts) {
    var overlay = ensureModalRoot();
    setModalError("");
    byId("ctask-modal-title").textContent = opts.title || "";
    var subEl = byId("ctask-modal-subtitle");
    subEl.textContent = opts.subtitle || "";
    subEl.style.display = opts.subtitle ? "block" : "none";

    var bodyEl = byId("ctask-modal-body");
    bodyEl.innerHTML = opts.bodyHtml || "";

    var saveBtn = byId("ctask-modal-save");
    saveBtn.textContent = opts.saveLabel || "Save";
    saveBtn.style.background = opts.danger ? "#991b1b" : "";
    saveBtn.style.borderColor = opts.danger ? "#f87171" : "";
    saveBtn.onclick = function () {
      setModalError("");
      if (typeof opts.onSave === "function") {
        opts.onSave(bodyEl);
      }
    };

    overlay.hidden = false;
    overlay.style.display = "flex";

    var firstInput = bodyEl.querySelector("textarea, input");
    if (firstInput) {
      setTimeout(function () {
        firstInput.focus();
      }, 30);
    }
  }

  function getAvailableClasses() {
    if (Array.isArray(taskState.classrooms) && taskState.classrooms.length) {
      return taskState.classrooms;
    }
    if (window.classroomState && Array.isArray(window.classroomState.classrooms)) {
      return window.classroomState.classrooms;
    }
    return [];
  }

  function getAvailableStudents() {
    if (Array.isArray(taskState.students) && taskState.students.length) {
      return taskState.students;
    }
    if (window.classroomState && Array.isArray(window.classroomState.students)) {
      return window.classroomState.students;
    }
    return [];
  }

  function findClassById(id) {
    var classes = getAvailableClasses();
    for (var i = 0; i < classes.length; i++) {
      if (String(classes[i].id) === String(id)) return classes[i];
    }
    return null;
  }

  function duePillHtml(dueDate, isCompleted) {
    if (!dueDate) {
      return '<span class="ctask-pill ctask-pill--muted">No due date</span>';
    }
    if (isCompleted) {
      return '<span class="ctask-pill ctask-pill--green">Due ' + escapeHtml(dueDate) + "</span>";
    }
    var today = new Date().toISOString().slice(0, 10);
    if (dueDate < today) {
      return '<span class="ctask-pill ctask-pill--red">Past due • ' + escapeHtml(dueDate) + "</span>";
    }
    if (dueDate === today) {
      return '<span class="ctask-pill ctask-pill--amber">Due today • ' + escapeHtml(dueDate) + "</span>";
    }
    return '<span class="ctask-pill ctask-pill--muted">Due ' + escapeHtml(dueDate) + "</span>";
  }

  function syncAllClassSelects() {
    var classes = getAvailableClasses();
    var assignSelect = byId("ctask-classroom-id");
    if (assignSelect) {
      var desiredVal = taskState.selectedClassId || assignSelect.value;
      if (!classes.length) {
        assignSelect.innerHTML = '<option value="">Create a class first</option>';
      } else {
        assignSelect.innerHTML = classes
          .map(function (c) {
            return (
              '<option value="' +
              escapeHtml(c.id) +
              '">' +
              escapeHtml(c.class_code) +
              " — " +
              escapeHtml(c.title) +
              "</option>"
            );
          })
          .join("");
        if (desiredVal) assignSelect.value = String(desiredVal);
      }
    }

    var postSelect = byId("post-classroom-id");
    if (postSelect && taskState.selectedClassId) {
      postSelect.value = String(taskState.selectedClassId);
    }
  }

  function updateCardHighlights() {
    var cards = document.querySelectorAll("#student-classroom .content-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      var cid = card.dataset.ctaskClassId;
      if (!cid) continue;
      if (taskState.selectedClassId && String(taskState.selectedClassId) === String(cid)) {
        card.classList.add("ctask-class-card-active");
      } else {
        card.classList.remove("ctask-class-card-active");
      }
    }
  }

  function filterOtherPostsBySelectedClass() {
    var containers = [byId("teacher-post-list"), byId("student-post-list")];
    var selected = taskState.selectedClassId ? findClassById(taskState.selectedClassId) : null;

    for (var c = 0; c < containers.length; c++) {
      var list = containers[c];
      if (!list) continue;
      var items = list.children;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!selected) {
          item.style.display = "";
        } else {
          var txt = item.textContent || "";
          var matches =
            txt.indexOf(selected.class_code) !== -1 || txt.indexOf(selected.title) !== -1;
          item.style.display = matches ? "" : "none";
        }
      }
    }
  }

  function bindClassCards() {
    var cards = document.querySelectorAll("#student-classroom .content-card");
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.dataset.ctaskBound === "1") continue;

      var text = card.textContent || "";
      var match = text.match(/(?:Class code|Code):\s*([A-Z0-9-]+)/i);
      if (!match) continue;

      var classes = getAvailableClasses();
      var found = null;
      for (var k = 0; k < classes.length; k++) {
        if (String(classes[k].class_code).toUpperCase() === String(match[1]).toUpperCase()) {
          found = classes[k];
          break;
        }
      }

      if (!found) continue;

      card.dataset.ctaskBound = "1";
      card.dataset.ctaskClassId = String(found.id);
      card.style.cursor = "pointer";
      card.title = "Click to open this class workspace";

      (function (el, classObj) {
        el.addEventListener("click", function (e) {
          if (e.target && e.target.closest("button, a, input, select, textarea")) return;
          var nextId = String(classObj.id);
          taskState.selectedClassId = taskState.selectedClassId === nextId ? "" : nextId;
          syncAllClassSelects();
          updateCardHighlights();
          filterOtherPostsBySelectedClass();
          renderTeacherTaskSections();
          renderStudentTaskSection();
        });
      })(card, found);
    }
    updateCardHighlights();
    filterOtherPostsBySelectedClass();
  }

  function renderWorkspaceBanner(targetParent, isTeacher) {
    if (!targetParent) return;
    var bannerId = isTeacher ? "teacher-class-workspace-banner" : "student-class-workspace-banner";
    var banner = byId(bannerId);

    if (!taskState.selectedClassId) {
      if (banner) banner.remove();
      return;
    }

    var cls = findClassById(taskState.selectedClassId);
    if (!cls) {
      if (banner) banner.remove();
      return;
    }

    if (!banner) {
      banner = document.createElement("div");
      banner.id = bannerId;
      banner.className = "ctask-workspace-banner";
      targetParent.insertBefore(banner, targetParent.firstChild);
    }

    var classTasks = taskState.tasks.filter(function (t) {
      return String(t.classroom_id) === String(cls.id);
    });

    var metaParts = [escapeHtml(cls.class_code)];
    if (cls.subject) metaParts.push(escapeHtml(cls.subject));
    if (cls.section) metaParts.push(escapeHtml(cls.section));
    metaParts.push(classTasks.length + " assigned task" + (classTasks.length === 1 ? "" : "s"));

    banner.innerHTML = [
      "<div>",
      '  <div class="section-note" style="margin-bottom:0.2rem;">Active Class Workspace</div>',
      '  <h3 style="margin:0 0 0.25rem 0;">' + escapeHtml(cls.title) + "</h3>",
      '  <div class="section-note">' + metaParts.join(" • ") + "</div>",
      "</div>",
      '<div style="display:flex;gap:0.5rem;align-items:center;">',
      '  <button type="button" class="classroom-button" data-clear-class-ws="1">Show All Classes</button>',
      "</div>"
    ].join("\n");

    var clearBtn = banner.querySelector("[data-clear-class-ws]");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        taskState.selectedClassId = "";
        syncAllClassSelects();
        updateCardHighlights();
        filterOtherPostsBySelectedClass();
        renderTeacherTaskSections();
        renderStudentTaskSection();
      });
    }
  }

  function handleGradeSubmission(submissionId) {
    var sub = null;
    for (var i = 0; i < taskState.submissions.length; i++) {
      if (Number(taskState.submissions[i].id) === Number(submissionId)) {
        sub = taskState.submissions[i];
        break;
      }
    }
    if (!sub) return;

    var maxScore = sub.max_score != null ? sub.max_score : 100;
    var defaultScore = sub.score != null ? String(sub.score) : "";
    var defaultFeedback = sub.feedback != null ? String(sub.feedback) : "";

    openModal({
      title: "Review & Grade Submission",
      subtitle: sub.student_name + " • " + sub.classroom_title + " • " + sub.task_title,
      saveLabel: "Save Grade",
      bodyHtml: [
        '<div style="padding:0.75rem;border-radius:8px;background:rgba(255,255,255,0.04);">',
        '  <div class="section-note" style="margin-bottom:0.35rem;">Student Submission</div>',
        '  <div style="white-space:pre-wrap;word-break:break-word;">' + escapeHtml(sub.submission_text) + "</div>",
        "</div>",
        "<div>",
        '  <label for="ctask-modal-score">Score (0 – ' + escapeHtml(maxScore) + ")</label>",
        '  <input id="ctask-modal-score" type="number" min="0" max="' + escapeHtml(maxScore) + '" step="0.5" value="' + escapeHtml(defaultScore) + '" required />',
        "</div>",
        "<div>",
        '  <label for="ctask-modal-feedback">Feedback (optional)</label>',
        '  <textarea id="ctask-modal-feedback" rows="3" placeholder="Add comments or grade notes...">' + escapeHtml(defaultFeedback) + "</textarea>",
        "</div>"
      ].join("\n"),
      onSave: function () {
        var scoreVal = ((byId("ctask-modal-score") || {}).value || "").trim();
        var feedbackVal = ((byId("ctask-modal-feedback") || {}).value || "").trim();
        var notice = byId("classroom-notice");

        postTaskAction({
          action: "grade_submission",
          submission_id: Number(submissionId),
          score: scoreVal,
          feedback: feedbackVal
        })
          .then(function (data) {
            closeModal();
            showNotice(notice, data.message || "Grade saved!", false);
            return loadClassroomTasks();
          })
          .catch(function (err) {
            setModalError(err.message);
          });
      }
    });
  }

  function getFilteredTasks() {
    if (!taskState.selectedClassId) return taskState.tasks;
    return taskState.tasks.filter(function (t) {
      return String(t.classroom_id) === String(taskState.selectedClassId);
    });
  }

  function ensureTableFilterBar(tableEl, barId, classStateKey, statusStateKey, onChange) {
    if (!tableEl || !tableEl.parentNode) return;
    var bar = byId(barId);
    var classes = getAvailableClasses();

    if (!bar) {
      bar = document.createElement("div");
      bar.id = barId;
      bar.className = "ctask-filter-bar";
      tableEl.parentNode.insertBefore(bar, tableEl);
    }

    var classOptions = ['<option value="">All Classes</option>']
      .concat(
        classes.map(function (c) {
          return (
            '<option value="' +
            escapeHtml(c.id) +
            '">' +
            escapeHtml(c.class_code) +
            " — " +
            escapeHtml(c.title) +
            "</option>"
          );
        })
      )
      .join("");

    bar.innerHTML = [
      '<label style="display:flex;align-items:center;gap:0.45rem;margin:0;">',
      '  <span class="section-note">Class:</span>',
      '  <select data-filter-class="1">' + classOptions + "</select>",
      "</label>",
      '<label style="display:flex;align-items:center;gap:0.45rem;margin:0;">',
      '  <span class="section-note">Status:</span>',
      '  <select data-filter-status="1">',
      '    <option value="">All Statuses</option>',
      '    <option value="submitted">Pending Review</option>',
      '    <option value="graded">Graded</option>',
      "  </select>",
      "</label>"
    ].join("\n");

    var clsSelect = bar.querySelector("[data-filter-class]");
    var stSelect = bar.querySelector("[data-filter-status]");
    clsSelect.value = taskState[classStateKey] || "";
    stSelect.value = taskState[statusStateKey] || "";

    clsSelect.addEventListener("change", function () {
      taskState[classStateKey] = this.value;
      onChange();
    });
    stSelect.addEventListener("change", function () {
      taskState[statusStateKey] = this.value;
      onChange();
    });
  }

  function renderDeduplicatedStudents() {
    var studentRowsEl = byId("teacher-student-rows");
    if (!studentRowsEl) return;

    var roster = getAvailableStudents();

    if (!roster.length) {
      studentRowsEl.innerHTML =
        '<tr><td colspan="3" class="section-note">No students have joined your classes yet.</td></tr>';
      return;
    }

    var byStudent = {};
    var order = [];

    for (var i = 0; i < roster.length; i++) {
      var st = roster[i];
      var sid = String(st.id);
      if (!byStudent[sid]) {
        byStudent[sid] = {
          id: st.id,
          name: st.name,
          classes: [],
          classIds: {}
        };
        order.push(sid);
      }
      var cid = String(st.classroom_id || "");
      if (cid && !byStudent[sid].classIds[cid]) {
        byStudent[sid].classIds[cid] = true;
        byStudent[sid].classes.push(st.classroom_title || "Class #" + cid);
      }
    }

    studentRowsEl.innerHTML = order
      .map(function (sid) {
        var entry = byStudent[sid];
        var subCount = 0;
        var revCount = 0;
        var assignedTotal = 0;

        for (var t = 0; t < taskState.tasks.length; t++) {
          if (entry.classIds[String(taskState.tasks[t].classroom_id)]) {
            assignedTotal++;
          }
        }

        for (var j = 0; j < taskState.submissions.length; j++) {
          var item = taskState.submissions[j];
          if (Number(item.student_id) === Number(entry.id)) {
            subCount++;
            if (item.status === "graded") revCount++;
          }
        }

        var badgesHtml = entry.classes
          .map(function (cTitle) {
            return '<span class="ctask-pill ctask-pill--muted">' + escapeHtml(cTitle) + "</span>";
          })
          .join(" ");

        var submittedText =
          assignedTotal > 0 ? subCount + " / " + assignedTotal : String(subCount);

        return [
          "<tr>",
          "  <td>",
          "    <div><strong>" + escapeHtml(entry.name) + "</strong></div>",
          '    <div style="display:flex;flex-wrap:wrap;gap:0.35rem;margin-top:0.3rem;">' + badgesHtml + "</div>",
          "  </td>",
          "  <td>" + submittedText + "</td>",
          "  <td>" + revCount + "</td>",
          "</tr>"
        ].join("\n");
      })
      .join("");
  }

  function renderTeacherTaskSections() {
    var m = taskState.metrics || {};
    var setText = function (id, val) {
      var el = byId(id);
      if (el) el.textContent = String(val);
    };

    setText("teacher-total-students", m.total_students != null ? m.total_students : 0);
    setText("teacher-active-assignments", m.active_assignments != null ? m.active_assignments : 0);
    setText("teacher-total-submissions", m.total_submissions != null ? m.total_submissions : 0);
    setText("teacher-pending-reviews", m.pending_reviews != null ? m.pending_reviews : 0);
    setText("teacher-submission-rate", m.submission_rate || "0%");
    setText("teacher-review-rate", m.review_rate || "0%");
    setText("teacher-average-grade", m.average_grade || "—");

    var recentEl = byId("teacher-recent-submissions");
    if (recentEl) {
      if (!taskState.submissions.length) {
        recentEl.innerHTML = '<p class="section-note">No student submissions yet.</p>';
      } else {
        recentEl.innerHTML = taskState.submissions
          .slice(0, 5)
          .map(function (s) {
            var badge =
              s.status === "graded"
                ? '<span class="ctask-pill ctask-pill--green">Graded • ' +
                  escapeHtml(s.score) +
                  "/" +
                  escapeHtml(s.max_score) +
                  "</span>"
                : '<span class="ctask-pill ctask-pill--amber">Pending review</span>';
            return (
              '<div style="display:flex;justify-content:space-between;align-items:center;gap:0.75rem;padding:0.55rem 0;border-bottom:1px solid rgba(255,255,255,0.08);">' +
              "<div><strong>" +
              escapeHtml(s.student_name) +
              "</strong> submitted <strong>" +
              escapeHtml(s.task_title) +
              '</strong> <span class="section-note">(' +
              escapeHtml(s.classroom_title) +
              ")</span></div>" +
              badge +
              "</div>"
            );
          })
          .join("");
      }
    }

    var subRowsEl = byId("teacher-submission-rows");
    if (subRowsEl) {
      var subTable = subRowsEl.closest("table");
      ensureTableFilterBar(
        subTable,
        "ctask-sub-filter-bar",
        "subClassFilter",
        "subStatusFilter",
        renderTeacherTaskSections
      );

      var filteredSubs = taskState.submissions.filter(function (s) {
        if (taskState.subClassFilter && String(s.classroom_id) !== String(taskState.subClassFilter)) {
          return false;
        }
        if (taskState.subStatusFilter && String(s.status) !== String(taskState.subStatusFilter)) {
          return false;
        }
        return true;
      });

      if (!filteredSubs.length) {
        subRowsEl.innerHTML =
          '<tr><td colspan="6" class="section-note">No matching student submissions.</td></tr>';
      } else {
        subRowsEl.innerHTML = filteredSubs
          .map(function (s) {
            var statusBadge =
              s.status === "graded"
                ? '<span class="ctask-pill ctask-pill--green">Graded (' +
                  escapeHtml(s.score) +
                  "/" +
                  escapeHtml(s.max_score) +
                  ")</span>"
                : '<span class="ctask-pill ctask-pill--amber">Pending review</span>';
            var btnLabel = s.status === "graded" ? "Edit grade" : "Review submission";
            var preview = String(s.submission_text || "");
            if (preview.length > 90) preview = preview.slice(0, 90) + "…";

            return [
              "<tr>",
              "  <td><strong>" + escapeHtml(s.student_name) + "</strong></td>",
              "  <td>" + escapeHtml(s.classroom_title) + "</td>",
              "  <td><strong>" +
                escapeHtml(s.task_title) +
                '</strong><br><small class="section-note">' +
                escapeHtml(preview) +
                "</small></td>",
              "  <td>" + escapeHtml(s.submitted_at || "") + "</td>",
              "  <td>" + statusBadge + "</td>",
              '  <td><button type="button" class="classroom-button" data-grade-sub="' +
                escapeHtml(s.id) +
                '">' +
                btnLabel +
                "</button></td>",
              "</tr>"
            ].join("\n");
          })
          .join("");

        var gradeBtns = subRowsEl.querySelectorAll("[data-grade-sub]");
        for (var g = 0; g < gradeBtns.length; g++) {
          gradeBtns[g].addEventListener("click", function () {
            handleGradeSubmission(Number(this.getAttribute("data-grade-sub")));
          });
        }
      }
    }

    var fbRowsEl = byId("teacher-feedback-rows");
    if (fbRowsEl) {
      var fbTable = fbRowsEl.closest("table");
      ensureTableFilterBar(
        fbTable,
        "ctask-fb-filter-bar",
        "fbClassFilter",
        "fbStatusFilter",
        renderTeacherTaskSections
      );

      var filteredFb = taskState.submissions.filter(function (s) {
        if (taskState.fbClassFilter && String(s.classroom_id) !== String(taskState.fbClassFilter)) {
          return false;
        }
        if (taskState.fbStatusFilter && String(s.status) !== String(taskState.fbStatusFilter)) {
          return false;
        }
        return true;
      });

      if (!filteredFb.length) {
        fbRowsEl.innerHTML =
          '<tr><td colspan="5" class="section-note">No matching grades or feedback.</td></tr>';
      } else {
        fbRowsEl.innerHTML = filteredFb
          .map(function (s) {
            var scoreCell = '<span class="ctask-pill ctask-pill--amber">Not graded</span>';
            if (s.score != null && Number(s.max_score) > 0) {
              var pct = Math.round((Number(s.score) / Number(s.max_score)) * 100);
              scoreCell =
                '<span class="ctask-pill ctask-pill--green">' +
                escapeHtml(s.score) +
                " / " +
                escapeHtml(s.max_score) +
                " (" +
                pct +
                "%)</span>";
            }
            var fbCell = s.feedback ? escapeHtml(s.feedback) : "—";
            return [
              "<tr>",
              "  <td><strong>" + escapeHtml(s.student_name) + "</strong></td>",
              "  <td>" + escapeHtml(s.classroom_title) + "</td>",
              "  <td>" + escapeHtml(s.task_title) + "</td>",
              "  <td>" + scoreCell + "</td>",
              "  <td>" + fbCell + "</td>",
              "</tr>"
            ].join("\n");
          })
          .join("");
      }
    }

    renderDeduplicatedStudents();

    var barsEl = byId("teacher-analytics-bars");
    if (barsEl) {
      var bars = Array.isArray(m.analytics_bars) ? m.analytics_bars : [];
      if (!bars.length) {
        barsEl.innerHTML = '<p class="section-note">Assign tasks to see submission progress.</p>';
      } else {
        barsEl.innerHTML = bars
          .map(function (b) {
            return [
              '<div class="distribution-row" style="margin-bottom:0.9rem;">',
              '  <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">',
              "    <span><strong>" +
                escapeHtml(b.title) +
                '</strong> <span class="section-note">(' +
                escapeHtml(b.classroom_title) +
                ")</span></span>",
              "    <span><strong>" +
                escapeHtml(b.submissions) +
                "/" +
                escapeHtml(b.students) +
                "</strong> (" +
                escapeHtml(b.percent) +
                "%)</span>",
              "  </div>",
              '  <div class="ctask-meter-track"><span class="ctask-meter-fill" style="width:' +
                escapeHtml(b.percent) +
                '%;"></span></div>',
              "</div>"
            ].join("\n");
          })
          .join("");
      }
    }
  }

  function renderStudentTaskSection() {
    var studentSection = byId("student-classroom");
    if (!studentSection) return;

    bindClassCards();

    var box = byId("student-ctask-workspace");
    if (!box) {
      box = document.createElement("div");
      box.id = "student-ctask-workspace";
      box.style.marginTop = "1.25rem";
      studentSection.appendChild(box);
    }

    renderWorkspaceBanner(box, false);

    var notice = byId("student-classroom-notice");
    var visibleTasks = getFilteredTasks();
    var selectedCls = taskState.selectedClassId ? findClassById(taskState.selectedClassId) : null;
    var headingSuffix = selectedCls ? " — " + escapeHtml(selectedCls.title) : "";

    var listHolder = byId("student-ctask-list-holder");
    if (!listHolder) {
      listHolder = document.createElement("div");
      listHolder.id = "student-ctask-list-holder";
      box.appendChild(listHolder);
    }

    if (!visibleTasks.length) {
      listHolder.innerHTML =
        '<h3 style="margin-top:0.5rem;">Assigned Classroom Tasks' +
        headingSuffix +
        '</h3><p class="section-note">No tasks assigned for this view yet.</p>';
      return;
    }

    var html = visibleTasks.map(function (t) {
      var isGraded = t.submission_status === "graded";
      var isDone = t.submission_status === "submitted" || isGraded;
      var statusPill = '<span class="ctask-pill ctask-pill--amber">Assigned • Not submitted</span>';
      var gradeHtml = "";

      if (isGraded) {
        var pct =
          Number(t.max_score) > 0 ? Math.round((Number(t.score) / Number(t.max_score)) * 100) : 0;
        statusPill =
          '<span class="ctask-pill ctask-pill--green">Graded • ' +
          escapeHtml(t.score) +
          "/" +
          escapeHtml(t.max_score) +
          " (" +
          pct +
          "%)</span>";
        gradeHtml = t.feedback
          ? '<div style="margin-top:0.5rem;padding:0.65rem 0.8rem;border-radius:8px;background:rgba(46,229,157,0.08);border:1px solid rgba(46,229,157,0.25);"><strong>Teacher Feedback:</strong> ' +
            escapeHtml(t.feedback) +
            "</div>"
          : "";
      } else if (t.submission_status === "submitted") {
        statusPill = '<span class="ctask-pill ctask-pill--green">Turned in • Awaiting grade</span>';
      }

      var submittedPreview = t.submission_text
        ? '<p class="section-note" style="margin-top:0.5rem;"><strong>Your submission:</strong> ' +
          escapeHtml(t.submission_text) +
          "</p>"
        : "";

      var actionHtml = isGraded
        ? '<span class="ctask-pill ctask-pill--muted">Submission locked after grading</span>'
        : '<button type="button" class="classroom-button classroom-primary" data-submit-ctask="' +
          escapeHtml(t.id) +
          '">' +
          (t.submission_id ? "Update Submission" : "Submit Work") +
          "</button>";

      return [
        '<article class="content-card" style="margin-top:0.75rem;">',
        '  <div style="display:flex;flex-wrap:wrap;gap:0.45rem;align-items:center;margin-bottom:0.4rem;">',
        '    <span class="ctask-pill">' +
          escapeHtml(t.class_code) +
          " • " +
          escapeHtml(t.classroom_title) +
          "</span>",
        "    " + duePillHtml(t.due_date, isDone),
        '    <span class="ctask-pill ctask-pill--muted">' + escapeHtml(t.max_score) + " pts</span>",
        "    " + statusPill,
        "  </div>",
        '  <h4 style="margin:0.25rem 0;">' + escapeHtml(t.title) + "</h4>",
        '  <p style="margin:0.35rem 0 0.65rem 0;">' + escapeHtml(t.description) + "</p>",
        submittedPreview,
        gradeHtml,
        '  <div style="margin-top:0.75rem;">' + actionHtml + "</div>",
        "</article>"
      ].join("\n");
    });

    listHolder.innerHTML =
      '<h3 style="margin-top:0.5rem;">Assigned Classroom Tasks' +
      headingSuffix +
      "</h3>" +
      html.join("");

    var subBtns = listHolder.querySelectorAll("[data-submit-ctask]");
    for (var i = 0; i < subBtns.length; i++) {
      subBtns[i].addEventListener("click", function () {
        var taskId = Number(this.getAttribute("data-submit-ctask"));
        var target = null;
        for (var k = 0; k < taskState.tasks.length; k++) {
          if (Number(taskState.tasks[k].id) === taskId) {
            target = taskState.tasks[k];
            break;
          }
        }
        if (!target || target.submission_status === "graded") return;

        var existing = target.submission_text ? String(target.submission_text) : "";

        openModal({
          title: "Submit Work — " + target.title,
          subtitle:
            target.class_code +
            " • " +
            target.classroom_title +
            " • Max: " +
            target.max_score +
            " pts",
          saveLabel: "Turn In Work",
          bodyHtml: [
            '<div style="padding:0.75rem;border-radius:8px;background:rgba(255,255,255,0.04);">',
            '  <div class="section-note" style="margin-bottom:0.25rem;">Instructions</div>',
            "  <div>" + escapeHtml(target.description) + "</div>",
            "</div>",
            "<div>",
            '  <label for="ctask-modal-submission">Your answer, notes, or link</label>',
            '  <textarea id="ctask-modal-submission" rows="4" required placeholder="Type your answer or paste a Google Drive / GitHub link...">' +
              escapeHtml(existing) +
              "</textarea>",
            "</div>"
          ].join("\n"),
          onSave: function () {
            var answer = ((byId("ctask-modal-submission") || {}).value || "").trim();
            postTaskAction({
              action: "submit_task",
              task_id: taskId,
              submission_text: answer
            })
              .then(function (data) {
                closeModal();
                showNotice(notice, data.message || "Submission saved!", false);
                return loadClassroomTasks();
              })
              .catch(function (err) {
                setModalError(err.message);
              });
          }
        });
      });
    }
  }

  function loadClassroomTasks() {
    injectStyles();
    syncAllClassSelects();
    bindClassCards();
    return fetch(API_URL, { credentials: "same-origin" })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) return;
        taskState.role = data.role || "student";
        taskState.classrooms = Array.isArray(data.classrooms) ? data.classrooms : [];
        taskState.students = Array.isArray(data.students) ? data.students : [];
        taskState.tasks = Array.isArray(data.tasks) ? data.tasks : [];
        taskState.submissions = Array.isArray(data.submissions) ? data.submissions : [];
        taskState.metrics = data.metrics || {};

        renderTeacherTaskSections();
        renderStudentTaskSection();
      })
      .catch(function (err) {
        console.error("[classroom_tasks.js] load error:", err);
      });
  }

  // teacher_classroom.js uses these to refresh after task changes + open submissions filtered to a class
  window.classroomTasks = {
    reload: loadClassroomTasks,
    showSubmissions: function (classId) {
      taskState.subClassFilter = classId ? String(classId) : "";
      taskState.subStatusFilter = "";
      renderTeacherTaskSections();
    }
  };

  document.addEventListener("DOMContentLoaded", function () {
    injectStyles();
    loadClassroomTasks();
    setTimeout(function () {
      syncAllClassSelects();
      bindClassCards();
      loadClassroomTasks();
    }, 650);
  });
})();