-- Migración 040: Web Push API para notificaciones nativas
-- Tabla para almacenar suscripciones de push de los usuarios

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  company_id uuid not null references companies(id) on delete cascade,
  endpoint text not null, -- URL única del navegador para recibir push
  auth text not null, -- Credencial de autenticación
  p256dh text not null, -- Clave de cifrado
  user_agent text, -- Para rastrear qué navegador/dispositivo
  created_at timestamp with time zone default now(),
  last_seen_at timestamp with time zone default now(),

  -- Índices para búsquedas rápidas
  unique(endpoint), -- Endpoint es único por navegador
  constraint push_subscriptions_company_id_fk
    foreign key (company_id)
    references companies(id)
    on delete cascade
);

-- RLS: cada usuario ve solo sus suscripciones; super_admin ve todas de su empresa
alter table push_subscriptions enable row level security;

create policy "Users see own push subscriptions"
  on push_subscriptions
  for select
  using (
    auth.uid() = (select supabase_auth_id from users where id = user_id)
    or (
      company_id = (select company_id from users where supabase_auth_id = auth.uid())
      and (select role from users where supabase_auth_id = auth.uid()) in ('admin', 'developer', 'super_admin')
    )
  );

create policy "Users insert own push subscriptions"
  on push_subscriptions
  for insert
  with check (
    auth.uid() = (select supabase_auth_id from users where id = user_id)
  );

create policy "Users delete own push subscriptions"
  on push_subscriptions
  for delete
  using (
    auth.uid() = (select supabase_auth_id from users where id = user_id)
  );

-- Índice para búsquedas por usuario
create index push_subscriptions_user_id_idx on push_subscriptions(user_id);
create index push_subscriptions_company_id_idx on push_subscriptions(company_id);
