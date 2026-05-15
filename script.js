let currentUser = JSON.parse(localStorage.getItem('user_session')) || null;
let listings = JSON.parse(localStorage.getItem('market_listings')) || [];
let isLoginMode = true;

const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.tab-content');

function showTab(tabId) {
    sections.forEach(s => s.classList.add('hidden'));
    navButtons.forEach(b => b.classList.remove('active'));
    document.getElementById(`sec-${tabId}`).classList.remove('hidden');
    const activeBtn = Array.from(navButtons).find(b => b.getAttribute('data-tab') === tabId);
    if (activeBtn) activeBtn.classList.add('active');
}

navButtons.forEach(btn => {
    btn.onclick = () => {
        const target = btn.getAttribute('data-tab');
        if (target === 'sell' && !currentUser) {
            alert("Login required to sell.");
            showTab('auth');
            return;
        }
        showTab(target);
    };
});

const switchBtn = document.getElementById('switch-auth');
const signupExtra = document.getElementById('signup-extra');
const authTitle = document.getElementById('auth-title');
const authBtn = document.getElementById('auth-btn');

function toggleAuthMode() {
    isLoginMode = !isLoginMode;

    if (isLoginMode) {
        authTitle.textContent = 'Welcome Back';
        authBtn.textContent = 'Login';
        signupExtra.classList.add('hidden');
        switchBtn.textContent = "New here? Create a verified account";
    } else {
        authTitle.textContent = 'Verified Registration';
        authBtn.textContent = 'Create Verified Account';
        signupExtra.classList.remove('hidden');
        switchBtn.textContent = "Already have an account? Login";
    }
}

switchBtn.addEventListener('click', toggleAuthMode);

// --- BULLETPROOF AUTHENTICATION LOGIC ---
document.getElementById('form-auth').addEventListener('submit', function (e) {
    e.preventDefault();

    // Grab the raw username and convert it to lowercase for safe storage/lookup
    const rawUser = document.getElementById('auth-user').value.trim();
    const safeUserKey = rawUser.toLowerCase();
    const pass = document.getElementById('auth-pass').value;

    if (isLoginMode) {
        // LOGIN logic
        const stored = JSON.parse(localStorage.getItem(`reg_user_${safeUserKey}`));
        if (stored && stored.password === pass) {
            login(stored);
        } else {
            alert("❌ Invalid username or password.");
        }
    } else {
        // REGISTRATION logic
        const confirmPass = document.getElementById('auth-pass-confirm').value;
        const phone = document.getElementById('auth-phone').value.trim();
        const address = document.getElementById('auth-address').value.trim();
        const fbLink = document.getElementById('auth-fb').value.trim();
        const idFileInput = document.getElementById('auth-id-img');
        const idFile = idFileInput.files[0];

        if (!rawUser) return alert("❌ Username required");
        if (pass !== confirmPass) return alert("❌ Passwords don't match");
        if (!phone || !address || !fbLink) return alert("❌ Phone, Address, and Facebook link are required");
        if (!idFile) return alert("❌ ID photo required");

        const reader = new FileReader();
        reader.onload = function () {
            try {
                const newUser = {
                    username: rawUser, // Keep their original casing for display
                    password: pass,
                    phone: phone,
                    address: address,
                    fb: fbLink,
                    idPhoto: reader.result
                };

                // Save using the safe lowercase key
                localStorage.setItem(`reg_user_${safeUserKey}`, JSON.stringify(newUser));

                alert("✅ Account created successfully! Logging you in...");

                // Clear the form and Auto-Login!
                document.getElementById('form-auth').reset();
                login(newUser);

            } catch (error) {
                console.error("Storage Error:", error);
                alert("❌ Error: Image file is too large! Please choose a smaller photo (under 2MB).");
            }
        };
        reader.readAsDataURL(idFile);
    }
});

function login(user) {
    localStorage.setItem('user_session', JSON.stringify(user));
    currentUser = user;
    updateNav();
    showTab('buy');
    renderListings();
}

function updateNav() {
    if (currentUser) {
        document.getElementById('nav-auth').classList.add('hidden');
        document.getElementById('nav-acc').classList.remove('hidden');
        document.getElementById('acc-name').innerText = currentUser.username;
        document.getElementById('acc-id-display').src = currentUser.idPhoto;
    }
}

document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('user_session');
    location.reload();
};

// --- POSTING ITEMS LOGIC ---
const sellForm = document.getElementById('form-sell');
sellForm.onsubmit = (e) => {
    e.preventDefault();
    const file = document.getElementById('p-img').files[0];
    if (!file) return alert("Please select an image.");

    const reader = new FileReader();
    reader.onload = () => {
        try {
            const newItem = {
                id: Date.now(),
                title: document.getElementById('p-title').value,
                price: document.getElementById('p-price').value,
                category: document.getElementById('p-category').value,
                desc: document.getElementById('p-desc').value,
                seller: currentUser.username,
                image: reader.result
            };
            listings.unshift(newItem);
            localStorage.setItem('market_listings', JSON.stringify(listings));
            sellForm.reset();
            alert("✅ Item listed successfully!");
            renderListings();
            showTab('buy');
        } catch (error) {
            alert("❌ Storage full! Try using a smaller product photo.");
        }
    };
    reader.readAsDataURL(file);
};

// --- RENDERING ITEMS ---
function renderListings(filterTerm = '', filterCat = 'all') {
    const grid = document.getElementById('listings-grid');
    grid.innerHTML = '';

    const filtered = listings.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(filterTerm.toLowerCase());
        const matchesCat = filterCat === 'all' || item.category === filterCat;
        return matchesSearch && matchesCat;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; padding: 2rem; color: var(--light);">No matching items found.</p>';
        return;
    }

    filtered.forEach(item => {
        // Look up the seller using lowercase to match our new safe storage logic
        const safeSellerKey = item.seller.toLowerCase();
        const sellerData = JSON.parse(localStorage.getItem(`reg_user_${safeSellerKey}`));
        const isOwner = currentUser && currentUser.username === item.seller;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="img-wrapper">
                <img src="${item.image}" class="product-img" alt="${item.title}">
                ${sellerData ? `
                <div class="id-badge">
                    <img src="${sellerData.idPhoto}" class="id-preview" title="Hover to view Seller ID">
                    <span>Verified</span>
                </div>` : ''}
            </div>
            <div class="product-body">
                <p class="price">₱${Number(item.price).toLocaleString()}</p>
                <h3>${item.title}</h3>
                <p class="desc">${item.desc}</p>
                <div class="card-footer">
                    <span>👤 ${item.seller}</span>
                    ${isOwner ?
                `<button class="btn-del" style="background:#ef4444;color:white;padding:0.5rem;border:none;border-radius:6px;cursor:pointer;" onclick="deleteItem(${item.id})">Remove</button>` :
                `<button class="btn-contact" style="background:var(--primary);color:white;padding:0.5rem;border:none;border-radius:6px;cursor:pointer;" onclick="contactSeller('${item.seller}')">Contact</button>`
            }
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

function deleteItem(id) {
    if (confirm("Delete this listing?")) {
        listings = listings.filter(i => i.id !== id);
        localStorage.setItem('market_listings', JSON.stringify(listings));
        renderListings();
    }
}

// --- MODAL POP-UP LOGIC ---
function contactSeller(seller) {
    const safeSellerKey = seller.toLowerCase();
    const sellerData = JSON.parse(localStorage.getItem(`reg_user_${safeSellerKey}`));

    if (!sellerData) {
        alert("Sorry, seller details could not be found.");
        return;
    }

    document.getElementById('modal-seller-name').innerText = sellerData.username;
    document.getElementById('modal-seller-address').innerText = sellerData.address || "Address not provided";
    document.getElementById('modal-seller-avatar').src = sellerData.idPhoto;

    const phoneBtn = document.getElementById('modal-seller-phone');
    phoneBtn.href = `tel:${sellerData.phone}`;
    phoneBtn.innerText = `📞 Call / SMS: ${sellerData.phone}`;

    const fbBtn = document.getElementById('modal-seller-fb');
    let cleanFbLink = sellerData.fb.startsWith('http') ? sellerData.fb : `https://${sellerData.fb}`;
    fbBtn.href = cleanFbLink;

    document.getElementById('seller-modal').classList.remove('hidden');
}

document.getElementById('close-modal').onclick = () => {
    document.getElementById('seller-modal').classList.add('hidden');
};

window.onclick = (event) => {
    const modal = document.getElementById('seller-modal');
    if (event.target === modal) {
        modal.classList.add('hidden');
    }
};

// --- FILTERS ---
document.getElementById('search-input').oninput = (e) => {
    const cat = document.getElementById('category-filter').value;
    renderListings(e.target.value, cat);
};

document.getElementById('category-filter').onchange = (e) => {
    const term = document.getElementById('search-input').value;
    renderListings(term, e.target.value);
};

// Initialize App
updateNav();
renderListings();