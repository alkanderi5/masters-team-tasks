'use client';

import { useRouter } from 'next/navigation';

export function EmployeeSwitcher({ current, employees }: { current: string; employees: { id: string; name: string }[] }) {
  const router = useRouter();
  return (
    <>
      <label htmlFor="emp-switch" className="sr-only">Switch employee</label>
      <select
        id="emp-switch"
        className="select"
        style={{ width: 'auto' }}
        value={current}
        onChange={(e) => router.push(`/employees/${e.target.value}`)}
      >
        {employees.map((e) => (
          <option key={e.id} value={e.id}>{e.name}</option>
        ))}
      </select>
    </>
  );
}
