<?php
// includes/permissions.php
// THE ONE PLACE that decides who may do what to whom.
// Every admin/staff endpoint must ask permission_denied() before acting.
//
// Roles, lowest to highest rank:
//   student, teacher  (rank 1, "regular users")
//   admin             (rank 2)
//   super_admin       (rank 3)
//
// The hard rules (see the role/permission matrix agreed for the course):
//   1. You can only act on accounts of LOWER rank than you. Equal or higher is refused.
//   2. You can never act on your own account through admin tools
//      (no self-promotion, self-suspension, self-reset). Use the profile page.
//   3. Only a Super Admin changes roles, and never TO super_admin.
//      Super Admins are created in the database only.
//   4. There must always be at least one active Super Admin.
//   5. Admins may view and delete regular users' content (with a reason), never edit it.

const ROLE_RANK = [
    'student'     => 1,
    'teacher'     => 1,
    'admin'       => 2,
    'super_admin' => 3,
];

const ROLE_LABELS = [
    'student'     => 'Student',
    'teacher'     => 'Teacher',
    'admin'       => 'Admin',
    'super_admin' => 'Super Admin',
];

// Roles a Super Admin may give through the app. super_admin is deliberately absent.
const ASSIGNABLE_ROLES = ['student', 'teacher', 'admin'];

// Actions that don't target a specific account, and the minimum rank they need.
const GLOBAL_ACTIONS = [
    'users.list'           => 2,   // see the user list
    'reports.view'         => 2,   // site-wide usage stats
    'logs.activity'        => 2,   // activity log (admins: regular users only)
    'announcements.manage' => 2,
    'users.create'         => 3,   // create an account (incl. Admins) with a temporary password
    'logs.security'        => 3,   // logins, failed logins, role/status changes
    'settings.global'      => 3,   // signups on/off, etc.
    'backup.full'          => 3,   // whole-database backup
];

// Actions on another user's account or content, and the minimum rank they need.
// The target must also be of LOWER rank than the actor (rule 1).
const TARGET_ACTIONS = [
    'user.view'           => 2,
    'user.edit'           => 2,   // display name / email
    'user.reset_password' => 2,
    'user.approve'        => 2,   // pending teacher -> active
    'user.suspend'        => 2,
    'user.ban'            => 2,
    'user.reactivate'     => 2,
    'content.view'        => 2,
    'content.delete'      => 2,
    'user.change_role'    => 3,
    'user.delete'         => 3,
];

function role_rank(?string $role): int
{
    return ROLE_RANK[$role ?? ''] ?? 0;
}

function role_label(?string $role): string
{
    return ROLE_LABELS[$role ?? ''] ?? 'Unknown';
}

/** Admins and Super Admins. */
function is_staff_role(?string $role): bool
{
    return role_rank($role) >= 2;
}

/**
 * Decide whether $actor may perform $action (optionally on $target).
 *
 * Returns NULL when allowed, or a short human-readable reason when refused.
 * $actor / $target are arrays with at least 'id' and 'role'.
 * $extra may hold 'new_role' for user.change_role.
 */
function permission_denied(array $actor, string $action, ?array $target = null, array $extra = []): ?string
{
    $actorRank = role_rank($actor['role'] ?? null);

    if (isset(GLOBAL_ACTIONS[$action])) {
        return $actorRank >= GLOBAL_ACTIONS[$action]
            ? null
            : 'You do not have permission to do that.';
    }

    if (!isset(TARGET_ACTIONS[$action])) {
        return 'Unknown action.';   // fail closed: anything not listed is refused
    }
    if ($actorRank < TARGET_ACTIONS[$action]) {
        return 'You do not have permission to do that.';
    }
    if ($target === null) {
        return 'No account was selected.';
    }

    // Rule 2: never through admin tools on yourself.
    if ((int) $actor['id'] === (int) $target['id']) {
        return 'You cannot do this to your own account. Use your profile instead.';
    }

    // Rule 1: only on lower-ranked accounts.
    if (role_rank($target['role'] ?? null) >= $actorRank) {
        return 'You can only manage accounts with a lower role than yours.';
    }

    // Rule 3: role changes.
    if ($action === 'user.change_role') {
        $newRole = $extra['new_role'] ?? null;
        if (!in_array($newRole, ASSIGNABLE_ROLES, true)) {
            return 'That role cannot be assigned here.';
        }
        if ($newRole === ($target['role'] ?? null)) {
            return 'The account already has that role.';
        }
    }

    return null;
}

/**
 * Rule 4: refuse anything that would leave no active Super Admin.
 * Call this before changing the role/status of, or deleting, $target.
 * Returns NULL when it is safe, or a reason when it is not.
 */
function last_super_admin_guard(mysqli $conn, array $target, ?string $newRole = null, ?string $newStatus = null, bool $deleting = false): ?string
{
    if (($target['role'] ?? null) !== 'super_admin') {
        return null;   // only matters when the target is a Super Admin
    }
    $losesPower = $deleting
        || ($newRole !== null && $newRole !== 'super_admin')
        || ($newStatus !== null && $newStatus !== 'active');
    if (!$losesPower) {
        return null;
    }

    $result = mysqli_query($conn,
        "SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND status = 'active'");
    $active = (int) mysqli_fetch_assoc($result)['n'];

    return $active <= 1
        ? 'There must always be at least one active Super Admin.'
        : null;
}
