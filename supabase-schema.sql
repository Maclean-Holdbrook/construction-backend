create extension if not exists pgcrypto;

create table if not exists public.products (
  id text primary key,
  name text not null,
  category text not null,
  price numeric(12,2) not null check (price > 0),
  unit text not null,
  badge text not null,
  stock text not null,
  description text not null,
  image_url text not null
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  phone text not null,
  address text not null,
  password_hash text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz null
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  customer_id uuid null references public.customers(id) on delete set null,
  customer jsonb not null,
  cart jsonb not null default '[]'::jsonb,
  totals jsonb not null,
  amount_kobo integer not null check (amount_kobo > 0),
  payment_status text not null,
  order_status text not null,
  created_at timestamptz not null default timezone('utc', now()),
  paid_at timestamptz null,
  gateway_response text null,
  retry_of text null,
  last_checked_at timestamptz null,
  updated_at timestamptz null
);

alter table if exists public.orders
  add column if not exists customer_id uuid null references public.customers(id) on delete set null;

insert into public.products (id, name, category, price, unit, badge, stock, description, image_url)
values
  ('diamond-cement-50kg', 'Diamond Cement 50kg', 'Cement', 88.00, 'per bag', 'Best Seller', 'In Stock', 'High-strength cement suitable for block work, casting, and reinforced concrete jobs.', '/products/cement.jpg'),
  ('concrete-block-6-inch', '6-Inch Concrete Block', 'Blocks', 14.00, 'per block', 'Site Essential', 'In Stock', 'Standard concrete blocks for walling, fencing, and residential site development.', '/products/blocks.jpg'),
  ('river-sand-load', 'River Sand Load', 'Sand', 1950.00, 'per trip', 'Bulk Order', 'In Stock', 'Clean construction sand suitable for plastering, mortar mixing, and screeding.', '/products/sand.jpg'),
  ('iron-rod-12mm', '12mm Iron Rod', 'Iron Rods', 148.00, 'per length', 'High Demand', 'In Stock', 'Reliable reinforcement rod for slabs, beams, columns, and commercial structural work.', '/products/iron-rods.jpg'),
  ('crushed-stones-aggregate', 'Crushed Stones Aggregate', 'Stones', 1650.00, 'per cubic yard', 'Foundation Mix', 'In Stock', 'Crushed aggregate for foundations, concrete mixing, drainage layers, and hardscaping.', '/products/stones.jpg')
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  price = excluded.price,
  unit = excluded.unit,
  badge = excluded.badge,
  stock = excluded.stock,
  description = excluded.description,
  image_url = excluded.image_url;
