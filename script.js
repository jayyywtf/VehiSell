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
let currentTab = 'home'; 
let currentLimit = 12; 
let userFavorites = JSON.parse(localStorage.getItem('user_favorites')) || []; 

// ADMIN OTP VARIABLES
let generatedAdminOTP = null;
let pendingAdminUser = null;

const navButtons = document.querySelectorAll('.nav-btn');
const sections = document.querySelectorAll('.tab-content');

// --- DARK MODE TOGGLE LOGIC ---
const themeToggleBtn = document.getElementById('theme-toggle');
let currentTheme = localStorage.getItem('theme') || 'light';

if (currentTheme === 'dark' && themeToggleBtn) {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggleBtn.innerText = '☀️';
}

if (themeToggleBtn) {
    themeToggleBtn.onclick = () => {
        currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', currentTheme);
        localStorage.setItem('theme', currentTheme);
        themeToggleBtn.innerText = currentTheme === 'dark' ? '☀️' : '🌙';
    };
}

window.viewFullImage = function(url) {
    const viewer = document.getElementById('full-image-viewer');
    const modal = document.getElementById('image-modal');
    if (viewer && modal) {
        viewer.src = url;
        modal.classList.remove('hidden');
    }
};

function showTab(tabId) {
    currentTab = tabId;
    sections.forEach(s => s.classList.add('hidden'));
    navButtons.forEach(b => b.classList.remove('active'));
    
    const targetSec = document.getElementById(`sec-${tabId}`);
    if(targetSec) targetSec.classList.remove('hidden');
    
    const activeBtn = Array.from(navButtons).find(b => b.getAttribute('data-tab') === tabId);
    if (activeBtn) activeBtn.classList.add('active');

    if(tabId === 'buy' || tabId === 'saved') {
        currentLimit = 12; 
        renderFilteredListings();
    }
}

window.switchTab = function(tabId) {
    showTab(tabId);
};

navButtons.forEach(btn => {
    btn.onclick = () => {
        const target = btn.getAttribute('data-tab');
        if ((target === 'sell' || target === 'saved') && !currentUser) {
            alert("Login required to access this feature.");
            showTab('auth');
            return;
        }
        showTab(target);
    };
});

const bellBtn = document.getElementById('bell-btn');
if(bellBtn) {
    bellBtn.onclick = (e) => {
        e.stopPropagation(); 
        document.getElementById('notif-dropdown')?.classList.toggle('hidden');
    };
}

const switchBtn = document.getElementById('switch-auth');
const signupExtra = document.getElementById('signup-extra');
const authTitle = document.getElementById('auth-title');
const authBtn = document.getElementById('auth-btn');

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    if (isLoginMode) {
        if(authTitle) authTitle.textContent = 'Welcome Back';
        if(authBtn) authBtn.textContent = 'Login';
        signupExtra?.classList.add('hidden');
        if(switchBtn) switchBtn.textContent = "New here? Create a verified account";
    } else {
        if(authTitle) authTitle.textContent = 'Verified Registration';
        if(authBtn) authBtn.textContent = 'Create Verified Account';
        signupExtra?.classList.remove('hidden');
        if(switchBtn) switchBtn.textContent = "Already have an account? Login";
    }
}
if(switchBtn) switchBtn.addEventListener('click', toggleAuthMode);

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

function compressImageAsync(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        compressImage(file, maxWidth, maxHeight, quality, resolve, reject);
    });
}

window.openPaymentModal = function(type, title, itemName, feeAmount, callback) {
    const modalTitle = document.getElementById('payment-modal-title');
    const itemTitle = document.getElementById('payment-item-title');
    const feeAmountEl = document.getElementById('payment-fee-amount');
    const feeLabel = document.getElementById('payment-fee-label');

    if(modalTitle) modalTitle.innerText = title;
    if(itemTitle) itemTitle.innerText = itemName;
    if(feeAmountEl) feeAmountEl.innerText = Number(feeAmount).toLocaleString(undefined, {minimumFractionDigits: 2});
    
    let label = 'Required Fee';
    if(type === 'reserve') label = 'Required Downpayment (5%)';
    if(type === 'dealer') label = 'Instant Verification Fee';
    if(type === 'boost') label = 'Hot List Boost Fee';
    if(feeLabel) feeLabel.innerText = label;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const gcashDiv = document.getElementById('dynamic-gcash');
    
    if (gcashDiv) {
        if (isMobile) {
            gcashDiv.innerHTML = `
                <a href="intent://#Intent;package=com.globe.gcash.android;scheme=gcash;end" style="background:#005ce6; color:white; font-weight:800; text-decoration:none; display:inline-block; padding:15px 25px; border-radius:12px; box-shadow: 0 4px 15px rgba(0,92,230,0.3); font-size: 1.1rem;">📱 Open GCash App</a>
                <p style="font-size:0.95rem; color:var(--text); margin-top:15px; margin-bottom:0;">Account Number: <strong style="color:var(--primary); font-family:monospace; font-size:1.1rem;">0912 345 6789</strong></p>
            `;
        } else {
            const gcashNumber = "09123456789"; 
            gcashDiv.innerHTML = `
                <img src="https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${gcashNumber}" alt="GCash QR Code" style="border-radius:12px; box-shadow: 0 5px 20px rgba(0,0,0,0.1);">
                <p style="font-size:0.95rem; color:var(--text); margin-top:15px; margin-bottom:0; font-weight:600;">Scan code with your GCash App</p>
            `;
        }
    }

    const receiptInput = document.getElementById('payment-receipt');
    if(receiptInput) receiptInput.value = ""; 
    document.getElementById('product-modal')?.classList.add('hidden'); 
    document.getElementById('payment-modal')?.classList.remove('hidden');

    const btn = document.getElementById('btn-confirm-payment');
    if (btn) {
        btn.onclick = async () => {
            const receiptFile = receiptInput?.files[0];
            if (!receiptFile) {
                alert("⚠️ Please upload a screenshot of your payment receipt before submitting.");
                return;
            }

            btn.disabled = true;
            btn.textContent = "Verifying Payment...";

            compressImage(receiptFile, 800, 800, 0.7, async function (compressedReceipt) {
                try {
                    await callback(compressedReceipt);
                    document.getElementById('payment-modal')?.classList.add('hidden');
                } catch(e) {
                    console.error(e);
                    alert("Error submitting payment.");
                }
                btn.disabled = false;
                btn.textContent = "Submit Payment Proof";
            }, function(err) {
                alert("Failed to process receipt image.");
                btn.disabled = false;
                btn.textContent = "Submit Payment Proof";
            });
        };
    }
};

const formAuth = document.getElementById('form-auth');
if (formAuth) {
    formAuth.addEventListener('submit', async function (e) {
        e.preventDefault();

        const rawUser = document.getElementById('auth-user')?.value.trim();
        const safeUserKey = rawUser.toLowerCase();
        const pass = document.getElementById('auth-pass')?.value;

        if(authBtn) authBtn.disabled = true; 

        if (isLoginMode) {
            if(authBtn) authBtn.textContent = "Logging in...";
            try {
                const q = query(collection(db, "users"), where("usernameKey", "==", safeUserKey), where("password", "==", pass));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    const userData = querySnapshot.docs[0].data();
                    if (userData.isVerified === false) {
                        alert("⏳ Account still pending! Please wait for the admin to verify your ID.");
                        if(authBtn) {
                            authBtn.textContent = "Login";
                            authBtn.disabled = false;
                        }
                        return;
                    }

                    if (userData.usernameKey === 'admin') {
                        if(authBtn) authBtn.textContent = "Sending Security Code...";
                        
                        generatedAdminOTP = Math.floor(100000 + Math.random() * 900000).toString();
                        pendingAdminUser = userData;

                        sendEmailNotification(
                            'admin', 
                            "Admin Login Attempt: Security Code", 
                            `Someone is attempting to log into the VehiSell Admin Dashboard.\n\nYour 6-digit authorization code is: ${generatedAdminOTP}\n\nIf this was not you, please secure your account.`
                        );

                        document.getElementById('otp-modal')?.classList.remove('hidden');
                        if(authBtn) {
                            authBtn.textContent = "Login";
                            authBtn.disabled = false;
                        }
                    } else {
                        login(userData);
                    }
                } else {
                    alert("❌ Invalid username or password.");
                    if(authBtn) {
                        authBtn.textContent = "Login";
                        authBtn.disabled = false;
                    }
                }
            } catch (error) {
                console.error(error);
                alert("Error logging in.");
                if(authBtn) {
                    authBtn.textContent = "Login";
                    authBtn.disabled = false;
                }
            }

        } else {
            const confirmPass = document.getElementById('auth-pass-confirm')?.value;
            const email = document.getElementById('auth-email')?.value.trim(); 
            const phone = document.getElementById('auth-phone')?.value.trim();
            const fbLink = document.getElementById('auth-fb')?.value.trim();
            const dealerCheckbox = document.getElementById('auth-is-dealer');
            const isDealer = dealerCheckbox ? dealerCheckbox.checked : false; 
            const idFileInput = document.getElementById('auth-id-img');
            const idBackFileInput = document.getElementById('auth-id-back-img');
            
            const idFile = idFileInput?.files[0];
            const idBackFile = idBackFileInput?.files[0];

            if (!rawUser) return resetBtn("❌ Username required", "Create Verified Account");
            if (pass !== confirmPass) return resetBtn("❌ Passwords don't match", "Create Verified Account");
            if (!email) return resetBtn("❌ Email required", "Create Verified Account");
            if (!idFile) return resetBtn("❌ Front ID photo required", "Create Verified Account");

            const q = query(collection(db, "users"), where("usernameKey", "==", safeUserKey));
            const userExists = await getDocs(q);
            if (!userExists.empty) return resetBtn("❌ Username already taken!", "Create Verified Account");

            const submitToFirebase = async (frontId, backId, verifyNow) => {
                const newUser = {
                    username: rawUser,
                    usernameKey: safeUserKey,
                    password: pass, 
                    email: email, 
                    phone: phone,
                    fb: fbLink,
                    isDealer: isDealer, 
                    idPhoto: frontId, 
                    idPhotoBack: backId, 
                    isVerified: verifyNow || safeUserKey === 'admin' 
                };
                await addDoc(collection(db, "users"), newUser);
                return newUser;
            };

            if(authBtn) authBtn.textContent = "Processing Front ID...";
            
            compressImage(idFile, 800, 800, 0.8, async function (compressedFrontPhoto) {
                
                const processBackAndSave = async () => {
                    let compressedBackPhoto = null;
                    if (idBackFile) {
                        compressedBackPhoto = await compressImageAsync(idBackFile, 800, 800, 0.8);
                    }

                    if(isDealer) {
                        if(authBtn) {
                            authBtn.textContent = "Proceed to Payment";
                            authBtn.disabled = false;
                        }
                        
                        openPaymentModal('dealer', 'Premium Dealer Registration', `Account: ${rawUser}`, 499, async (receiptStr) => {
                            await addDoc(collection(db, "reservations"), {
                                item: "Premium Dealer Registration",
                                buyer: rawUser,
                                seller: "VehiSell Admin", 
                                fee: 499,
                                receipt: receiptStr, 
                                timestamp: Date.now()
                            });
                            
                            const newUser = await submitToFirebase(compressedFrontPhoto, compressedBackPhoto, true);
                            alert("✅ Payment accepted! You are now an Instantly Verified Premium Dealer!");
                            formAuth.reset();
                            login(newUser);
                        });

                    } else {
                        if(authBtn) authBtn.textContent = "Submitting Review...";
                        await submitToFirebase(compressedFrontPhoto, compressedBackPhoto, false);
                        alert("✅ Account submitted! The admin will review your ID to protect the community.");
                        formAuth.reset();
                        toggleAuthMode(); 
                        if(authBtn) {
                            authBtn.textContent = "Login";
                            authBtn.disabled = false;
                        }
                    }
                };
                
                processBackAndSave();

            }, function(errorMessage) {
                resetBtn("❌ " + errorMessage, "Create Verified Account");
            });
        }
    });
}

const verifyOtpBtn = document.getElementById('btn-verify-otp');
if (verifyOtpBtn) {
    verifyOtpBtn.onclick = () => {
        const inputVal = document.getElementById('otp-input')?.value.trim();
        
        if (inputVal === generatedAdminOTP) {
            document.getElementById('otp-modal')?.classList.add('hidden');
            if(document.getElementById('otp-input')) document.getElementById('otp-input').value = '';
            generatedAdminOTP = null; 
            login(pendingAdminUser);
            pendingAdminUser = null;
        } else {
            alert("❌ Incorrect security code. Please try again.");
        }
    };
}

function resetBtn(msg, originalText) {
    alert(msg);
    if(authBtn) {
        authBtn.textContent = originalText;
        authBtn.disabled = false;
    }
}

function login(user) {
    localStorage.setItem('user_session', JSON.stringify(user));
    currentUser = user;
    updateNav();
    
    if (user.usernameKey === 'admin') {
        showTab('admin'); 
    } else {
        showTab('buy'); 
    }
    
    fetchAndRenderListings();
    listenForLiveAlerts(); 
}

// BULLETPROOF NAV UPDATER - Safe from crashes
function updateNav() {
    if (currentUser) {
        document.getElementById('nav-auth')?.classList.add('hidden');
        const isAdmin = currentUser.usernameKey === 'admin';

        if (isAdmin) {
            document.getElementById('nav-acc')?.classList.add('hidden');
            document.querySelector('[data-tab="sell"]')?.classList.add('hidden'); 
            document.getElementById('nav-admin')?.classList.remove('hidden');
            document.getElementById('nav-logout')?.classList.remove('hidden');
            
            document.getElementById('nav-saved')?.classList.add('hidden');
            if(document.getElementById('quick-icons')) document.getElementById('quick-icons').style.display = 'none';
            if(bellBtn) bellBtn.style.display = 'none';
            
            loadAdminDashboard();
        } else {
            document.getElementById('nav-acc')?.classList.remove('hidden');
            document.querySelector('[data-tab="sell"]')?.classList.remove('hidden'); 
            document.getElementById('nav-admin')?.classList.add('hidden');
            document.getElementById('nav-logout')?.classList.add('hidden');
            
            document.getElementById('nav-saved')?.classList.remove('hidden');
            if(document.getElementById('quick-icons')) document.getElementById('quick-icons').style.display = 'flex';
            if(bellBtn) bellBtn.style.display = 'flex';
            
            const accName = document.getElementById('acc-name');
            if (accName) accName.innerText = currentUser.username;
            const accDisplay = document.getElementById('acc-id-display');
            if (accDisplay) accDisplay.src = currentUser.idPhoto;

            if (currentUser.isDealer) {
                if(document.getElementById('acc-dealer-badge')) document.getElementById('acc-dealer-badge').style.display = 'block';
                if(document.getElementById('boost-container')) document.getElementById('boost-container').classList.remove('hidden');
            } else {
                if(document.getElementById('acc-dealer-badge')) document.getElementById('acc-dealer-badge').style.display = 'none';
                if(document.getElementById('boost-container')) document.getElementById('boost-container').classList.add('hidden');
            }

            const backIdImg = document.getElementById('acc-id-back-display');
            const backIdUploadBox = document.getElementById('upload-back-id-box');
            if (currentUser.idPhotoBack) {
                if(backIdImg) { backIdImg.src = currentUser.idPhotoBack; backIdImg.style.display = 'block'; }
                if(backIdUploadBox) backIdUploadBox.style.display = 'none';
            } else {
                if(backIdImg) backIdImg.style.display = 'none';
                if(backIdUploadBox) backIdUploadBox.style.display = 'block';
            }

            loadInbox();
            loadUserHistory(); 
        }
    } else {
        document.getElementById('nav-auth')?.classList.remove('hidden');
        document.getElementById('nav-acc')?.classList.add('hidden');
        document.getElementById('nav-admin')?.classList.add('hidden');
        document.getElementById('nav-logout')?.classList.add('hidden');
        if(document.getElementById('quick-icons')) document.getElementById('quick-icons').style.display = 'none';
        document.getElementById('nav-saved')?.classList.add('hidden');
    }
}

const saveBackIdBtn = document.getElementById('btn-save-back-id');
if (saveBackIdBtn) {
    saveBackIdBtn.onclick = async () => {
        const fileInput = document.getElementById('profile-upload-back-id');
        const file = fileInput?.files[0];
        if (!file) return alert("Please select an image first.");

        saveBackIdBtn.disabled = true;
        saveBackIdBtn.textContent = "Uploading...";

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
            saveBackIdBtn.disabled = false;
            saveBackIdBtn.textContent = "Upload & Save";
        }, function(err) {
            alert("Error reading image.");
            saveBackIdBtn.disabled = false;
            saveBackIdBtn.textContent = "Upload & Save";
        });
    };
}

// SAFE LOGOUT LOGIC
const performLogout = () => {
    localStorage.removeItem('user_session');
    location.reload();
};

const hiddenLogoutBtn = document.getElementById('logout-btn');
if (hiddenLogoutBtn) hiddenLogoutBtn.onclick = performLogout;

const navLogoutBtn = document.getElementById('nav-logout');
if (navLogoutBtn) navLogoutBtn.onclick = performLogout;

let pendingProductImages = [];

const pImgInput = document.getElementById('p-img');
if (pImgInput) {
    pImgInput.addEventListener('change', function(e) {
        Array.from(this.files).forEach(file => {
            if(file.type.startsWith('image/')) pendingProductImages.push(file);
        });
        renderImagePreviews();
        this.value = ''; 
    });
}

window.removePendingImage = function(index) {
    pendingProductImages.splice(index, 1);
    renderImagePreviews();
};

function renderImagePreviews() {
    const container = document.getElementById('sell-img-previews');
    if(!container) return;
    container.innerHTML = ''; 
    pendingProductImages.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const div = document.createElement('div');
            div.style = "position: relative; display: inline-block;";
            div.innerHTML = `
                <img src="${ev.target.result}" style="width: 75px; height: 75px; object-fit: cover; border-radius: 12px; border: 2px solid var(--border); box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                <span onclick="removePendingImage(${index})" style="position: absolute; top: -8px; right: -8px; background: #ef4444; color: white; border-radius: 50%; width: 24px; height: 24px; text-align: center; line-height: 20px; font-size: 16px; cursor: pointer; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">&times;</span>
            `;
            container.appendChild(div);
        };
        reader.readAsDataURL(file);
    });
}

const boostCheck = document.getElementById('p-boost');
if(boostCheck) {
    boostCheck.onchange = function() {
        const submitBtn = document.getElementById('submit-sell-btn');
        if (submitBtn) submitBtn.textContent = this.checked ? 'Proceed to Payment (₱150)' : 'Post Item';
    };
}

const sellForm = document.getElementById('form-sell');
if (sellForm) {
    sellForm.onsubmit = async (e) => {
        e.preventDefault();
        if (pendingProductImages.length === 0) return alert("Please select at least one image.");

        const submitBtn = document.getElementById('submit-sell-btn');
        if(submitBtn) { submitBtn.disabled = true; submitBtn.textContent = "Compressing Photos..."; }

        try {
            const compressedImagesArray = await Promise.all(pendingProductImages.map(f => compressImageAsync(f, 1200, 1200, 0.8)));
            const isBoosted = document.getElementById('p-boost') ? document.getElementById('p-boost').checked : false;

            const publishToCloud = async () => {
                if(submitBtn) submitBtn.textContent = "Saving Listing...";
                const newItem = {
                    title: document.getElementById('p-title')?.value || "",
                    price: Number(document.getElementById('p-price')?.value) || 0,
                    category: document.getElementById('p-category')?.value || "",
                    desc: document.getElementById('p-desc')?.value || "",
                    seller: currentUser.username,
                    sellerKey: currentUser.username.toLowerCase(),
                    sellerIdPhoto: currentUser.idPhoto, 
                    isDealer: currentUser.isDealer || false, 
                    boosted: isBoosted, 
                    status: 'available', 
                    timestamp: Date.now(),
                    images: compressedImagesArray 
                };
                
                await addDoc(collection(db, "listings"), newItem);

                sellForm.reset();
                pendingProductImages = []; 
                const previewCont = document.getElementById('sell-img-previews');
                if(previewCont) previewCont.innerHTML = ''; 
                if(submitBtn) submitBtn.textContent = "Post Item";
                alert(isBoosted ? "🌟 Boost successful! Item posted to Hot List." : "✅ Item listed successfully!");
                fetchAndRenderListings();
                loadUserHistory();
                showTab('buy');
            };

            if(isBoosted) {
                if(submitBtn) submitBtn.disabled = false;
                window.openPaymentModal('boost', 'Hot List Boost', document.getElementById('p-title')?.value || 'Item', 150, async (receiptStr) => {
                    await addDoc(collection(db, "reservations"), {
                        item: "Listing Boost Fee",
                        buyer: currentUser.username,
                        seller: "VehiSell Admin", 
                        fee: 150,
                        receipt: receiptStr, 
                        timestamp: Date.now()
                    });
                    await publishToCloud();
                });
            } else {
                await publishToCloud();
            }

        } catch (error) {
            console.error(error);
            alert("❌ Failed to list item.");
            if(submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Post Item"; }
        }
    };
}

window.toggleFavorite = (e, docId) => {
    e.stopPropagation();
    if (!currentUser) return alert("You must be logged in to save items.");
    if (currentUser.usernameKey === 'admin') return; 
    
    if (userFavorites.includes(docId)) {
        userFavorites = userFavorites.filter(id => id !== docId);
    } else {
        userFavorites.push(docId);
    }
    localStorage.setItem('user_favorites', JSON.stringify(userFavorites));
    renderFilteredListings(); 
};

window.boostExistingItem = function(docId, title) {
    window.openPaymentModal('boost', 'Hot List Boost', title, 150, async (receiptStr) => {
        await addDoc(collection(db, "reservations"), {
            item: "Listing Boost Fee",
            buyer: currentUser.username,
            seller: "VehiSell Admin", 
            fee: 150,
            receipt: receiptStr, 
            timestamp: Date.now()
        });

        await updateDoc(doc(db, "listings", docId), { 
            boosted: true, 
            timestamp: Date.now() 
        });

        alert("🌟 Boost successful! Your listing has been bumped to the top of the Hot List.");
        fetchAndRenderListings();
        loadUserHistory();
    });
};

function loadUserHistory() {
    if (!currentUser || currentUser.usernameKey === 'admin') return;

    const q = query(collection(db, "listings"), where("sellerKey", "==", currentUser.usernameKey));
    onSnapshot(q, (snapshot) => {
        const historyBox = document.getElementById('user-history-list');
        if(!historyBox) return;
        historyBox.innerHTML = '';
        
        let items = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            data.docId = doc.id;
            items.push(data);
        });

        items.sort((a, b) => b.timestamp - a.timestamp);

        if (items.length === 0) {
            historyBox.innerHTML = '<p style="color: var(--light); text-align: center;">No history yet.</p>';
            return;
        }

        items.forEach(item => {
            const div = document.createElement('div');
            div.style = "display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid var(--border); flex-wrap: wrap; gap: 10px;";
            
            const thumb = item.images && item.images.length > 0 ? item.images[0] : item.image;
            
            let statusBadge = '';
            let actionButtons = '';

            const canBoost = item.status === 'available' && !item.boosted;
            const boostBtnHtml = canBoost 
                ? `<button class="btn-boost" onclick="boostExistingItem('${item.docId}', '${item.title.replace(/'/g, "\\'")}')">🚀 Boost (₱150)</button>` 
                : '';

            if (item.status === 'sold') {
                statusBadge = `<span style="background: #ef4444; color: white; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: bold;">SOLD</span>`;
                actionButtons = `<button class="btn-del" style="background:var(--border);color:var(--text);padding:8px 15px;border:none;border-radius:8px;cursor:not-allowed;" disabled>Closed</button>`;
            } else if (item.status === 'reserved') {
                statusBadge = `<span style="background: #f59e0b; color: white; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: bold;">RESERVED</span>`;
                actionButtons = `<button class="btn-primary" style="background:#10b981;padding:8px 15px;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem;" onclick="markAsSold('${item.docId}')">Mark as Sold</button>`;
            } else {
                statusBadge = item.boosted 
                    ? `<span style="background: linear-gradient(135deg, #f59e0b, #fbbf24); color: white; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: bold; box-shadow: 0 2px 10px rgba(245,158,11,0.3);">🌟 BOOSTED</span>`
                    : `<span style="background: #10b981; color: white; padding: 4px 10px; border-radius: 6px; font-size: 0.75rem; font-weight: bold;">AVAILABLE</span>`;
                
                actionButtons = `
                    <div style="display: flex; gap: 8px; flex-direction: column;">
                        ${boostBtnHtml}
                        <button class="btn-del" style="background:#ef4444;color:white;padding:8px 15px;border:none;border-radius:8px;cursor:pointer;font-size:0.9rem; width:100%;" onclick="deleteItem('${item.docId}')">Delete</button>
                    </div>
                `;
            }

            div.innerHTML = `
                <div style="display: flex; gap: 15px; align-items: center; flex: 1; min-width: 200px;">
                    <img src="${thumb}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border);">
                    <div>
                        <strong style="color: var(--text); font-size: 1.1rem; display: block; margin-bottom: 5px;">${item.title}</strong>
                        ${statusBadge}
                    </div>
                </div>
                <div style="min-width: 120px;">${actionButtons}</div>
            `;
            historyBox.appendChild(div);
        });
    });
}

window.markAsSold = async function(docId) {
    if(confirm("Marking this item as SOLD will permanently remove it from the marketplace. Ensure you have received full payment. Continue?")) {
        try {
            await updateDoc(doc(db, "listings", docId), { status: 'sold' });
            alert("✅ Item successfully marked as SOLD!");
            fetchAndRenderListings(); 
        } catch(e) {
            alert("Error updating status.");
            console.error(e);
        }
    }
};

async function fetchAndRenderListings() {
    const targetGridId = currentTab === 'saved' ? 'saved-grid' : 'listings-grid';
    const grid = document.getElementById(targetGridId);
    if(!grid) return;
    grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color: var(--light);">Loading premium listings...</p>';

    try {
        const querySnapshot = await getDocs(collection(db, "listings"));
        allListings = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            data.docId = doc.id; 
            if(!data.status) data.status = 'available'; 
            allListings.push(data);
        });
        
        renderFilteredListings();

    } catch (error) {
        console.error(error);
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; color: red;">Error loading items.</p>';
    }
}

['search-input', 'category-filter', 'min-price', 'max-price', 'sort-filter'].forEach(id => {
    const el = document.getElementById(id);
    if(el) {
        el.addEventListener('input', () => {
            currentLimit = 12;
            renderFilteredListings();
        });
    }
});

const loadMoreBtn = document.getElementById('btn-load-more');
if(loadMoreBtn) {
    loadMoreBtn.onclick = () => {
        currentLimit += 12;
        renderFilteredListings();
    };
}

function renderFilteredListings() {
    const targetGridId = currentTab === 'saved' ? 'saved-grid' : 'listings-grid';
    const grid = document.getElementById(targetGridId);
    if(!grid) return;
    grid.innerHTML = '';

    const filterTerm = document.getElementById('search-input')?.value.toLowerCase() || "";
    const filterCat = document.getElementById('category-filter')?.value || "all";
    const minP = Number(document.getElementById('min-price')?.value) || 0;
    const maxP = Number(document.getElementById('max-price')?.value) || Infinity;
    const sortOrder = document.getElementById('sort-filter')?.value || "newest";

    let filtered = allListings.filter(item => {
        if (item.status === 'sold') return false; 
        
        if (currentTab === 'saved') {
            return userFavorites.includes(item.docId);
        }

        if (filterCat !== 'all' && item.category !== filterCat) return false;
        if (filterTerm && !item.title.toLowerCase().includes(filterTerm)) return false;
        if (item.price < minP || item.price > maxP) return false;

        return true;
    });

    if (sortOrder === 'price-asc') {
        filtered.sort((a,b) => a.price - b.price);
    } else if (sortOrder === 'price-desc') {
        filtered.sort((a,b) => b.price - a.price);
    } else {
        filtered.sort((a,b) => b.timestamp - a.timestamp); 
    }

    filtered.sort((a, b) => (b.boosted ? 1 : 0) - (a.boosted ? 1 : 0));

    if (filtered.length === 0) {
        grid.innerHTML = '<p style="text-align:center; grid-column:1/-1; padding: 3rem; color: var(--light); font-size:1.1rem;">No items found matching your criteria.</p>';
        const loadContainer = document.getElementById('load-more-container');
        if(loadContainer) loadContainer.style.display = 'none';
        return;
    }

    const toDisplay = filtered.slice(0, currentLimit);

    toDisplay.forEach(item => {
        const isOwner = currentUser && currentUser.username === item.seller;
        const isAdmin = currentUser && currentUser.usernameKey === 'admin'; 
        
        const thumbnailSrc = item.images && item.images.length > 0 ? item.images[0] : item.image;
        const datePosted = new Date(item.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        const reservedBadge = item.status === 'reserved' 
            ? `<div class="status-badge status-reserved">Reserved</div>` 
            : '';
            
        const boostBadge = item.boosted 
            ? `<div class="boost-badge">🌟 Featured</div>` 
            : '';
            
        const boostClass = item.boosted ? 'boosted-card' : '';
        const dealerIcon = item.isDealer ? `<span style="color:#3b82f6; font-size:0.85rem;" title="Verified Dealer">☑️</span>` : '';
        const heartClass = userFavorites.includes(item.docId) ? 'heart-btn active' : 'heart-btn';
        
        const heartBtnHtml = isAdmin ? '' : `<button class="${heartClass}" style="position: absolute; top: 15px; right: 15px; z-index: 50;" onclick="toggleFavorite(event, '${item.docId}')">❤️</button>`;

        const card = document.createElement('div');
        card.className = `product-card ${boostClass}`;
        card.innerHTML = `
            <div onclick="openProductModal('${item.docId}')" style="cursor: pointer;">
                <div class="img-wrapper">
                    ${boostBadge}
                    ${reservedBadge}
                    <img src="${thumbnailSrc}" class="product-img" alt="${item.title}">
                </div>
            </div>
            
            ${item.sellerIdPhoto ? `
            <div class="id-badge" onclick="viewFullImage('${item.sellerIdPhoto}')" title="Click to view ID">
                <img src="${item.sellerIdPhoto}" class="id-preview">
                <span>Verified</span>
            </div>` : ''}

            ${heartBtnHtml}

            <div onclick="openProductModal('${item.docId}')" style="cursor: pointer; display: flex; flex-direction: column; flex: 1;">
                <div class="product-body" style="padding-bottom: 0;">
                    <p class="price">₱${Number(item.price).toLocaleString()}</p>
                    <h3>${item.title}</h3>
                    <p class="desc" style="margin-bottom: 5px;">${item.desc}</p>
                    <p style="font-size: 0.75rem; color: var(--light); margin: 0 0 10px 0; font-weight: 600;">📅 Posted: ${datePosted}</p>
                </div>
            </div>
            
            <div class="product-body" style="padding-top: 0; flex: 0;">
                <div class="card-footer" style="flex-direction: column; align-items: stretch; gap: 10px; border-top: none;">
                    <span style="font-weight: 800; color: var(--text);">👤 ${item.seller} ${dealerIcon}</span>
                    <button class="btn-primary" style="padding:0.8rem;border-radius:12px;cursor:pointer;flex:1;" onclick="openProductModal('${item.docId}')">View Details</button>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });

    const loadContainer = document.getElementById('load-more-container');
    if (loadContainer) {
        if (filtered.length > currentLimit && currentTab !== 'saved') {
            loadContainer.style.display = 'block';
        } else {
            loadContainer.style.display = 'none';
        }
    }
}

window.currentGalleryImages = [];
window.currentGalleryIndex = 0;
window.currentActiveListing = null; 

window.openProductModal = function(docId) {
    const item = allListings.find(i => i.docId === docId);
    if (!item) return;

    window.currentActiveListing = item;

    if(document.getElementById('pm-title')) document.getElementById('pm-title').innerText = item.title;
    if(document.getElementById('pm-price')) document.getElementById('pm-price').innerText = `₱${Number(item.price).toLocaleString()}`;
    if(document.getElementById('pm-desc')) document.getElementById('pm-desc').innerText = item.desc;
    
    const dealerIcon = item.isDealer ? `<span style="color:#3b82f6; font-size:0.95rem;">☑️</span>` : '';
    if(document.getElementById('pm-seller-name')) document.getElementById('pm-seller-name').innerHTML = `${item.seller} ${dealerIcon}`;
    
    window.currentGalleryImages = item.images && item.images.length > 0 ? item.images : [item.image];
    window.currentGalleryIndex = 0;
    
    renderGallery();

    const isAdmin = currentUser && currentUser.usernameKey === 'admin';
    const isOwner = currentUser && currentUser.username === item.seller;
    
    const reportBtn = document.getElementById('pm-report-btn');
    if (reportBtn) {
        reportBtn.style.display = (isAdmin || isOwner) ? 'none' : 'inline-block';
    }

    const actionsDiv = document.getElementById('pm-actions');
    if(actionsDiv) {
        actionsDiv.innerHTML = '';

        if (isAdmin) {
            actionsDiv.innerHTML = `<button class="btn-del" style="background:#ef4444;color:white;padding:1rem 2rem;border:none;border-radius:12px;cursor:pointer;font-weight:800;" onclick="deleteItem('${item.docId}')">Delete Listing (Admin Action)</button>`;
        } 
        else if (isOwner) {
            actionsDiv.innerHTML = `<button class="btn-del" style="background:#ef4444;color:white;padding:1rem 2rem;border:none;border-radius:12px;cursor:pointer;font-weight:800;" onclick="deleteItem('${item.docId}')">Remove Listing</button>`;
        } else {
            const isReserved = item.status === 'reserved';
            const reserveBtnHtml = isReserved 
                ? `<button class="btn-contact" style="background:#94a3b8;color:white;padding:1rem 1.5rem;border:none;border-radius:12px;cursor:not-allowed;font-weight:800;" disabled>Item is Reserved</button>`
                : `<button class="btn-contact" style="background:#10b981;color:white;padding:1rem 1.5rem;border:none;border-radius:12px;cursor:pointer;font-weight:800;" onclick="openPaymentModal('reserve', 'Reserve Item', '${item.title.replace(/'/g, "\\'")}', ${item.price * 0.05}, processReservation)">Reserve (5%)</button>`;

            window.pendingReservation = { docId: item.docId, title: item.title, sellerKey: item.sellerKey, sellerName: item.seller, fee: item.price * 0.05 };

            actionsDiv.innerHTML = `
                <button class="btn-contact" style="background:#64748b;color:white;padding:1rem 1.5rem;border:none;border-radius:12px;cursor:pointer;font-weight:700;" onclick="contactSeller('${item.sellerKey}')">Contact</button>
                <button class="btn-contact" style="background:var(--primary);color:white;padding:1rem 1.5rem;border:none;border-radius:12px;cursor:pointer;font-weight:700;" onclick="openChatModal('${item.sellerKey}', '${item.seller.replace(/'/g, "\\'")}')">Live Chat</button>
                ${reserveBtnHtml}
            `;
        }
    }

    document.getElementById('product-modal')?.classList.remove('hidden');
};

window.reportCurrentListing = async function() {
    if(!currentUser) return alert("You must be logged in to report a listing.");
    const reason = prompt("Why are you reporting this listing? (Spam, Fake, Inappropriate, etc.)");
    
    if(reason && reason.trim() !== '') {
        try {
            await addDoc(collection(db, "reports"), {
                docId: window.currentActiveListing.docId,
                title: window.currentActiveListing.title,
                seller: window.currentActiveListing.seller,
                reporter: currentUser.username,
                reason: reason,
                timestamp: Date.now()
            });
            alert("🚩 Listing reported. Our Admin team will review this immediately.");
        } catch(e) {
            console.error(e);
            alert("Failed to send report.");
        }
    }
};

window.renderGallery = function() {
    const mainImg = document.getElementById('pm-main-img');
    if(mainImg) mainImg.src = window.currentGalleryImages[window.currentGalleryIndex];
    
    const thumbsContainer = document.getElementById('pm-thumbnails');
    if(!thumbsContainer) return;
    thumbsContainer.innerHTML = '';
    
    if(window.currentGalleryImages.length > 1) {
        window.currentGalleryImages.forEach((imgSrc, idx) => {
            const img = document.createElement('img');
            img.src = imgSrc;
            const isActive = idx === window.currentGalleryIndex;
            img.style = `height: 60px; width: 60px; min-width: 60px; object-fit: cover; border-radius: 6px; cursor: pointer; box-sizing: border-box; border: 3px solid ${isActive ? 'var(--primary)' : 'transparent'}; opacity: ${isActive ? '1' : '0.5'}; transition: all 0.2s ease; margin: 0;`;
            img.onclick = () => { window.currentGalleryIndex = idx; renderGallery(); };
            thumbsContainer.appendChild(img);
        });
    }
};

window.prevGalleryImage = function(e) {
    e.stopPropagation();
    if(window.currentGalleryImages.length <= 1) return;
    window.currentGalleryIndex = (window.currentGalleryIndex - 1 + window.currentGalleryImages.length) % window.currentGalleryImages.length;
    renderGallery();
};

window.nextGalleryImage = function(e) {
    e.stopPropagation();
    if(window.currentGalleryImages.length <= 1) return;
    window.currentGalleryIndex = (window.currentGalleryIndex + 1) % window.currentGalleryImages.length;
    renderGallery();
};

window.deleteItem = async function(docId) {
    if (confirm("Delete this listing from the cloud?")) {
        try {
            await deleteDoc(doc(db, "listings", docId));
            document.getElementById('product-modal')?.classList.add('hidden'); 
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

        if(document.getElementById('modal-seller-name')) document.getElementById('modal-seller-name').innerText = sellerData.username;
        if(document.getElementById('modal-seller-avatar')) document.getElementById('modal-seller-avatar').src = sellerData.idPhoto;

        const phoneBtn = document.getElementById('modal-seller-phone');
        if(phoneBtn) {
            phoneBtn.href = `tel:${sellerData.phone}`; 
            phoneBtn.innerText = `📞 Call / SMS: ${sellerData.phone}`;
        }

        const fbBtn = document.getElementById('modal-seller-fb');
        if(fbBtn) {
            let cleanFbLink = sellerData.fb.startsWith('http') ? sellerData.fb : `https://${sellerData.fb}`;
            fbBtn.href = cleanFbLink;
        }

        if(document.getElementById('modal-seller-address')) document.getElementById('modal-seller-address').style.display = 'none';
        document.getElementById('seller-modal')?.classList.remove('hidden');
    } catch (error) {
        alert("Error loading seller info.");
    }
};

window.processReservation = async function(compressedReceipt) {
    await addDoc(collection(db, "notifications"), {
        targetUser: window.pendingReservation.sellerKey,
        type: 'reserve',
        fromUser: currentUser.username,
        itemName: window.pendingReservation.title,
        timestamp: Date.now()
    });

    await addDoc(collection(db, "reservations"), {
        item: window.pendingReservation.title,
        buyer: currentUser.username,
        seller: window.pendingReservation.sellerName, 
        fee: window.pendingReservation.fee,
        receipt: compressedReceipt, 
        timestamp: Date.now()
    });

    await updateDoc(doc(db, "listings", window.pendingReservation.docId), { status: 'reserved' });

    sendEmailNotification(
        window.pendingReservation.sellerKey, 
        "Item Reserved!", 
        `Great news! Your item ${window.pendingReservation.title} was just reserved by ${currentUser.username}. Log in to chat with them to complete the sale.`
    );

    alert("✅ Payment submitted successfully! The item is now reserved and the seller has been notified.");
    fetchAndRenderListings();
};

let currentChatUnsubscribe = null;
let activeChatUserId = null;

function getChatId(user1, user2) {
    return user1 < user2 ? `${user1}_${user2}` : `${user2}_${user1}`;
}

window.openChatModal = function(sellerKey, sellerName) {
    if (!currentUser) { alert("Login required to chat."); showTab('auth'); return; }
    
    activeChatUserId = sellerKey;
    if(document.getElementById('chat-target-name')) document.getElementById('chat-target-name').innerText = "Chat with " + sellerName;
    document.getElementById('product-modal')?.classList.add('hidden'); 
    document.getElementById('chat-modal')?.classList.remove('hidden');

    const chatId = getChatId(currentUser.usernameKey, sellerKey);
    const q = query(collection(db, "messages"), where("chatId", "==", chatId));

    if (currentChatUnsubscribe) currentChatUnsubscribe();

    currentChatUnsubscribe = onSnapshot(q, (snapshot) => {
        let msgs = [];
        snapshot.forEach(doc => msgs.push(doc.data()));
        msgs.sort((a, b) => a.timestamp - b.timestamp);

        const chatBox = document.getElementById('chat-messages');
        if(!chatBox) return;
        chatBox.innerHTML = '';
        
        msgs.forEach(m => {
            const div = document.createElement('div');
            div.className = 'chat-bubble ' + (m.sender === currentUser.usernameKey ? 'sent' : 'received');
            
            const timeString = new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            
            let innerHtml = '';
            if (m.imageUrl) {
                innerHtml += `<img src="${m.imageUrl}" style="max-width: 100%; border-radius: 8px; margin-bottom: 8px; cursor: zoom-in;" onclick="viewFullImage('${m.imageUrl}')"><br>`;
            }
            if (m.text) {
                innerHtml += `<span style="display: block;">${m.text}</span>`;
            }
            
            innerHtml += `<span style="display: block; font-size: 0.65rem; opacity: 0.6; margin-top: 6px; text-align: right; font-weight: 600;">${timeString}</span>`;
            
            div.innerHTML = innerHtml;
            chatBox.appendChild(div);
        });
        
        chatBox.scrollTop = chatBox.scrollHeight; 
    });
};

window.closeChatModal = function() {
    document.getElementById('chat-modal')?.classList.add('hidden');
    activeChatUserId = null; 
};

window.removeChatImg = function() {
    const chatImgInput = document.getElementById('chat-img-input');
    if(chatImgInput) chatImgInput.value = '';
    const chatImgPreviewContainer = document.getElementById('chat-img-preview-container');
    if(chatImgPreviewContainer) chatImgPreviewContainer.style.display = 'none';
};

const chatImgInput = document.getElementById('chat-img-input');
if(chatImgInput) {
    chatImgInput.onchange = function(e) {
        const file = e.target.files[0];
        if(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if(document.getElementById('chat-img-preview')) document.getElementById('chat-img-preview').src = e.target.result;
                if(document.getElementById('chat-img-preview-container')) document.getElementById('chat-img-preview-container').style.display = 'block';
            };
            reader.readAsDataURL(file);
        }
    };
}

const formChat = document.getElementById('form-chat');
if(formChat) {
    formChat.onsubmit = async (e) => {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        const fileInput = document.getElementById('chat-img-input');
        
        const text = input?.value.trim() || "";
        const file = fileInput?.files[0];
        
        if (!text && !file) return;

        const submitBtn = document.querySelector('#form-chat button[type="submit"]');
        if(submitBtn) submitBtn.disabled = true;

        try {
            let imgBase64 = null;
            if (file) {
                imgBase64 = await compressImageAsync(file, 800, 800, 0.7); 
            }

            if(input) input.value = '';
            removeChatImg();

            const chatId = getChatId(currentUser.usernameKey, activeChatUserId);

            await addDoc(collection(db, "messages"), {
                chatId: chatId,
                sender: currentUser.usernameKey,
                text: text,
                imageUrl: imgBase64, 
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
        if(submitBtn) submitBtn.disabled = false;
    };
}

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
    if(!container) return;

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
        const dropdownBox = document.getElementById('dropdown-list');
        if(!dropdownBox) return;
        dropdownBox.innerHTML = '';
        
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

        const notifBadge = document.getElementById('notif-badge');

        if(interactors.size === 0) {
            dropdownBox.innerHTML = '<p style="color: var(--light); text-align: center; margin: 20px 0; font-size: 0.9rem;">No messages yet.</p>';
            if(notifBadge) notifBadge.classList.add('hidden');
            return;
        } else {
            if(notifBadge) {
                notifBadge.innerText = interactors.size;
                notifBadge.classList.remove('hidden');
            }
        }

        interactors.forEach((data, user) => {
            let actionText = data.type === 'reserve' ? 'reserved your item.' : 'sent you a message.';
            
            const dropDiv = document.createElement('div');
            dropDiv.style = "display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid var(--border); cursor: pointer; transition: background 0.2s;";
            dropDiv.onmouseover = () => dropDiv.style.background = 'var(--bg)';
            dropDiv.onmouseout = () => dropDiv.style.background = 'transparent';
            dropDiv.onclick = () => {
                document.getElementById('notif-dropdown')?.classList.add('hidden'); 
                openChatModal(user.toLowerCase(), user); 
            };
            dropDiv.innerHTML = `
                <div>
                    <strong style="color: var(--text); font-size: 1.05rem;">${user}</strong>
                    <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: var(--light);">${actionText}</p>
                </div>
                <span style="font-size: 1.5rem; color: var(--primary);">💬</span>
            `;
            dropdownBox.appendChild(dropDiv);
        });
    });
}

async function loadAdminDashboard() {
    const resQuery = query(collection(db, "reservations"));
    const withQuery = query(collection(db, "withdrawals"));
    
    const updateDashboardUI = () => {
        let grossProfit = 0;
        let adminReserves = [];
        let adminWithdrawals = [];
        
        // This is safe since it's driven by snapshot callbacks below
    };

    onSnapshot(resQuery, (snapshot) => {
        let grossProfit = 0;
        let allLogs = [];
        snapshot.forEach(doc => {
            const r = doc.data();
            grossProfit += Number(r.fee);
            allLogs.push({ type: 'reserve', data: r, time: r.timestamp });
        });

        // Store these globally to compute balance properly if needed
        window.tempAdminGross = grossProfit;
        window.tempAdminReservesLogs = allLogs;
        
        if(window.tempAdminWithdrawn !== undefined) {
            renderAdminFinancials();
        }
    });

    onSnapshot(withQuery, (snapshot) => {
        let totalWithdrawn = 0;
        let allLogs = [];
        snapshot.forEach(doc => {
            const w = doc.data();
            totalWithdrawn += Number(w.amount);
            allLogs.push({ type: 'withdraw', data: w, time: w.timestamp });
        });
        
        window.tempAdminWithdrawn = totalWithdrawn;
        window.tempAdminWithdrawLogs = allLogs;
        
        if(window.tempAdminGross !== undefined) {
            renderAdminFinancials();
        }
    });

    try {
        const usersSnap = await getDocs(collection(db, "users"));
        if(document.getElementById('admin-total-users')) document.getElementById('admin-total-users').innerText = usersSnap.size.toLocaleString();

        const listingsSnap = await getDocs(collection(db, "listings"));
        let active = 0, reserved = 0, sold = 0;
        
        listingsSnap.forEach(doc => {
            const status = doc.data().status || 'available';
            if(status === 'sold') sold++;
            else if(status === 'reserved') reserved++;
            else active++;
        });

        if(document.getElementById('admin-total-listings')) document.getElementById('admin-total-listings').innerText = active.toLocaleString();
        if(document.getElementById('admin-total-reserved')) document.getElementById('admin-total-reserved').innerText = reserved.toLocaleString();
        if(document.getElementById('admin-total-sold')) document.getElementById('admin-total-sold').innerText = sold.toLocaleString();
    } catch(err) {
        console.error("Could not fetch counts", err);
    }

    const qPending = query(collection(db, "users"), where("isVerified", "==", false));
    onSnapshot(qPending, (snapshot) => {
        const pendingBox = document.getElementById('admin-pending-users');
        if(!pendingBox) return;
        pendingBox.innerHTML = '';
        
        if(snapshot.empty) {
            pendingBox.innerHTML = '<p style="color: var(--light); text-align: center; margin: 20px 0;">No pending accounts.</p>';
            return;
        }

        snapshot.forEach(docSnap => {
            const u = docSnap.data();
            const uId = docSnap.id;
            
            const div = document.createElement('div');
            div.style = "padding: 20px; border-bottom: 1px solid var(--border); margin-bottom: 15px; background: var(--card-bg); border-radius: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.02);";
            div.innerHTML = `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                    <div>
                        <strong style="font-size: 1.2rem; color: var(--text);">${u.username}</strong>
                        <p style="margin: 2px 0 0 0; font-size: 0.9rem; color: var(--light); font-weight: 600;">${u.email}</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn-primary" style="background: #10b981; padding: 8px 20px; width: auto;" onclick="approveUser('${uId}', '${u.username}', '${u.usernameKey}')">Approve</button>
                        <button class="btn-secondary" style="padding: 8px 20px; width: auto; margin: 0; border: none; background: #fee2e2; color: #ef4444;" onclick="rejectUser('${uId}')">Reject</button>
                    </div>
                </div>
                <div style="display: flex; gap: 15px;">
                    <div style="flex: 1;">
                        <p style="font-size: 0.85rem; margin: 0 0 8px 0; font-weight: 800; color: var(--light);">Front ID</p>
                        <img src="${u.idPhoto}" onclick="viewFullImage('${u.idPhoto}')" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px; border: 2px solid var(--border); cursor: zoom-in;">
                    </div>
                    ${u.idPhotoBack ? `
                    <div style="flex: 1;">
                        <p style="font-size: 0.85rem; margin: 0 0 8px 0; font-weight: 800; color: var(--light);">Back ID</p>
                        <img src="${u.idPhotoBack}" onclick="viewFullImage('${u.idPhotoBack}')" style="width: 100%; height: 120px; object-fit: cover; border-radius: 8px; border: 2px solid var(--border); cursor: zoom-in;">
                    </div>` : '<div style="flex: 1; display:flex; align-items:center; justify-content:center; background:var(--bg); border-radius:8px; border:2px dashed var(--border);"><p style="font-size: 0.85rem; margin: 0; color:var(--light); font-weight:600;">No Back ID Provided</p></div>'}
                </div>
            `;
            pendingBox.appendChild(div);
        });
    });

    const qVerified = query(collection(db, "users"), where("isVerified", "==", true));
    onSnapshot(qVerified, (snapshot) => {
        const allUsersBox = document.getElementById('admin-all-users');
        if(!allUsersBox) return;
        allUsersBox.innerHTML = '';
        
        let count = 0;
        snapshot.forEach(docSnap => {
            const u = docSnap.data();
            const uId = docSnap.id;
            
            if(u.usernameKey === 'admin') return; 
            count++;
            
            const badge = u.isDealer 
                ? `<span style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:bold;">Premium Dealer</span>` 
                : `<span style="background:#64748b; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem; font-weight:bold;">Standard User</span>`;

            allUsersBox.innerHTML += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 15px; border-bottom: 1px solid var(--border); background: var(--card-bg); border-radius: 8px; margin-bottom: 10px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${u.idPhoto}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; border:1px solid var(--border); cursor:zoom-in;" onclick="viewFullImage('${u.idPhoto}')">
                        <div>
                            <strong style="color:var(--text);">${u.username}</strong> ${badge}<br>
                            <span style="font-size:0.8rem; color:var(--light);">${u.email} | ${u.phone}</span>
                        </div>
                    </div>
                    <button class="btn-del" style="background:#ef4444; color:white; border:none; padding:8px 15px; border-radius:8px; cursor:pointer; font-size:0.85rem;" onclick="banUser('${uId}', '${u.username.replace(/'/g, "\\'")}')">Ban User</button>
                </div>
            `;
        });
        
        if(count === 0) allUsersBox.innerHTML = '<p style="color: var(--light); text-align: center; margin: 20px 0;">No active users found.</p>';
    });

    const reportsQuery = query(collection(db, "reports"));
    onSnapshot(reportsQuery, (snapshot) => {
        const box = document.getElementById('admin-reports');
        if(!box) return;
        box.innerHTML = '';
        if(snapshot.empty) {
            box.innerHTML = '<p style="color: var(--light); text-align: center; margin: 20px 0;">No reported listings.</p>';
            return;
        }
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            box.innerHTML += `
                <div style="padding: 15px; background: var(--card-bg); border-radius: 12px; margin-bottom: 10px; border: 1px solid #fecdd3; box-shadow: 0 4px 10px rgba(225,29,72,0.05);">
                    <strong style="color: var(--text); font-size: 1.1rem;">Listing: ${data.title}</strong><br>
                    <span style="color: var(--light); font-size: 0.9rem;">Seller: ${data.seller}</span><br><br>
                    <span style="color: #e11d48; font-size: 0.95rem; font-weight: bold;">Reason: "${data.reason}"</span><br>
                    <span style="color: var(--light); font-size: 0.8rem;">Reported by: ${data.reporter}</span>
                    <div style="display: flex; gap: 10px; margin-top: 15px;">
                        <button class="btn-del" onclick="deleteItem('${data.docId}'); dismissReport('${docSnap.id}');" style="padding: 8px 15px; background: #ef4444; color: white; border: none; border-radius: 8px; cursor: pointer;">Delete Listing</button>
                        <button class="btn-secondary" onclick="dismissReport('${docSnap.id}')" style="padding: 8px 15px; width: auto; margin: 0;">Dismiss Flag</button>
                    </div>
                </div>
            `;
        });
    });
}

function renderAdminFinancials() {
    let currentTotalAdminProfit = (window.tempAdminGross || 0) - (window.tempAdminWithdrawn || 0);
    const profitEl = document.getElementById('admin-total-profit');
    if(profitEl) profitEl.innerText = currentTotalAdminProfit.toLocaleString(undefined, {minimumFractionDigits: 2});

    const logsBox = document.getElementById('admin-logs');
    if(!logsBox) return;
    logsBox.innerHTML = '';
    
    let allLogs = (window.tempAdminReservesLogs || []).concat(window.tempAdminWithdrawLogs || []);
    allLogs.sort((a, b) => b.time - a.time);

    if (allLogs.length === 0) {
        logsBox.innerHTML = '<p style="color: var(--light); text-align: center; margin: 20px 0;">No system transactions yet.</p>';
    } else {
        allLogs.forEach(log => {
            const logItem = document.createElement('div');
            logItem.style = "padding: 15px; border-bottom: 1px solid var(--border); font-size: 0.95rem;";
            
            const timeString = new Date(log.time).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            if (log.type === 'reserve') {
                const r = log.data;
                let logText = `<strong>${r.buyer}</strong> reserved <em>${r.item}</em> from <strong>${r.seller}</strong>`;
                if (r.item.includes("Listing Boost Fee") || r.item.includes("Premium Dealer Registration")) {
                    logText = `<strong>${r.buyer}</strong> paid for <em>${r.item}</em>`;
                }
                logItem.innerHTML = `
                    <div style="display:flex; justify-content: space-between; align-items: center;">
                        <span style="color: var(--text);">${logText}</span>
                        <span style="color: #10b981; font-weight: 800; font-size: 1.1rem;">+₱${Number(r.fee).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                    <div style="display:flex; justify-content: space-between; margin-top: 8px; font-size: 0.85rem;">
                        <span style="color: var(--light); font-weight: 600;">${timeString}</span>
                        ${r.receipt ? `<span onclick="viewFullImage('${r.receipt}')" style="color:var(--primary); font-weight:800; cursor: pointer;">🔍 View Receipt</span>` : ''}
                    </div>
                `;
            } else {
                const w = log.data;
                logItem.innerHTML = `
                    <div style="display:flex; justify-content: space-between; align-items: center;">
                        <span style="color: var(--text);"><strong>Bank Withdrawal</strong></span>
                        <span style="color: #ef4444; font-weight: 800; font-size: 1.1rem;">-₱${Number(w.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    </div>
                    <div style="display:flex; justify-content: space-between; margin-top: 8px; font-size: 0.85rem;">
                        <span style="color: var(--light); font-weight: 600;">${timeString}</span>
                        <span style="color: var(--light); font-weight:800;">🏦 Processed</span>
                    </div>
                `;
            }
            logsBox.appendChild(logItem);
        });
    }
}

window.banUser = async function(docId, username) {
    if(confirm(`Are you absolutely sure you want to PERMANENTLY BAN and delete ${username} from the platform?`)) {
        try {
            await deleteDoc(doc(db, "users", docId));
            alert(`🔨 User ${username} has been permanently banned.`);
        } catch(e) {
            alert("Error banning user.");
        }
    }
};

window.dismissReport = async function(reportId) {
    try { await deleteDoc(doc(db, "reports", reportId)); } 
    catch(e) { console.error("Error dismissing report"); }
};

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

const withdrawBtn = document.getElementById('btn-withdraw');
if(withdrawBtn) {
    withdrawBtn.onclick = async () => {
        let currentTotalAdminProfit = (window.tempAdminGross || 0) - (window.tempAdminWithdrawn || 0);
        if(currentTotalAdminProfit <= 0) {
            alert("You have no funds available to withdraw.");
            return;
        }

        const amountStr = prompt(`You have ₱${currentTotalAdminProfit.toLocaleString(undefined, {minimumFractionDigits: 2})} available.\n\nHow much would you like to withdraw?`, currentTotalAdminProfit);
        
        if (amountStr === null) return; 

        const amountToWithdraw = Number(amountStr.replace(/,/g, ''));

        if (isNaN(amountToWithdraw) || amountToWithdraw <= 0) {
            alert("⚠️ Invalid amount entered.");
            return;
        }

        if (amountToWithdraw > currentTotalAdminProfit) {
            alert("⚠️ Insufficient funds! You cannot withdraw more than your available profit.");
            return;
        }

        if(confirm(`Confirm withdrawal of ₱${amountToWithdraw.toLocaleString(undefined, {minimumFractionDigits: 2})} to your bank account?`)) {
            try {
                withdrawBtn.disabled = true;
                withdrawBtn.textContent = "Processing...";

                await addDoc(collection(db, "withdrawals"), {
                    amount: amountToWithdraw,
                    timestamp: Date.now()
                });

                alert(`✅ ₱${amountToWithdraw.toLocaleString()} Withdrawal Requested! Funds will reflect in your bank account within 2-3 business days.`);
                
                withdrawBtn.disabled = false;
                withdrawBtn.textContent = "🏦 Withdraw Funds to Bank";

            } catch(err) {
                alert("Error processing withdrawal.");
                withdrawBtn.disabled = false;
                withdrawBtn.textContent = "🏦 Withdraw Funds to Bank";
            }
        }
    };
}

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
    const paymentModal = document.getElementById('payment-modal');
    const imageModal = document.getElementById('image-modal');
    const productModal = document.getElementById('product-modal'); 
    const notifDropdown = document.getElementById('notif-dropdown');
    const otpModal = document.getElementById('otp-modal');
    
    if (event.target === sellerModal) sellerModal.classList.add('hidden');
    if (event.target === paymentModal) paymentModal.classList.add('hidden');
    if (event.target === imageModal) imageModal.classList.add('hidden');
    if (event.target === productModal) productModal.classList.add('hidden');
    if (otpModal && event.target === otpModal) otpModal.classList.add('hidden');

    if (notifDropdown && !notifDropdown.classList.contains('hidden')) {
        if (!event.target.closest('#quick-icons')) {
            notifDropdown.classList.add('hidden');
        }
    }
};

const searchInput = document.getElementById('search-input');
if(searchInput) {
    searchInput.oninput = (e) => {
        currentLimit = 12;
        renderFilteredListings();
    };
}

const catFilter = document.getElementById('category-filter');
if(catFilter) {
    catFilter.onchange = (e) => {
        currentLimit = 12;
        renderFilteredListings();
    };
}

showTab('home');
updateNav();
fetchAndRenderListings();
if (currentUser) listenForLiveAlerts();
