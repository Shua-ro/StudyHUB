<?php
// assignments.php
// Teacher Assignments feature. One page, behaviour depends on the logged-in role:
//
//   student : read and search ALL assignments (view only)
//   teacher : create, read, update, delete and search THEIR OWN assignments,
//             and see the list of students
//   admin   : create, read, update, delete and search ALL assignments,
//             and see the list of students
//
// Every permission is checked here on the server, not only hidden in the page.

require __DIR__ . '/includes/auth.php';
require __DIR__ . '/includes/db.php';      // gives us $conn (mysqli)

$user   = require_login();                 // not logged in -> login.html
$userId = (int) $user['id'];
$role   = $user['role'];

$isAdmin   = ($role === 'admin');
$canManage = in_array($role, ['teacher', 'admin'], true);   // may create / edit / delete
$perPage   = 5;

/* ---------- small helpers ---------- */

// Make text safe to print in HTML.
function h($text)
{
    return htmlspecialchars((string) $text, ENT_QUOTES, 'UTF-8');
}

// Run a prepared statement. $types is like 'iss'; $params are the values.
function run_query($conn, $sql, $types = '', $params = [])
{
    $stmt = mysqli_prepare($conn, $sql);
    if ($types !== '') {
        mysqli_stmt_bind_param($stmt, $types, ...$params);
    }
    mysqli_stmt_execute($stmt);
    return $stmt;
}

// Record the action in the same audit_log table the other features use.
// If the audit table is missing, ignore the error so the page still works.
function write_audit($conn, $userId, $action, $entityId, $details)
{
    try {
        run_query(
            $conn,
            'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?)',
            'issss',
            [$userId, $action, 'assignment', $entityId, $details]
        );
    } catch (Exception $e) {
        // audit is optional here
    }
}

// Check the form fields. Returns a list of error messages (empty = OK).
function validate_assignment($title, $subject, $description, $due)
{
    $errors = [];
    if ($title === '') {
        $errors[] = 'A title is required.';
    } elseif (mb_strlen($title) > 120) {
        $errors[] = 'The title must be 120 characters or fewer.';
    }
    if ($subject === '') {
        $errors[] = 'A subject is required.';
    } elseif (mb_strlen($subject) > 80) {
        $errors[] = 'The subject must be 80 characters or fewer.';
    }
    if (mb_strlen($description) > 2000) {
        $errors[] = 'The description must be 2000 characters or fewer.';
    }
    if ($due !== '') {
        $d = DateTime::createFromFormat('Y-m-d', $due);
        if (!$d || $d->format('Y-m-d') !== $due) {
            $errors[] = 'The due date is not a valid date.';
        }
    }
    return $errors;
}

// Find one assignment this user is allowed to change. Returns the row or null.
function find_assignment($conn, $id, $userId, $isAdmin)
{
    if ($isAdmin) {
        $stmt = run_query($conn, 'SELECT id, title, subject, description, due_date FROM assignments WHERE id = ?', 'i', [$id]);
    } else {
        $stmt = run_query($conn, 'SELECT id, title, subject, description, due_date FROM assignments WHERE id = ? AND teacher_id = ?', 'ii', [$id, $userId]);
    }
    return mysqli_fetch_assoc(mysqli_stmt_get_result($stmt));
}

function flash($type, $message)
{
    $_SESSION['assign_flash'] = ['type' => $type, 'message' => $message];
}

function page_url($page, $q)
{
    $args = ['page' => $page];
    if ($q !== '') {
        $args['q'] = $q;
    }
    return 'assignments.php?' . http_build_query($args);
}

/* ---------- CSRF token (stops other sites from posting to this page) ---------- */

if (empty($_SESSION['csrf'])) {
    $_SESSION['csrf'] = bin2hex(random_bytes(32));
}
$csrf = $_SESSION['csrf'];

/* ---------- page state ---------- */

$form       = ['id' => '', 'title' => '', 'subject' => '', 'description' => '', 'due_date' => ''];
$formErrors = [];
$dbError    = '';

/* ---------- CREATE / UPDATE / DELETE (form posts) ---------- */

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!hash_equals($csrf, (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(419);
        exit('Your session expired. Go back, refresh the page and try again.');
    }
    if (!$canManage) {                        // students are blocked on the server
        http_response_code(403);
        exit('Your role can only view assignments.');
    }

    $action = (string) ($_POST['action'] ?? '');
    $id     = (int) ($_POST['id'] ?? 0);

    try {
        // ----- DELETE -----
        if ($action === 'delete') {
            $row = find_assignment($conn, $id, $userId, $isAdmin);
            if (!$row) {
                flash('error', 'That assignment was not found, or you are not allowed to delete it.');
            } else {
                run_query($conn, 'DELETE FROM assignments WHERE id = ?', 'i', [$id]);
                write_audit($conn, $userId, 'DELETE', 'ASSIGN-' . $id, $row['title']);
                flash('ok', 'Assignment deleted.');
            }
            header('Location: assignments.php');
            exit;
        }

        // ----- CREATE or UPDATE -----
        if ($action === 'create' || $action === 'update') {
            $title       = trim((string) ($_POST['title'] ?? ''));
            $subject     = trim((string) ($_POST['subject'] ?? ''));
            $description = trim((string) ($_POST['description'] ?? ''));
            $due         = trim((string) ($_POST['due_date'] ?? ''));
            $dueValue    = ($due === '') ? null : $due;      // empty date is saved as NULL

            $formErrors = validate_assignment($title, $subject, $description, $due);

            if ($formErrors) {
                // Show the form again with what the user typed.
                $form = [
                    'id'          => ($action === 'update') ? (string) $id : '',
                    'title'       => $title,
                    'subject'     => $subject,
                    'description' => $description,
                    'due_date'    => $due,
                ];
            } elseif ($action === 'create') {
                run_query(
                    $conn,
                    'INSERT INTO assignments (teacher_id, title, subject, description, due_date) VALUES (?, ?, ?, ?, ?)',
                    'issss',
                    [$userId, $title, $subject, $description, $dueValue]
                );
                write_audit($conn, $userId, 'CREATE', 'ASSIGN-' . mysqli_insert_id($conn), $title);
                flash('ok', 'Assignment added.');
                header('Location: assignments.php');
                exit;
            } else {
                if (!find_assignment($conn, $id, $userId, $isAdmin)) {
                    flash('error', 'That assignment was not found, or you are not allowed to edit it.');
                } else {
                    run_query(
                        $conn,
                        'UPDATE assignments SET title = ?, subject = ?, description = ?, due_date = ? WHERE id = ?',
                        'ssssi',
                        [$title, $subject, $description, $dueValue, $id]
                    );
                    write_audit($conn, $userId, 'UPDATE', 'ASSIGN-' . $id, $title);
                    flash('ok', 'Assignment updated.');
                }
                header('Location: assignments.php');
                exit;
            }
        }
    } catch (Exception $e) {
        error_log('assignments.php error: ' . $e->getMessage());
        $dbError = 'Could not save to the database. Is MySQL running and is db/assignments_setup.sql imported?';
    }
}

/* ---------- READ + SEARCH ---------- */

$q           = trim((string) ($_GET['q'] ?? ''));
$page        = max(1, (int) ($_GET['page'] ?? 1));
$assignments = [];
$students    = [];
$total       = 0;
$pages       = 1;

try {
    // Load an assignment into the form for editing (?edit=ID).
    if ($canManage && isset($_GET['edit']) && $_SERVER['REQUEST_METHOD'] === 'GET') {
        $row = find_assignment($conn, (int) $_GET['edit'], $userId, $isAdmin);
        if ($row) {
            $form = [
                'id'          => (string) $row['id'],
                'title'       => $row['title'],
                'subject'     => $row['subject'],
                'description' => (string) $row['description'],
                'due_date'    => (string) ($row['due_date'] ?? ''),
            ];
        } else {
            flash('error', 'That assignment was not found, or you are not allowed to edit it.');
            header('Location: assignments.php');
            exit;
        }
    }

    // Build the WHERE part. A teacher only sees their own assignments.
    $where  = [];
    $types  = '';
    $params = [];

    if ($role === 'teacher') {
        $where[]  = 'a.teacher_id = ?';
        $types   .= 'i';
        $params[] = $userId;
    }
    if ($q !== '') {
        $like = '%' . addcslashes($q, '\\%_') . '%';
        $where[] = '(a.title LIKE ? OR a.subject LIKE ? OR a.description LIKE ? OR u.display_name LIKE ?)';
        $types  .= 'ssss';
        array_push($params, $like, $like, $like, $like);
    }
    $whereSql = $where ? 'WHERE ' . implode(' AND ', $where) : '';

    // How many rows match (for the page numbers).
    $stmt  = run_query($conn, "SELECT COUNT(*) AS n FROM assignments a JOIN users u ON u.id = a.teacher_id $whereSql", $types, $params);
    $total = (int) mysqli_fetch_assoc(mysqli_stmt_get_result($stmt))['n'];
    $pages = max(1, (int) ceil($total / $perPage));
    $page  = min($page, $pages);
    $offset = ($page - 1) * $perPage;

    // The rows for this page: soonest due date first, no-date last.
    $sql = "SELECT a.id, a.teacher_id, a.title, a.subject, a.description, a.due_date, u.display_name AS teacher
            FROM assignments a
            JOIN users u ON u.id = a.teacher_id
            $whereSql
            ORDER BY (a.due_date IS NULL), a.due_date ASC, a.id DESC
            LIMIT ? OFFSET ?";
    $stmt = run_query($conn, $sql, $types . 'ii', array_merge($params, [$perPage, $offset]));
    $assignments = mysqli_fetch_all(mysqli_stmt_get_result($stmt), MYSQLI_ASSOC);

    // Teachers and admins also get the list of students (read from the users table).
    if ($canManage) {
        $stmt = run_query($conn, "SELECT id, display_name, username, created_at FROM users WHERE role = 'student' ORDER BY display_name LIMIT 100");
        $students = mysqli_fetch_all(mysqli_stmt_get_result($stmt), MYSQLI_ASSOC);
    }
} catch (Exception $e) {
    error_log('assignments.php error: ' . $e->getMessage());
    $dbError = 'Could not read from the database. Is MySQL running and is db/assignments_setup.sql imported?';
}

/* ---------- one-time message ---------- */

$flash = $_SESSION['assign_flash'] ?? null;
unset($_SESSION['assign_flash']);

$roleLabels = ['student' => 'Student', 'teacher' => 'Teacher', 'admin' => 'Administrator'];
$editing    = ($form['id'] !== '');
$today      = date('Y-m-d');
?>
<!doctype html>
<html lang="en" data-ready="true">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Assignments - StudyHub</title>
    <link rel="icon" href="data:," />
    <link rel="stylesheet" href="css/style.css" />
    <script>
      /* Same theme logic as index.php */
      (function () {
        var theme = "dark";
        try {
          var pref = localStorage.getItem("studyhub-theme") || "dark";
          theme = pref === "system"
            ? (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
            : (pref === "light" ? "light" : "dark");
        } catch (e) {}
        document.documentElement.setAttribute("data-theme", theme);
      })();
    </script>
    <style>
      /* This page has no sidebar, so use a simple one-column layout. */
      body { display: block; }
      #app { overflow: visible; padding: var(--space-4); }
      .btn-link { display: inline-block; padding: var(--space-2) var(--space-3); border: 1px solid var(--border);
                  border-radius: var(--radius); background: var(--card); color: var(--primary); text-decoration: none; }
      .inline-form { margin: 0; }
      .flash-ok { border: 1px solid var(--brand); padding: var(--space-2) var(--space-3);
                  border-radius: var(--radius); margin-bottom: var(--space-4); }
      .search-row { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-bottom: var(--space-3); }
      .search-row input[type="search"] { flex: 1 1 16rem; }
      .pager { display: flex; justify-content: center; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; }
    </style>
  </head>
  <body>
    <header class="app-header">
      <a class="app-brand" href="index.php" aria-label="StudyHub home">
        <img src="assets/logo.svg" alt="" />
        <span>StudyHub</span>
      </a>
      <div class="user-menu">
        <span id="user-label"><?= h($user['name']) ?></span>
        <span class="status-pill"><?= h($roleLabels[$role] ?? $role) ?></span>
        <a class="btn-link" href="index.php">Dashboard</a>
        <a class="btn-link" href="logout.php">Sign out</a>
      </div>
    </header>

    <main id="app">
      <h2>Assignments</h2>

      <?php if ($flash): ?>
        <?php if ($flash['type'] === 'ok'): ?>
          <p class="flash-ok" role="status"><?= h($flash['message']) ?></p>
        <?php else: ?>
          <div role="alert"><?= h($flash['message']) ?></div>
        <?php endif; ?>
      <?php endif; ?>

      <?php if ($dbError): ?>
        <div role="alert"><?= h($dbError) ?></div>
      <?php endif; ?>

      <?php if ($canManage): ?>
        <div class="content-card">
          <h3><?= $editing ? 'Edit assignment' : 'Add assignment' ?></h3>

          <?php if ($formErrors): ?>
            <div role="alert">
              <?php foreach ($formErrors as $err): ?><div><?= h($err) ?></div><?php endforeach; ?>
            </div>
          <?php endif; ?>

          <form method="post" action="assignments.php" novalidate>
            <input type="hidden" name="csrf" value="<?= h($csrf) ?>" />
            <input type="hidden" name="action" value="<?= $editing ? 'update' : 'create' ?>" />
            <input type="hidden" name="id" value="<?= h($form['id']) ?>" />

            <div>
              <label for="as-title">Title</label>
              <input type="text" id="as-title" name="title" maxlength="120" required
                     placeholder="e.g. Lab report: Ohm's law" value="<?= h($form['title']) ?>" />
            </div>
            <div>
              <label for="as-subject">Subject</label>
              <input type="text" id="as-subject" name="subject" maxlength="80" required
                     placeholder="e.g. Physics" value="<?= h($form['subject']) ?>" />
            </div>
            <div>
              <label for="as-desc">Description (optional)</label>
              <textarea id="as-desc" name="description" rows="3" maxlength="2000"
                        placeholder="What should students do?"><?= h($form['description']) ?></textarea>
            </div>
            <div>
              <label for="as-due">Due date (optional)</label>
              <input type="date" id="as-due" name="due_date" value="<?= h($form['due_date']) ?>" />
            </div>

            <button type="submit"><?= $editing ? 'Save changes' : 'Add assignment' ?></button>
            <?php if ($editing): ?><a class="btn-link" href="assignments.php">Cancel edit</a><?php endif; ?>
          </form>
        </div>
      <?php else: ?>
        <p class="section-note">Your role can view and search assignments, but not change them.</p>
      <?php endif; ?>

      <div class="content-card">
        <h3><?= $role === 'teacher' ? 'My assignments' : 'All assignments' ?></h3>

        <form method="get" action="assignments.php" class="search-row" role="search">
          <label class="sr-only" for="as-search">Search assignments</label>
          <input type="search" id="as-search" name="q" value="<?= h($q) ?>"
                 placeholder="Search title, subject, description or teacher" />
          <button type="submit">Search</button>
          <?php if ($q !== ''): ?><a class="btn-link" href="assignments.php">Clear</a><?php endif; ?>
        </form>

        <p class="section-note" role="status">
          <?php if ($q !== ''): ?>
            <?= $total ?> result<?= $total === 1 ? '' : 's' ?> for "<?= h($q) ?>"
          <?php else: ?>
            <?= $total ?> assignment<?= $total === 1 ? '' : 's' ?>
          <?php endif; ?>
        </p>

        <?php foreach ($assignments as $a): ?>
          <article class="info-entry">
            <h4><?= h($a['title']) ?></h4>
            <p class="section-note">
              <?= h($a['subject']) ?> · by <?= h($a['teacher']) ?>
              <?php if ($a['due_date']): ?>
                · Due <?= h(date('M j, Y', strtotime($a['due_date']))) ?>
                <?php if ($a['due_date'] < $today): ?>(past due)<?php endif; ?>
              <?php else: ?>
                · No due date
              <?php endif; ?>
            </p>
            <?php if ((string) $a['description'] !== ''): ?>
              <p><?= nl2br(h($a['description'])) ?></p>
            <?php endif; ?>

            <?php if ($canManage): /* teachers only receive their own rows; admins receive all */ ?>
              <div class="task-actions">
                <a class="btn-link" href="assignments.php?edit=<?= (int) $a['id'] ?>">Edit</a>
                <form method="post" action="assignments.php" class="inline-form"
                      onsubmit="return confirm('Delete this assignment?');">
                  <input type="hidden" name="csrf" value="<?= h($csrf) ?>" />
                  <input type="hidden" name="action" value="delete" />
                  <input type="hidden" name="id" value="<?= (int) $a['id'] ?>" />
                  <button type="submit" class="btn-danger">Delete</button>
                </form>
              </div>
            <?php endif; ?>
          </article>
        <?php endforeach; ?>

        <?php if (!$assignments && !$dbError): ?>
          <p class="section-note">
            <?= $q !== '' ? 'No assignments match your search.' : ($canManage ? 'No assignments yet. Add one above.' : 'No assignments yet.') ?>
          </p>
        <?php endif; ?>

        <?php if ($pages > 1): ?>
          <nav class="pager" aria-label="Assignment pages">
            <?php if ($page > 1): ?><a class="btn-link" href="<?= h(page_url($page - 1, $q)) ?>">Previous</a><?php endif; ?>
            <span>Page <?= $page ?> of <?= $pages ?></span>
            <?php if ($page < $pages): ?><a class="btn-link" href="<?= h(page_url($page + 1, $q)) ?>">Next</a><?php endif; ?>
          </nav>
        <?php endif; ?>
      </div>

      <?php if ($canManage): ?>
        <div class="content-card">
          <h3>Students (<?= count($students) ?>)</h3>
          <?php if ($students): ?>
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr><th>Name</th><th>Email</th><th>Joined</th></tr>
                </thead>
                <tbody>
                  <?php foreach ($students as $s): ?>
                    <tr>
                      <td><?= h($s['display_name']) ?></td>
                      <td><?= h($s['username']) ?></td>
                      <td><?= h(date('M j, Y', strtotime($s['created_at']))) ?></td>
                    </tr>
                  <?php endforeach; ?>
                </tbody>
              </table>
            </div>
          <?php else: ?>
            <p class="section-note">No student accounts yet.</p>
          <?php endif; ?>
        </div>
      <?php endif; ?>
    </main>
  </body>
</html>