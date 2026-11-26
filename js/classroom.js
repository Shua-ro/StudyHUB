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

  function ensureTeacherWorkspace() {
    var teacherSection = byId("teacher-classroom");
    if (!teacherSection) return null;

    var workspace = byId("teacher-classroom-workspace");
    if (!workspace) {
      workspace = document.createElement("div");
      workspace.id = "teacher-classroom-workspace";
      workspace.innerHTML = [
        '<div class="content-card" style="margin-top: 1rem;">',
        '  <label for="teacher-class-search"><strong>Search classes</strong></label>',
        '  <input id="teacher-class-search" type="search" placeholder="Search by code, title, subject, or section..." />',
        "</div>",
        '<div id="teacher-class-list" class="classroom-grid" style="margin-top: 1rem;"></div>',
        '<form id="teacher-post-form" class="content-card classroom-form" style="margin-top: 1rem;">',
        "  <h3>Post Class Announcement / Material</h3>",
        "  <div>",
        '    <label for="post-classroom-id">Select class</label>',
        '    <select id="post-classroom-id" required></select>',
        "  </div>",
        "  <div>",
        '    <label for="post-title">Post title</label>',
        '    <input id="post-title" maxlength="150" required placeholder="e.g. Week 4 Lecture Slides" />',
        "  </div>",
        "  <div>",
        '    <label for="post-content">Details / Instructions</label>',
        '    <textarea id="post-content" rows="3" required placeholder="Write class announcement or study notes..."></textarea>',
        "  </div>",
        '  <button type="submit">Publish Post</button>',
        "</form>",
        '<div id="teacher-post-list" style="margin-top: 1rem;"></div>'
      ].join("\n");

      teacherSection.appendChild(workspace);

      var searchInput = byId("teacher-class-search");
      if (searchInput) {
        var timer = null;
        searchInput.addEventListener("input", function () {
          clearTimeout(timer);
          timer = setTimeout(function () {
            state.query = searchInput.value.trim();
            loadClassroom();
          }, 250);
        });
      }

      var postForm = byId("teacher-post-form");
      if (postForm) {
        postForm.addEventListener("submit", function (e) {
          e.preventDefault();
          var teacherNotice = byId("classroom-notice");
          hideNotice(teacherNotice);

          var classSelect = byId("post-classroom-id");
          var titleInput = byId("post-title");
          var contentInput = byId("post-content");

          postAction({
            action: "create_post",
            classroom_id: Number(classSelect ? classSelect.value : 0),
            title: titleInput ? titleInput.value.trim() : "",
            content: contentInput ? contentInput.value.trim() : ""
          })
            .then(function (data) {
              postForm.reset();
              showNotice(teacherNotice, data.message ? data.message : "Announcement posted!", false);
              return loadClassroom();
            })
            .catch(function (err) {
              showNotice(teacherNotice, err.message, true);
            });
        });
      }
    }

    return workspace;
  }

  function renderTeacherView() {
    var workspace = ensureTeacherWorkspace();
    if (!workspace) return;

    var listEl = byId("teacher-class-list");
    var selectEl = byId("post-classroom-id");
    var postListEl = byId("teacher-post-list");
    var teacherNotice = byId("classroom-notice");

    if (selectEl) {
      if (!state.classrooms.length) {
        selectEl.innerHTML = '<option value="">Create a class first</option>';
      } else {
        selectEl.innerHTML = state.classrooms
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
      }
    }

    if (listEl) {
      if (!state.classrooms.length) {
        listEl.innerHTML = '<p class="section-note">No classes found.</p>';
      } else {
        listEl.innerHTML = state.classrooms
          .map(function (cls) {
            var meta = escapeHtml(cls.subject);
            if (cls.section) {
              meta = meta + " • " + escapeHtml(cls.section);
            }
            return [
              '<article class="content-card">',
              "  <h3>" + escapeHtml(cls.title) + "</h3>",
              '  <p class="section-note">' + meta + "</p>",
              "  <p><strong>Class code:</strong> <code>" + escapeHtml(cls.class_code) + "</code></p>",
              '  <div style="display:flex; gap:0.5rem; margin-top:0.75rem;">',
              '    <button type="button" class="classroom-button" data-edit-class="' +
                escapeHtml(cls.id) +
                '">Edit</button>',
              '    <button type="button" class="classroom-button" data-delete-class="' +
                escapeHtml(cls.id) +
                '">Delete</button>',
              "  </div>",
              "</article>"
            ].join("\n");
          })
          .join("");

        var editButtons = listEl.querySelectorAll("[data-edit-class]");
        for (var i = 0; i < editButtons.length; i++) {
          editButtons[i].addEventListener("click", function () {
            var id = Number(this.getAttribute("data-edit-class"));
            var cls = findClassById(id);
            if (!cls) return;

            var newTitle = prompt("Edit class name:", cls.title);
            if (newTitle === null) return;
            var newSubject = prompt("Edit subject:", cls.subject);
            if (newSubject === null) return;
            var newSection = prompt("Edit section:", cls.section ? cls.section : "");
            if (newSection === null) return;

            postAction({
              action: "update_class",
              id: id,
              title: newTitle.trim(),
              subject: newSubject.trim(),
              section: newSection.trim()
            })
              .then(function (data) {
                showNotice(teacherNotice, data.message ? data.message : "Class updated.", false);
                return loadClassroom();
              })
              .catch(function (err) {
                showNotice(teacherNotice, err.message, true);
              });
          });
        }

        var deleteButtons = listEl.querySelectorAll("[data-delete-class]");
        for (var j = 0; j < deleteButtons.length; j++) {
          deleteButtons[j].addEventListener("click", function () {
            var id = Number(this.getAttribute("data-delete-class"));
            if (!confirm("Delete this class and all of its posts?")) return;

            postAction({
              action: "delete_class",
              id: id
            })
              .then(function (data) {
                showNotice(teacherNotice, data.message ? data.message : "Class deleted.", false);
                return loadClassroom();
              })
              .catch(function (err) {
                showNotice(teacherNotice, err.message, true);
              });
          });
        }
      }
    }

    if (postListEl) {
      if (!state.posts.length) {
        postListEl.innerHTML = '<p class="section-note">No announcements posted yet.</p>';
      } else {
        var postCards = state.posts.map(function (p) {
          var cls = findClassById(p.classroom_id);
          var classLabel = cls ? cls.class_code + " • " + cls.title : "Class #" + p.classroom_id;
          return [
            '<article class="content-card" style="margin-top:0.75rem;">',
            '  <p class="section-note">' +
              escapeHtml(classLabel) +
              " • " +
              escapeHtml(p.created_at ? p.created_at : "") +
              "</p>",
            "  <h4>" + escapeHtml(p.title) + "</h4>",
            "  <p>" + escapeHtml(p.content) + "</p>",
            '  <button type="button" class="classroom-button" data-delete-post="' +
              escapeHtml(p.id) +
              '">Delete Post</button>',
            "</article>"
          ].join("\n");
        });

        postListEl.innerHTML = "<h3>Posted Announcements & Materials</h3>" + postCards.join("");

        var delPostButtons = postListEl.querySelectorAll("[data-delete-post]");
        for (var k = 0; k < delPostButtons.length; k++) {
          delPostButtons[k].addEventListener("click", function () {
            var postId = Number(this.getAttribute("data-delete-post"));
            if (!confirm("Delete this post?")) return;

            postAction({
              action: "delete_post",
              id: postId
            })
              .then(function (data) {
                showNotice(teacherNotice, data.message ? data.message : "Post deleted.", false);
                return loadClassroom();
              })
              .catch(function (err) {
                showNotice(teacherNotice, err.message, true);
              });
          });
        }
      }
    }
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
        renderTeacherView();
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
    var createToggleBtn = byId("class-create-toggle");
    var createForm = byId("class-create-form");
    var createCancelBtn = byId("class-create-cancel");
    var nameInput = byId("class-name");
    var sectionInput = byId("class-section");
    var subjectInput = byId("class-subject");
    var teacherNotice = byId("classroom-notice");

    var joinToggleBtn = byId("class-join-toggle");
    var joinForm = byId("class-join-form");
    var joinCancelBtn = byId("class-join-cancel");
    var joinCodeInput = byId("class-join-code");
    var studentNotice = byId("student-classroom-notice");

    if (createToggleBtn && createForm && !createToggleBtn.dataset.bound) {
      createToggleBtn.dataset.bound = "1";
      createToggleBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        createForm.hidden = !createForm.hidden;
        hideNotice(teacherNotice);
        if (!createForm.hidden && nameInput) nameInput.focus();
      });
    }

    if (createCancelBtn && createForm && !createCancelBtn.dataset.bound) {
      createCancelBtn.dataset.bound = "1";
      createCancelBtn.addEventListener("click", function () {
        createForm.reset();
        createForm.hidden = true;
        hideNotice(teacherNotice);
      });
    }

    if (createForm && !createForm.dataset.bound) {
      createForm.dataset.bound = "1";
      createForm.addEventListener("submit", function (e) {
        e.preventDefault();
        hideNotice(teacherNotice);

        postAction({
          action: "create_class",
          name: nameInput ? nameInput.value.trim() : "",
          section: sectionInput ? sectionInput.value.trim() : "",
          subject: subjectInput ? subjectInput.value.trim() : ""
        })
          .then(function (data) {
            createForm.reset();
            createForm.hidden = true;
            var codeText = data.class_code ? data.class_code : "";
            showNotice(
              teacherNotice,
              data.message ? data.message : "Class created! Share code: " + codeText,
              false
            );
            return loadClassroom();
          })
          .catch(function (err) {
            showNotice(teacherNotice, err.message, true);
          });
      });
    }

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