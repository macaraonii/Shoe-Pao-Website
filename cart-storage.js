// cart-storage.js
// Universal cart storage logic for all pages

function getCart() {
    return JSON.parse(localStorage.getItem('cart') || '[]');
}

function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function addToCart(product) {
    // Require user to be signed in before adding to cart.
    try {
    var profile = null; try{ profile = JSON.parse(sessionStorage.getItem('profile')||localStorage.getItem('profile')||'null'); }catch(e){ profile = null; }
        if(!profile || !profile.email){
            // Save an optional return URL so user can come back after login
            try{ var returnUrl = window.location.pathname + window.location.search; }catch(e){ var returnUrl = '' }
            var redirect = 'login.html';
            if(returnUrl) redirect += '?return=' + encodeURIComponent(returnUrl);
            // Briefly inform user then redirect to login
            try{ alert('Please sign in to add items to your cart. You will be redirected to the login page.'); }catch(e){}
            window.location.href = redirect;
            return { success: false, reason: 'login_required' };
        }
    }catch(e){ /* ignore auth check errors, continue to attempt adding */ }
    // Enforce inventory-aware caps before adding
    try {
        var cart = getCart();
        var maxAllowed = getMaxAllowedForProduct(product);
        // If product stock is 0, don't add
        if (maxAllowed === 0) {
            return { success: false, reason: 'out_of_stock' };
        }
        // Prevent duplicates by title+brand+size (if size exists)
        let found = cart.find(item => item.title === product.title && item.brand === product.brand && (item.size === product.size));
        if (found) {
            var current = (found.qty || found.quantity || 1);
            var incoming = product.qty || product.quantity || 1;
            var newQty = current + incoming;
            if (newQty > maxAllowed) {
                found.qty = maxAllowed;
                saveCart(cart);
                return { success: false, reason: 'max_reached', maxAllowed: maxAllowed };
            } else {
                found.qty = newQty;
            }
        } else {
            var incoming = product.qty || product.quantity || 1;
            if (incoming > maxAllowed) product.qty = maxAllowed;
            cart.unshift(product); // Add new/different shoes to the top (stack vertically)
        }
        saveCart(cart);
        return { success: true };
    } catch (e) {
        // fallback: behave like previous implementation if anything goes wrong
        let cart = getCart();
        let found = cart.find(item => item.title === product.title && item.brand === product.brand && (item.size === product.size));
        if (found) {
            found.qty = (found.qty || 1) + (product.qty || 1);
        } else {
            cart.unshift(product);
        }
        saveCart(cart);
        return { success: true };
    }
}

// Find inventory item matching a product (by id, name exact, contains title, or brand)
function findInventoryItemForProduct(product) {
    try {
        var inv = JSON.parse(localStorage.getItem('inventory') || '[]');
        if (!Array.isArray(inv) || inv.length === 0) return null;
        // prefer id match
        if (product.id) {
            var byId = inv.find(function(i){ return i.id === product.id; });
            if (byId) return byId;
        }
        var title = (product.title || '').toString().trim();
        var brand = (product.brand || '').toString().trim();
        var found = inv.find(function(i){ return (i.name||'').toString().trim() === title; });
        if (found) return found;
        found = inv.find(function(i){ return title && (i.name||'').toString().toLowerCase().indexOf(title.toLowerCase()) !== -1; });
        if (found) return found;
        if (brand) {
            found = inv.find(function(i){ return (i.brand||'').toString().toLowerCase() === brand.toLowerCase(); });
            if (found) return found;
        }
        return null;
    } catch (e) { return null; }
}

// Returns the maximum allowed quantity a customer can have for the given product based on inventory rules
function getMaxAllowedForProduct(product) {
    try {
        var invItem = findInventoryItemForProduct(product);
        // If inventory is missing for this product, allow adding without an artificial cap
        // (the live site may not seed inventory for all visitors). When inventory exists,
        // enforce critical-level rule: if stock < 6 allow only 1 per customer; otherwise
        // allow up to the available stock (no lower cap like '3').
        if (!invItem) {
            return Number.POSITIVE_INFINITY; // no artificial cap
        }
        var size = (product.size || '').toString();
        var stock = (invItem.sizes && (invItem.sizes[size] !== undefined)) ? Number(invItem.sizes[size]) : 0;
        if (isNaN(stock) || stock <= 0) return 0;
        if (stock < 6) return 1; // critical level: only one allowed
        // otherwise allow up to the available stock (no artificial per-customer cap)
        return stock;
    } catch (e) {
        return 3;
    }
}

// Compute packaging fee: every two total shoes in the cart incurs an additional PHP 50 charge
function computePackagingFee(cart) {
    try {
        cart = Array.isArray(cart) ? cart : getCart();
        var totalItems = 0;
        cart.forEach(function(item){
            var qty = (typeof item.qty === 'number') ? item.qty : ((typeof item.quantity === 'number') ? item.quantity : 1);
            totalItems += Number(qty) || 0;
        });
        var pairs = Math.floor(totalItems / 2);
        return pairs * 50; // 50 PHP per pair
    } catch (e) { return 0; }
}

function getCartTotals(cart) {
    try {
        cart = Array.isArray(cart) ? cart : getCart();
        var subtotal = 0;
        cart.forEach(function(item){
            var qty = (typeof item.qty === 'number') ? item.qty : ((typeof item.quantity === 'number') ? item.quantity : 1);
            subtotal += (Number(item.price) || 0) * Number(qty);
        });
        var packaging = computePackagingFee(cart);
        return { subtotal: subtotal, packaging: packaging, total: subtotal + packaging };
    } catch (e) { return { subtotal:0, packaging:0, total:0 }; }
}

// expose helpers globally
window.computePackagingFee = computePackagingFee;
window.getCartTotals = getCartTotals;

// Update any cart sidebar UI elements if present on the page.
function renderCartSidebarUI(){
    try{
        var cart = getCart();
        var totals = getCartTotals(cart);
        // format currency simple helper
        function fmt(v){ try{ return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(v); }catch(e){ return '₱'+Number(v||0).toFixed(2);} }
        // update subtotal
            // Remove/hide the subtotal row in the cart sidebar UI — we'll show a single Total row instead
            try{
                var elSubtotal = document.getElementById('cartSubtotal');
                if(elSubtotal){
                    // hide the entire row containing the subtotal (safest across templates)
                    var subRow = elSubtotal.closest ? elSubtotal.closest('.cart-subtotal-row') : (elSubtotal.parentNode || null);
                    if(subRow) subRow.style.display = 'none';
                }
            }catch(e){}
        // update packaging row/value
        var pkgRow = document.getElementById('cartPackagingRow');
        if(!pkgRow){
            // try to create under subtotal
            if(elSubtotal && elSubtotal.parentNode && elSubtotal.parentNode.parentNode){
                pkgRow = document.createElement('div'); pkgRow.id='cartPackagingRow'; pkgRow.className='cart-subtotal-row'; pkgRow.style.marginTop='6px';
                pkgRow.innerHTML = '<span class="cart-subtotal-label">Packaging Fee</span><span id="cartPackagingValue" class="cart-subtotal-value">₱0.00</span>';
                elSubtotal.parentNode.parentNode.insertBefore(pkgRow, elSubtotal.parentNode.nextSibling);
            }
        }
        // Remove/hide packaging row in cart sidebar UI — packaging is added to J&T shipping and should not show separately here
        try{
            var pkgVal = document.getElementById('cartPackagingValue'); if(pkgVal) pkgVal.textContent = fmt(totals.packaging);
            if(pkgRow) {
                // If the packaging row exists inside the cart sidebar, remove it entirely so it never appears in the cart modal
                var cartSidebar = document.getElementById('cartSidebar');
                if(cartSidebar && cartSidebar.contains(pkgRow)) {
                    pkgRow.remove();
                } else {
                    // otherwise keep it hidden (for non-sidebar contexts)
                    pkgRow.style.display = 'none';
                }
            }
            // Also defensively remove any packaging row that other scripts may have inserted directly inside the cart sidebar
            try{
                var extra = document.querySelectorAll('#cartSidebar #cartPackagingRow');
                extra.forEach(function(n){ if(n) n.remove(); });
            }catch(e){}
        }catch(e){}
        // update total row
            // ensure a single Total row exists in the cart sidebar and update it
            try{
                var totalRow = document.getElementById('cartTotalRow');
                if(!totalRow){
                    // create a Total row under the cart items area
                    var cartSidebar = document.getElementById('cartSidebar');
                    if(cartSidebar){
                        totalRow = document.createElement('div');
                        totalRow.id = 'cartTotalRow';
                        totalRow.className = 'cart-subtotal-row';
                        totalRow.style.marginTop = '6px';
                        totalRow.innerHTML = '<span class="cart-subtotal-label">Total</span><span id="cartTotalValue" class="cart-subtotal-value">' + fmt(0) + '</span>';
                        // insert before the checkout button if available
                        var checkoutBtn = document.getElementById('checkoutBtn');
                        if(checkoutBtn && checkoutBtn.parentNode) checkoutBtn.parentNode.insertBefore(totalRow, checkoutBtn);
                        else cartSidebar.appendChild(totalRow);
                    }
                }
                var totalVal = document.getElementById('cartTotalValue'); if(totalVal) totalVal.textContent = fmt(totals.subtotal);
            }catch(e){}
        // update cart count
        var countEl = document.getElementById('cartCount'); if(countEl){ var totalItems2=0; cart.forEach(function(it){ var q=(typeof it.qty==='number')?it.qty:((typeof it.quantity==='number')?it.quantity:1); totalItems2 += Number(q)||0; }); countEl.textContent = totalItems2; }
    }catch(e){ /* ignore UI update errors */ }
    try{ // ensure the cart item list (with edit buttons) is also updated when UI values change
        renderCartSidebarItems();
    }catch(err){}
}

// Keep cart UI in sync when cart changes in other tabs/windows
window.addEventListener('storage', function(e){ if(e.key === 'cart' || e.key === null) renderCartSidebarUI(); });
// Also try to update when DOM is ready
document.addEventListener('DOMContentLoaded', function(){ renderCartSidebarUI(); });

// When user clicks the nav cart button, render the sidebar items (with edit buttons) and open the sidebar.
document.addEventListener('DOMContentLoaded', function(){
    try{
        var cartImg = document.querySelector('img[alt="Cart"]');
        if(!cartImg) return;
        var btn = cartImg.closest('button');
        if(!btn) return;
        btn.addEventListener('click', function(e){
            try{ e.preventDefault(); }catch(ex){}
            // render items and totals
            renderCartSidebarItems(); renderCartSidebarUI();
            // open sidebar overlay if present
            var overlay = document.getElementById('cartOverlay');
            var sidebar = document.getElementById('cartSidebar');
            if(overlay && sidebar){ overlay.classList.add('show'); sidebar.classList.add('open'); document.body.style.overflow = 'hidden'; sidebar.setAttribute('aria-hidden','false'); overlay.setAttribute('aria-hidden','false'); }
        });
    }catch(e){ /* ignore */ }
});

// Observe cart sidebar open/close so we can render items immediately when it opens
document.addEventListener('DOMContentLoaded', function(){
    try{
        var sidebar = document.getElementById('cartSidebar');
        if(!sidebar) return;
        var obs = new MutationObserver(function(mutations){
            mutations.forEach(function(m){
                if(m.attributeName === 'class'){
                    try{
                        if(sidebar.classList.contains('open')){
                            renderCartSidebarItems(); renderCartSidebarUI();
                        }
                    }catch(e){}
                }
            });
        });
        obs.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
    }catch(e){}
});

// --- Session integrity helpers -------------------------------------------------
// Ensure pages restored from bfcache or visited via back/forward validate the active session
function getActiveProfile(){ try{ return JSON.parse(sessionStorage.getItem('profile') || localStorage.getItem('profile') || 'null'); }catch(e){ return null; } }

// Sign out helper that clears session-scoped profile and replaces the current history entry
window.signOut = function(){
    try{ sessionStorage.removeItem('profile'); sessionStorage.removeItem('profile_updated_at'); }catch(e){}
    try{ localStorage.removeItem('profile'); localStorage.removeItem('profile_updated_at'); }catch(e){}
    // Replace current location so back won't return to a page that assumes the previous profile
    try{ window.location.replace('login.html'); }catch(e){ window.location.href = 'login.html'; }
};

// When a page is restored from bfcache (pageshow with persisted=true) or navigated via back/forward,
// ensure it reflects the current session. If the DOM shows a different user's email than the active
// session, redirect to login so the user can't view another account via the back button.
window.addEventListener('pageshow', function(ev){
    try{
        var p = getActiveProfile();
        // look for a few common account-email holders used across pages
        var accountEl = document.getElementById('accountEmail') || document.querySelector('.checkout-account') || document.querySelector('[data-account-email]');
        if(accountEl){
            var shown = (accountEl.textContent || '').trim();
            // try to extract an email from the shown text
            var m = shown.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
            var shownEmail = m ? m[0] : null;
            if(!p || !p.email){
                // No active session but page shows account info -> force login
                window.location.replace('login.html');
                return;
            }
            if(shownEmail && p.email && shownEmail.toLowerCase() !== String(p.email).toLowerCase()){
                // Mismatch between DOM and active session — don't allow viewing; force login
                window.location.replace('login.html');
                return;
            }
        } else {
            // Generic check: if page contains elements that should be protected (data-protected="true"), enforce session
            var protectedEl = document.querySelector('[data-protected="true"]');
            if(protectedEl && (!p || !p.email)){
                window.location.replace('login.html');
                return;
            }
        }
    }catch(e){ /* ignore */ }
});

function removeFromCart(idx) {
    let cart = getCart();
    cart.splice(idx, 1);
    saveCart(cart);
}

function clearCart() {
    saveCart([]);
}

// Render cart items inside the sidebar/modal in a consistent way and attach edit handlers.
function renderCartSidebarItems(){
    try{
        var cart = getCart();
        var container = document.getElementById('cartItems');
        if(!container) return;
        container.innerHTML = '';
        if(!Array.isArray(cart) || cart.length === 0){
            var empty = document.createElement('div'); empty.className = 'cart-empty'; empty.textContent = 'Your cart is empty'; container.appendChild(empty); return;
        }
        cart.forEach(function(item, index){
            var box = document.createElement('div'); box.className = 'cart-item-box';
            var img = document.createElement('img'); img.className = 'cart-item-img'; img.src = item.image || 'IMAGE/NIKE1.png'; img.alt = item.title || 'Product';
            var middle = document.createElement('div'); middle.className = 'cart-item-middle';
            var title = document.createElement('div'); title.className = 'cart-item-title'; title.textContent = item.title || '';
            var brand = document.createElement('div'); brand.className = 'cart-item-brand'; brand.textContent = item.brand || '';
            var size = document.createElement('div'); size.className = 'cart-item-size'; size.textContent = 'Size: ' + (item.size || '');
            var qtyControls = document.createElement('div'); qtyControls.className = 'cart-quantity-controls';
            var lessenBtn = document.createElement('button'); lessenBtn.className = 'qty-btn decrease'; lessenBtn.setAttribute('data-index', index);
            var lessenImg = document.createElement('img'); lessenImg.src = 'IMAGE/LessenBTN.png'; lessenImg.alt = '-'; lessenImg.style.width='22px'; lessenImg.style.height='22px'; lessenBtn.appendChild(lessenImg);
            var qtyText = document.createElement('span'); qtyText.className = 'cart-item-qty'; qtyText.textContent = item.quantity || (item.qty || 1);
            var addBtn = document.createElement('button'); addBtn.className = 'qty-btn increase'; addBtn.setAttribute('data-index', index);
            var addImg = document.createElement('img'); addImg.src = 'IMAGE/AddBTN.png'; addImg.alt='+'; addImg.style.width='22px'; addImg.style.height='22px'; addBtn.appendChild(addImg);
            qtyControls.appendChild(lessenBtn); qtyControls.appendChild(qtyText); qtyControls.appendChild(addBtn);
            middle.appendChild(title); middle.appendChild(brand); middle.appendChild(size); middle.appendChild(qtyControls);
            var actions = document.createElement('div'); actions.style.display='flex'; actions.style.flexDirection='column'; actions.style.gap='6px';
            var editBtn = document.createElement('button'); editBtn.className = 'btn ghost cart-item-edit'; editBtn.textContent = 'Edit'; editBtn.setAttribute('data-index', index);
            var removeBtn = document.createElement('button'); removeBtn.className = 'cart-item-remove'; removeBtn.setAttribute('data-index', index);
            var trashImg = document.createElement('img'); trashImg.src='IMAGE/TrashIcon.png'; trashImg.alt='Remove'; trashImg.style.width='18px'; trashImg.style.height='18px'; removeBtn.appendChild(trashImg);
            actions.appendChild(editBtn); actions.appendChild(removeBtn);
            var priceEl = document.createElement('div'); priceEl.className = 'cart-item-price'; priceEl.textContent = (function(){ try{ return new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format((item.price||0) * (item.quantity || item.qty || 1)); }catch(e){ return '₱'+(((item.price||0)*(item.quantity||item.qty||1)).toFixed(2)); } })();
            box.appendChild(img); box.appendChild(middle); box.appendChild(actions); box.appendChild(priceEl);
            container.appendChild(box);
        });
        // attach basic handlers (increase/decrease/remove/edit)
        container.querySelectorAll('.qty-btn.decrease').forEach(function(btn){ btn.onclick = function(){ var idx = Number(btn.getAttribute('data-index')); var cart = getCart(); if(!cart[idx]) return; if((cart[idx].quantity||cart[idx].qty||1) > 1){ cart[idx].quantity = (cart[idx].quantity||cart[idx].qty||1) - 1; saveCart(cart); renderCartSidebarItems(); renderCartSidebarUI(); } }; });
        container.querySelectorAll('.qty-btn.increase').forEach(function(btn){ btn.onclick = function(){ var idx = Number(btn.getAttribute('data-index')); var cart = getCart(); if(!cart[idx]) return; cart[idx].quantity = (cart[idx].quantity||cart[idx].qty||1) + 1; // respect inventory cap
                var max = getMaxAllowedForProduct(cart[idx]); if(cart[idx].quantity > max) cart[idx].quantity = max; saveCart(cart); renderCartSidebarItems(); renderCartSidebarUI(); }; });
        container.querySelectorAll('.cart-item-remove').forEach(function(btn){ btn.onclick = function(){ var idx = Number(btn.getAttribute('data-index')); var cart = getCart(); if(isNaN(idx)) return; cart.splice(idx,1); saveCart(cart); renderCartSidebarItems(); renderCartSidebarUI(); }; });
        container.querySelectorAll('.cart-item-edit').forEach(function(btn){ btn.onclick = function(){ var idx = Number(btn.getAttribute('data-index')); openCartItemEditor(idx); }; });
    }catch(e){ console.error('renderCartSidebarItems error', e); }
}

// Open modal to edit a cart item's selectable attributes (color, size). Changes apply only to cart.
function openCartItemEditor(index){
    try{
        var cart = getCart(); if(!cart || !Array.isArray(cart) || !cart[index]) return;
        var item = cart[index];
        // build modal overlay
    var existing = document.getElementById('cartEditModalOverlay'); if(existing) existing.remove();
    // reuse existing bank-modal styles so the modal appears above the cart sidebar and uses Poppins + btn styles
    var overlay = document.createElement('div'); overlay.id = 'cartEditModalOverlay'; overlay.className = 'bank-modal-overlay show';
    // Ensure overlay behaves as a centered, full-screen layer even if page lacks bank-modal CSS
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    // Force a semi-opaque backdrop so modal content is readable
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.padding = '20px';
    overlay.style.boxSizing = 'border-box';
    // Ensure overlay is above other page layers (cart sidebar had z-index ~99999)
    overlay.style.zIndex = '1002000';
    var modal = document.createElement('div'); modal.className = 'bank-modal cart-edit-modal';
    // Ensure modal is constrained and scrolls if content exceeds viewport
    // Make modal wider on larger screens to avoid internal horizontal scrolling,
    // but remain responsive on small viewports.
    modal.style.width = 'min(760px, calc(100vw - 40px))';
    modal.style.maxWidth = '760px';
    modal.style.maxHeight = 'calc(100vh - 80px)';
    modal.style.overflowY = 'auto';
    modal.style.boxSizing = 'border-box';
    modal.style.position = 'relative';
    modal.style.zIndex = '1002001';
    // Ensure visible white background and comfortable padding so content never appears transparent
    modal.style.background = '#ffffff';
    modal.style.padding = '20px';
    modal.style.borderRadius = '12px';
    modal.style.boxShadow = '0 12px 48px rgba(0,0,0,0.28)';
    modal.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><h3 style="margin:0;font-size:1.05rem;">Edit item</h3><button id="cartEditCloseBtn" class="bank-modal-close" style="background:none;border:none;font-size:20px;cursor:pointer;">✕</button></div>`;
        var content = document.createElement('div');
        // Left: image
    var left = document.createElement('div'); left.style.float='none'; left.style.marginRight='0'; left.style.width='140px'; left.innerHTML = `<img src="${item.image||'IMAGE/NIKE1.png'}" alt="${item.title||''}" style="width:140px;height:140px;object-fit:contain;border:1px solid #eee;border-radius:8px;background:#fff;"/>`;
        content.appendChild(left);
        // Right: details
            var right = document.createElement('div');
            // Use flex layout inside the modal to avoid floats and horizontal scrollbars
            right.style.flex = '1';
            right.style.minWidth = '0';
        var title = document.createElement('div'); title.style.fontWeight='600'; title.style.marginBottom='6px'; title.textContent = item.title || '';
        var brand = document.createElement('div'); brand.style.color='#666'; brand.style.marginBottom='10px'; brand.textContent = item.brand || '';
        right.appendChild(title); right.appendChild(brand);
        // Determine available colors by scanning inventory for matching name/brand
        var inv = JSON.parse(localStorage.getItem('inventory') || '[]');
        var colors = [];
        try{
            inv.forEach(function(r){ if(!r) return; var match = false; if(item.id && r.id && r.id===item.id) match=true; var name=(item.title||'').toString().toLowerCase(); if(!match && r.name && (r.name||'').toString().toLowerCase().indexOf(name)!==-1) match=true; if(!match && item.brand && r.brand && r.brand.toString().toLowerCase()===item.brand.toString().toLowerCase()) match=true; if(match){ colors.push({color: r.color || r.colorName || r.color || '', image: r.image || r.images && r.images[0] || '' , sizes: r.sizes || {}}); } });
        }catch(e){}
        // Ensure at least current color present
        if(colors.length === 0){ colors.push({ color: item.color || item.colorName || '', image: item.image || '', sizes: {} }); }
        var colorRow = document.createElement('div'); colorRow.style.marginBottom='10px'; colorRow.innerHTML = '<div style="font-size:0.95rem;margin-bottom:6px;">Colors</div>';
        var colorButtons = document.createElement('div'); colorButtons.style.display='flex'; colorButtons.style.gap='8px';
        colors.forEach(function(c, ci){ var b = document.createElement('button'); b.className='btn ghost cart-edit-color'; b.textContent = c.color || ('Color ' + (ci+1)); b.setAttribute('data-index', ci);
            if((item.color||'').toString().toLowerCase() === (c.color||'').toString().toLowerCase()) { b.classList.remove('ghost'); b.classList.add('primary'); modal._selectedColor = ci; }
            b.onclick = function(){ // mark selected
                colorButtons.querySelectorAll('button').forEach(function(x){ x.classList.remove('primary'); x.classList.add('ghost'); });
                b.classList.remove('ghost'); b.classList.add('primary'); // update preview image
                var imgEl = left.querySelector('img'); if(c.image) imgEl.src = c.image; else imgEl.src = item.image || imgEl.src; // store selected index on modal
                modal._selectedColor = ci;
                // update sizes shown for this color
                renderSizesForColor(ci);
            }; colorButtons.appendChild(b); });
        right.appendChild(colorRow); colorRow.appendChild(colorButtons);
        // Sizes: use sizes from selected color inventory entry if available, else fallback to first
        var sizesObj = (colors[0] && colors[0].sizes) ? colors[0].sizes : {};
        var sizeRow = document.createElement('div'); sizeRow.style.marginBottom='10px'; sizeRow.innerHTML = '<div style="font-size:0.95rem;margin-bottom:6px;">Sizes</div>';
    var sizeButtons = document.createElement('div'); sizeButtons.style.display='flex'; sizeButtons.style.flexWrap='wrap'; sizeButtons.style.gap='6px';
        // collect size keys
        // helper to (re)render sizes for a selected color index
        function renderSizesForColor(colorIndex){
            try{
                sizeButtons.innerHTML = '';
                var sObj = (colors[colorIndex] && colors[colorIndex].sizes) ? colors[colorIndex].sizes : {};
                var keys = Object.keys(sObj || {}).sort(function(a,b){ return Number(a) - Number(b); });
                if(keys.length === 0){ keys = [ item.size || '' ]; }
                keys.forEach(function(s){ var available = (sObj && sObj[s] !== undefined) ? Number(sObj[s]) : 0;
                    var sb = document.createElement('button'); sb.className='btn ghost cart-edit-size'; sb.textContent = s; sb.setAttribute('data-size', s);
                    // clear previous state classes
                    sb.classList.remove('low-stock','oos');
                    if(available <= 0){ sb.disabled = true; sb.classList.add('oos'); }
                    else { sb.disabled = false; if(available < 6) sb.classList.add('low-stock'); }
                        if((item.size||'') == s){ sb.classList.remove('ghost'); sb.classList.add('primary'); modal._selectedSize = s; }
                        sb.onclick = function(){ if(sb.disabled) return; sizeButtons.querySelectorAll('button').forEach(function(x){ x.classList.remove('primary'); x.classList.add('ghost'); }); sb.classList.remove('ghost'); sb.classList.add('primary'); modal._selectedSize = s; };
                    sizeButtons.appendChild(sb);
                });
            }catch(e){ console.error('renderSizesForColor error', e); }
        }

        // render sizes for the initially selected color (or default 0)
        renderSizesForColor(modal._selectedColor !== undefined ? modal._selectedColor : 0);
        right.appendChild(sizeRow); sizeRow.appendChild(sizeButtons);
        // Confirm / Cancel
        var actionsRow = document.createElement('div'); actionsRow.style.display='flex'; actionsRow.style.justifyContent='flex-end'; actionsRow.style.gap='8px'; actionsRow.style.marginTop='12px';
    var cancelBtn = document.createElement('button'); cancelBtn.className='btn ghost'; cancelBtn.textContent='Cancel';
    var saveBtn = document.createElement('button'); saveBtn.className='btn primary'; saveBtn.textContent='Save changes';
        actionsRow.appendChild(cancelBtn); actionsRow.appendChild(saveBtn);
        right.appendChild(actionsRow);
            // Build a single row using flex so the left image and right details fit without overflow
            var row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '12px';
        row.style.alignItems = 'flex-start';
        // Allow the row to wrap on narrow viewports so the modal doesn't force horizontal scrolling
        row.style.flexWrap = 'wrap';
            // Left image fixed width
        left.style.flex = '0 0 140px';
        left.style.width = '140px';
        left.style.boxSizing = 'border-box';
            // Ensure the image inside scales down if necessary
            var imgEl = left.querySelector('img'); if(imgEl){ imgEl.style.width = '140px'; imgEl.style.height = '140px'; }
        row.appendChild(left);
        row.appendChild(right);
            modal.appendChild(row);
    // ensure our modal overlay sits above the cart sidebar even if bank-modal styles are absent
    overlay.style.zIndex = overlay.style.zIndex || '1001000';
    if(modal){ modal.style.zIndex = '1001001'; }
    overlay.appendChild(modal); document.body.appendChild(overlay);
    // Wire up close/cancel
    document.getElementById('cartEditCloseBtn').onclick = function(){ overlay.remove(); };
        cancelBtn.onclick = function(){ overlay.remove(); };
        // Save handler: apply selected color/size to cart item (only color image and size)
        saveBtn.onclick = function(){
            try{
                var selColorIdx = (modal._selectedColor !== undefined) ? modal._selectedColor : 0;
                var selSize = modal._selectedSize || item.size || '';
                var chosen = colors[selColorIdx] || colors[0];
                // update cart
                var cart2 = getCart();
                if(!cart2[index]) { overlay.remove(); return; }
                cart2[index].size = selSize;
                if(chosen && chosen.image) cart2[index].image = chosen.image;
                if(chosen && chosen.color) cart2[index].color = chosen.color;
                // ensure quantity doesn't exceed max for new size
                var max = getMaxAllowedForProduct(cart2[index]);
                if(cart2[index].quantity && cart2[index].quantity > max) cart2[index].quantity = max;
                saveCart(cart2);
                renderCartSidebarItems(); renderCartSidebarUI();
                overlay.remove();
            }catch(e){ console.error('save cart edit', e); overlay.remove(); }
        };
    }catch(e){ console.error('openCartItemEditor error', e); }
}
// Expose globally for inline event handlers
window.getCart = getCart;
window.saveCart = saveCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.getMaxAllowedForProduct = getMaxAllowedForProduct;
window.findInventoryItemForProduct = findInventoryItemForProduct;
window.renderCartSidebarItems = renderCartSidebarItems;
window.openCartItemEditor = openCartItemEditor;
