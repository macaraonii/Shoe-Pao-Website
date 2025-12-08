-- Supabase schema for ShoePao
-- Run this in Supabase SQL editor or psql against your database

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text,
  first_name text,
  last_name text,
  phone text,
  role text NOT NULL DEFAULT 'client' CHECK (role IN ('client','admin')),
  addresses jsonb,
  primary_address_id text,
  profile_picture text,
  registered_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  metadata jsonb,
  loyverse_id text -- store external loyverse id if present
);

-- Inventory (products)
CREATE TABLE IF NOT EXISTS inventory (
  id text PRIMARY KEY,
  title text NOT NULL,
  description text,
  price_cents bigint NOT NULL CHECK (price_cents >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  active boolean NOT NULL DEFAULT true,
  stock integer DEFAULT 0,
  variants jsonb,
  images jsonb DEFAULT '[]'::jsonb,
  categories text[],
  tags text[],
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  loyverse_id text UNIQUE -- external id from Loyverse
);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text UNIQUE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  buyer_email text,
  items jsonb NOT NULL,
  subtotal_cents bigint NOT NULL CHECK (subtotal_cents >= 0),
  shipping_cents bigint NOT NULL DEFAULT 0,
  tax_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  currency text NOT NULL DEFAULT 'PHP',
  status text NOT NULL DEFAULT 'pending',
  payment_method text,
  shipping_address jsonb,
  billing_address jsonb,
  notes text,
  tracking jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  loyverse_id text UNIQUE
);

-- Wishlists
CREATE TABLE IF NOT EXISTS wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  product_id text NOT NULL REFERENCES inventory(id),
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

-- Carts (one row per user)
CREATE TABLE IF NOT EXISTS carts (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inventory_loyverse_id ON inventory(loyverse_id);
CREATE INDEX IF NOT EXISTS idx_users_loyverse_id ON users(loyverse_id);
CREATE INDEX IF NOT EXISTS idx_orders_loyverse_id ON orders(loyverse_id);

-- Sample function to keep updated_at up-to-date on inventory
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_inventory_touch ON inventory;
CREATE TRIGGER trg_inventory_touch
BEFORE UPDATE ON inventory
FOR EACH ROW
EXECUTE PROCEDURE touch_updated_at();
