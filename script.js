import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, addDoc, query, where, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyATVV-25NWLsUx_hsg2msXyW5HukrF83cc",
    authDomain: "vehisell-c2885.firebaseapp.com",
    projectId: "vehisell-c2885",
    storageBucket: "vehisell-c2885.firebasestorage.app",
    messagingSenderId: "215673029794",
    appId: "1:215673029794:web:2a71002794b6b56cb743fb",
    measurementId: "G-8D01S12W9C"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

let currentUser = JSON.parse(localStorage.getItem('user_session')) || null;
let allListings = []; 
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

function compressImage(file, maxWidth, maxHeight, quality, onSuccess, onError) {
    if (!file.type.match(/image.*/)) {
        if(onError) onError("Unsupported format. Please upload a standard JPG or PNG.");
        return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;
            if (width > height) {
                if (width > maxWidth) { height = Math.round((height *= maxWidth / width)); width = maxWidth; }
            } else {
                if (height > maxHeight) { width = Math.round((width *= maxHeight / height)); height = maxHeight; }
            }
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            onSuccess(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = function() {
            if(onError) onError("Could not read image. Ensure photo is JPG, not HEIC.");
        };
        img.src = event.target.result;
    };
    reader.onerror = function() {
         if(onError) onError("File reading failed.");
    };
    reader.readAsDataURL(file);
}

document.getElementById('form-auth').addEventListener('submit', async function (e) {
    e.preventDefault();

    const rawUser = document.getElementById('auth-user').value.trim();
    const safeUserKey = rawUser.toLowerCase();
    const pass = document.getElementById('auth-pass').value;

    authBtn.disabled = true; 

    if (isLoginMode) {
        authBtn.textContent = "Logging in...";
        try {
            const q = query(collection(db, "users"), where("usernameKey", "==", safeUserKey), where("password", "==", pass));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const userData = querySnapshot.docs[0].data();
                login(userData);
            } else {
                alert("❌ Invalid username or password.");
            }
        } catch (error) {
            console.error(error);
            alert("Error logging in.");
        }
        authBtn.textContent = "Login";
        authBtn.disabled = false;

    } else {
        const confirmPass = document.getElementById('auth-pass-confirm').value;
        const phone = document.getElementById('auth-phone').value.trim();
        const fbLink = document.getElementById('auth-fb').value.trim();
        const idFileInput = document.getElementById('auth-id-img');
        const idFile = idFileInput.files[0];

        if (!rawUser) return resetBtn("❌ Username required", "Create Verified Account");
        if (pass !== confirmPass) return resetBtn("❌ Passwords don't match", "Create Verified Account");
        if (!phone || !fbLink) return resetBtn("❌ Phone and Facebook link are required", "Create Verified Account");
        if (!idFile) return resetBtn("❌ ID photo required", "Create Verified Account");

        const q = query(collection(db, "users"), where("usernameKey", "==", safeUserKey));
        const userExists = await getDocs(q);
        if (!userExists.empty) return resetBtn("❌ Username already taken!", "Create Verified Account");

        authBtn.textContent = "Uploading ID...";
        
        // Crushing the ID photo to 300px and 40% quality
        compressImage(idFile, 300, 300, 0.4, async function (compressedIdPhoto) {
            try {
                authBtn.textContent = "Creating Account...";
                
                const newUser = {
                    username: rawUser,
                    usernameKey: safeUserKey,
                    password: pass, 
                    phone: phone,
                    fb: fbLink,
                    idPhoto: compressedIdPhoto 
                };
                await addDoc(collection(db, "users"), newUser);

                alert("✅ Account created successfully! Logging you in...");
                document.getElementById('form-auth').reset();
                login(newUser);

            } catch (error) {
                console.error(error);
                resetBtn("❌ Error saving to cloud.", "Create Verified Account");
            }
        }, function(errorMessage) {
            resetBtn("❌ " + errorMessage, "Create Verified Account");
        });
    }
});

function resetBtn(msg, originalText) {
    alert(msg);
    authBtn.textContent = originalText;
    authBtn.disabled = false;
}

function login(user) {
    localStorage.setItem('user_session', JSON.stringify(user));
    currentUser = user;
    updateNav();
    showTab('buy');
    fetchAndRenderListings();
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

const sellForm = document.getElementById('form-sell');
sellForm.onsubmit = (e) => {
    e.preventDefault();
    const file = document.getElementById('p-img').files[0];
    if (!file) return alert("Please select an image.");

    const submitBtn = sellForm.querySelector('button');
    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading to Cloud...";

    // Crushing the product photo to 400px and 40% quality
    compressImage(file, 400, 400, 0.4, async function (compressedProductPhoto) {
        try {
            const newItem = {
                title: document.getElementById('p-title').value,
                price: document.getElementById('p-price').value,
                category: document.getElementById('p-category').value,
                desc: document.getElementById('p-desc').value,
                seller: currentUser.username,
                sellerKey: currentUser.username.toLowerCase(),
                sellerIdPhoto: currentUser.idPhoto, 
                image: compressedProductPhoto, 
                timestamp: Date.now()
            };
            
            submitBtn.textContent = "Saving...";
            await addDoc(collection(db, "listings"), newItem);

            sellForm.reset();
            alert("✅ Item listed successfully!");
            fetchAndRenderListings();
            showTab('buy');

        } catch (error) {
            console.error(error);
            alert("❌ Failed to list item. Check console.");
            submitBtn.disabled = false;
            submitBtn.textContent = "Post Item";
        }
    }, function(errorMessage) {
        alert("❌ " + errorMessage);
        submitBtn.disabled = false;
        submitBtn.textContent = "Post Item";
    });
};

async function fetchAndRenderListings() {
    const grid = document.getElementById('listings-grid');
    grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color: var(--light);">Loading cloud listings...</p>';

    try {
        const querySnapshot = await getDocs(collection(db, "listings"));
        allListings = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.docId = doc.id; 
            allListings.push(data);
        });
        
        allListings.sort((a, b) => b.timestamp - a.timestamp);
        renderFilteredListings('', 'all');

    } catch (error) {
        console.error(error);
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color: red;">Error loading items.</p>';
    }
}

function renderFilteredListings(filterTerm = '', filterCat = 'all') {
    const grid = document.getElementById('listings-grid');
    grid.innerHTML = '';

    const filtered = allListings.filter(item => {
        const matchesSearch = item.title.toLowerCase().includes(filterTerm.toLowerCase());
        const matchesCat = filterCat === 'all' || item.category === filterCat;
        return matchesSearch && matchesCat;
    });

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; padding: 2rem; color: var(--light);">No items yet.</p>';
        return;
    }

    filtered.forEach(item => {
        const isOwner = currentUser && currentUser.username === item.seller;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div class="img-wrapper">
                <img src="${item.image}" class="product-img" alt="${item.title}">
                ${item.sellerIdPhoto ? `
                <div class="id-badge">
                    <img src="${item.sellerIdPhoto}" class="id-preview" title="Hover to view Seller ID">
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
                `<button class="btn-del" style="background:#ef4444;color:white;padding:0.5rem;border:none;border-radius:6px;cursor:pointer;" onclick="deleteItem('${item.docId}')">Remove</button>` :
                `
                <div style="display: flex; gap: 5px;">
                    <button class="btn-contact" style="background:#10b981;color:white;padding:0.5rem 1rem;border:none;border-radius:6px;cursor:pointer;font-weight:bold;" onclick="openReserveModal('${item.title.replace(/'/g, "\\'")}', ${item.price})">Reserve</button>
                    <button class="btn-contact" style="background:var(--primary);color:white;padding:0.5rem;border:none;border-radius:6px;cursor:pointer;" onclick="contactSeller('${item.sellerKey}')">Contact</button>
                </div>
                `
            }
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

window.deleteItem = async function(docId) {
    if (confirm("Delete this listing from the cloud?")) {
        try {
            await deleteDoc(doc(db, "listings", docId));
            alert("Deleted!");
            fetchAndRenderListings();
        } catch (error) {
            alert("Error deleting item.");
        }
    }
};

window.contactSeller = async function(sellerKey) {
    try {
        const q = query(collection(db, "users"), where("usernameKey", "==", sellerKey));
        const querySnapshot = await getDocs(q);
        
        if (querySnapshot.empty) {
            alert("Sorry, seller details could not be found in the database.");
            return;
        }

        const sellerData = querySnapshot.docs[0].data();

        document.getElementById('modal-seller-name').innerText = sellerData.username;
        document.getElementById('modal-seller-avatar').src = sellerData.idPhoto;

        const phoneBtn = document.getElementById('modal-seller-phone');
        phoneBtn.href = `tel:${sellerData.phone}`; 
        phoneBtn.innerText = `📞 Call / SMS: ${sellerData.phone}`;

        const fbBtn = document.getElementById('modal-seller-fb');
        let cleanFbLink = sellerData.fb.startsWith('http') ? sellerData.fb : `https://${sellerData.fb}`;
        fbBtn.href = cleanFbLink;

        document.getElementById('modal-seller-address').style.display = 'none';

        document.getElementById('seller-modal').classList.remove('hidden');
    } catch (error) {
        alert("Error loading seller info.");
    }
};

// --- RESERVATION LOGIC ---
window.openReserveModal = function(title, price) {
    if (!currentUser) {
        alert("You must be logged in to reserve an item.");
        showTab('auth');
        return;
    }

    const numericPrice = Number(price);
    const reserveFee = numericPrice * 0.05; // Calculate 5%

    // Populate the modal with the exact math
    document.getElementById('reserve-item-title').innerText = title;
    document.getElementById('reserve-full-price').innerText = numericPrice.toLocaleString();
    document.getElementById('reserve-fee-amount').innerText = reserveFee.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

    document.getElementById('reserve-modal').classList.remove('hidden');
};

window.confirmReservation = function() {
    alert("Payment submitted for verification! The seller will be notified once the funds clear our escrow.");
    document.getElementById('reserve-modal').classList.add('hidden');
};

// Close both modals if clicked outside
window.onclick = (event) => {
    const sellerModal = document.getElementById('seller-modal');
    const reserveModal = document.getElementById('reserve-modal');
    if (event.target === sellerModal) sellerModal.classList.add('hidden');
    if (event.target === reserveModal) reserveModal.classList.add('hidden');
};

document.getElementById('search-input').oninput = (e) => {
    const cat = document.getElementById('category-filter').value;
    renderFilteredListings(e.target.value, cat);
};

document.getElementById('category-filter').onchange = (e) => {
    const term = document.getElementById('search-input').value;
    renderFilteredListings(term, e.target.value);
};

updateNav();
fetchAndRenderListings();