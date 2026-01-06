// Footwear Inventory Manager
// Data model and client-side storage
(function() {
  const EU_SIZES = Array.from({ length: 11 }, (_, i) => 35 + i); // 35..45
  const STORAGE_KEYS = {
    inventory: 'shoeInventoryData',
    sales: 'shoeSalesLog',
    settings: 'shoeInventorySettings'
  };

  const defaultSettings = { lowStockThreshold: 3 };

  const state = {
    products: [],
    sales: [],
    settings: { ...defaultSettings },
    ui: {
      selectedTab: 'inventory',
      bulkMode: false,
      selectedProductIds: new Set(),
      editingProductId: null,
      editingVariantProductId: null,
      productModalColors: [],
      productModalImages: [],
      reports: { timeframe: 'all', open: { low: false, sizes: false, brands: false, dead: false } }
    }
  };

  // Utilities
  const uid = (p='id') => `${p}-${Math.random().toString(36).slice(2, 9)}`;
  const clampNum = (n, min, max) => Math.max(min, Math.min(max, n));
  const parseNum = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  // SKU generation: SP-BBB-MMMM-XXXX
  function generateProductSKU(brand, model, category) {
    const prefix = 'SP';
    const clean = (str, len, removeVowels = false) => {
      let s = String(str || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (removeVowels) s = s.replace(/[AEIOU]/g, '');
      if (!s) s = 'X'.repeat(len);
      return s.slice(0, len);
    };
    const b = clean(brand, 3);
    const m = clean(model, 4, false);
    const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,4);
    let base = `${prefix}-${b}-${m}-${rand}`;
    // Ensure uniqueness if state is available
    if (state && Array.isArray(state.products)) {
      if (!state.products.some(p => p.sku === base)) return base;
      let i = 1; let sku = `${base}-${i}`;
      while (state.products.some(p => p.sku === sku)) { i++; sku = `${base}-${i}`; }
      return sku;
    }
    return base;
  }

  function displayNameFromUrl(url) {
    try {
      if (!url) return 'image';
      if (url.startsWith('data:')) {
        const mime = url.slice(5).split(';')[0];
        const ext = (mime.split('/')[1] || 'img').toLowerCase();
        return `image.${ext}`;
      }
      const u = new URL(url, window.location.origin);
      const seg = u.pathname.split('/').filter(Boolean);
      return seg.length ? seg[seg.length - 1] : url;
    } catch {
      return 'image';
    }
  }

  const ls = {
    get(key, fallback) {
      try { const txt = localStorage.getItem(key); return txt ? JSON.parse(txt) : fallback; } catch { return fallback; }
    },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
  };

  // Data helpers
  function ensureSizes() {
    return EU_SIZES.map(eu => ({ eu, stock: 0, sku: '' }));
  }

  function newColor(name, code) {
    return { id: uid('color'), name, code: code || '#ffffff', sizes: ensureSizes() };
  }

  function newProduct({ brand, model, category, status = 'active', images = [], pricing = {}, description = '', sku = '' }) {
    return {
      id: uid('prod'), brand, model, category, status,
      images, pricing: {
        original: parseNum(pricing.original, 0),
        sale: parseNum(pricing.sale, 0),
        cost: parseNum(pricing.cost, 0)
      },
      description,
      sku: sku || generateProductSKU(brand, model, category),
      colors: []
    };
  }

  function totalStockForProduct(p) {
    return p.colors.reduce((acc, c) => acc + c.sizes.reduce((sacc, s) => sacc + s.stock, 0), 0);
  }

  function totalStockForColor(c) {
    return c.sizes.reduce((acc, s) => acc + s.stock, 0);
  }

  function availableSizes(c) {
    return c.sizes.filter(s => s.stock > 0).map(s => s.eu);
  }

  // Persistence
  function loadAll() {
    state.products = ls.get(STORAGE_KEYS.inventory, []);
    state.sales = ls.get(STORAGE_KEYS.sales, []);
    state.settings = { ...defaultSettings, ...(ls.get(STORAGE_KEYS.settings, {})) };
  }

  function saveAll() {
    ls.set(STORAGE_KEYS.inventory, state.products);
    ls.set(STORAGE_KEYS.sales, state.sales);
    ls.set(STORAGE_KEYS.settings, state.settings);
  }

  // Sample data
  function seedSampleIfEmpty() {
    if (state.products && state.products.length) return;
    const p1 = newProduct({ brand: 'Nike', model: 'Air Max 90', category: 'Sneakers', images: ['IMAGE/AIRMAXWHITE.avif'] });
    const p2 = newProduct({ brand: 'Adidas', model: 'Ultraboost 22', category: 'Running' });
    const p3 = newProduct({ brand: 'Converse', model: 'Chuck Taylor', category: 'Casual' });

    p1.colors.push(newColor('White', '#ffffff'));
    p1.colors.push(newColor('Black', '#000000'));
    p2.colors.push(newColor('Core Black', '#111111'));
    p2.colors.push(newColor('Solar Red', '#ff3b3b'));
    p3.colors.push(newColor('Optical White', '#ffffff'));

    // Randomize initial stock
    [p1, p2, p3].forEach(p => p.colors.forEach(c => c.sizes.forEach(s => s.stock = Math.floor(Math.random() * 8))));

    state.products = [p1, p2, p3];
    saveAll();
  }

  // UI binding helpers
  const qs = (sel) => document.querySelector(sel);
  const qsa = (sel) => Array.from(document.querySelectorAll(sel));

  function switchTab(tab) {
    state.ui.selectedTab = tab;
    qsa('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    qsa('.tab').forEach(s => s.classList.toggle('active', s.id === `tab-${tab}`));
    renderAll();
  }

  function populateFilters() {
    const brands = Array.from(new Set(state.products.map(p => p.brand))).sort();
    const categories = Array.from(new Set(state.products.map(p => p.category))).sort();
    const brandSel = qs('#filterBrand');
    const catSel = qs('#filterCategory');
    brandSel.innerHTML = '<option value="">All Brands</option>' + brands.map(b => `<option>${b}</option>`).join('');
    catSel.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option>${c}</option>`).join('');

    const sizeSel = qs('#filterSize');
    sizeSel.innerHTML = '<option value="">Any Size</option>' + EU_SIZES.map(s => `<option value="${s}">${s}EU</option>`).join('');
  }

  // Inventory listing
  function renderProductsTable() {
    const tbody = qs('#productsTbody');
    const text = qs('#searchInput').value.toLowerCase();
    const filterBrand = qs('#filterBrand').value;
    const filterCat = qs('#filterCategory').value;
    const filterSize = qs('#filterSize').value;
    const filterStock = qs('#filterStock').value; // '', 'low', 'out', 'in'
    const filterStatus = qs('#filterStatus') ? qs('#filterStatus').value : '';
    const threshold = state.settings.lowStockThreshold;

    const filtered = state.products.filter(p => {
      const matchesText = !text || [p.brand, p.model, p.category].join(' ').toLowerCase().includes(text) || p.colors.some(c => c.name.toLowerCase().includes(text));
      const matchesBrand = !filterBrand || p.brand === filterBrand;
      const matchesCat = !filterCat || p.category === filterCat;
      // If a specific size is selected, consider size existence; allow out-of-stock when filtering 'out'
      const matchesSize = !filterSize || p.colors.some(c => c.sizes.some(s => String(s.eu) === filterSize && (filterStock === 'out' ? true : s.stock > 0)));
      // Determine stock status: use total product stock, or size-specific total when a size filter is applied
      const total = !filterSize
        ? totalStockForProduct(p)
        : p.colors.reduce((acc, c) => acc + c.sizes.reduce((sacc, s) => sacc + (String(s.eu) === filterSize ? s.stock : 0), 0), 0);
      const stockStatus = total === 0 ? 'out' : (total <= threshold ? 'low' : 'in');
      const matchesStock = !filterStock || stockStatus === filterStock;
      const matchesStatus = !filterStatus || p.status === filterStatus;
      return matchesText && matchesBrand && matchesCat && matchesSize && matchesStock && matchesStatus;
    });

    tbody.innerHTML = filtered.map(p => {
      const colors = p.colors.map(c => {
        const stock = totalStockForColor(c);
        const status = stock === 0 ? 'out' : (stock <= threshold ? 'low' : 'in');
        return `<span class="badge ${status}" title="${availableSizes(c).join(', ') || 'None'}">${c.name} (${stock})</span>`;
      }).join(' ');
      const total = totalStockForProduct(p);
      const totalStatus = total === 0 ? 'out' : (total <= threshold ? 'low' : 'in');
      const price = `₱${p.pricing.sale || p.pricing.original || 0}`;
      const bulkBox = state.ui.bulkMode ? `<input type="checkbox" class="bulkSel" data-id="${p.id}" ${state.ui.selectedProductIds.has(p.id) ? 'checked' : ''}/>` : '';
      const catDisplay = (p.category || '').trim();
      return `<tr>
        <td class="bulk-col">${bulkBox}</td>
        <td>${p.brand}</td>
        <td>${p.sku || ''}</td>
        <td>${p.model}</td>
        <td>${catDisplay}</td>
        <td class="status ${p.status}">${p.status}</td>
        <td class="colors-cell">${colors || '<span class=\"badge out\">No colors</span>'}</td>
        <td><span class="badge ${totalStatus}">${total}</span></td>
        <td>${price}</td>
        <td>
          <button class="secondary" data-action="edit" data-id="${p.id}">Edit</button>
          <button class="secondary" data-action="variants" data-id="${p.id}">Variants</button>
          <button class="danger" data-action="delete" data-id="${p.id}">Delete</button>
        </td>
      </tr>`;
    }).join('');

    qsa('.bulkSel').forEach(cb => cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id; if (e.target.checked) state.ui.selectedProductIds.add(id); else state.ui.selectedProductIds.delete(id);
      updateSelectedCount();
    }));

    updateSelectedCount();

    // Bind row actions
    qsa('[data-action="edit"]').forEach(btn => btn.addEventListener('click', () => openProductModal(btn.dataset.id)));
    qsa('[data-action="variants"]').forEach(btn => btn.addEventListener('click', () => openVariantModal(btn.dataset.id)));
    qsa('[data-action="delete"]').forEach(btn => btn.addEventListener('click', () => deleteProduct(btn.dataset.id)));
  }

  function updateSelectedCount() {
    const el = qs('#selectedCount'); if (!el) return;
    el.textContent = String(state.ui.selectedProductIds.size);
  }

  // Product modal
  function openProductModal(productId) {
    const dlg = qs('#productModal');
    const isEdit = !!productId;
    state.ui.editingProductId = productId || null;
    qs('#productModalTitle').textContent = isEdit ? 'Edit Product' : 'Add Product';
    const brand = qs('#prodBrand');
    const model = qs('#prodModel');
    const cat = qs('#prodCategory');
    const statusSel = qs('#prodStatus');
    const pOrig = qs('#priceOriginal');
    const pSale = qs('#priceSale');
    const pCost = qs('#priceCost');
    const skuEl = qs('#prodSKU');
    const descEl = qs('#prodDescription');
    // images handled via state.ui.productModalImages

    if (isEdit) {
      const p = state.products.find(x => x.id === productId);
      brand.value = p.brand; model.value = p.model; cat.value = p.category || ''; statusSel.value = p.status;
      pOrig.value = p.pricing.original || ''; pSale.value = p.pricing.sale || ''; pCost.value = p.pricing.cost || '';
      if (skuEl) skuEl.value = p.sku || '';
      if (descEl) descEl.value = p.description || '';
      state.ui.productModalImages = Array.isArray(p.images) ? p.images.map(url => ({ url, name: displayNameFromUrl(url) })) : [];
      renderImagesList();
      // Hide initial variant builder on edit; use Variants modal instead
      const initSec = qs('#initialVariantSection'); if (initSec) initSec.style.display = 'none';
      state.ui.productModalColors = [];
    } else {
      brand.value = ''; model.value = ''; cat.value = ''; statusSel.value = 'active'; pOrig.value = ''; pSale.value = ''; pCost.value = '';
      if (skuEl) skuEl.value = '';
      if (descEl) descEl.value = '';
      // Show initial variant builder on add
      const initSec = qs('#initialVariantSection'); if (initSec) initSec.style.display = 'block';
      state.ui.productModalColors = [];
      state.ui.productModalImages = [];
      renderImagesList();
      renderInitialVariants();
    }

    dlg.showModal();
  }

  function saveProductFromModal() {
    const brand = qs('#prodBrand').value.trim();
    const model = qs('#prodModel').value.trim();
    const cat = qs('#prodCategory').value.trim();
    const statusSel = qs('#prodStatus').value;
    const pOrig = parseNum(qs('#priceOriginal').value, 0);
    const pSale = parseNum(qs('#priceSale').value, 0);
    const pCost = parseNum(qs('#priceCost').value, 0);
    const skuPreview = (qs('#prodSKU')?.value || '').trim();
    const desc = (qs('#prodDescription')?.value || '').trim();

    if (!brand || !model) { alert('Brand and Model are required'); return; }
    if (pOrig <= 0) { alert('Original price is required'); return; }
    if (!state.ui.productModalImages || state.ui.productModalImages.length < 2) { alert('Add at least two images'); return; }

    const pid = state.ui.editingProductId;
    if (pid) {
      const p = state.products.find(x => x.id === pid);
      // Confirm archiving when changing status to archived
      if (statusSel === 'archived' && p.status !== 'archived') {
        const ok = confirm(`Archive ${p.brand} ${p.model}?\nArchived products are hidden from active listings.`);
        if (!ok) { return; }
      }
      p.brand = brand; p.model = model; p.category = cat; p.status = statusSel;
      p.pricing.original = pOrig; p.pricing.sale = pSale; p.pricing.cost = pCost;
      // Keep existing SKU unless empty; regenerate if missing
      if (!p.sku) p.sku = generateProductSKU(brand, model, cat);
      p.description = desc;
      p.images = state.ui.productModalImages.map(it => it.url);
    } else {
      // Require at least one color with sizes when adding
      const colors = state.ui.productModalColors.filter(c => (c.name || '').trim().length);
      if (!colors.length) { alert('Add at least one color with stock'); return; }
      if (statusSel === 'archived') {
        const ok = confirm('Create this product in archived state?');
        if (!ok) { return; }
      }
      const newP = newProduct({ brand, model, category: cat, status: statusSel, images: [], pricing: { original: pOrig, sale: pSale, cost: pCost }, description: desc });
      newP.images = state.ui.productModalImages.map(it => it.url);
      // Copy colors and sizes
      newP.colors = colors.map(c => ({ id: c.id, name: c.name, code: c.code, sizes: c.sizes.map(s => ({ eu: s.eu, stock: clampNum(parseNum(s.stock,0), 0, 9999), sku: s.sku || '' })) }));
      state.products.push(newP);
    }
    saveAll();
    qs('#productModal').close();
    renderAll();
  }

  function deleteProduct(id) {
    if (!confirm('Delete this product?')) return;
    state.products = state.products.filter(p => p.id !== id);
    saveAll();
    renderAll();
  }

  // Images management in Add/Edit Product modal
  function renderImagesList() {
    const list = qs('#imagesList'); if (!list) return;
    const raw = state.ui.productModalImages || [];
    const imgs = raw.map(it => (typeof it === 'string' ? { url: it, name: displayNameFromUrl(it) } : it));
    state.ui.productModalImages = imgs;
    list.innerHTML = imgs.map((item, idx) => `<div class="image-item" data-index="${idx}">
      <img src="${item.url}" alt="Product image ${idx+1}" />
      <span class="image-name" title="${item.name}">${item.name}</span>
      <div class="image-actions">
        <button class="danger" data-action="remove-image">Remove</button>
      </div>
    </div>`).join('');
    list.querySelectorAll('[data-action="remove-image"]').forEach(btn => btn.addEventListener('click', () => {
      const idx = parseNum(btn.closest('.image-item').dataset.index, -1);
      if (idx >= 0) {
        state.ui.productModalImages.splice(idx, 1);
        renderImagesList();
      }
    }));
  }

  function addImagesFromFileInput() {
    const inp = qs('#imageFileInput'); if (!inp) return;
    const files = Array.from(inp.files || []);
    if (!files.length) { alert('Choose image files'); return; }
    const readers = files.map(file => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve({ url: fr.result, name: file.name });
      fr.onerror = reject;
      fr.readAsDataURL(file);
    }));
    Promise.all(readers)
      .then(items => { state.ui.productModalImages.push(...items); renderImagesList(); inp.value = ''; })
      .catch(() => alert('Failed to import one or more images'));
  }

  // Variants modal
  function openVariantModal(productId) {
    const dlg = qs('#variantModal');
    state.ui.editingVariantProductId = productId;
    const p = state.products.find(x => x.id === productId);
    const list = qs('#variantColorsList');
    list.innerHTML = p.colors.map(c => `<div class="color-item" data-id="${c.id}">
      <span class="color-dot" style="background:${c.code}"></span>
      <strong>${c.name}</strong>
      <span class="muted">(${totalStockForColor(c)})</span>
      <div class="color-actions">
        <button class="secondary" data-action="edit-color">Edit</button>
        <button class="danger" data-action="delete-color">Delete</button>
      </div>
    </div>`).join('');

    bindColorActions(list);
    renderSizesEditor(p);

    dlg.showModal();
  }

  function bindColorActions(list) {
    list.querySelectorAll('[data-action="edit-color"]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.closest('.color-item').dataset.id;
      const p = state.products.find(x => x.id === state.ui.editingVariantProductId);
      const c = p.colors.find(y => y.id === id);
      const name = prompt('Color name', c.name);
      if (name === null) return;
      const code = prompt('Color hex (#rrggbb)', c.code);
      if (code === null) return;
      c.name = name.trim() || c.name; c.code = code || c.code; saveAll(); openVariantModal(p.id);
    }));
    list.querySelectorAll('[data-action="delete-color"]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.closest('.color-item').dataset.id;
      const p = state.products.find(x => x.id === state.ui.editingVariantProductId);
      if (!confirm('Delete this color variant?')) return;
      p.colors = p.colors.filter(y => y.id !== id);
      saveAll(); openVariantModal(p.id);
    }));
  }

  function renderSizesEditor(p) {
    const editor = qs('#sizesEditor');
    editor.innerHTML = '';
    if (!p.colors.length) {
      editor.innerHTML = '<p class="muted">No colors yet. Add one above.</p>';
      return;
    }
    p.colors.forEach(color => {
      const card = document.createElement('div'); card.className = 'size-card';
      const fill = document.createElement('div'); fill.className = 'fill-actions';
      fill.innerHTML = `<strong>${color.name}</strong>
        <button class="secondary" data-action="fill-all" data-id="${color.id}">Fill all sizes</button>
        <button class="secondary" data-action="clear-all" data-id="${color.id}">Clear</button>`;
      card.appendChild(fill);
      const grid = document.createElement('div'); grid.className = 'size-grid';
      EU_SIZES.forEach(eu => {
        const s = color.sizes.find(x => x.eu === eu);
        const row = document.createElement('div'); row.className = 'size-row';
        row.innerHTML = `<label>${eu}EU</label><input type="number" min="0" step="1" value="${s.stock}" data-color="${color.id}" data-size="${eu}" />`;
        grid.appendChild(row);
      });
      card.appendChild(grid);
      editor.appendChild(card);
    });

    // Bind fill actions and size inputs
    editor.querySelectorAll('[data-action="fill-all"]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const qty = parseNum(prompt('Set stock for all sizes to:'), null);
      if (qty === null) return;
      const p = state.products.find(x => x.id === state.ui.editingVariantProductId);
      const c = p.colors.find(y => y.id === id);
      c.sizes.forEach(s => s.stock = clampNum(qty, 0, 9999));
      saveAll(); openVariantModal(p.id);
    }));
    editor.querySelectorAll('[data-action="clear-all"]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const p = state.products.find(x => x.id === state.ui.editingVariantProductId);
      const c = p.colors.find(y => y.id === id);
      if (!confirm('Clear all stock for this color? This cannot be undone.')) return;
      c.sizes.forEach(s => s.stock = 0);
      saveAll(); openVariantModal(p.id);
    }));

    editor.querySelectorAll('input[type="number"]').forEach(inp => inp.addEventListener('change', (e) => {
      const colorId = Number.isNaN(Number(e.target.dataset.color)) ? e.target.dataset.color : e.target.dataset.color;
      const eu = parseNum(e.target.dataset.size);
      const qty = clampNum(parseNum(e.target.value), 0, 9999);
      const p = state.products.find(x => x.id === state.ui.editingVariantProductId);
      const c = p.colors.find(y => y.id === colorId);
      const s = c.sizes.find(z => z.eu === eu);
      s.stock = qty; saveAll();
    }));
  }

  function addColorFromModal() {
    const name = qs('#variantColorName').value.trim();
    const code = qs('#variantColorCode').value || '#ffffff';
    if (!name) { alert('Enter a color name'); return; }
    const p = state.products.find(x => x.id === state.ui.editingVariantProductId);
    p.colors.push(newColor(name, code));
    saveAll();
    qs('#variantColorName').value = '';
    openVariantModal(p.id);
  }

  // Initial variants in Add Product modal
  function addInitialColorFromModal() {
    const name = qs('#initialColorName').value.trim();
    const code = qs('#initialColorCode').value || '#ffffff';
    if (!name) { alert('Enter a color name'); return; }
    state.ui.productModalColors.push(newColor(name, code));
    qs('#initialColorName').value = '';
    renderInitialVariants();
  }

  function bindInitialColorActions(list) {
    list.querySelectorAll('[data-action="edit-init-color"]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.closest('.color-item').dataset.id;
      const c = state.ui.productModalColors.find(y => y.id === id);
      const name = prompt('Color name', c.name);
      if (name === null) return;
      const code = prompt('Color hex (#rrggbb)', c.code);
      if (code === null) return;
      c.name = name.trim() || c.name; c.code = code || c.code; renderInitialVariants();
    }));
    list.querySelectorAll('[data-action="delete-init-color"]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.closest('.color-item').dataset.id;
      state.ui.productModalColors = state.ui.productModalColors.filter(y => y.id !== id);
      renderInitialVariants();
    }));
  }

  function renderInitialVariants() {
    const colors = state.ui.productModalColors;
    const list = qs('#initialColorsList');
    const editor = qs('#initialSizesEditor');
    if (!list || !editor) return;
    list.innerHTML = colors.map(c => `<div class="color-item" data-id="${c.id}">
      <span class="color-dot" style="background:${c.code}"></span>
      <strong>${c.name || '(unnamed)'}</strong>
      <span class="muted">(${totalStockForColor(c)})</span>
      <div class="color-actions">
        <button class="secondary" data-action="edit-init-color">Edit</button>
        <button class="danger" data-action="delete-init-color">Delete</button>
      </div>
    </div>`).join('');
    bindInitialColorActions(list);

    editor.innerHTML = '';
    if (!colors.length) {
      editor.innerHTML = '<p class="muted">Add a color above to set stock.</p>';
      return;
    }
    colors.forEach(color => {
      const card = document.createElement('div'); card.className = 'size-card';
      const fill = document.createElement('div'); fill.className = 'fill-actions';
      fill.innerHTML = `<strong>${color.name}</strong>
        <button class="secondary" data-action="fill-all-init" data-id="${color.id}">Fill all sizes</button>
        <button class="secondary" data-action="clear-all-init" data-id="${color.id}">Clear</button>`;
      card.appendChild(fill);
      const grid = document.createElement('div'); grid.className = 'size-grid';
      EU_SIZES.forEach(eu => {
        const s = color.sizes.find(x => x.eu === eu) || { eu, stock: 0 };
        const row = document.createElement('div'); row.className = 'size-row';
        row.innerHTML = `<label>${eu}EU</label><input type="number" min="0" step="1" value="${s.stock}" data-init-color="${color.id}" data-size="${eu}" />`;
        grid.appendChild(row);
      });
      card.appendChild(grid);
      editor.appendChild(card);
    });

    // Bind fill and inputs
    editor.querySelectorAll('[data-action="fill-all-init"]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const qty = parseNum(prompt('Set stock for all sizes to:'), null);
      if (qty === null) return;
      const c = state.ui.productModalColors.find(y => y.id === id);
      c.sizes.forEach(s => s.stock = clampNum(qty, 0, 9999));
      renderInitialVariants();
    }));
    editor.querySelectorAll('[data-action="clear-all-init"]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const c = state.ui.productModalColors.find(y => y.id === id);
      if (!confirm('Clear all stock for this color? This cannot be undone.')) return;
      c.sizes.forEach(s => s.stock = 0);
      renderInitialVariants();
    }));
    editor.querySelectorAll('input[type="number"]').forEach(inp => inp.addEventListener('change', (e) => {
      const colorId = e.target.dataset.initColor;
      const eu = parseNum(e.target.dataset.size);
      const qty = clampNum(parseNum(e.target.value), 0, 9999);
      const c = state.ui.productModalColors.find(y => y.id === colorId);
      const s = c.sizes.find(z => z.eu === eu);
      if (s) s.stock = qty; else c.sizes.push({ eu, stock: qty, sku: '' });
    }));
  }

  function saveVariantsModal() {
    qs('#variantModal').close();
    renderAll();
  }

  // Bulk actions
  function setBulkMode(on) {
    state.ui.bulkMode = on; if (!on) state.ui.selectedProductIds.clear(); renderProductsTable();
    updateSelectedCount();
  }

  function openBulkPrice() { qs('#bulkPriceModal').showModal(); }
  function applyBulkPrice() {
    const ids = Array.from(state.ui.selectedProductIds);
    if (!ids.length) { alert('Select products first'); return; }
    const field = qs('#bulkPriceField').value; // original|sale|cost
    const method = qs('#bulkPriceMethod').value; // set|inc_pct|dec_pct|inc_num|dec_num
    const value = parseNum(qs('#bulkPriceValue').value, NaN);
    if (!['original','sale','cost'].includes(field)) { alert('Choose a field'); return; }
    if (!['set','inc_pct','dec_pct','inc_num','dec_num'].includes(method)) { alert('Choose a method'); return; }
    if (!Number.isFinite(value)) { alert('Enter a value'); return; }
    if ((method === 'inc_pct' || method === 'dec_pct') && value < 0) { alert('Percent must be non-negative'); return; }
    if ((method === 'inc_num' || method === 'dec_num') && value < 0) { alert('Amount must be non-negative'); return; }
    state.products.forEach(p => {
      if (!ids.includes(p.id)) return;
      const cur = parseNum(p.pricing[field], 0);
      let next = cur;
      if (method === 'set') next = value;
      else if (method === 'inc_pct') next = cur * (1 + value / 100);
      else if (method === 'dec_pct') next = cur * (1 - value / 100);
      else if (method === 'inc_num') next = cur + value;
      else if (method === 'dec_num') next = cur - value;
      p.pricing[field] = Math.max(0, Number(next.toFixed(2)));
    });
    saveAll(); qs('#bulkPriceModal').close(); renderProductsTable();
  }

  function openBulkRestock() { qs('#bulkRestockModal').showModal(); }
  function applyBulkRestock() {
    const ids = Array.from(state.ui.selectedProductIds);
    if (!ids.length) { alert('Select products first'); return; }
    const scope = qs('#bulkRestockScope').value; // all|low|out|size
    const qty = parseNum(qs('#bulkRestockQty').value, null);
    const size = parseNum(qs('#bulkRestockSize').value, null);
    if (qty === null || qty < 0) { alert('Enter a non-negative quantity'); return; }
    const qtyInt = Math.floor(clampNum(qty, 0, 9999));
    if (scope === 'size') {
      if (!Number.isFinite(size)) { alert('Enter a size (EU 35–45)'); return; }
      if (!EU_SIZES.includes(size)) { alert('Size must be between 35 and 45 EU'); return; }
    }
    const threshold = state.settings.lowStockThreshold;
    state.products.forEach(p => {
      if (!ids.includes(p.id)) return;
      p.colors.forEach(c => c.sizes.forEach(s => {
        const isLow = s.stock > 0 && s.stock <= threshold;
        const isOut = s.stock === 0;
        const isSize = scope === 'size' && s.eu === size;
        if (scope === 'all' || (scope === 'low' && isLow) || (scope === 'out' && isOut) || isSize) {
          s.stock = clampNum(s.stock + qtyInt, 0, 9999);
        }
      }));
    });
    saveAll();
    qs('#bulkRestockModal').close();
    renderAll();
  }

  function bulkArchive() {
    const ids = Array.from(state.ui.selectedProductIds);
    if (!ids.length) { alert('Select products first'); return; }
    const names = state.products.filter(p => ids.includes(p.id)).map(p => `${p.brand} ${p.model}`);
    const msg = `Archive ${ids.length} product(s)?\nArchived products are hidden from active listings.`;
    if (!confirm(msg)) { return; }
    state.products.forEach(p => { if (ids.includes(p.id)) p.status = 'archived'; });
    saveAll(); renderProductsTable();
  }

  function bulkUnarchive() {
    const ids = Array.from(state.ui.selectedProductIds);
    if (!ids.length) { alert('Select products first'); return; }
    state.products.forEach(p => { if (ids.includes(p.id)) p.status = 'active'; });
    saveAll(); renderProductsTable();
  }

  // Sales tracking
  function populateSaleSelectors() {
    const prodSel = qs('#saleProduct');
    prodSel.innerHTML = state.products.map(p => `<option value="${p.id}">${p.brand} ${p.model}</option>`).join('');
    onSaleProductChange();
  }

  function onSaleProductChange() {
    const prodSel = qs('#saleProduct');
    const colorSel = qs('#saleColor');
    const sizeSel = qs('#saleSize');
    const p = state.products.find(x => x.id === prodSel.value);
    colorSel.innerHTML = p.colors.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const c = p.colors[0];
    sizeSel.innerHTML = (c ? c.sizes : EU_SIZES.map(eu => ({ eu }))).map(s => `<option value="${s.eu}">${s.eu}EU</option>`).join('');
  }

  function onSaleColorChange() {
    const prodSel = qs('#saleProduct'); const colorSel = qs('#saleColor'); const sizeSel = qs('#saleSize');
    const p = state.products.find(x => x.id === prodSel.value);
    const c = p.colors.find(y => y.id === colorSel.value);
    sizeSel.innerHTML = c.sizes.map(s => `<option value="${s.eu}">${s.eu}EU (${s.stock})</option>`).join('');
  }

  function recordSale() {
    const p = state.products.find(x => x.id === qs('#saleProduct').value);
    const c = p.colors.find(y => y.id === qs('#saleColor').value);
    const eu = parseNum(qs('#saleSize').value);
    const qty = clampNum(parseNum(qs('#saleQty').value, 1), 1, 9999);
    const price = parseNum(qs('#salePrice').value, p.pricing.sale || p.pricing.original || 0);
    const s = c.sizes.find(z => z.eu === eu);
    if (s.stock < qty) { alert('Insufficient stock'); return; }
    s.stock -= qty;
    const sale = { id: uid('sale'), productId: p.id, colorId: c.id, eu, qty, price, date: new Date().toISOString() };
    state.sales.push(sale);
    saveAll();
    renderSalesLog();
    renderProductsTable();
  }

  function renderSalesLog() {
    const tbody = qs('#salesTbody');
    const rows = state.sales.slice().reverse().map(sale => {
      const p = state.products.find(p => p.id === sale.productId);
      const c = p.colors.find(x => x.id === sale.colorId) || { name: '?' };
      const total = sale.qty * sale.price;
      const date = new Date(sale.date).toLocaleString();
      return `<tr>
        <td>${date}</td>
        <td>${p.brand}</td>
        <td>${p.model}</td>
        <td>${c.name}</td>
        <td>${sale.eu}EU</td>
        <td>${sale.qty}</td>
        <td>₱${total.toFixed(2)}</td>
      </tr>`;
    }).join('');
    tbody.innerHTML = rows;
  }

  // Reports & Alerts
  function renderReports() {
    const overview = qs('#overviewList');
    const lowList = qs('#lowStockList');
    const bestSizes = qs('#bestSizesList');
    const bestBrands = qs('#bestBrandsList');
    const deadStock = qs('#deadStockList');
    const lowSummary = qs('#lowStockSummary');
    const sizesSummary = qs('#bestSizesSummary');
    const brandsSummary = qs('#bestBrandsSummary');
    const deadSummary = qs('#deadStockSummary');
    const threshold = state.settings.lowStockThreshold;

    // Timeframe filter for sales
    const tf = state.ui.reports.timeframe || 'all';
    const now = Date.now();
    const cutoff = tf === '7d' ? now - 7*24*3600*1000 : tf === '30d' ? now - 30*24*3600*1000 : 0;
    const salesFiltered = cutoff ? state.sales.filter(s => new Date(s.date).getTime() >= cutoff) : state.sales.slice();

    const activeProducts = state.products.filter(p => p.status === 'active').length;
    const totalUnits = state.products.reduce((acc, p) => acc + totalStockForProduct(p), 0);
    const totalSales = salesFiltered.reduce((acc, s) => acc + (s.qty * s.price), 0);

    overview.innerHTML = [
      `<li><strong>Active products:</strong> ${activeProducts}</li>`,
      `<li><strong>Total units in stock:</strong> ${totalUnits}</li>`,
      `<li><strong>Sales (${tf === 'all' ? 'All Time' : (tf === '7d' ? '7d' : '30d')}):</strong> ₱${totalSales.toFixed(2)}</li>`
    ].join('');

    // Low/out stock summary + optional details
    const lowItems = [];
    let lowCount = 0, outCount = 0;
    state.products.forEach(p => p.colors.forEach(c => c.sizes.forEach(s => {
      if (s.stock === 0) { outCount++; lowItems.push(`<li>${p.brand} ${p.model} - ${c.name} ${s.eu}EU: <span class=\"badge out\">Out</span></li>`); }
      else if (s.stock <= threshold) { lowCount++; lowItems.push(`<li>${p.brand} ${p.model} - ${c.name} ${s.eu}EU: <span class=\"badge low\">Low (${s.stock})</span></li>`); }
    })));
    if (lowSummary) lowSummary.textContent = `Low: ${lowCount} • Out: ${outCount}`;
    const lowOpen = state.ui.reports.open.low;
    const lowShown = lowOpen ? lowItems : lowItems.slice(0, 10);
    lowList.innerHTML = (lowShown.join('') || '<li>All good 👍</li>');
    lowList.classList.toggle('open', lowOpen);
    const lowToggle = document.querySelector('[data-report-toggle="low"]'); if (lowToggle) lowToggle.textContent = lowOpen ? 'Hide details' : 'Show details';

    // Best sizes (timeframe)
    const bySize = new Map();
    salesFiltered.forEach(s => bySize.set(s.eu, (bySize.get(s.eu) || 0) + s.qty));
    const sizeSorted = Array.from(bySize.entries()).sort((a,b) => b[1]-a[1]);
    if (sizesSummary) sizesSummary.textContent = sizeSorted.length ? `Top 5: ${sizeSorted.slice(0,5).map(([eu]) => `${eu}EU`).join(', ')}` : 'No sales yet';
    const sizesOpen = state.ui.reports.open.sizes;
    const sizesShown = (sizesOpen ? sizeSorted : sizeSorted.slice(0,5)).map(([eu, qty]) => `<li>${eu}EU: ${qty} sold</li>`);
    bestSizes.innerHTML = sizesShown.join('') || '<li>No sales yet</li>';
    bestSizes.classList.toggle('open', sizesOpen);
    const sizesToggle = document.querySelector('[data-report-toggle="sizes"]'); if (sizesToggle) sizesToggle.textContent = sizesOpen ? 'Hide details' : 'Show details';

    // Best brands (timeframe)
    const byBrand = new Map();
    salesFiltered.forEach(s => {
      const p = state.products.find(x => x.id === s.productId);
      if (!p) return;
      byBrand.set(p.brand, (byBrand.get(p.brand) || 0) + (s.qty * s.price));
    });
    const brandSorted = Array.from(byBrand.entries()).sort((a,b) => b[1]-a[1]);
    if (brandsSummary) brandsSummary.textContent = brandSorted.length ? `Top 5: ${brandSorted.slice(0,5).map(([brand]) => brand).join(', ')}` : 'No sales yet';
    const brandsOpen = state.ui.reports.open.brands;
    const brandsShown = (brandsOpen ? brandSorted : brandSorted.slice(0,5)).map(([brand, rev]) => `<li>${brand}: ₱${rev.toFixed(2)}</li>`);
    bestBrands.innerHTML = brandsShown.join('') || '<li>No sales yet</li>';
    bestBrands.classList.toggle('open', brandsOpen);
    const brandsToggle = document.querySelector('[data-report-toggle="brands"]'); if (brandsToggle) brandsToggle.textContent = brandsOpen ? 'Hide details' : 'Show details';

    // Dead stock (no sales ever for that product/color/size)
    const soldKey = new Set(state.sales.map(s => `${s.productId}|${s.colorId}|${s.eu}`));
    const deadItems = [];
    state.products.forEach(p => p.colors.forEach(c => c.sizes.forEach(s => {
      const key = `${p.id}|${c.id}|${s.eu}`;
      if (s.stock > 0 && !soldKey.has(key)) {
        deadItems.push(`<li>${p.brand} ${p.model} - ${c.name} ${s.eu}EU (${s.stock} in stock)</li>`);
      }
    })));
    if (deadSummary) deadSummary.textContent = `Items: ${deadItems.length}`;
    const deadOpen = state.ui.reports.open.dead;
    const deadShown = deadOpen ? deadItems : deadItems.slice(0, 10);
    deadStock.innerHTML = deadShown.join('') || '<li>No dead stock 🎉</li>';
    deadStock.classList.toggle('open', deadOpen);
    const deadToggle = document.querySelector('[data-report-toggle="dead"]'); if (deadToggle) deadToggle.textContent = deadOpen ? 'Hide details' : 'Show details';
  }

  function renderAlerts() {
    const ul = qs('#alertsList');
    const threshold = state.settings.lowStockThreshold;
    const alerts = [];
    state.products.forEach(p => p.colors.forEach(c => c.sizes.forEach(s => {
      if (s.stock === 0) alerts.push(`<li>Out of stock: ${p.brand} ${p.model} - ${c.name} ${s.eu}EU</li>`);
      else if (s.stock <= threshold) alerts.push(`<li>Low stock: ${p.brand} ${p.model} - ${c.name} ${s.eu}EU (${s.stock})</li>`);
    })));
    ul.innerHTML = alerts.join('') || '<li>No alerts</li>';
  }

  // Settings
  function renderSettings() { qs('#lowStockThreshold').value = state.settings.lowStockThreshold; }
  function saveSettings() { state.settings.lowStockThreshold = clampNum(parseNum(qs('#lowStockThreshold').value, 3), 1, 999); saveAll(); renderAll(); }

  // Render all
  function renderAll() {
    populateFilters();
    renderProductsTable();
    if (state.ui.selectedTab === 'sales') { populateSaleSelectors(); renderSalesLog(); }
    if (state.ui.selectedTab === 'reports') renderReports();
    if (state.ui.selectedTab === 'alerts') renderAlerts();
    if (state.ui.selectedTab === 'settings') renderSettings();
  }

  // Event wiring
  function wireEvents() {
    qsa('.tabs button').forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));

    qs('#addProductBtn').addEventListener('click', () => openProductModal(null));
    qs('#saveProductBtn').addEventListener('click', (e) => { e.preventDefault(); saveProductFromModal(); });
    const cancelBtn = qs('#cancelProductBtn'); if (cancelBtn) cancelBtn.addEventListener('click', (e) => { e.preventDefault(); qs('#productModal').close(); });
    const addInitBtn = qs('#addInitialColorBtn'); if (addInitBtn) addInitBtn.addEventListener('click', (e) => { e.preventDefault(); addInitialColorFromModal(); });
    const importImageBtn = qs('#importImageBtn'); if (importImageBtn) importImageBtn.addEventListener('click', (e) => { e.preventDefault(); addImagesFromFileInput(); });

    qs('#addColorBtn').addEventListener('click', (e) => { e.preventDefault(); addColorFromModal(); });
    qs('#saveVariantsBtn').addEventListener('click', (e) => { e.preventDefault(); saveVariantsModal(); });

    qs('#toggleBulkSelect').addEventListener('change', (e) => setBulkMode(e.target.checked));
    qs('#bulkEditPrice').addEventListener('click', openBulkPrice);
    qs('#applyBulkPriceBtn').addEventListener('click', (e) => { e.preventDefault(); applyBulkPrice(); });

    qs('#bulkRestock').addEventListener('click', openBulkRestock);
    qs('#applyBulkRestockBtn').addEventListener('click', (e) => { e.preventDefault(); applyBulkRestock(); });
    const bulkPriceMethodSel = qs('#bulkPriceMethod');
    const bulkPriceValueInp = qs('#bulkPriceValue');
    if (bulkPriceMethodSel && bulkPriceValueInp) {
      const updatePlaceholder = () => {
        const m = bulkPriceMethodSel.value;
        if (m === 'inc_pct' || m === 'dec_pct') bulkPriceValueInp.placeholder = 'Percent (e.g., 10)';
        else bulkPriceValueInp.placeholder = 'Amount or value (e.g., 100)';
      };
      bulkPriceMethodSel.addEventListener('change', updatePlaceholder);
      updatePlaceholder();
    }

    qs('#bulkArchive').addEventListener('click', bulkArchive);
    const bulkUnarchiveBtn = qs('#bulkUnarchive'); if (bulkUnarchiveBtn) bulkUnarchiveBtn.addEventListener('click', bulkUnarchive);

    const scopeSel = qs('#bulkRestockScope');
    const sizeInp = qs('#bulkRestockSize');
    if (scopeSel && sizeInp) {
      const toggleSize = () => { sizeInp.style.display = scopeSel.value === 'size' ? 'block' : 'none'; };
      scopeSel.addEventListener('change', toggleSize);
      toggleSize();
    }

    const selectAllBtn = qs('#selectAllBtn');
    if (selectAllBtn) selectAllBtn.addEventListener('click', (e) => {
      e.preventDefault();
      if (!state.ui.bulkMode) { alert('Enable Bulk select first'); return; }
      qsa('.bulkSel').forEach(cb => { cb.checked = true; state.ui.selectedProductIds.add(cb.dataset.id); });
      updateSelectedCount();
    });

    // Sales
    qs('#saleProduct').addEventListener('change', onSaleProductChange);
    qs('#saleColor').addEventListener('change', onSaleColorChange);
    qs('#recordSaleBtn').addEventListener('click', recordSale);

    // Filters
    ['#searchInput','#filterBrand','#filterCategory','#filterSize','#filterStock','#filterStatus'].forEach(sel => {
      const el = qs(sel); if (el) el.addEventListener('input', renderProductsTable);
    });

    // Reports controls and toggles
    const tfSel = qs('#reportsTimeframe');
    if (tfSel) tfSel.addEventListener('change', () => { state.ui.reports.timeframe = tfSel.value; renderReports(); });
    qsa('[data-report-toggle]').forEach(btn => btn.addEventListener('click', () => {
      const key = btn.dataset.reportToggle;
      const open = state.ui.reports.open[key];
      state.ui.reports.open[key] = !open;
      btn.textContent = open ? 'Show details' : 'Hide details';
      renderReports();
    }));
    // Settings
    qs('#saveSettingsBtn').addEventListener('click', saveSettings);
  }

  // Init
  function init() {
    loadAll();
    seedSampleIfEmpty();
    wireEvents();
    renderAll();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
