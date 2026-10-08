import { requireMe } from '@/lib/auth';
import { listEmployees } from '@/lib/queries';
import { SectionHead } from '@/components/ui';
import { AddEmployeeButton, EditEmployeeButton, PasswordForm } from './SettingsForms';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const me = await requireMe();
  const team = me.isManager ? await listEmployees({ includeInactive: true }) : [];
  const serviceKeySet = !!process.env.SUPABASE_SERVICE_ROLE_KEY;

  return (
    <>
      <div className="head">
        <div>
          <h1>Settings</h1>
          <div className="sub">Signed in as {me.email}</div>
        </div>
      </div>

      <div className="cols">
        {me.isManager && (
          <section className="col-main">
            <div>
              <SectionHead title={`Team · ${team.filter((e) => e.active).length} active`} right={<AddEmployeeButton canCreateLogins={serviceKeySet} />} />
              {!serviceKeySet && (
                <div className="notice small">
                  Login accounts can’t be created until SUPABASE_SERVICE_ROLE_KEY is set on the server. You can still add
                  employees without a login and track their work.
                </div>
              )}
              <div className="card tbl-wrap">
                <table className="tbl" style={{ minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Position</th>
                      <th>Role</th>
                      <th>Login</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {team.map((e) => (
                      <tr key={e.id} style={{ opacity: e.active ? 1 : 0.6 }}>
                        <td style={{ fontWeight: 500 }}>{e.name}</td>
                        <td className="muted">{e.position || '—'}</td>
                        <td>{e.role === 'manager' ? 'Manager' : 'Employee'}</td>
                        <td className="muted">{e.user_id ? 'Yes' : 'No login'}</td>
                        <td>{e.active ? 'Active' : 'Deactivated'}</td>
                        <td style={{ textAlign: 'right' }}>
                          <EditEmployeeButton
                            employee={{ id: e.id, name: e.name, position: e.position, role: e.role, active: e.active, hasLogin: !!e.user_id }}
                            isSelf={e.id === me.employee.id}
                            canCreateLogins={serviceKeySet}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted" style={{ marginTop: 8 }}>
                Employees are never deleted, so their history stays complete. Deactivating blocks their login and hides
                them from assignment lists.
              </p>
            </div>
          </section>
        )}

        <section className="col-side">
          <div className="card pad">
            <h2 className="sec" style={{ marginBottom: 12 }}>Change your password</h2>
            <PasswordForm />
          </div>
        </section>
      </div>
    </>
  );
}
