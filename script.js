import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc, collection, getDocs, addDoc, query, where, deleteDoc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
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

// --- GLOBAL IMAGE VIEWER ---
window.viewFullImage = function(url) {
    document.getElementById('full-image-viewer').src = url;
    document.getElementById('image-modal').classList.remove('hidden');
};

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

// Wrapper to make compressImage async so we can map over multiple files
function compressImageAsync(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        compressImage(file, maxWidth, maxHeight, quality, resolve, reject);
    });
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
                
                if (userData.isVerified === false) {
                    alert("⏳ Account still pending! Please wait for the admin to verify your ID.");
                    authBtn.textContent = "Login";
                    authBtn.disabled = false;
                    return;
                }
                
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
        const email = document.getElementById('auth-email').value.trim(); 
        const phone = document.getElementById('auth-phone').value.trim();
        const fbLink = document.getElementById('auth-fb').value.trim();
        const idFileInput = document.getElementById('auth-id-img');
        const idBackFileInput = document.getElementById('auth-id-back-img');
        
        const idFile = idFileInput.files[0];
        const idBackFile = idBackFileInput.files[0];

        if (!rawUser) return resetBtn("❌ Username required", "Create Verified Account");
        if (pass !== confirmPass) return resetBtn("❌ Passwords don't match", "Create Verified Account");
        if (!email) return resetBtn("❌ Email required", "Create Verified Account");
        if (!idFile) return resetBtn("❌ Front ID photo required", "Create Verified Account");

        const q = query(collection(db, "users"), where("usernameKey", "==", safeUserKey));
        const userExists = await getDocs(q);
        if (!userExists.empty) return resetBtn("❌ Username already taken!", "Create Verified Account");

        authBtn.textContent = "Processing Front ID...";
        
        compressImage(idFile, 800, 800, 0.8, async function (compressedFrontPhoto) {
            
            const finishRegistration = async (compressedBackPhoto) => {
                authBtn.textContent = "Submitting Review...";
                try {
                    const newUser = {
                        username: rawUser,
                        usernameKey: safeUserKey,
                        password: pass, 
                        email: email, 
                        phone: phone,
                        fb: fbLink,
                        idPhoto: compressedFrontPhoto, 
                        idPhotoBack: compressedBackPhoto, 
                        isVerified: safeUserKey === 'admin' ? true : false 
                    };
                    await addDoc(collection(db, "users"), newUser);

                    if (safeUserKey === 'admin') {
                        alert("✅ Admin Account created! Logging you in...");
                        document.getElementById('form-auth').reset();
                        login(newUser);
                    } else {
                        alert("✅ Account submitted! The admin will review your ID to protect the community. You will receive an email once you are verified.");
                        document.getElementById('form-auth').reset();
                        toggleAuthMode(); 
                        authBtn.textContent = "Login";
                        authBtn.disabled = false;
                    }

                } catch (error) {
                    console.error(error);
                    resetBtn("❌ Error saving to cloud.", "Create Verified Account");
                }
            };

            if (idBackFile) {
                authBtn.textContent = "Processing Back ID...";
                compressImage(idBackFile, 800, 800, 0.8, function(compressedBackPhoto) {
                    finishRegistration(compressedBackPhoto);
                }, function(err) {
                    resetBtn("❌ Error reading Back ID.", "Create Verified Account");
                });
            } else {
                finishRegistration(null); 
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
    listenForLiveAlerts(); 
}

function updateNav() {
    if (currentUser) {
        document.getElementById('nav-auth').classList.add('hidden');
        document.getElementById('nav-acc').classList.remove('hidden');
        document.getElementById('acc-name').innerText = currentUser.username;
        document.getElementById('acc-id-display').src = currentUser.idPhoto;

        const backIdImg = document.getElementById('acc-id-back-display');
        const backIdUploadBox = document.getElementById('upload-back-id-box');
        
        if (currentUser.idPhotoBack) {
            backIdImg.src = currentUser.idPhotoBack;
            backIdImg.style.display = 'block';
            backIdUploadBox.style.display = 'none';
        } else {
            backIdImg.style.display = 'none';
            backIdUploadBox.style.display = 'block';
        }

        if (currentUser.usernameKey === 'admin') {
            document.getElementById('nav-admin').classList.remove('hidden');
            document.querySelector('[data-tab="sell"]').classList.add('hidden'); 
            loadAdminDashboard();
        } else {
            document.querySelector('[data-tab="sell"]').classList.remove('hidden'); 
            loadInbox();
        }
    }
}

document.getElementById('btn-save-back-id').onclick = async () => {
    const fileInput = document.getElementById('profile-upload-back-id');
    const file = fileInput.files[0];
    if (!file) return alert("Please select an image first.");

    const btn = document.getElementById('btn-save-back-id');
    btn.disabled = true;
    btn.textContent = "Uploading...";

    compressImage(file, 800, 800, 0.8, async function(compressedBackPhoto) {
        try {
            const q = query(collection(db, "users"), where("usernameKey", "==", currentUser.usernameKey));
            const snap = await getDocs(q);
            if (!snap.empty) {
                const docId = snap.docs[0].id;
                await updateDoc(doc(db, "users", docId), { idPhotoBack: compressedBackPhoto });
                
                currentUser.idPhotoBack = compressedBackPhoto;
                localStorage.setItem('user_session', JSON.stringify(currentUser));
                
                alert("✅ Back ID uploaded successfully!");
                updateNav();
            }
        } catch (e) {
            alert("Error saving back ID.");
        }
        btn.disabled = false;
        btn.textContent = "Upload & Save";
    }, function(err) {
        alert("Error reading image.");
        btn.disabled = false;
        btn.textContent = "Upload & Save";
    });
};

document.getElementById('logout-btn').onclick = () => {
    localStorage.removeItem('user_session');
    location.reload();
};

// --- MULTIPLE IMAGE PREVIEW LOGIC ---
document.getElementById('p-img').addEventListener('change', function(e) {
    const container = document.getElementById('sell-img-previews');
    container.innerHTML = ''; 
    Array.from(this.files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = document.createElement('img');
            img.src = ev.target.result;
            img.style = "width: 60px; height: 60px; object-fit: cover; border-radius: 5px; border: 1px solid #cbd5e1;";
            container.appendChild(img);
        };
        reader.readAsDataURL(file);
    });
});

const sellForm = document.getElementById('form-sell');
sellForm.onsubmit = async (e) => {
    e.preventDefault();
    const files = Array.from(document.getElementById('p-img').files);
    if (files.length === 0) return alert("Please select at least one image.");

    const submitBtn = sellForm.querySelector('button');
    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading Photos to Cloud...";

    try {
        // Compress all selected images simultaneously
        const compressedImagesArray = await Promise.all(files.map(f => compressImageAsync(f, 1200, 1200, 0.8)));

        submitBtn.textContent = "Saving Listing...";
        const newItem = {
            title: document.getElementById('p-title').value,
            price: document.getElementById('p-price').value,
            category: document.getElementById('p-category').value,
            desc: document.getElementById('p-desc').value,
            seller: currentUser.username,
            sellerKey: currentUser.username.toLowerCase(),
            sellerIdPhoto: currentUser.idPhoto, 
            images: compressedImagesArray, // Array of HD images!
            timestamp: Date.now()
        };
        
        await addDoc(collection(db, "listings"), newItem);

        sellForm.reset();
        document.getElementById('sell-img-previews').innerHTML = ''; // Clear previews
        alert("✅ Item listed successfully!");
        fetchAndRenderListings();
        showTab('buy');

    } catch (error) {
        console.error(error);
        alert("❌ Failed to list item.");
    }

    submitBtn.disabled = false;
    submitBtn.textContent = "Post Item";
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

        // Fallback for old items with only one image
        const thumbnailSrc = item.images && item.images.length > 0 ? item.images[0] : item.image;

        const card = document.createElement('div');
        card.className = 'product-card';
        card.innerHTML = `
            <div onclick="openProductModal('${item.docId}')" style="cursor: pointer;">
                <div class="img-wrapper">
                    <img src="${thumbnailSrc}" class="product-img" alt="${item.title}">
                </div>
                
                ${item.sellerIdPhoto ? `
                <div class="id-badge">
                    <img src="${item.sellerIdPhoto}" class="id-preview" title="Hover to view Seller ID">
                    <span>Verified</span>
                </div>` : ''}

                <div class="product-body" style="padding-bottom: 0;">
                    <p class="price">₱${Number(item.price).toLocaleString()}</p>
                    <h3>${item.title}</h3>
                    <p class="desc">${item.desc}</p>
                </div>
            </div>
            
            <div class="product-body" style="padding-top: 0;">
                <div class="card-footer" style="flex-direction: column; align-items: stretch; gap: 10px; border-top: none;">
                    <span style="font-weight: 600;">👤 ${item.seller}</span>
                    ${isOwner ?
                `<button class="btn-del" style="background:#ef4444;color:white;padding:0.5rem;border:none;border-radius:6px;cursor:pointer;" onclick="deleteItem('${item.docId}')">Remove Listing</button>` :
                `
                <div style="display: flex; gap: 5px; justify-content: space-between;">
                    <button class="btn-contact" style="background:#10b981;color:white;padding:0.5rem;border:none;border-radius:6px;cursor:pointer;font-weight:bold;flex:1;" onclick="openReserveModal('${item.title.replace(/'/g, "\\'")}', ${item.price}, '${item.sellerKey}', '${item.seller}')">Reserve</button>
                    <button class="btn-contact" style="background:var(--primary);color:white;padding:0.5rem;border:none;border-radius:6px;cursor:pointer;flex:1;" onclick="openChatModal('${item.sellerKey}', '${item.seller}')">Live Chat</button>
                </div>
                `
            }
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- NEW BIG PRODUCT MODAL ---
window.openProductModal = function(docId) {
    const item = allListings.find(i => i.docId === docId);
    if (!item) return;

    document.getElementById('pm-title').innerText = item.title;
    document.getElementById('pm-price').innerText = `₱${Number(item.price).toLocaleString()}`;
    document.getElementById('pm-desc').innerText = item.desc;
    document.getElementById('pm-seller-name').innerText = item.seller;
    
    const imageArray = item.images && item.images.length > 0 ? item.images : [item.image];
    document.getElementById('pm-main-img').src = imageArray[0];
    
    const thumbsContainer = document.getElementById('pm-thumbnails');
    thumbsContainer.innerHTML = '';
    
    // Only show thumbnail bar if there are multiple images
    if(imageArray.length > 1) {
        imageArray.forEach(imgSrc => {
            const img = document.createElement('img');
            img.src = imgSrc;
            img.style = "height: 60px; width: 60px; object-fit: cover; border-radius: 5px; cursor: pointer; border: 2px solid transparent;";
            img.onmouseover = () => img.style.borderColor = "var(--primary)";
            img.onmouseout = () => img.style.borderColor = "transparent";
            img.onclick = () => document.getElementById('pm-main-img').src = imgSrc; // Swap main image
            thumbsContainer.appendChild(img);
        });
    }

    const isOwner = currentUser && currentUser.username === item.seller;
    const actionsDiv = document.getElementById('pm-actions');
    actionsDiv.innerHTML = '';

    if (isOwner) {
        actionsDiv.innerHTML = `<button class="btn-del" style="background:#ef4444;color:white;padding:0.8rem 1.5rem;border:none;border-radius:6px;cursor:pointer;" onclick="deleteItem('${item.docId}')">Remove Listing</button>`;
    } else {
        actionsDiv.innerHTML = `
            <button class="btn-contact" style="background:#10b981;color:white;padding:0.8rem 1.5rem;border:none;border-radius:6px;cursor:pointer;font-weight:bold;" onclick="openReserveModal('${item.title.replace(/'/g, "\\'")}', ${item.price}, '${item.sellerKey}', '${item.seller}')">Reserve</button>
            <button class="btn-contact" style="background:var(--primary);color:white;padding:0.8rem 1.5rem;border:none;border-radius:6px;cursor:pointer;" onclick="openChatModal('${item.sellerKey}', '${item.seller}')">Live Chat</button>
        `;
    }

    document.getElementById('product-modal').classList.remove('hidden');
};

window.deleteItem = async function(docId) {
    if (confirm("Delete this listing from the cloud?")) {
        try {
            await deleteDoc(doc(db, "listings", docId));
            document.getElementById('product-modal').classList.add('hidden'); // Close modal if open
            alert("Deleted!");
            fetchAndRenderListings();
        } catch (error) {
            alert("Error deleting item.");
        }
    }
};

let pendingReservation = null;

window.openReserveModal = function(title, price, sellerKey, sellerName) {
    if (!currentUser) {
        alert("You must be logged in to reserve an item.");
        showTab('auth');
        return;
    }

    const numericPrice = Number(price);
    const reserveFee = numericPrice * 0.05; 
    
    pendingReservation = { title, sellerKey, sellerName, price: numericPrice, fee: reserveFee }; 

    document.getElementById('reserve-item-title').innerText = title;
    document.getElementById('reserve-full-price').innerText = numericPrice.toLocaleString();
    document.getElementById('reserve-fee-amount').innerText = reserveFee.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2});

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const gcashDiv = document.getElementById('dynamic-gcash');
    
    if (isMobile) {
        gcashDiv.innerHTML = `
            <a href="intent://#Intent;package=com.globe.gcash.android;scheme=gcash;end" style="background:#005ce6; color:white; font-weight:bold; text-decoration:none; display:inline-block; padding:12px 20px; border-radius:10px; box-shadow: 0 4px 10px rgba(0,92,230,0.3);">📱 Open GCash App</a>
            <p style="font-size:0.85rem; color:var(--light); margin-top:10px; margin-bottom:0;">Account Number: <strong>0912 345 6789</strong></p>
        `;
    } else {
        const gcashNumber = "09123456789"; 
        gcashDiv.innerHTML = `
            <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${gcashNumber}" alt="GCash QR Code" style="border-radius:10px; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
            <p style="font-size:0.85rem; color:var(--light); margin-top:10px; margin-bottom:0;">Scan code with your GCash App</p>
        `;
    }

    document.getElementById('reserve-receipt').value = ""; 
    document.getElementById('product-modal').classList.add('hidden'); // Close product modal so this is clearly on top
    document.getElementById('reserve-modal').classList.remove('hidden');
};

window.confirmReservation = async function() {
    const receiptFile = document.getElementById('reserve-receipt').files[0];
    if (!receiptFile) {
        alert("⚠️ Please upload a screenshot of your payment receipt before submitting.");
        return;
    }

    const submitBtn = document.getElementById('btn-confirm-reservation');
    submitBtn.disabled = true;
    submitBtn.textContent = "Verifying Payment...";

    compressImage(receiptFile, 600, 600, 0.6, async function (compressedReceipt) {
        try {
            await addDoc(collection(db, "notifications"), {
                targetUser: pendingReservation.sellerKey,
                type: 'reserve',
                fromUser: currentUser.username,
                itemName: pendingReservation.title,
                timestamp: Date.now()
            });

            await addDoc(collection(db, "reservations"), {
                item: pendingReservation.title,
                buyer: currentUser.username,
                seller: pendingReservation.sellerName, 
                fee: pendingReservation.fee,
                receipt: compressedReceipt, 
                timestamp: Date.now()
            });

            sendEmailNotification(
                pendingReservation.sellerKey, 
                "Item Reserved!", 
                `Great news! Your item ${pendingReservation.title} was just reserved by ${currentUser.username}. Log in to chat with them to complete the sale.`
            );

            document.getElementById('reserve-modal').classList.add('hidden');
            alert("✅ Payment submitted successfully! The seller has been notified.");

        } catch(err) {
            console.error("Error", err);
            alert("Error submitting reservation.");
        }
        
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Payment Proof";

    }, function(err) {
        alert("Failed to process receipt image.");
        submitBtn.disabled = false;
        submitBtn.textContent = "Submit Payment Proof";
    });
};

let currentChatUnsubscribe = null;
let activeChatUserId = null;

function getChatId(user1, user2) {
    return user1 < user2 ? `${user1}_${user2}` : `${user2}_${user1}`;
}

window.openChatModal = function(sellerKey, sellerName) {
    if (!currentUser) { alert("Login required to chat."); showTab('auth'); return; }
    
    activeChatUserId = sellerKey;
    document.getElementById('chat-target-name').innerText = "Chat with " + sellerName;
    document.getElementById('product-modal').classList.add('hidden'); // Close product modal if open
    document.getElementById('chat-modal').classList.remove('hidden');

    const chatId = getChatId(currentUser.usernameKey, sellerKey);
    const q = query(collection(db, "messages"), where("chatId", "==", chatId));

    if (currentChatUnsubscribe) currentChatUnsubscribe();

    currentChatUnsubscribe = onSnapshot(q, (snapshot) => {
        let msgs = [];
        snapshot.forEach(doc => msgs.push(doc.data()));
        msgs.sort((a, b) => a.timestamp - b.timestamp);

        const chatBox = document.getElementById('chat-messages');
        chatBox.innerHTML = '';
        
        msgs.forEach(m => {
            const div = document.createElement('div');
            div.className = 'chat-bubble ' + (m.sender === currentUser.usernameKey ? 'sent' : 'received');
            
            // Allow images to render beautifully inside chat bubbles!
            let innerHtml = '';
            if (m.imageUrl) {
                innerHtml += `<img src="${m.imageUrl}" style="max-width: 100%; border-radius: 8px; margin-bottom: 5px; cursor: pointer;" onclick="viewFullImage('${m.imageUrl}')"><br>`;
            }
            if (m.text) {
                innerHtml += `<span style="display: block;">${m.text}</span>`;
            }
            div.innerHTML = innerHtml;
            
            chatBox.appendChild(div);
        });
        
        chatBox.scrollTop = chatBox.scrollHeight; 
    });
};

window.closeChatModal = function() {
    document.getElementById('chat-modal').classList.add('hidden');
    activeChatUserId = null; 
};

// --- CHAT IMAGE PREVIEW & REMOVAL LOGIC ---
window.removeChatImg = function() {
    document.getElementById('chat-img-input').value = '';
    document.getElementById('chat-img-preview-container').style.display = 'none';
};

document.getElementById('chat-img-input').onchange = function(e) {
    const file = e.target.files[0];
    if(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('chat-img-preview').src = e.target.result;
            document.getElementById('chat-img-preview-container').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
};

document.getElementById('form-chat').onsubmit = async (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    const fileInput = document.getElementById('chat-img-input');
    
    const text = input.value.trim();
    const file = fileInput.files[0];
    
    if (!text && !file) return;

    const submitBtn = document.querySelector('#form-chat button[type="submit"]');
    submitBtn.disabled = true;

    try {
        let imgBase64 = null;
        if (file) {
            imgBase64 = await compressImageAsync(file, 800, 800, 0.7); // Compress chat images
        }

        input.value = '';
        removeChatImg();

        const chatId = getChatId(currentUser.usernameKey, activeChatUserId);

        await addDoc(collection(db, "messages"), {
            chatId: chatId,
            sender: currentUser.usernameKey,
            text: text,
            imageUrl: imgBase64, // Save the image string!
            timestamp: Date.now()
        });

        await addDoc(collection(db, "notifications"), {
            targetUser: activeChatUserId,
            type: 'message',
            fromUser: currentUser.username,
            text: text ? text : "Sent an image.",
            timestamp: Date.now()
        });

        sendEmailNotification(
            activeChatUserId, 
            "New Message Received", 
            `You have a new unread message from ${currentUser.username} on VehiSell.`
        );

    } catch (err) {
        console.error(err);
    }
    submitBtn.disabled = false;
};

let alertsUnsubscribe = null;
let seenAlerts = new Set();

function listenForLiveAlerts() {
    if (!currentUser) return;
    if (alertsUnsubscribe) alertsUnsubscribe();

    const q = query(collection(db, "notifications"), where("targetUser", "==", currentUser.usernameKey));
    
    alertsUnsubscribe = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const docId = change.doc.id;
                const data = change.doc.data();
                
                if (!seenAlerts.has(docId)) {
                    seenAlerts.add(docId);
                    if (Date.now() - data.timestamp < 10000) {
                        triggerToastPopup(data);
                    }
                }
            }
        });
    });
}

function triggerToastPopup(data) {
    if (data.type === 'message' && activeChatUserId === data.fromUser.toLowerCase()) return;

    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = data.type === 'reserve' ? 'toast reserve-toast' : 'toast';
    
    toast.style.cursor = 'pointer';
    toast.title = "Click to reply!";

    if (data.type === 'reserve') {
        toast.innerHTML = `<h4>🎉 Item Reserved!</h4><p><strong>${data.fromUser}</strong> has reserved your item. Click to chat.</p>`;
    } else if (data.type === 'message') {
        toast.innerHTML = `<h4>💬 New Message</h4><p><strong>${data.fromUser}:</strong> ${data.text}</p>`;
    }

    toast.onclick = () => {
        window.openChatModal(data.fromUser.toLowerCase(), data.fromUser);
        toast.remove();
    };

    container.appendChild(toast);
    setTimeout(() => { if(container.contains(toast)) toast.remove(); }, 8000);
}

function loadInbox() {
    if (!currentUser || currentUser.usernameKey === 'admin') return;
    
    const q = query(collection(db, "notifications"), where("targetUser", "==", currentUser.usernameKey));
    onSnapshot(q, (snapshot) => {
        const inboxBox = document.getElementById('inbox-list');
        inboxBox.innerHTML = '';
        
        let interactors = new Map();
        
        snapshot.forEach(doc => {
            const data = doc.data();
            if(!interactors.has(data.fromUser)) {
                interactors.set(data.fromUser, data);
            } else {
                if(data.timestamp > interactors.get(data.fromUser).timestamp) {
                    interactors.set(data.fromUser, data);
                }
            }
        });

        if(interactors.size === 0) {
            inboxBox.innerHTML = '<p style="color: var(--light); text-align: center;">No messages yet.</p>';
            return;
        }

        interactors.forEach((data, user) => {
            const div = document.createElement('div');
            div.style = "display: flex; justify-content: space-between; align-items: center; background: #f8fafc; padding: 10px 15px; border-radius: 8px; border: 1px solid #e2e8f0;";
            
            let actionText = data.type === 'reserve' ? 'reserved your item.' : 'sent you a message.';
            
            div.innerHTML = `
                <div>
                    <strong style="color: var(--primary); font-size: 1.1rem;">${user}</strong>
                    <p style="margin: 3px 0 0 0; font-size: 0.85rem; color: var(--light);">${actionText}</p>
                </div>
                <button class="btn-primary" style="width: auto; padding: 8px 15px; font-size: 0.85rem;" onclick="openChatModal('${user.toLowerCase()}', '${user}')">Reply / Chat</button>
            `;
            inboxBox.appendChild(div);
        });
    });
}

// --- ADMIN DASHBOARD LOGIC ---
let currentTotalAdminProfit = 0;

async function loadAdminDashboard() {
    
    const resQuery = query(collection(db, "reservations"));
    const withQuery = query(collection(db, "withdrawals"));
    
    onSnapshot(resQuery, async (snapshot) => {
        let grossProfit = 0;
        const logsBox = document.getElementById('admin-logs');
        logsBox.innerHTML = '';
        
        let reserves = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            grossProfit += Number(data.fee);
            reserves.push(data);
        });

        let totalWithdrawn = 0;
        const wSnap = await getDocs(withQuery);
        wSnap.forEach(d => totalWithdrawn += Number(d.data().amount));

        currentTotalAdminProfit = grossProfit - totalWithdrawn;
        document.getElementById('admin-total-profit').innerText = currentTotalAdminProfit.toLocaleString(undefined, {minimumFractionDigits: 2});

        reserves.sort((a,b) => b.timestamp - a.timestamp);
        reserves.forEach(r => {
            const logItem = document.createElement('div');
            logItem.style = "padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 0.9rem;";
            logItem.innerHTML = `
                <strong>${r.buyer}</strong> reserved <em>${r.item}</em> from <strong>${r.seller}</strong> (+₱${r.fee.toLocaleString()})
                ${r.receipt ? `<br><span onclick="viewFullImage('${r.receipt}')" style="color:var(--primary); font-size:0.8rem; font-weight:bold; cursor: pointer;">🔍 View Receipt</span>` : ''}
            `;
            logsBox.appendChild(logItem);
        });
    });

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        document.getElementById('admin-total-users').innerText = usersSnap.size.toLocaleString();

        const listingsSnap = await getDocs(collection(db, "listings"));
        document.getElementById('admin-total-listings').innerText = listingsSnap.size.toLocaleString();
    } catch(err) {
        console.error("Could not fetch counts", err);
    }

    const qPending = query(collection(db, "users"), where("isVerified", "==", false));
    onSnapshot(qPending, (snapshot) => {
        const pendingBox = document.getElementById('admin-pending-users');
        pendingBox.innerHTML = '';
        
        if(snapshot.empty) {
            pendingBox.innerHTML = '<p style="color: var(--light); text-align: center;">No pending accounts.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            const u = docSnap.data();
            const uId = docSnap.id;
            
            const div = document.createElement('div');
            div.style = "padding: 15px; border-bottom: 1px solid #e2e8f0; margin-bottom: 10px; background: #f8fafc; border-radius: 8px;";
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <div>
                        <strong style="font-size: 1.1rem; color: var(--text);">${u.username}</strong>
                        <p style="margin: 0; font-size: 0.85rem; color: var(--light);">${u.email}</p>
                    </div>
                    <div style="display: flex; gap: 5px;">
                        <button class="btn-primary" style="background: #10b981; padding: 5px 15px; width: auto;" onclick="approveUser('${uId}', '${u.username}', '${u.usernameKey}')">Approve</button>
                        <button class="btn-secondary" style="padding: 5px 15px; width: auto; margin: 0;" onclick="rejectUser('${uId}')">Reject</button>
                    </div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <div style="flex: 1;">
                        <p style="font-size: 0.8rem; margin: 0 0 5px 0; font-weight: bold;">Front ID</p>
                        <img src="${u.idPhoto}" onclick="viewFullImage('${u.idPhoto}')" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; cursor: zoom-in;">
                        <p style="font-size: 0.7rem; color: var(--primary); margin: 2px 0 0 0; cursor: pointer;" onclick="viewFullImage('${u.idPhoto}')">🔍 Click to enlarge</p>
                    </div>
                    ${u.idPhotoBack ? `
                    <div style="flex: 1;">
                        <p style="font-size: 0.8rem; margin: 0 0 5px 0; font-weight: bold;">Back ID</p>
                        <img src="${u.idPhotoBack}" onclick="viewFullImage('${u.idPhotoBack}')" style="width: 100%; height: 100px; object-fit: cover; border-radius: 6px; border: 1px solid #cbd5e1; cursor: zoom-in;">
                        <p style="font-size: 0.7rem; color: var(--primary); margin: 2px 0 0 0; cursor: pointer;" onclick="viewFullImage('${u.idPhotoBack}')">🔍 Click to enlarge</p>
                    </div>` : '<div style="flex: 1;"><p style="font-size: 0.8rem; margin: 0 0 5px 0; color:var(--light);">No Back ID</p></div>'}
                </div>
            `;
            pendingBox.appendChild(div);
        });
    });
}

window.approveUser = async function(docId, username, usernameKey) {
    if(confirm(`Approve ${username}'s ID and send them an email?`)) {
        try {
            await updateDoc(doc(db, "users", docId), { isVerified: true });
            
            sendEmailNotification(
                usernameKey, 
                "Account Verified: Welcome to VehiSell!", 
                `Hello ${username}! Great news, the admin has successfully verified your ID. Your account is now fully active. You can log in, post listings, and safely interact with buyers!`
            );
            
            alert(`✅ ${username} has been approved and notified.`);
        } catch(e) {
            alert("Error approving user.");
            console.error(e);
        }
    }
};

window.rejectUser = async function(docId) {
    if(confirm("Reject this user? This will delete their pending account permanently.")) {
        try {
            await deleteDoc(doc(db, "users", docId));
            alert("User rejected and removed from system.");
        } catch(e) {
            alert("Error rejecting user.");
        }
    }
};

document.getElementById('btn-withdraw').onclick = async () => {
    if(currentTotalAdminProfit <= 0) {
        alert("You have no funds available to withdraw.");
        return;
    }

    if(confirm(`Withdraw ₱${currentTotalAdminProfit.toLocaleString()} to your registered Admin Bank Account?`)) {
        try {
            await addDoc(collection(db, "withdrawals"), {
                amount: currentTotalAdminProfit,
                timestamp: Date.now()
            });
            alert("✅ Withdrawal Requested! Funds will reflect in your account within 2-3 business days.");
        } catch(err) {
            alert("Error processing withdrawal.");
        }
    }
};

async function sendEmailNotification(targetUsernameKey, subjectTitle, bodyMessage) {
    try {
        const q = query(collection(db, "users"), where("usernameKey", "==", targetUsernameKey));
        const userDoc = await getDocs(q);
        
        if(!userDoc.empty) {
            const userEmail = userDoc.docs[0].data().email;
            const currentTime = new Date().toLocaleString(); 
            
            emailjs.send("service_gzunt5g", "template_xlk8x6j", {
                to_email: userEmail,             
                title: subjectTitle,             
                name: "VehiSell Admin",          
                message: bodyMessage,            
                time: currentTime,               
                email: "admin@vehisell.com"      
            }).then(
              (response) => {
                console.log('✅ Email sent successfully!', response.status, response.text);
              },
              (error) => {
                console.error('❌ Email failed to send.', error);
              }
            );
        }
    } catch(err) {
        console.error("Could not fetch user email for notification", err);
    }
}

window.onclick = (event) => {
    const sellerModal = document.getElementById('seller-modal');
    const reserveModal = document.getElementById('reserve-modal');
    const imageModal = document.getElementById('image-modal');
    const productModal = document.getElementById('product-modal'); // Ensures clicking off the big gallery closes it
    
    if (event.target === sellerModal) sellerModal.classList.add('hidden');
    if (event.target === reserveModal) reserveModal.classList.add('hidden');
    if (event.target === imageModal) imageModal.classList.add('hidden');
    if (event.target === productModal) productModal.classList.add('hidden');
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
if (currentUser) listenForLiveAlerts();
