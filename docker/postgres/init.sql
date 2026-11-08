do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cognera_app') then
    create role cognera_app login password 'cognera_local_app'
      nosuperuser nobypassrls nocreatedb nocreaterole;
  end if;
end
$$;
