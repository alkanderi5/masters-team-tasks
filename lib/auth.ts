import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from './supabase/server';
import type { Employee } from './types';

export interface Me {
  userId: string;
  email: string | null;
  employee: Employee;
  isManager: boolean;
}

/** The signed-in user and their employee record (cached per request). */
export const getMe = cache(async (): Promise<Me | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: employee } = await supabase
    .from('employees')
    .select('*')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle();

  if (!employee) return null;
  return {
    userId: user.id,
    email: user.email ?? null,
    employee: employee as Employee,
    isManager: employee.role === 'manager',
  };
});

/** For pages: signed in and linked to an active employee, else redirect. */
export async function requireMe(): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/setup');
  return me;
}

export async function requireManager(): Promise<Me> {
  const me = await requireMe();
  if (!me.isManager) redirect(`/employees/${me.employee.id}`);
  return me;
}
