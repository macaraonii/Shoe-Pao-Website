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
        if (!invItem) {
            // inventory not found -> fallback to generic cap of 3
            return 3;
        }
        var size = (product.size || '').toString();
        var stock = (invItem.sizes && (invItem.sizes[size] !== undefined)) ? Number(invItem.sizes[size]) : 0;
        if (isNaN(stock) || stock <= 0) return 0;
        var cap = (stock < 6) ? 1 : 3;
        return Math.min(cap, stock);
    } catch (e) {
        return 3;
    }
}

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
