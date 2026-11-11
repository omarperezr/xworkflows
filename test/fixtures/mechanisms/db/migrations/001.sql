create table account (
  id int primary key,
  email text,
  qty int,
  constraint account_qty_ck check (qty >= 0)
);
create unique index account_email_uq on account (email);
alter table account enable row level security;
create policy "owner reads" on account for select using (true);
create function touch() returns trigger as $$ begin return new; end $$ language plpgsql;
create function audit_log() returns void security definer as $$ begin end $$ language plpgsql;
create trigger account_touch before update on account for each row execute function touch();
