'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/Modal';
import { changePasswordAction, createEmployeeAction, updateEmployeeAction } from '@/lib/actions';
import type { ActionResult, AppRole } from '@/lib/types';

function Err({ state }: { state: ActionResult | null }) {
  return state && !state.ok ? <div className="form-error" role="alert">{state.error}</div> : null;
}

function useDone(state: ActionResult | null, onDone: () => void) {
  const router = useRouter();
  const seen = useRef(state);
  useEffect(() => {
    if (state && state !== seen.current && state.ok) {
      seen.current = state;
      onDone();
      router.refresh();
    }
  }, [state, onDone, router]);
}

export function PasswordForm() {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(changePasswordAction, null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form ref={ref} action={action} className="form-grid">
      <div className="field">
        <label htmlFor="pw1">New password</label>
        <input id="pw1" name="password" type="password" className="input" minLength={8} required autoComplete="new-password" />
      </div>
      <div className="field">
        <label htmlFor="pw2">Repeat new password</label>
        <input id="pw2" name="confirm" type="password" className="input" minLength={8} required autoComplete="new-password" />
      </div>
      <Err state={state} />
      {state?.ok && <div className="form-ok">Password changed.</div>}
      <button className="btn" type="submit" disabled={pending}>Change password</button>
    </form>
  );
}

export function AddEmployeeButton({ canCreateLogins }: { canCreateLogins: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary sm" onClick={() => setOpen(true)}>+ Add employee</button>
      <Modal open={open} onClose={() => setOpen(false)} label="Add employee">
        <AddEmployeeForm canCreateLogins={canCreateLogins} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function AddEmployeeForm({ canCreateLogins, onDone }: { canCreateLogins: boolean; onDone: () => void }) {
  const [state, action, pending] = useActionState(createEmployeeAction, null);
  useDone(state, onDone);
  return (
    <form action={action} className="form-grid">
      <h2>Add employee</h2>
      <div className="field">
        <label htmlFor="ne-name">Name</label>
        <input id="ne-name" name="name" className="input" required maxLength={80} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="ne-pos">Position (optional)</label>
        <input id="ne-pos" name="position" className="input" maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="ne-role">Role</label>
        <select id="ne-role" name="role" className="select" defaultValue="employee">
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
        </select>
      </div>
      {canCreateLogins && (
        <>
          <div className="field">
            <label htmlFor="ne-email">Login email (optional — leave empty for no login)</label>
            <input id="ne-email" name="email" type="email" className="input" autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor="ne-pw">Temporary password (min 8 characters)</label>
            <input id="ne-pw" name="password" type="text" className="input" autoComplete="off" minLength={8} />
          </div>
        </>
      )}
      <Err state={state} />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary" disabled={pending}>Add employee</button>
      </div>
    </form>
  );
}

interface EditableEmployee {
  id: string;
  name: string;
  position: string | null;
  role: AppRole;
  active: boolean;
  hasLogin: boolean;
}

export function EditEmployeeButton({
  employee,
  isSelf,
  canCreateLogins,
}: {
  employee: EditableEmployee;
  isSelf: boolean;
  canCreateLogins: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn sm" onClick={() => setOpen(true)}>Edit</button>
      <Modal open={open} onClose={() => setOpen(false)} label={`Edit ${employee.name}`}>
        <EditEmployeeForm employee={employee} isSelf={isSelf} canCreateLogins={canCreateLogins} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function EditEmployeeForm({
  employee: e,
  isSelf,
  canCreateLogins,
  onDone,
}: {
  employee: EditableEmployee;
  isSelf: boolean;
  canCreateLogins: boolean;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(updateEmployeeAction, null);
  useDone(state, onDone);
  return (
    <form action={action} className="form-grid">
      <h2>Edit {e.name}</h2>
      <input type="hidden" name="id" value={e.id} />
      <div className="field">
        <label htmlFor="ee-name">Name</label>
        <input id="ee-name" name="name" className="input" defaultValue={e.name} required maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="ee-pos">Position</label>
        <input id="ee-pos" name="position" className="input" defaultValue={e.position ?? ''} maxLength={80} />
      </div>
      <div className="field">
        <label htmlFor="ee-role">Role</label>
        <select id="ee-role" name="role" className="select" defaultValue={e.role} disabled={isSelf}>
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
        </select>
        {isSelf && <input type="hidden" name="role" value={e.role} />}
      </div>
      <label className="check">
        <input type="checkbox" name="active" defaultChecked={e.active} disabled={isSelf} /> Active
        {isSelf && <input type="hidden" name="active" value="on" />}
      </label>
      {canCreateLogins &&
        (e.hasLogin ? (
          <div className="field">
            <label htmlFor="ee-pw">Set a new password (optional)</label>
            <input id="ee-pw" name="password" type="text" className="input" autoComplete="off" minLength={8} />
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="ee-email">Create login — email (optional)</label>
              <input id="ee-email" name="email" type="email" className="input" autoComplete="off" />
            </div>
            <div className="field">
              <label htmlFor="ee-pw2">Temporary password</label>
              <input id="ee-pw2" name="password" type="text" className="input" autoComplete="off" minLength={8} />
            </div>
          </>
        ))}
      <Err state={state} />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary" disabled={pending}>Save</button>
      </div>
    </form>
  );
}
