'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from './Modal';
import {
  cancelTaskAction,
  completeTaskAction,
  createTaskAction,
  reassignTaskAction,
  reopenTaskAction,
  setStatusAction,
  updateTaskAction,
} from '@/lib/actions';
import type { CompleteResult, TaskStatus } from '@/lib/types';
import { STATUS_LABEL } from '@/lib/format';

export interface EmployeeOption {
  id: string;
  name: string;
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? <div className="form-error" role="alert">{error}</div> : null;
}

/* ================================================================ */
/* Status: Not started / In progress / Blocked                       */
/* ================================================================ */

export function StatusControl({
  taskId,
  status,
  blockedReason,
}: {
  taskId: string;
  status: TaskStatus;
  blockedReason: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);

  function change(next: TaskStatus, reason?: string) {
    setError(null);
    start(async () => {
      const r = await setStatusAction(taskId, next, reason);
      if (!r.ok) setError(r.error);
      else {
        setBlockOpen(false);
        router.refresh();
      }
    });
  }

  const opts: TaskStatus[] = ['not_started', 'in_progress', 'blocked'];
  return (
    <>
      <div className="seg" role="group" aria-label="Status">
        {opts.map((s) => (
          <button
            key={s}
            type="button"
            className={`${status === s ? 'on' : ''}${s === 'blocked' && status === s ? ' bl' : ''}`}
            aria-pressed={status === s}
            disabled={pending}
            onClick={() => {
              if (s === 'blocked') setBlockOpen(true);
              else if (s !== status) change(s);
            }}
          >
            <span className={`s s-${s}`} aria-hidden="true">{s === 'blocked' ? '!' : null}</span>
            {STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {error && !blockOpen && <ErrorLine error={error} />}
      <BlockDialog
        open={blockOpen}
        initial={blockedReason ?? ''}
        editing={status === 'blocked'}
        pending={pending}
        error={blockOpen ? error : null}
        onClose={() => {
          setBlockOpen(false);
          setError(null);
        }}
        onSubmit={(reason) => change('blocked', reason)}
      />
    </>
  );
}

function BlockDialog({
  open,
  initial,
  editing,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean;
  initial: string;
  editing: boolean;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState(initial);
  useEffect(() => {
    if (open) setReason(initial);
  }, [open, initial]);

  return (
    <Modal open={open} onClose={onClose} label="Blocked reason">
      <h2>{editing ? 'Update why this is blocked' : 'Why is this task blocked?'}</h2>
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          if (reason.trim()) onSubmit(reason.trim());
        }}
      >
        <div className="field">
          <label htmlFor="block-reason">Reason (visible to management)</label>
          <textarea
            id="block-reason"
            className="textarea"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
            required
            autoFocus
            placeholder="e.g. Waiting for replacement equipment."
          />
        </div>
        <ErrorLine error={error} />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn warn" disabled={pending || !reason.trim()}>
            {editing ? 'Save reason' : 'Mark blocked'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/* ================================================================ */
/* ✓ Job Done                                                        */
/* ================================================================ */

export function JobDoneButton({ taskId, title, unfinished }: { taskId: string; title: string; unfinished: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [step, setStep] = useState<'idle' | 'confirm' | 'warn'>('idle');
  const [warn, setWarn] = useState<CompleteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(force: boolean) {
    setError(null);
    start(async () => {
      const r = await completeTaskAction(taskId, force);
      if ('error' in r) {
        setError(r.error);
        return;
      }
      if (r.ok) {
        setStep('idle');
        router.refresh();
      } else if (r.needs_confirmation) {
        setWarn(r);
        setStep('warn');
      }
    });
  }

  function click() {
    setError(null);
    if (unfinished > 0) run(false); // server returns the unfinished list → warning
    else setStep('confirm');
  }

  const close = () => {
    setStep('idle');
    setError(null);
  };

  return (
    <>
      <button type="button" className="btn done" onClick={click} disabled={pending}>
        ✓ Job Done
      </button>
      {error && step === 'idle' && <ErrorLine error={error} />}

      <Modal open={step === 'confirm'} onClose={close} label="Confirm job done">
        <h2>Mark this job as completed?</h2>
        <p>“{title}” moves to History. It is never deleted and a manager can reopen it.</p>
        <ErrorLine error={error} />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={close}>Cancel</button>
          <button type="button" className="btn done" onClick={() => run(false)} disabled={pending}>
            ✓ Confirm
          </button>
        </div>
      </Modal>

      <Modal open={step === 'warn'} onClose={close} label="Unfinished subtasks">
        <h2>
          This job contains {warn?.unfinished} unfinished subtask{warn?.unfinished === 1 ? '' : 's'}
        </h2>
        <div className="warn-list">
          {warn?.items?.map((it) => (
            <span key={it.id}>
              {it.status === 'blocked' ? '!' : it.status === 'in_progress' ? '◐' : '○'} {it.title} — {STATUS_LABEL[it.status]}
            </span>
          ))}
          {warn && (warn.unfinished ?? 0) > (warn.items?.length ?? 0) && (
            <span>…and {(warn.unfinished ?? 0) - (warn.items?.length ?? 0)} more</span>
          )}
        </div>
        <p className="small">
          Completing anyway leaves those subtasks as they are (they are not marked Done). They leave active work and
          return if the job is reopened.
        </p>
        <ErrorLine error={error} />
        <div className="form-grid">
          <button type="button" className="btn warn" onClick={() => run(true)} disabled={pending}>
            Complete parent anyway
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                close();
                document.getElementById('subtasks')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              Review subtasks
            </button>
            <button type="button" className="btn" onClick={close}>Cancel</button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/* ================================================================ */
/* Manager actions: edit, reassign, cancel, reopen                   */
/* ================================================================ */

type Panel = null | 'edit' | 'reassign' | 'cancel' | 'reopen';

export function ManagerTaskActions({
  taskId,
  title,
  description,
  employeeId,
  employees,
  closed,
}: {
  taskId: string;
  title: string;
  description: string | null;
  employeeId: string;
  employees: EmployeeOption[];
  closed: boolean;
}) {
  const [panel, setPanel] = useState<Panel>(null);
  const close = () => setPanel(null);

  return (
    <div className="row-wrap">
      {closed ? (
        <button type="button" className="btn" onClick={() => setPanel('reopen')}>Reopen task</button>
      ) : (
        <>
          <button type="button" className="btn sm" onClick={() => setPanel('edit')}>Edit</button>
          <button type="button" className="btn sm" onClick={() => setPanel('reassign')}>Reassign</button>
          <button type="button" className="btn sm ghost" onClick={() => setPanel('cancel')}>Cancel task</button>
        </>
      )}

      <Modal open={panel === 'edit'} onClose={close} label="Edit task">
        <EditForm taskId={taskId} title={title} description={description} onDone={close} />
      </Modal>
      <Modal open={panel === 'reassign'} onClose={close} label="Reassign task">
        <ReassignForm taskId={taskId} employeeId={employeeId} employees={employees} onDone={close} />
      </Modal>
      <Modal open={panel === 'cancel'} onClose={close} label="Cancel task">
        <NoteForm
          heading="Cancel this task?"
          body="Use this for a task created by mistake. It leaves active work, nothing is deleted, and a manager can reopen it."
          confirm="Cancel task"
          tone="warn"
          run={(note) => cancelTaskAction(taskId, note)}
          onDone={close}
        />
      </Modal>
      <Modal open={panel === 'reopen'} onClose={close} label="Reopen task">
        <NoteForm
          heading="Reopen this task?"
          body="It returns to active work. The earlier completion stays in its history."
          confirm="Reopen"
          tone="primary"
          run={(note) => reopenTaskAction(taskId, note)}
          onDone={close}
        />
      </Modal>
    </div>
  );
}

function useCloseOnSuccess(state: { ok: boolean } | null, onDone: () => void) {
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

function EditForm({ taskId, title, description, onDone }: { taskId: string; title: string; description: string | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(updateTaskAction, null);
  useCloseOnSuccess(state, onDone);
  return (
    <form action={action} className="form-grid">
      <h2>Edit task</h2>
      <input type="hidden" name="task_id" value={taskId} />
      <div className="field">
        <label htmlFor="et-title">Title</label>
        <input id="et-title" name="title" className="input" defaultValue={title} required maxLength={200} />
      </div>
      <div className="field">
        <label htmlFor="et-desc">Description</label>
        <textarea id="et-desc" name="description" className="textarea" defaultValue={description ?? ''} maxLength={4000} />
      </div>
      <ErrorLine error={state && !state.ok ? state.error : null} />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary" disabled={pending}>Save</button>
      </div>
    </form>
  );
}

function ReassignForm({
  taskId,
  employeeId,
  employees,
  onDone,
}: {
  taskId: string;
  employeeId: string;
  employees: EmployeeOption[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(reassignTaskAction, null);
  useCloseOnSuccess(state, onDone);
  return (
    <form action={action} className="form-grid">
      <h2>Reassign task</h2>
      <input type="hidden" name="task_id" value={taskId} />
      <div className="field">
        <label htmlFor="ra-emp">Assign to</label>
        <select id="ra-emp" name="employee_id" className="select" defaultValue={employeeId}>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>
      <label className="check">
        <input type="checkbox" name="include_subtasks" defaultChecked /> Also move unfinished subtasks owned by the same person
      </label>
      <ErrorLine error={state && !state.ok ? state.error : null} />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary" disabled={pending}>Reassign</button>
      </div>
    </form>
  );
}

function NoteForm({
  heading,
  body,
  confirm,
  tone,
  run,
  onDone,
}: {
  heading: string;
  body: string;
  confirm: string;
  tone: 'warn' | 'primary';
  run: (note: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  onDone: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="form-grid"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await run(note.trim());
          if (!r.ok) setError(r.error);
          else {
            onDone();
            router.refresh();
          }
        });
      }}
    >
      <h2>{heading}</h2>
      <p>{body}</p>
      <div className="field">
        <label htmlFor="note-f">Note (optional, kept in history)</label>
        <input id="note-f" className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
      </div>
      <ErrorLine error={error} />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>Back</button>
        <button type="submit" className={`btn ${tone}`} disabled={pending}>{confirm}</button>
      </div>
    </form>
  );
}

/* ================================================================ */
/* Create tasks                                                      */
/* ================================================================ */

export function AddSubtaskForm({
  parentId,
  defaultEmployeeId,
  employees,
}: {
  parentId: string;
  defaultEmployeeId: string;
  employees?: EmployeeOption[]; // managers only
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(createTaskAction, null);
  const seen = useRef(state);
  useEffect(() => {
    if (state && state !== seen.current && state.ok) {
      seen.current = state;
      formRef.current?.reset();
      (formRef.current?.elements.namedItem('title') as HTMLInputElement | null)?.focus();
      router.refresh();
    }
  }, [state, router]);

  return (
    <form ref={formRef} action={action} className="add-row">
      <input type="hidden" name="parent_id" value={parentId} />
      <label htmlFor="st-title" className="sr-only">New subtask title</label>
      <input id="st-title" name="title" className="input" placeholder="+ Add subtask — type a title and press Enter" required maxLength={200} />
      {employees && (
        <>
          <label htmlFor="st-emp" className="sr-only">Assign subtask to</label>
          <select id="st-emp" name="employee_id" className="select" defaultValue={defaultEmployeeId}>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </>
      )}
      <button type="submit" className="btn" disabled={pending}>Add</button>
      {state && !state.ok && <div style={{ flexBasis: '100%' }}><ErrorLine error={state.error} /></div>}
    </form>
  );
}

export function AddTaskButton({
  employees,
  defaultEmployeeId,
  label = '+ Add Task',
}: {
  employees: EmployeeOption[];
  defaultEmployeeId?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn primary" onClick={() => setOpen(true)}>{label}</button>
      <Modal open={open} onClose={() => setOpen(false)} label="Add task">
        <AddTaskForm employees={employees} defaultEmployeeId={defaultEmployeeId} onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function AddTaskForm({
  employees,
  defaultEmployeeId,
  onDone,
}: {
  employees: EmployeeOption[];
  defaultEmployeeId?: string;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState(createTaskAction, null);
  return (
    <form action={action} className="form-grid">
      <h2>New task</h2>
      <input type="hidden" name="open_after" value="1" />
      <div className="field">
        <label htmlFor="nt-title">Title</label>
        <input id="nt-title" name="title" className="input" required maxLength={200} autoFocus />
      </div>
      <div className="field">
        <label htmlFor="nt-emp">Assign to</label>
        <select id="nt-emp" name="employee_id" className="select" defaultValue={defaultEmployeeId ?? ''} required>
          <option value="" disabled>Choose employee…</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor="nt-desc">Description (optional)</label>
        <textarea id="nt-desc" name="description" className="textarea" maxLength={4000} />
      </div>
      <ErrorLine error={state && !state.ok ? state.error : null} />
      <div className="modal-actions">
        <button type="button" className="btn" onClick={onDone}>Cancel</button>
        <button type="submit" className="btn primary" disabled={pending}>{pending ? 'Creating…' : 'Create and open'}</button>
      </div>
    </form>
  );
}
