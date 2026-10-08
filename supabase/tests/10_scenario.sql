\set ON_ERROR_STOP 1
insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a','ali@x'),
 ('00000000-0000-0000-0000-00000000000b','mohammed@x'),
 ('00000000-0000-0000-0000-00000000000c','hussein@x'),
 ('00000000-0000-0000-0000-00000000000d','outsider@x');

set role authenticated;
-- Ali bootstraps as first manager
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.needs_bootstrap() as needs_bootstrap_before;
select public.bootstrap_first_manager('Ali') is not null as bootstrapped;
select public.needs_bootstrap() as needs_bootstrap_after;
\set QUIET 1
select public.create_employee('Mohammed','Events','employee','00000000-0000-0000-0000-00000000000b') as mo \gset
select public.create_employee('Hussein','Media','employee','00000000-0000-0000-0000-00000000000c') as hu \gset
select public.create_employee('NoLogin','Cleaner','employee',null) as nl \gset

select public.create_task('Prepare Wednesday Tournament','Weekly 9-ball', :'mo', null) as tour \gset
select public.create_task('Prepare Tables', null, null, :'tour') as tables \gset
select public.create_task('Live Stream', null, :'hu', :'tour') as stream \gset
select public.create_task('Check Lighting', null, null, :'tables') as light \gset
select public.create_task('Check Balls', null, null, :'tables') as balls \gset
select public.create_task('Other job', null, :'nl', null) as other \gset
\set QUIET 0

-- Mohammed works
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.set_task_status(:'tour','in_progress');
select public.create_task('Replace Bulb', null, null, :'light') is not null as mo_added_subtask;
select public.set_task_status(:'light','blocked','Waiting for replacement light.');
select public.set_task_status(:'light','blocked','Waiting for approval.');  -- reason change
select count(*) as mo_visible_tasks from public.tasks;   -- whole tournament tree (6), not "Other job"
select count(*) as mo_sees_other from public.tasks where id = :'other';

-- Employee may not do manager things
do $$ begin
  perform public.create_task('Root by employee', null, null, null);
  raise exception 'SHOULD HAVE FAILED';
exception when others then
  if sqlerrm = 'SHOULD HAVE FAILED' then raise; end if;
  raise notice 'OK refused: %', sqlerrm;
end $$;
do $$ begin
  perform public.set_task_status((select id from public.tasks where title='Live Stream'), 'in_progress');
  raise exception 'SHOULD HAVE FAILED';
exception when others then
  if sqlerrm = 'SHOULD HAVE FAILED' then raise; end if;
  raise notice 'OK refused: %', sqlerrm;
end $$;
do $$ begin
  insert into public.tasks(title, employee_id, created_by) values ('x', public.current_employee_id(), public.current_employee_id());
  raise exception 'SHOULD HAVE FAILED';
exception when others then
  if sqlerrm = 'SHOULD HAVE FAILED' then raise; end if;
  raise notice 'OK direct insert refused: %', sqlerrm;
end $$;
do $$ begin
  perform public.set_task_status((select id from public.tasks where title='Check Balls'), 'blocked', '  ');
  raise exception 'SHOULD HAVE FAILED';
exception when others then
  if sqlerrm = 'SHOULD HAVE FAILED' then raise; end if;
  raise notice 'OK blank reason refused: %', sqlerrm;
end $$;

select public.dashboard_counts();

-- Job Done on parent with unfinished children -> needs confirmation
select public.complete_task(:'tables') as first_try;
select public.set_task_status(:'light','in_progress');   -- unblock
select public.complete_task(:'tables', true) as forced;
select title, status, is_active, ancestor_closed from public.task_list order by depth, title;

-- Manager reopens
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.reopen_task(:'tables');
select title, status, is_active from public.task_list where id in (:'tables', :'light');
select public.complete_task(:'light');
select public.cancel_task(:'other', 'Created by mistake');
select public.reassign_task(:'tour', :'hu', true);
select title, employee_name from public.task_list order by depth, title;

select action, old_value, new_value, note, performed_by_name, task_title
  from public.activity_feed order by id;

select * from public.employee_summaries();
select public.dashboard_counts();

-- Append-only + no delete
reset role;
do $$ begin
  update public.task_history set note = 'tamper' where id = 1;
  raise exception 'SHOULD HAVE FAILED';
exception when others then
  if sqlerrm = 'SHOULD HAVE FAILED' then raise; end if;
  raise notice 'OK history update refused: %', sqlerrm;
end $$;
do $$ begin
  delete from public.tasks where title = 'Other job';
  raise exception 'SHOULD HAVE FAILED';
exception when others then
  if sqlerrm = 'SHOULD HAVE FAILED' then raise; end if;
  raise notice 'OK delete refused: %', sqlerrm;
end $$;

-- Outsider (no employee row) sees nothing
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select (select count(*) from public.tasks) tasks, (select count(*) from public.employees) emps;
set role anon;
do $$ begin
  perform public.dashboard_counts();
  raise exception 'SHOULD HAVE FAILED';
exception when others then
  if sqlerrm = 'SHOULD HAVE FAILED' then raise; end if;
  raise notice 'OK anon refused: %', sqlerrm;
end $$;
