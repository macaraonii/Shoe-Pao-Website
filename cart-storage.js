// cart-storage.js
// Universal cart storage logic for all pages

function getCart() {
    return JSON.parse(localStorage.getItem('cart') || '[]');
}

function saveCart(cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
}

function addToCart(product) {
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
}

// Keep cart UI in sync when cart changes in other tabs/windows
window.addEventListener('storage', function(e){ if(e.key === 'cart' || e.key === null) renderCartSidebarUI(); });
// Also try to update when DOM is ready
document.addEventListener('DOMContentLoaded', function(){ renderCartSidebarUI(); });

function removeFromCart(idx) {
    let cart = getCart();
    cart.splice(idx, 1);
    saveCart(cart);
}

function clearCart() {
    saveCart([]);
}

// Expose globally for inline event handlers
window.getCart = getCart;
window.saveCart = saveCart;
window.addToCart = addToCart;
window.removeFromCart = removeFromCart;
window.clearCart = clearCart;
window.getMaxAllowedForProduct = getMaxAllowedForProduct;
window.findInventoryItemForProduct = findInventoryItemForProduct;
