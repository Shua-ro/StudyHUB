// js/classroom.js
// Student Classroom page: joined classes, class updates, and the Join class form.
// (The teacher Classroom page lives in js/teacher_classroom.js.)
(function () {
  var API_URL = "api/classroom.php";

  var state = {
    role: "student",
    classrooms: [],
    posts: [],
    students: [],
    query: ""
  };

  window.classroomState = state;

  function byId(id) {
    return document.getElementById(id);
  }

  function showNotice(el, message, isError) {
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
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function postAction(payload) {
    return fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload)
    }).then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok) {
          throw new Error((data && data.message) ? data.message : "Request failed.");
        }
        if (!data) {
          throw new Error("Empty response from server.");
        }
        if (!data.ok) {
          throw new Error(data.message ? data.message : "Request failed.");
        }
        return data;
      });
    });
  }

  function findClassById(classId) {
    for (var i = 0; i < state.classrooms.length; i++) {
      if (Number(state.classrooms[i].id) === Number(classId)) {
        return state.classrooms[i];
      }
    }
    return null;
  }

  function renderStudentView() {
    var studentCardsEl = byId("student-class-cards");
    var studentDetailEl = byId("student-class-detail");
    if (!studentCardsEl) return;

    if (!state.classrooms.length) {
      studentCardsEl.innerHTML =
        '<p class="section-note">You have not joined any classes yet. Click "+ Join class" and enter your teacher\'s code.</p>';
      if (studentDetailEl) studentDetailEl.hidden = true;
      return;
    }

    studentCardsEl.innerHTML = state.classrooms
      .map(function (cls) {
        var meta = escapeHtml(cls.subject);
        if (cls.section) {
          meta = meta + " • " + escapeHtml(cls.section);
        }
        return [
          '<article class="content-card" data-class-id="' + escapeHtml(cls.id) + '">',
          "  <h3>" + escapeHtml(cls.title) + "</h3>",
          '  <p class="section-note">' + meta + "</p>",
          "  <p><strong>Teacher:</strong> " + escapeHtml(cls.teacher_name ? cls.teacher_name : "Instructor") + "</p>",
          "  <p><strong>Code:</strong> <code>" + escapeHtml(cls.class_code) + "</code></p>",
          "</article>"
        ].join("\n");
      })
      .join("");

    if (studentDetailEl) {
      studentDetailEl.hidden = false;
      if (!state.posts.length) {
        studentDetailEl.innerHTML =
          '<p class="section-note" style="margin-top:1rem;">No class announcements or materials posted yet.</p>';
      } else {
        var studentPosts = state.posts.map(function (p) {
          var cls = findClassById(p.classroom_id);
          var clsTitle = cls ? cls.title : "Class";
          return [
            '<article class="content-card" style="margin-top:0.75rem;">',
            '  <p class="section-note">' +
              escapeHtml(clsTitle) +
              " • Posted by " +
              escapeHtml(p.author_name ? p.author_name : "Teacher") +
              " • " +
              escapeHtml(p.created_at ? p.created_at : "") +
              "</p>",
            "  <h4>" + escapeHtml(p.title) + "</h4>",
            "  <p>" + escapeHtml(p.content) + "</p>",
            "</article>"
          ].join("\n");
        });

        studentDetailEl.innerHTML =
          '<h3 style="margin-top:1rem;">Class Updates & Materials</h3>' + studentPosts.join("");
      }
    }
  }

  function loadClassroom() {
    var url = state.query
      ? API_URL + "?q=" + encodeURIComponent(state.query)
      : API_URL;

    return fetch(url, { credentials: "same-origin" })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data) return;
        if (!data.ok) return;
        state.role = data.role ? data.role : "student";
        state.classrooms = Array.isArray(data.classrooms) ? data.classrooms : [];
        state.posts = Array.isArray(data.posts) ? data.posts : [];
        state.students = Array.isArray(data.students) ? data.students : [];
        window.classroomState = state;
        renderStudentView();
        var studentRowsEl = byId("teacher-student-rows");
        if (studentRowsEl && state.students.length) {
          studentRowsEl.innerHTML = state.students
            .map(function (student) {
              return (
                "<tr><td>" +
                escapeHtml(student.name) +
                "</td><td>" +
                escapeHtml(student.submitted != null ? student.submitted : 0) +
                "</td><td>" +
                escapeHtml(student.reviewed != null ? student.reviewed : 0) +
                "</td></tr>"
              );
            })
            .join("");
        }
      })
      .catch(function (err) {
        console.error("[classroom.js] load error:", err);
      });
  }

  function bindClassroomEvents() {
    var joinToggleBtn = byId("class-join-toggle");
    var joinForm = byId("class-join-form");
    var joinCancelBtn = byId("class-join-cancel");
    var joinCodeInput = byId("class-join-code");
    var studentNotice = byId("student-classroom-notice");

    if (joinToggleBtn && joinForm && !joinToggleBtn.dataset.bound) {
      joinToggleBtn.dataset.bound = "1";
      joinToggleBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        joinForm.hidden = !joinForm.hidden;
        hideNotice(studentNotice);
        if (!joinForm.hidden && joinCodeInput) joinCodeInput.focus();
      });
    }

    if (joinCancelBtn && joinForm && !joinCancelBtn.dataset.bound) {
      joinCancelBtn.dataset.bound = "1";
      joinCancelBtn.addEventListener("click", function () {
        joinForm.reset();
        joinForm.hidden = true;
        hideNotice(studentNotice);
      });
    }

    if (joinForm && !joinForm.dataset.bound) {
      joinForm.dataset.bound = "1";
      joinForm.addEventListener("submit", function (e) {
        e.preventDefault();
        hideNotice(studentNotice);

        postAction({
          action: "join_class",
          code: joinCodeInput ? joinCodeInput.value.trim() : ""
        })
          .then(function (data) {
            joinForm.reset();
            joinForm.hidden = true;
            showNotice(studentNotice, data.message ? data.message : "Joined class!", false);
            return loadClassroom();
          })
          .catch(function (err) {
            showNotice(studentNotice, err.message, true);
          });
      });
    }
  }

  bindClassroomEvents();
  document.addEventListener("DOMContentLoaded", function () {
    bindClassroomEvents();
    loadClassroom();
  });
  setTimeout(bindClassroomEvents, 300);
})();