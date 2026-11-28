<?php
// who can do what to whom. every admin/staff endpoint has to call permission_denied() first.
// ranks: student/teacher = 1, admin = 2, super_admin = 3
// rules (from the course role matrix):
//   1. you can only act on accounts ranked LOWER than you
//   2. never on yourself through admin tools, use the profile page for that
//   3. only super admins change roles, and never TO super_admin (those get made in the db)
//   4. there's always gotta be at least one active super admin
//   5. admins can view/delete regular users' content (with a reason) but never edit it

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

// roles a super admin can hand out, super_admin left out on purpose
const ASSIGNABLE_ROLES = ['student', 'teacher', 'admin'];

// actions that don't target an account + min rank
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

// actions on someone else's account/content + min rank. target still has to be lower rank (rule 1)
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

// admin or super admin
function is_staff_role(?string $role): bool
{
    return role_rank($role) >= 2;
}

// can $actor do $action (optionally to $target)?
// null = yes, otherwise a short reason. $extra can have 'new_role' for user.change_role
function permission_denied(array $actor, string $action, ?array $target = null, array $extra = []): ?string
{
    $actorRank = role_rank($actor['role'] ?? null);

    if (isset(GLOBAL_ACTIONS[$action])) {
        return $actorRank >= GLOBAL_ACTIONS[$action]
            ? null
            : 'You do not have permission to do that.';
    }

    if (!isset(TARGET_ACTIONS[$action])) {
        return 'Unknown action.';   // not listed = nope
    }
    if ($actorRank < TARGET_ACTIONS[$action]) {
        return 'You do not have permission to do that.';
    }
    if ($target === null) {
        return 'No account was selected.';
    }

    // rule 2: not on yourself
    if ((int) $actor['id'] === (int) $target['id']) {
        return 'You cannot do this to your own account. Use your profile instead.';
    }

    // rule 1: lower rank only
    if (role_rank($target['role'] ?? null) >= $actorRank) {
        return 'You can only manage accounts with a lower role than yours.';
    }

    // rule 3: role changes
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

// rule 4: don't let the last active super admin get demoted/suspended/deleted.
// call before changing role/status or deleting. null = fine, otherwise a reason
function last_super_admin_guard(mysqli $conn, array $target, ?string $newRole = null, ?string $newStatus = null, bool $deleting = false): ?string
{
    if (($target['role'] ?? null) !== 'super_admin') {
        return null;   // only matters for super admins
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
