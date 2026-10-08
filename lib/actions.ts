'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';
import { getMe } from './auth';
import type { ActionResult, AppRole, CompleteResult, TaskStatus } from './types';
import { isUuid } from './format';

/* Clean database error text for the UI. */
function errText(error: { message?: string } | null | undefined, fallback = 'Something went wrong'): string {
  return (error?.message || fallback).replace(/^.*?ERROR:\s*/, '');
}

function fail(error: { message?: string } | null | undefined, fallback?: string): ActionResult {
  return { ok: false, error: errText(error, fallback) };
}

function refresh() {
  revalidatePath('/', 'layout');
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();

/* ---------------------------------------------------------------- */
/* Auth                                                              */
/* ---------------------------------------------------------------- */

export async function signInAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: str(fd, 'email'), password: String(fd.get('password') ?? '') });
  if (error) {
    if (error.code === 'invalid_credentials') return { ok: false, error: 'Incorrect email or password' };
    if (error.code === 'email_not_confirmed') return { ok: false, error: 'This email is not confirmed yet. Ask your manager to confirm it.' };
    // Configuration problems (wrong key or URL) would otherwise look like a bad password.
    console.error('Sign-in failed:', error);
    return { ok: false, error: `Sign-in failed: ${error.message}` };
  }
  redirect('/');
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function bootstrapAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const name = str(fd, 'name');
  if (!name) return { ok: false, error: 'Enter your name' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('bootstrap_first_manager', { p_name: name });
  if (error) return fail(error);
  redirect('/');
}

export async function changePasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const password = String(fd.get('password') ?? '');
  if (password.length < 8) return { ok: false, error: 'Use at least 8 characters' };
  if (password !== String(fd.get('confirm') ?? '')) return { ok: false, error: 'Passwords do not match' };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(error);
  return { ok: true };
}

/* ---------------------------------------------------------------- */
/* Tasks                                                             */
/* ---------------------------------------------------------------- */

export async function createTaskAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const title = str(fd, 'title');
  if (!title) return { ok: false, error: 'Enter a title' };
  const parent = str(fd, 'parent_id');
  const employee = str(fd, 'employee_id');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_task', {
    p_title: title,
    p_description: str(fd, 'description') || null,
    p_employee_id: isUuid(employee) ? employee : null,
    p_parent_id: isUuid(parent) ? parent : null,
  });
  if (error) return fail(error);
  refresh();
  if (!parent && fd.get('open_after') === '1') redirect(`/tasks/${data}`);
  return { ok: true, id: data as string };
}

export async function setStatusAction(taskId: string, status: TaskStatus, reason?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_task_status', {
    p_task_id: taskId,
    p_status: status,
    p_reason: reason ?? null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

export async function completeTaskAction(
  taskId: string,
  force: boolean,
): Promise<CompleteResult | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('complete_task', { p_task_id: taskId, p_force: force });
  if (error) return { ok: false, error: errText(error) };
  const result = data as CompleteResult;
  if (result.ok) refresh();
  return result;
}

export async function reopenTaskAction(taskId: string, note: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('reopen_task', { p_task_id: taskId, p_note: note || null });
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

export async function cancelTaskAction(taskId: string, note: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_task', { p_task_id: taskId, p_note: note || null });
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

export async function updateTaskAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const id = str(fd, 'task_id');
  const title = str(fd, 'title');
  if (!title) return { ok: false, error: 'Enter a title' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('update_task_details', {
    p_task_id: id,
    p_title: title,
    p_description: str(fd, 'description') || null,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

export async function reassignTaskAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('reassign_task', {
    p_task_id: str(fd, 'task_id'),
    p_employee_id: str(fd, 'employee_id'),
    p_include_subtasks: fd.get('include_subtasks') === 'on',
  });
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

/* ---------------------------------------------------------------- */
/* Employees (manager)                                               */
/* ---------------------------------------------------------------- */

const ROLES: AppRole[] = ['manager', 'employee'];

export async function createEmployeeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await getMe();
  if (!me?.isManager) return { ok: false, error: 'Only a manager can do this' };

  const name = str(fd, 'name');
  const role = (ROLES.includes(str(fd, 'role') as AppRole) ? str(fd, 'role') : 'employee') as AppRole;
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');
  if (!name) return { ok: false, error: 'Enter a name' };
  if (email && password.length < 8) return { ok: false, error: 'Temporary password needs at least 8 characters' };

  let userId: string | null = null;
  let admin: ReturnType<typeof createAdminClient> | null = null;
  if (email) {
    try {
      admin = createAdminClient();
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) return fail(error, 'Could not create the login');
    userId = data.user.id;
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('create_employee', {
    p_name: name,
    p_position: str(fd, 'position') || null,
    p_role: role,
    p_user_id: userId,
  });
  if (error) {
    if (admin && userId) await admin.auth.admin.deleteUser(userId); // don't leave an orphan login
    return fail(error);
  }
  refresh();
  return { ok: true };
}

export async function updateEmployeeAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const me = await getMe();
  if (!me?.isManager) return { ok: false, error: 'Only a manager can do this' };

  const id = str(fd, 'id');
  const role = (ROLES.includes(str(fd, 'role') as AppRole) ? str(fd, 'role') : 'employee') as AppRole;
  const active = fd.get('active') === 'on';
  const email = str(fd, 'email').toLowerCase();
  const password = String(fd.get('password') ?? '');

  const supabase = await createClient();
  const { data: before } = await supabase.from('employees').select('user_id, active').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: 'Employee not found' };

  const { error } = await supabase.rpc('update_employee', {
    p_id: id,
    p_name: str(fd, 'name'),
    p_position: str(fd, 'position') || null,
    p_role: role,
    p_active: active,
  });
  if (error) return fail(error);

  const needsAdmin = (before.user_id && (before.active !== active || password)) || (!before.user_id && email);
  if (needsAdmin) {
    let admin;
    try {
      admin = createAdminClient();
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
    if (before.user_id) {
      const attrs: { ban_duration?: string; password?: string } = {};
      if (before.active !== active) attrs.ban_duration = active ? 'none' : '876000h';
      if (password) {
        if (password.length < 8) return { ok: false, error: 'New password needs at least 8 characters' };
        attrs.password = password;
      }
      const { error: e2 } = await admin.auth.admin.updateUserById(before.user_id, attrs);
      if (e2) return fail(e2);
    } else if (email) {
      if (password.length < 8) return { ok: false, error: 'Temporary password needs at least 8 characters' };
      const { data, error: e3 } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (e3 || !data.user) return fail(e3, 'Could not create the login');
      const { error: e4 } = await supabase.rpc('link_employee_user', { p_id: id, p_user_id: data.user.id });
      if (e4) {
        await admin.auth.admin.deleteUser(data.user.id);
        return fail(e4);
      }
    }
  }
  refresh();
  return { ok: true };
}
