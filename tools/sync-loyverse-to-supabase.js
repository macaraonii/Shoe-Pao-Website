// sync-loyverse-to-supabase.js
// Simple sync script: Loyverse -> Supabase using REST (server-side only)
// Usage: set env vars (see .env.example) and run: node sync-loyverse-to-supabase.js

const axios = require('axios');
require('dotenv').config();

const LOYVERSE_BASE = process.env.LOYVERSE_BASE || 'https://api.loyverse.com/v1';
const LOYVERSE_KEY = process.env.LOYVERSE_API_KEY; // set in env
const SUPABASE_URL = process.env.SUPABASE_URL; // https://xyz.supabase.co
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // server key

if(!LOYVERSE_KEY) { console.error('LOYVERSE_API_KEY not set'); process.exit(1); }
if(!SUPABASE_URL || !SUPABASE_KEY) { console.error('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set'); process.exit(1); }

const supaHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates'
};

async function fetchLoyverseItems(page = 1, per_page = 100) {
  // Adjust endpoint according to Loyverse API docs and pagination
  const url = `${LOYVERSE_BASE}/items`;
  const res = await axios.get(url, {
    headers: { Authorization: `Bearer ${LOYVERSE_KEY}` },
    params: { page, per_page }
  });
  return res.data; // inspect shape in logs
}

function mapItemToProduct(it) {
  // Basic mapping; adapt to the Loyverse response shape
  const id = it.id || (it.sku || it.code) || slugify(it.name || 'product');
  const price = (it.price && Number(it.price)) || (it.unit_price && Number(it.unit_price)) || 0;
  return {
    id: String(id),
    title: it.name || it.title || '',
    description: it.description || null,
    price_cents: Math.round(price * 100),
    currency: (it.currency || 'PHP'),
    stock: (Number(it.quantity) || Number(it.stock) || 0),
    images: JSON.stringify(it.images || []),
    categories: (it.categories ? (Array.isArray(it.categories)? it.categories : [it.categories]) : []),
    tags: (it.tags || []),
    metadata: JSON.stringify({raw: it}),
    loyverse_id: it.id || null
  };
}

function slugify(text){
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g, '').slice(0,60);
}

async function upsertInventory(product) {
  // Use Supabase REST endpoint to upsert by PK (id)
  const url = `${SUPABASE_URL}/rest/v1/inventory?on_conflict=id`;
  try {
    await axios.post(url, product, { headers: supaHeaders });
    console.log('Upserted', product.id);
  } catch (err) {
    console.error('Upsert failed', product.id, err.response ? err.response.data : err.message);
  }
}

async function syncItems() {
  console.log('Syncing items...');
  try {
    // Simple single-page fetch — you may need to loop per API pagination
    const items = await fetchLoyverseItems(1, 100);
    if(!items) { console.warn('No items returned'); return; }
    // If items is an object with data property, adjust accordingly
    const list = Array.isArray(items) ? items : (items.data || items.items || []);
    for (const it of list) {
      const p = mapItemToProduct(it);
      await upsertInventory(p);
    }
  } catch (err) {
    console.error('Sync items error', err.response ? err.response.data : err.message);
  }
}

// --- sales sync (orders)
async function fetchLoyverseSales(since) {
  const url = `${LOYVERSE_BASE}/orders`;
  const params = {};
  if(since) params.since = since; // adjust param name per Loyverse docs
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${LOYVERSE_KEY}` }, params });
  return res.data;
}

function mapSaleToOrder(sale) {
  // adapt to the Loyverse sale shape
  const items = (sale.items || sale.lines || []).map(li => ({
    product_id: li.product_id || li.item_id || li.id || null,
    sku: li.sku || null,
    title: li.name || li.title || null,
    quantity: Number(li.quantity || li.qty || 0),
    unit_price_cents: Math.round((Number(li.price || li.unit_price || 0)) * 100),
    line_total_cents: Math.round((Number(li.total || (li.price*li.quantity) || 0)) * 100)
  }));

  const subtotal = Math.round(Number(sale.total_without_tax || sale.subtotal || sale.subtotal_amount || 0) * 100);
  const total = Math.round(Number(sale.total || sale.amount || 0) * 100);

  return {
    order_number: sale.id || sale.order_no || null,
    buyer_email: (sale.customer && sale.customer.email) || sale.email || null,
    items: JSON.stringify(items),
    subtotal_cents: subtotal,
    shipping_cents: Math.round(Number(sale.shipping || 0) * 100),
    tax_cents: Math.round(Number(sale.tax || 0) * 100),
    discount_cents: Math.round(Number(sale.discount || 0) * 100),
    total_cents: total,
    currency: sale.currency || 'PHP',
    status: sale.status || 'paid',
    payment_method: sale.payment_method || null,
    shipping_address: JSON.stringify(sale.shipping_address || sale.address || {}),
    created_at: sale.created_at || sale.createdAt || new Date().toISOString(),
    loyverse_id: sale.id || null
  };
}

async function upsertOrder(order) {
  const url = `${SUPABASE_URL}/rest/v1/orders?on_conflict=loyverse_id`;
  try {
    await axios.post(url, order, { headers: supaHeaders });
    console.log('Upserted order', order.order_number || order.loyverse_id);
  } catch (err) {
    console.error('Upsert order failed', order.order_number, err.response ? err.response.data : err.message);
  }
}

async function syncSales(since) {
  console.log('Syncing sales...');
  try {
    const res = await fetchLoyverseSales(since);
    const list = Array.isArray(res) ? res : (res.data || res.sales || []);
    for (const s of list) {
      const o = mapSaleToOrder(s);
      await upsertOrder(o);
    }
  } catch (err) { console.error('Sync sales error', err.response ? err.response.data : err.message); }
}

// customers
async function fetchLoyverseCustomers(page=1, per_page=100) {
  const url = `${LOYVERSE_BASE}/customers`;
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${LOYVERSE_KEY}` }, params: { page, per_page } });
  return res.data;
}

function mapCustomerToUser(c) {
  return {
    email: (c.email || '').toLowerCase() || null,
    display_name: c.name || (c.first_name ? c.first_name + ' ' + (c.last_name||'') : null),
    first_name: c.first_name || null,
    last_name: c.last_name || null,
    phone: c.phone || null,
    role: 'client',
    addresses: JSON.stringify(c.addresses || []),
    registered_at: c.created_at || new Date().toISOString(),
    loyverse_id: c.id || null
  };
}

async function upsertUser(user) {
  // Upsert on loyverse_id if exists; else upsert on email
  const url = `${SUPABASE_URL}/rest/v1/users?on_conflict=loyverse_id`;
  try {
    await axios.post(url, user, { headers: supaHeaders });
    console.log('Upserted user', user.email || user.loyverse_id);
  } catch (err) {
    console.error('Upsert user failed', user.email, err.response ? err.response.data : err.message);
  }
}

async function syncCustomers() {
  console.log('Syncing customers...');
  try {
    const res = await fetchLoyverseCustomers(1,100);
    const list = Array.isArray(res) ? res : (res.data || res.customers || []);
    for (const c of list) {
      const u = mapCustomerToUser(c);
      await upsertUser(u);
    }
  } catch (err) { console.error('Sync customers error', err.response ? err.response.data : err.message); }
}

// Main
(async function main(){
  console.log('Starting Loyverse -> Supabase sync');
  try {
    await syncItems();
    await syncCustomers();
    // pass 'since' param if you store last sync timestamp
    await syncSales();
    console.log('Sync completed');
  } catch (err) {
    console.error('Sync failed', err.message || err);
  }
})();
