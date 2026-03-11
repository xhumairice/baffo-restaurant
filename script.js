// ========== SUPABASE CONFIG ==========
const SUPABASE_URL = 'https://rifzojimhpquxsipitmk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJpZnpvamltaHBxdXhzaXBpdG1rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyMDc2NTIsImV4cCI6MjA4ODc4MzY1Mn0.O3ed2xyVFOoBZ6BIKnBysHXAsSXjH2f5RC2B7tApuQc';

const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`
};

async function sbFetch(table, options = {}) {
    const { method = 'GET', filter = '', body = null, select = '*' } = options;
    const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}${filter}`;
    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);
    const res = await fetch(url, config);
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Supabase error');
    }
    return method === 'GET' ? res.json() : res;
}

// ========== STATE ==========
let menuItemsCache = [];
let cart = []; // { id, name, price, qty }
let isLoggedIn = false;
let currentUser = null;
let currentUserData = null;

// ========== PAGE NAVIGATION ==========
function showPage(pageId) {
    if ((pageId === 'menu' || pageId === 'reserve' || pageId === 'about' || pageId === 'order' || pageId === 'cart') && !isLoggedIn) {
        alert('Please log in to access this page.');
        showPage('login');
        return;
    }

    if (pageId === 'admin' && (!isLoggedIn || currentUserData?.role !== 'admin')) {
        alert('Admin access only!');
        return;
    }

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const page = document.getElementById(pageId);
    if (page) { page.classList.add('active'); window.scrollTo(0, 0); }

    if (pageId === 'menu') loadMenuItems();
    else if (pageId === 'order') loadOrderGrid();
    else if (pageId === 'cart') loadCartPage();
    else if (pageId === 'reserve') { setMinDate(); updateReservationsList(); }
    else if (pageId === 'admin') loadAdminDashboard();
}

// ========== AUTHENTICATION ==========
async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value.trim();
    const errorDiv = document.getElementById('loginError');
    errorDiv.classList.remove('show');

    if (!username || !password) { showError(errorDiv, 'Please fill in all fields.'); return; }

    try {
        const data = await sbFetch('users', { filter: `&username=eq.${username}&password=eq.${password}` });
        if (data.length === 0) { showError(errorDiv, 'Incorrect username or password.'); return; }

        const user = data[0];
        isLoggedIn = true;
        currentUser = user.username;
        currentUserData = user;

        document.getElementById('authBtn').textContent = 'LOG OUT';
        document.getElementById('cartBtn').style.display = 'inline-block';
        document.getElementById('adminLink').style.display = user.role === 'admin' ? 'block' : 'none';
        document.getElementById('loginUsername').value = '';
        document.getElementById('loginPassword').value = '';
        showPage('home');
    } catch (err) {
        showError(errorDiv, 'Login failed. Please try again.');
        console.error(err);
    }
}

async function handleSignup() {
    const username = document.getElementById('signupUsername').value.trim();
    const address = document.getElementById('signupAddress').value.trim();
    const password = document.getElementById('signupPassword').value.trim();
    const confirmPassword = document.getElementById('confirmPassword').value.trim();
    const errorDiv = document.getElementById('signupError');
    errorDiv.classList.remove('show');

    if (!username || !address || !password || !confirmPassword) { showError(errorDiv, 'Please fill in all fields.'); return; }
    if (username.length < 3) { showError(errorDiv, 'Username must be at least 3 characters.'); return; }
    if (password.length < 4) { showError(errorDiv, 'Password must be at least 4 characters.'); return; }
    if (password !== confirmPassword) { showError(errorDiv, 'Passwords do not match.'); return; }

    try {
        const existing = await sbFetch('users', { filter: `&username=eq.${username}` });
        if (existing.length > 0) { showError(errorDiv, 'Username already exists.'); return; }

        await sbFetch('users', { method: 'POST', filter: '', body: { username, password, address, role: 'user' } });

        isLoggedIn = true;
        currentUser = username;
        currentUserData = { username, address, role: 'user' };
        document.getElementById('authBtn').textContent = 'LOG OUT';
        document.getElementById('cartBtn').style.display = 'inline-block';
        document.getElementById('adminLink').style.display = 'none';
        document.getElementById('signupUsername').value = '';
        document.getElementById('signupAddress').value = '';
        document.getElementById('signupPassword').value = '';
        document.getElementById('confirmPassword').value = '';
        showPage('home');
    } catch (err) {
        showError(errorDiv, 'Signup failed. Please try again.');
        console.error(err);
    }
}

function toggleAuth() {
    if (isLoggedIn) {
        isLoggedIn = false;
        currentUser = null;
        currentUserData = null;
        cart = [];
        document.getElementById('authBtn').textContent = 'LOG IN';
        document.getElementById('cartBtn').style.display = 'none';
        document.getElementById('adminLink').style.display = 'none';
        updateCartBadge();
        showPage('login');
    }
}

// ========== MENU PAGE (view only) ==========
async function loadMenuItems() {
    const menuGrid = document.getElementById('menuGrid');
    menuGrid.innerHTML = '<div style="text-align:center;padding:2rem;color:#999;">Loading menu...</div>';
    try {
        menuItemsCache = await sbFetch('menu_items');
        menuGrid.innerHTML = '';
        menuItemsCache.forEach(item => {
            const div = document.createElement('div');
            div.className = 'menu-item';
            div.innerHTML = `<h3>${item.name}</h3><p>${item.description}</p><div class="price">$${item.price}</div>`;
            menuGrid.appendChild(div);
        });
    } catch (err) {
        menuGrid.innerHTML = '<div style="text-align:center;padding:2rem;color:red;">Failed to load menu.</div>';
    }
}

// ========== ORDER PAGE (add to cart) ==========
async function loadOrderGrid() {
    const grid = document.getElementById('orderGrid');
    grid.innerHTML = '<div style="text-align:center;padding:2rem;color:#999;">Loading...</div>';
    try {
        menuItemsCache = await sbFetch('menu_items');
        grid.innerHTML = '';
        menuItemsCache.forEach(item => {
            const inCart = cart.find(c => c.id === item.id);
            const div = document.createElement('div');
            div.className = 'menu-item';
            div.id = `order-item-${item.id}`;
            div.innerHTML = `
                <h3>${item.name}</h3>
                <p>${item.description}</p>
                <div class="price">$${item.price}</div>
                <div class="qty-controls" style="margin-top:1rem; display:flex; align-items:center; gap:0.5rem;">
                    <button onclick="changeQty(${item.id}, -1)" style="width:36px;height:36px;padding:0;font-size:1.2rem;">−</button>
                    <span id="qty-${item.id}" style="font-size:1.1rem;font-weight:bold;min-width:24px;text-align:center;">${inCart ? inCart.qty : 0}</span>
                    <button onclick="changeQty(${item.id}, 1)" style="width:36px;height:36px;padding:0;font-size:1.2rem;">+</button>
                    <button onclick="addToCart(${item.id})" style="flex:1;padding:0.5rem;font-size:0.9rem;">Add to Cart</button>
                </div>
            `;
            grid.appendChild(div);
        });
    } catch (err) {
        grid.innerHTML = '<div style="text-align:center;padding:2rem;color:red;">Failed to load items.</div>';
    }
}

// ========== CART LOGIC ==========
function changeQty(itemId, delta) {
    const item = menuItemsCache.find(i => i.id === itemId);
    if (!item) return;
    let cartItem = cart.find(c => c.id === itemId);
    if (!cartItem) {
        if (delta < 0) return;
        cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
    } else {
        cartItem.qty += delta;
        if (cartItem.qty <= 0) cart = cart.filter(c => c.id !== itemId);
    }
    const qtyEl = document.getElementById(`qty-${itemId}`);
    if (qtyEl) {
        const current = cart.find(c => c.id === itemId);
        qtyEl.textContent = current ? current.qty : 0;
    }
    updateCartBadge();
}

function addToCart(itemId) {
    const item = menuItemsCache.find(i => i.id === itemId);
    if (!item) return;
    let cartItem = cart.find(c => c.id === itemId);
    const qtyEl = document.getElementById(`qty-${itemId}`);
    const qty = qtyEl ? parseInt(qtyEl.textContent) || 1 : 1;
    if (cartItem) {
        cartItem.qty = qty;
    } else {
        cart.push({ id: item.id, name: item.name, price: item.price, qty: qty > 0 ? qty : 1 });
    }
    updateCartBadge();
    showToast(`✅ ${item.name} added to cart!`);
}

function updateCartBadge() {
    const total = cart.reduce((s, c) => s + c.qty, 0);
    document.getElementById('cartCount').textContent = total;
}

function showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = 'position:fixed;bottom:2rem;right:2rem;background:#0F9ED5;color:white;padding:1rem 1.5rem;border-radius:8px;font-weight:bold;z-index:999;transition:opacity 0.5s;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => toast.style.opacity = '0', 2500);
}

// ========== CART PAGE ==========
function loadCartPage() {
    const list = document.getElementById('cartItemsList');
    const totalEl = document.getElementById('cartTotal');

    // Show/hide delivery address field
    document.getElementById('orderType').addEventListener('change', function () {
        document.getElementById('deliveryAddressGroup').style.display = this.value === 'delivery' ? 'block' : 'none';
    });

    if (cart.length === 0) {
        list.innerHTML = '<div style="color:#999;text-align:center;padding:2rem;">Your cart is empty. <a onclick="showPage(\'order\')" style="color:var(--primary);cursor:pointer;">Add items</a></div>';
        totalEl.textContent = '';
    } else {
        let html = '<table class="reservation-table"><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th></th></tr></thead><tbody>';
        cart.forEach(item => {
            html += `<tr>
                <td>${item.name}</td>
                <td>${item.qty}</td>
                <td>$${(item.price * item.qty).toFixed(2)}</td>
                <td><button class="delete-btn" onclick="removeFromCart(${item.id})">✕</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        list.innerHTML = html;
        const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
        totalEl.textContent = `Total: $${total.toFixed(2)}`;
    }

    loadMyOrders();
}

function removeFromCart(itemId) {
    cart = cart.filter(c => c.id !== itemId);
    updateCartBadge();
    loadCartPage();
}

async function placeOrder() {
    const orderType = document.getElementById('orderType').value;
    const deliveryAddress = document.getElementById('deliveryAddress').value.trim();
    const phone = document.getElementById('phoneNumber').value.trim();
    const instructions = document.getElementById('specialInstructions').value.trim();
    const errorDiv = document.getElementById('checkoutError');
    const successDiv = document.getElementById('checkoutSuccess');

    errorDiv.classList.remove('show');
    successDiv.classList.remove('show');

    if (cart.length === 0) { showError(errorDiv, 'Your cart is empty!'); return; }
    if (!phone) { showError(errorDiv, 'Please enter your phone number.'); return; }
    if (orderType === 'delivery' && !deliveryAddress) { showError(errorDiv, 'Please enter a delivery address.'); return; }

    const total = cart.reduce((s, c) => s + c.price * c.qty, 0);
    const itemsSummary = cart.map(c => `${c.name} x${c.qty}`).join(', ');

    try {
        await sbFetch('orders', {
            method: 'POST',
            filter: '',
            body: {
                username: currentUser,
                items: itemsSummary,
                total: total,
                order_type: orderType,
                delivery_address: orderType === 'delivery' ? deliveryAddress : 'Pickup',
                phone: phone,
                instructions: instructions || 'None',
                status: 'pending'
            }
        });

        cart = [];
        updateCartBadge();
        document.getElementById('phoneNumber').value = '';
        document.getElementById('deliveryAddress').value = '';
        document.getElementById('specialInstructions').value = '';

        successDiv.classList.add('show');
        setTimeout(() => successDiv.classList.remove('show'), 4000);
        loadCartPage();

    } catch (err) {
        showError(errorDiv, 'Failed to place order. Please try again.');
        console.error(err);
    }
}

async function loadMyOrders() {
    const list = document.getElementById('myOrdersList');
    list.innerHTML = '<div style="color:#999;text-align:center;padding:1rem;">Loading your orders...</div>';
    try {
        const orders = await sbFetch('orders', { filter: `&username=eq.${currentUser}&order=created_at.desc` });
        if (orders.length === 0) {
            list.innerHTML = '<div style="color:#999;text-align:center;padding:1rem;">No orders yet.</div>';
            return;
        }
        let html = '<table class="reservation-table"><thead><tr><th>Items</th><th>Total</th><th>Type</th><th>Status</th><th>Date</th></tr></thead><tbody>';
        orders.forEach(o => {
            const statusColor = o.status === 'done' ? '#28a745' : o.status === 'preparing' ? '#ffc107' : '#0F9ED5';
            html += `<tr>
                <td>${o.items}</td>
                <td>$${Number(o.total).toFixed(2)}</td>
                <td>${o.order_type}</td>
                <td><span style="color:${statusColor};font-weight:bold;">${o.status.toUpperCase()}</span></td>
                <td>${formatDate(o.created_at)}</td>
            </tr>`;
        });
        html += '</tbody></table>';
        list.innerHTML = html;
    } catch (err) {
        list.innerHTML = '<div style="color:red;text-align:center;">Failed to load orders.</div>';
    }
}

// ========== RESERVATIONS ==========
function setMinDate() {
    const dateInput = document.getElementById('reserveDate');
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
}

async function handleReservation() {
    const numPeople = document.getElementById('numPeople').value;
    const date = document.getElementById('reserveDate').value;
    const time = document.getElementById('reserveTime').value;
    const comment = document.getElementById('reserveComment').value;
    const errorDiv = document.getElementById('reserveError');
    const successDiv = document.getElementById('reserveSuccess');

    errorDiv.classList.remove('show');
    successDiv.classList.remove('show');

    if (!numPeople || !date || !time) { showError(errorDiv, 'Please fill in all required fields.'); return; }
    if (numPeople < 1 || numPeople > 20) { showError(errorDiv, 'Number of people must be between 1 and 20.'); return; }

    try {
        await sbFetch('reservations', {
            method: 'POST', filter: '',
            body: { username: currentUser, people: parseInt(numPeople), date, time, comment: comment || 'No special requests' }
        });
        document.getElementById('numPeople').value = '';
        document.getElementById('reserveDate').value = '';
        document.getElementById('reserveTime').value = '';
        document.getElementById('reserveComment').value = '';
        successDiv.classList.add('show');
        setTimeout(() => successDiv.classList.remove('show'), 3000);
        updateReservationsList();
    } catch (err) {
        showError(errorDiv, 'Failed to save reservation.');
    }
}

async function updateReservationsList() {
    const list = document.getElementById('reservationsList');
    list.innerHTML = '<div style="color:#999;text-align:center;padding:1rem;">Loading...</div>';
    try {
        const reservations = await sbFetch('reservations', { filter: `&username=eq.${currentUser}&order=date.asc` });
        if (reservations.length === 0) {
            list.innerHTML = '<div style="color:#999;text-align:center;padding:2rem;">No reservations yet.</div>';
            return;
        }
        let html = '<table class="reservation-table"><thead><tr><th>Date</th><th>Time</th><th>People</th><th>Action</th></tr></thead><tbody>';
        reservations.forEach(res => {
            html += `<tr>
                <td>${formatDate(res.date)}</td>
                <td>${res.time}</td>
                <td>${res.people}</td>
                <td><button class="delete-btn" onclick="deleteReservation(${res.id})">DELETE</button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        list.innerHTML = html;
    } catch (err) {
        list.innerHTML = '<div style="color:red;">Failed to load reservations.</div>';
    }
}

async function deleteReservation(id) {
    if (confirm('Cancel this reservation?')) {
        await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${id}`, { method: 'DELETE', headers });
        updateReservationsList();
    }
}

// ========== ADMIN FUNCTIONS ==========
async function loadAdminDashboard() {
    if (!isLoggedIn || currentUserData?.role !== 'admin') { showPage('home'); return; }
    try {
        const [users, menuItems, reservations, orders] = await Promise.all([
            sbFetch('users'), sbFetch('menu_items'), sbFetch('reservations'), sbFetch('orders')
        ]);
        menuItemsCache = menuItems;
        document.getElementById('totalUsers').textContent = users.length;
        document.getElementById('totalReservations').textContent = reservations.length;
        document.getElementById('totalMenuItems').textContent = menuItems.length;
        document.getElementById('totalOrders').textContent = orders.length;
        loadUsersTable(users);
        loadMenuTable(menuItems);
        loadAllReservations(reservations);
        loadAllOrders(orders);
    } catch (err) { console.error('Admin error:', err); }
}

function loadUsersTable(users) {
    const tbody = document.getElementById('usersTableBody');
    tbody.innerHTML = '';
    users.forEach(user => {
        const roleBadge = user.role === 'admin' ? '<span class="role-badge admin-badge">ADMIN</span>' : '<span class="role-badge user-badge">USER</span>';
        const row = document.createElement('tr');
        row.innerHTML = `<td><strong>${user.username}</strong></td><td>${user.address}</td><td>${roleBadge}</td><td><button class="action-btn remove-btn" onclick="deleteUser('${user.username}')">Delete</button></td>`;
        tbody.appendChild(row);
    });
}

function loadMenuTable(menuItems) {
    const tbody = document.getElementById('menuTableBody');
    tbody.innerHTML = '';
    menuItems.forEach(item => {
        const row = document.createElement('tr');
        row.innerHTML = `<td><strong>${item.name}</strong></td><td>$${item.price}</td><td><button class="action-btn remove-btn" onclick="deleteMenuItem(${item.id})">Delete</button></td>`;
        tbody.appendChild(row);
    });
}

function loadAllReservations(reservations) {
    const tbody = document.getElementById('allReservationsBody');
    tbody.innerHTML = '';
    if (reservations.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#999;">No reservations yet</td></tr>';
        return;
    }
    reservations.forEach(res => {
        const row = document.createElement('tr');
        row.innerHTML = `<td>${res.username}</td><td>${formatDate(res.date)}</td><td>${res.time}</td><td>${res.people}</td><td>${res.comment}</td><td><button class="action-btn remove-btn" onclick="deleteReservationAdmin(${res.id})">Delete</button></td>`;
        tbody.appendChild(row);
    });
}

function loadAllOrders(orders) {
    const tbody = document.getElementById('allOrdersBody');
    tbody.innerHTML = '';
    if (orders.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#999;">No orders yet</td></tr>';
        return;
    }
    orders.forEach(o => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${o.username}</td>
            <td>${o.items}</td>
            <td>$${Number(o.total).toFixed(2)}</td>
            <td>${o.order_type}</td>
            <td>${o.phone}</td>
            <td>${o.delivery_address}</td>
            <td>${o.instructions}</td>
            <td>
                <select onchange="updateOrderStatus(${o.id}, this.value)" style="padding:0.3rem;border-radius:4px;border:1px solid #ccc;">
                    <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="preparing" ${o.status === 'preparing' ? 'selected' : ''}>Preparing</option>
                    <option value="done" ${o.status === 'done' ? 'selected' : ''}>Done</option>
                </select>
            </td>
            <td><button class="action-btn remove-btn" onclick="deleteOrder(${o.id})">Delete</button></td>
        `;
        tbody.appendChild(row);
    });
}

async function updateOrderStatus(id, status) {
    try {
        await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ status })
        });
        const msgDiv = document.getElementById('adminMessage');
        msgDiv.textContent = `✅ Order status updated to "${status}"!`;
        msgDiv.classList.add('show');
        setTimeout(() => msgDiv.classList.remove('show'), 3000);
    } catch (err) { console.error(err); }
}

async function deleteOrder(id) {
    if (confirm('Delete this order?')) {
        await fetch(`${SUPABASE_URL}/rest/v1/orders?id=eq.${id}`, { method: 'DELETE', headers });
        loadAdminDashboard();
    }
}

async function addMenuItemAdmin() {
    const name = document.getElementById('menuName').value.trim();
    const desc = document.getElementById('menuDesc').value.trim();
    const price = parseFloat(document.getElementById('menuPrice').value);
    const msgDiv = document.getElementById('adminMessage');
    msgDiv.classList.remove('show');
    if (!name || !desc || !price || price <= 0) {
        msgDiv.textContent = '❌ Please fill in all fields with valid values.';
        msgDiv.classList.add('show');
        return;
    }
    try {
        await sbFetch('menu_items', { method: 'POST', filter: '', body: { name, description: desc, price } });
        document.getElementById('menuName').value = '';
        document.getElementById('menuDesc').value = '';
        document.getElementById('menuPrice').value = '';
        msgDiv.textContent = '✅ Menu item added!';
        msgDiv.classList.add('show');
        setTimeout(() => msgDiv.classList.remove('show'), 3000);
        loadAdminDashboard();
    } catch (err) {
        msgDiv.textContent = '❌ Failed to add item.';
        msgDiv.classList.add('show');
    }
}

async function deleteMenuItem(id) {
    if (confirm('Delete this menu item?')) {
        await fetch(`${SUPABASE_URL}/rest/v1/menu_items?id=eq.${id}`, { method: 'DELETE', headers });
        loadAdminDashboard();
    }
}

async function deleteUser(username) {
    if (username === 'admin') { alert('Cannot delete the admin account!'); return; }
    if (confirm(`Delete user "${username}"?`)) {
        await fetch(`${SUPABASE_URL}/rest/v1/users?username=eq.${username}`, { method: 'DELETE', headers });
        loadAdminDashboard();
    }
}

async function deleteReservationAdmin(id) {
    if (confirm('Delete this reservation?')) {
        await fetch(`${SUPABASE_URL}/rest/v1/reservations?id=eq.${id}`, { method: 'DELETE', headers });
        loadAdminDashboard();
    }
}

// ========== HELPERS ==========
function showError(element, message) {
    element.textContent = message;
    element.classList.add('show');
}

function formatDate(dateString) {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('Baffo Restaurant — Connected to Supabase ✅');
    showPage('login');
});

document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        if (document.getElementById('login').classList.contains('active')) handleLogin();
        else if (document.getElementById('signup').classList.contains('active')) handleSignup();
        else if (document.getElementById('reserve').classList.contains('active')) handleReservation();
    }
});
