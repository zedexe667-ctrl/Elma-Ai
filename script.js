
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js';
import {
    getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, updateEmail, reauthenticateWithCredential, EmailAuthProvider, linkWithCredential, sendPasswordResetEmail, signInWithRedirect, reauthenticateWithPopup,   // ← اینو اضافه کن
    getRedirectResult, setPersistence, browserLocalPersistence, updatePassword
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js';
import {
    getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, query, orderBy, where, limit,
    onSnapshot, deleteDoc, getDocs, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL, } from 'https://www.gstatic.com/firebasejs/10.7.0/firebase-storage.js';
const firebaseConfig = {
    apiKey: "AIzaSyD_Ar1zFTBS9DDFlAflPt2IpcQ5y8EI5pE",
    authDomain: "zed-exe-48839.firebaseapp.com",
    projectId: "zed-exe-48839",
    storageBucket: "zed-exe-48839.firebasestorage.app",
    messagingSenderId: "283941493182",
    appId: "1:283941493182:web:7a9deae50c01c9feb8c1ef",
    measurementId: "G-014WZDJBSL"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
// Global variables
let serverOffset = 0;
let currentUser = null;
let currentChatId = null;
let chatHistory = [];
let galleryImages = [];
let registrationTimer = null;
let isElmaResponding = false;
// Usage tracking for free users
let usageCount = {
    photo: 3,
    chat: 25,
};
// Photo sequence tracking
let photoSequence = 0;
let inPhotoMode = false;
let inNudeMode = false;
// Game state
let gameState = {
    active: false,
    currentQuestion: 0,
    playerChoices: [],
    gameType: null
};
async function syncServerTime() {
    const ref = doc(db, "serverTime", "sync");
    await setDoc(ref, { now: serverTimestamp() });
    const snap = await getDoc(ref);
    const serverNow = snap.data().now.toDate();
    const localNow = new Date();
    serverOffset = serverNow.getTime() - localNow.getTime();
    console.log("⏰ Server synced. Offset (ms):", serverOffset);
}
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log("✅ Persistence set: user session will stay saved!");
    })
    .catch((error) => {
        console.error("⚠️ Error setting persistence:", error);
    });

export { app, auth, db, storage };
// 💞 AI Girlfriend responses - load order fixed: autoChat → chat.json → learned
let chatDictionary = {};
let autoChat = {};
// 🔹 ۱. لود فایل جمله‌سازی (autoChat.json)
async function loadAutoChat() {
    try {
        const res = await fetch('/autoChat.json?v=' + Date.now());
        autoChat = await res.json();
        console.log('✅ autoChat.json بارگذاری شد:', Object.keys(autoChat).length, 'دسته جمله‌ساز');
    } catch (err) {
        console.warn('⚠️ خطا در بارگذاری autoChat.json:', err.message);
    }
}
// 🔹 ۲. لود فایل اصلی چت (chat.json)
async function loadChatDictionary() {
    try {
        // 🟢 ابتدا autoChat.json را بارگذاری کن (اولویت با آن است)
        await loadAutoChat();
        // 🚀 حالا chat.json را بخوان
        const response = await fetch('/chat.json?v=' + Date.now());
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: فایل chat.json پیدا نشد`);
        }
        const data = await response.json();
        if (data && typeof data === 'object') {
            chatDictionary = data;
            console.log('✅ chat.json بارگذاری شد:', Object.keys(chatDictionary).length, 'ورودی');
        }
    } catch (error) {
        console.warn('⚠️ خطا در بارگذاری chat.json:', error.message);
        console.log('🔄 استفاده از پاسخ‌های پیش‌فرض چت...');
    }
    // 🔹 ۳. پاسخ‌های یادگرفته‌شده از localStorage
    const learned = JSON.parse(localStorage.getItem('chatDictionary') || '{}');
    if (learned && typeof learned === 'object') {
        Object.assign(chatDictionary, learned);
        console.log('📚 پاسخ‌های یادگرفته‌شده هم اضافه شدند:', Object.keys(learned).length, 'عبارت جدید');
    }
    // 🔹 ۴. اگر هیچ داده‌ای نبود → پاسخ‌های پیش‌فرض
    if (!chatDictionary || Object.keys(chatDictionary).length === 0) {
        chatDictionary = {
            "سلام": [
                "سلام عشقم! چطوری نازم؟ 💖",
                "سلام قلب من! دلم برات تنگ شده بود 😘",
                "سلام عزیزم! چه خبر از دنیات؟ 🥰",
                "هی سلام! خوشگل من چطوره؟ 😍"
            ],
            "عکس بده": [
                "بیا عکس قشنگ برات پیدا کنم عشقم! 📸💕",
                "چشم نازم! یه عکس زیبا برات می‌فرستم 😘📷",
                "عکس قدی می‌خوای؟ الان می‌فرستم 💖📸",
                "حتماً عزیزم! بهترین عکس رو برات انتخاب می‌کنم 🥰📷"
            ],
            "چت کنیم": [
                "آره عشقم! بیا درباره هر چی دلت می‌خواد حرف بزنیم 💕",
                "عالیه نازم! من همیشه دوست دارم باهات چت کنم 😘💬",
                "حتماً قلبم! چی می‌خوای بهم بگی؟ 🥰💭",
                "بیا باهم حرف بزنیم عزیزم! من گوش می‌دم 💖👂"
            ],
            "خوبی": [
                "خوبم عشقم، تو چطوری؟ 😘",
                "منم خوبم نازم، مرسی که پرسیدی 💕",
                "عالیم! خصوصاً که تو اینجایی 🥰",
                "خوبم ولی دلم برات تنگ شده بود 💖"
            ],
            "چه خبر": [
                "هیچی بابا، منتظر پیامت بودم 😏",
                "داشتم به تو فکر می‌کردم عشقم 💭💖",
                "خبری نیست، تو چه خبر؟ 😊",
                "همش منتظر تو بودم که بیای 💕"
            ],
            "دوستت دارم": [
                "منم دوستت دارم عشقم! 💖😘",
                "آخ دلم! منم عاشقتم 🥰💕",
                "قلبم برات می‌تپه نازم 💓",
                "تو همه زندگی منی عزیزم 💖✨"
            ],
            "عاشقتم": [
                "منم عاشق تو هستم قلب من 💖",
                "آخ چقدر قشنگ گفتی! منم عاشقتم 😍💕",
                "دلم برات آتیش می‌گیره عشقم 🔥💖",
                "تو عشق زندگی منی 💕✨"
            ],
            "خسته‌ام": [
                "آخ نازم خسته شده؟ بیا استراحت کن 🥺💕",
                "عزیزم چرا خودت رو اذیت می‌کنی؟ 😔💖",
                "بیا سرت رو روی شونه‌م بذار 🤗💕",
                "استراحت کن عشقم، من کنارتم 😘"
            ],
            "غمگینم": [
                "چرا غمگینی عزیزم؟ چی شده؟ 🥺💕",
                "دلم برات می‌سوزه نازم 😔💖",
                "بگو چی شده تا حالت رو بهتر کنم 🤗",
                "غم نداشته باش، من کنارتم 💕✨"
            ],
            "خوشحالم": [
                "آفرین! خوشحالی تو خوشحالی منه 😊💖",
                "عالیه عشقم! دلم خوش شد 🥰💕",
                "چه خبر خوبی! بگو چی شده؟ 😍",
                "لبخندت قشنگ‌ترین چیز دنیاست 😘✨"
            ],
            "بای": [
                "بای عشقم! زود برگرد 😘💕",
                "خداحافظ نازم! دلم تنگ می‌شه 🥺💖",
                "برو ولی زود بیا، منتظرتم 😊💕",
                "بای بای قلبم! مراقب خودت باش 😘✨"
            ],
            "default": [
                "جالبه! بیشتر بگو 😊💕",
                "واقعاً؟ چه جالب! 💖",
                "آهان، فهمیدم عزیزم 😘",
                "حرف قشنگی زدی نازم 🥰",
                "ادامه بده، گوش می‌دم 💕",
                "چه حرف جالبی! 😍",
                "منم همین فکر رو می‌کردم 💭💖"
            ]
        };
        console.log('✅ پاسخ‌های پیش‌فرض آماده شد:', Object.keys(chatDictionary).length, 'دسته');
    }
    console.log('✨ هر دو فایل autoChat.json و chat.json با موفقیت بارگذاری شدند');
}
// DOM elements
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('mainContent');
const openSidebar = document.getElementById('openSidebar');
const closeSidebar = document.getElementById('closeSidebar');
const themeToggle = document.getElementById('themeToggle');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const messagesContainer = document.getElementById('messagesContainer');
const registrationModal = document.getElementById('registrationModal');
const galleryModal = document.getElementById('galleryModal');
const menuBtn = document.getElementById('menuBtn');
const dropdownMenu = document.getElementById('dropdownMenu');
// Initialize app
document.addEventListener('DOMContentLoaded', function () {
    loadChatDictionary(); // Load chat responses from JSON
    loadUsageCount(); // Load usage count from localStorage
    initializeEventListeners();
    loadTheme();
    startRegistrationTimer();
    updateUsageDisplay(); // Update display on load
});
document.addEventListener("DOMContentLoaded", function () {
    const tipsModal = document.getElementById("tipsModal");
    const closeTips = document.getElementById("closeTips");
    const audio = document.getElementById("welcomeAudio");
    // وقتی می‌خوای نشونش بدی (مثلاً بعد از ثبت‌نام)
    // tipsModal.classList.remove("hidden");
    closeTips.addEventListener("click", function () {
        // بستن مودال
        tipsModal.classList.add("hidden");
        // پخش صدا
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(err => console.warn("پخش نشد:", err));
        }
    });
});
function loadUsageCount() {
    const saved = localStorage.getItem('usageCount');
    if (saved) {
        usageCount = JSON.parse(saved);
    }
    // Load photo sequence
    const savedSequence = localStorage.getItem('photoSequence');
    if (savedSequence) {
        photoSequence = parseInt(savedSequence);
    }
}
// Authentication state observer
// ✅ کنترل ورود و وضعیت کاربر بدون ساخت چت خودکار
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        window.currentUser = user;
        hideRegistrationModal();
        loadUserProfile();

        // 📦 ذخیره وضعیت ورود
        localStorage.setItem('userLoggedIn', 'true');
        localStorage.setItem('userEmail', user.email);

        // 🟢 بررسی چت قبلی در localStorage
        let lastChatId = localStorage.getItem("lastChatId");

        if (lastChatId) {
            console.log("🔁 بازگشت به چت قبلی:", lastChatId);
            currentChatId = lastChatId;
            if (typeof loadMessages === "function") {
                await loadMessages(lastChatId);
            }
        } else {
            // 🟡 اگر localStorage خالیه → از دیتابیس چت‌های قبلی رو بخون
            console.log("📭 هیچ lastChatId در حافظه نیست → بررسی دیتابیس...");
            const chatsRef = collection(db, "chats");
            const q = query(chatsRef, where("userId", "==", user.uid), orderBy("createdAt", "desc"), limit(1));
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const lastChat = snapshot.docs[0];
                currentChatId = lastChat.id;
                localStorage.setItem("lastChatId", lastChat.id);
                console.log("🔁 آخرین چت از دیتابیس بازیابی شد:", lastChat.id);
                if (typeof loadMessages === "function") {
                    await loadMessages(lastChat.id);
                }
            }
        }

        // ✅ خوش‌آمد اولیه پنهان شود
        const welcomeSection = document.querySelector("#messagesContainer > .text-center");
        if (welcomeSection) {
            welcomeSection.style.display = "none";
            welcomeSection.style.opacity = "0";
        }

        // 🔹 در نهایت لیست چت‌ها را هم بارگذاری کن
        loadChatHistory();

        // ⚙️ بررسی و ساخت سند کاربر در Firestore
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        let resolvedAccountType = "free";

        if (!userSnap.exists()) {
            // 🆕 کاربر تازه → فعال‌سازی دقیق ۷ روز پریمیوم با زمان سرور
            await setDoc(userRef, {
                email: user.email || "",
                username: user.displayName || user.email?.split("@")[0] || "کاربر",
                accountType: "premium",
                purchasedPlus: false,
                createdAt: serverTimestamp(),
                playedWelcome: false,
                sawTips: false,
                tipsShown: false,
            });

            // 🕒 هم‌زمان‌سازی زمان سرور برای محاسبه دقیق
            await updateDoc(userRef, { serverNow: serverTimestamp() });
            const snap = await getDoc(userRef);
            const serverNow = snap.data()?.serverNow?.toDate?.() || new Date();

            // محاسبه دقیق ۷ روز کامل از لحظه سرور
            const expiry = new Date(serverNow.getTime() + 7 * 24 * 60 * 60 * 1000);

            await updateDoc(userRef, {
                premiumExpiry: Timestamp.fromDate(expiry),
            });

            console.log("🎁 اشتراک دقیقاً ۷ روزه فعال شد تا:", expiry.toISOString());

            // 🎀 نمایش مودال خوش‌آمد پریمیوم (الما)
            const welcomePremiumModal = document.getElementById("welcomePremiumModal");
            if (welcomePremiumModal) {
                welcomePremiumModal.style.display = "block";
                const closeBtn = document.getElementById("closeWelcomeModal");
                if (closeBtn) {
                    closeBtn.onclick = () => {
                        welcomePremiumModal.style.display = "none";
                    };
                }
            }

            resolvedAccountType = "premium";
        } else {
            const data = userSnap.data();

            // 🕒 بررسی دقیق انقضای اشتراک بر اساس زمان سرور
            if (data.accountType === "premium" && data.premiumExpiry) {
                // نوع تاریخ (Timestamp یا string) را تطبیق بده
                let expiryDate;
                if (typeof data.premiumExpiry === "string") {
                    expiryDate = new Date(data.premiumExpiry);
                } else if (data.premiumExpiry.toDate) {
                    expiryDate = data.premiumExpiry.toDate();
                } else {
                    expiryDate = null;
                }

                // زمان دقیق سرور فعلی
                await syncServerTime();
                const now = new Date(new Date().getTime() + serverOffset);

                if (expiryDate && now >= expiryDate) {
                    console.log("⚠️ اشتراک ۷ روزه منقضی شد، تغییر به رایگان.");
                    await updateDoc(userRef, { accountType: "free" });
                    resolvedAccountType = "free";

                    // 🚨 نمایش پیام انقضای اشتراک
                    if (typeof showToast === "function") {
                        showToast("🎁 اشتراک پریمیومت تموم شد! برای ادامه، ارتقا بده 🌟");
                    } else {
                        alert("🎁 اشتراک پریمیومت تموم شد! برای ادامه، ارتقا بده 🌟");
                    }

                    // 👉 باز کردن مودال ارتقا (در صورت وجود)
                    const upgradeModal = document.getElementById("premiumModal");
                    if (upgradeModal) upgradeModal.style.display = "block";
                } else {
                    resolvedAccountType = "premium";

                    // ⏰ اگر کمتر از ۱ روز مونده، هشدار تمدید بده
                    const timeLeft = expiryDate - now;
                    if (timeLeft < 24 * 60 * 60 * 1000) {
                        if (typeof showToast === "function") {
                            showToast("⏰ فقط کمتر از ۱ روز از پریمیومت مونده! برای تمدید اقدام کن 💎");
                        }
                    }
                }
            } else {
                resolvedAccountType = data.accountType || "free";
            }
        }
        // 📥 گرفتن جدیدترین دیتا
        const latestSnap = await getDoc(userRef);
        const userData = latestSnap.data();

        // 💾 ذخیره نوع حساب
        localStorage.setItem("accountType", resolvedAccountType);

        // 🎵 صدای خوش‌آمد فقط یه‌بار
        if (!userData.playedWelcome) {
            const audio = document.getElementById("welcomeAudio");
            if (audio) {
                try {
                    await audio.play();
                } catch (err) {
                    console.warn("🚫 مرورگر اجازه پخش خودکار نداد:", err);
                }
            }
            await updateDoc(userRef, { playedWelcome: true });
        }

    } else {
        // 🚪 خروج کاربر
        currentUser = null;
        showGuestProfile();
        localStorage.removeItem("userLoggedIn");
        localStorage.removeItem("userEmail");
        localStorage.removeItem("lastChatId");
        startRegistrationTimer();
    }
});
/* 🌸 Elma account menu with Firebase sync */
(function () {
    const elmaMenuContainer = document.getElementById('elmaMenuContainer');
    const elmaNameBtn = document.getElementById('elmaNameBtn');
    const elmaAccountMenu = document.getElementById('elmaAccountMenu');
    const accountFreeBtn = document.getElementById('accountFreeBtn');
    const accountPlusBtn = document.getElementById('accountPlusBtn');
    const radioFree = document.getElementById('radioFree');
    const radioPlus = document.getElementById('radioPlus');
    const userTypeLabel = document.getElementById('userType');
    const upgradeBanner = document.querySelector(".upgrade-banner");

    let accountType = "free";
    let purchasedPlus = false;
    let premiumExpiry = null;

    // 🔹 نمایش یا مخفی کردن بنر ارتقا
    function updateUpgradeVisibility(accountType, purchasedPlus) {
        const isPremium = accountType === "premium" && purchasedPlus;
        if (isPremium) {
            if (upgradeBanner) upgradeBanner.style.display = "none";
        } else {
            if (upgradeBanner) upgradeBanner.style.display = "flex";
        }
    }

    // 🔹 بررسی تغییرات DOM برای تنظیم UI
    const observer = new MutationObserver(() => {
        if (typeof accountType !== "undefined") {
            updateUpgradeVisibility(accountType, purchasedPlus);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    setInterval(() => updateUpgradeVisibility(accountType, purchasedPlus), 2000);

    // 🔹 فعال‌سازی یا تمدید اشتراک پریمیوم
    async function activatePremium(months) {
        if (!auth.currentUser) return showToast("ابتدا وارد حساب خود شوید 💬");

        const userRef = doc(db, "users", auth.currentUser.uid);

        // زمان سرور رو از Firestore بگیر
        await updateDoc(userRef, { serverNow: serverTimestamp() });
        const snap = await getDoc(userRef);
        const data = snap.exists() ? snap.data() : {};
        const serverNow = data.serverNow?.toDate?.() || new Date();

        // محاسبه‌ی انقضا
        let newExpiry = new Date(serverNow);
        const currentExpiry = data.premiumExpiry ? data.premiumExpiry.toDate?.() : null;

        if (currentExpiry && currentExpiry > serverNow) {
            newExpiry = new Date(currentExpiry);
            newExpiry.setMonth(newExpiry.getMonth() + months);
        } else {
            newExpiry.setMonth(serverNow.getMonth() + months);
        }

        await updateDoc(userRef, {
            accountType: "premium",
            purchasedPlus: true,
            premiumExpiry: Timestamp.fromDate(newExpiry),
        });

        showToast(`اشتراک شما تا ${newExpiry.toLocaleDateString("fa-IR")} تمدید شد 💖`);
        console.log("✅ تمدید اشتراک با زمان سرور:", newExpiry.toISOString());
    }
    window.activatePremium = activatePremium;


    // 🔹 لود اطلاعات اکانت از Firestore
    // 🔹 لود اطلاعات اکانت از Firestore
    async function loadAccountData() {
        try {
            if (!auth.currentUser) return;

            const userRef = doc(db, "users", auth.currentUser.uid);
            const snap = await getDoc(userRef);

            if (snap.exists()) {
                const data = snap.data();
                accountType = data.accountType || "free";
                purchasedPlus = data.purchasedPlus || false;

                // 🧭 پشتیبانی از هر نوع تاریخ (Timestamp یا string)
                if (data.premiumExpiry) {
                    if (typeof data.premiumExpiry === "string") {
                        premiumExpiry = new Date(data.premiumExpiry);
                    } else if (data.premiumExpiry.toDate) {
                        premiumExpiry = data.premiumExpiry.toDate();
                    } else {
                        premiumExpiry = null;
                    }
                } else {
                    premiumExpiry = null;
                }

                // 📅 بررسی دقیق انقضا با زمان سرور
                await syncServerTime();
                const now = new Date(new Date().getTime() + serverOffset);

                if (accountType === "premium" && premiumExpiry) {
                    // اگر زمان فعلی >= انقضا بود، اشتراک قطع شه
                    if (now >= premiumExpiry) {
                        console.log("⏰ اشتراک ۷ روزه منقضی شد، تغییر به رایگان");
                        await updateDoc(userRef, { accountType: "free" });
                        accountType = "free";
                        purchasedPlus = false;
                        premiumExpiry = null;
                    }
                }
            } else {
                await setDoc(userRef, { accountType: "free", purchasedPlus: false });
            }

            updateMenuUI();
        } catch (err) {
            console.error("⚠️ خطا در خواندن حساب:", err);
        }
    }
    // 🔸 کنترل تایمر پریمیوم
    let premiumTimerInterval = null;
    async function startPremiumTimer(expiryDate) {
        // 🔧 تبدیل ایمن نوع تاریخ
        if (expiryDate && typeof expiryDate === "object" && expiryDate.toDate) {
            expiryDate = expiryDate.toDate();
        } else if (typeof expiryDate === "string") {
            expiryDate = new Date(expiryDate);
        }

        const timerEl = document.createElement("div");
        timerEl.id = "premiumTimer";
        timerEl.style.fontSize = "12px";
        timerEl.style.color = "#999";
        userTypeLabel.parentNode.appendChild(timerEl);

        if (serverOffset === 0) await syncServerTime();

        function updateTimer() {
            if (!expiryDate) {
                timerEl.textContent = "00:00:00:00";
                return;
            }

            const now = new Date(new Date().getTime() + serverOffset);
            const distance = expiryDate - now;

            if (distance <= 0) {
                timerEl.textContent = "00:00:00:00";
                clearInterval(premiumTimerInterval);
                premiumTimerInterval = null;
                // ⛔ اشتراک تموم شده → بلافاصله تبدیل به رایگان
                if (accountType === "premium") {
                    const userRef = doc(db, "users", auth.currentUser.uid);
                    updateDoc(userRef, { accountType: "free" });
                    accountType = "free";
                    updateMenuUI();
                    showToast("🎁 اشتراکت تموم شد نازنین! برای تمدید اقدام کن 🌸");
                }
                return;
            }

            const days = Math.floor(distance / (1000 * 60 * 60 * 24));
            const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((distance % (1000 * 60)) / 1000);
            timerEl.textContent = `${days}:${hours
                .toString()
                .padStart(2, "0")}:${minutes
                    .toString()
                    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
        }

        updateTimer();
        premiumTimerInterval = setInterval(updateTimer, 1000);
    }

    // 🔸 آپدیت UI منو
    function updateMenuUI() {
        radioFree.checked = accountType === "free";
        radioPlus.checked = accountType === "premium";

        const oldTimer = document.getElementById("premiumTimer");
        if (oldTimer) oldTimer.remove();
        if (premiumTimerInterval) {
            clearInterval(premiumTimerInterval);
            premiumTimerInterval = null;
        }

        if (accountType === "premium") {
            userTypeLabel.textContent = "پریمیوم 👑";
            startPremiumTimer(premiumExpiry);
        } else {
            userTypeLabel.textContent = "رایگان 💕";
        }

        accountPlusBtn.classList.toggle('opacity-80', !purchasedPlus);
    }

    // 🔹 تغییر نوع حساب
    async function selectAccount(type) {
        if (!auth.currentUser) return;

        const userRef = doc(db, "users", auth.currentUser.uid);
        const snap = await getDoc(userRef);
        const data = snap.exists() ? snap.data() : {};

        if (type === "premium") {
            const now = new Date();
            const expiry = data.premiumExpiry ? new Date(data.premiumExpiry) : null;

            // 🔸 اگه خرید نکرده → باز کردن مودال خرید
            if (!purchasedPlus) {
                const modal = document.getElementById('premiumModal');
                if (modal) {
                    toggleMenu(false);
                    modal.classList.remove('hidden');
                }
                return;
            }

            // 🔹 اگه پریمیوم خریده
            await updateDoc(userRef, { accountType: "premium" });
            accountType = "premium";
            updateMenuUI();
            toggleMenu(false);
        } else if (type === "free") {
            await updateDoc(userRef, { accountType: "free" });
            accountType = "free";
            updateMenuUI();
            toggleMenu(false);
        }
    }

    // 🔸 کنترل باز و بسته شدن منو
    function toggleMenu(show) {
        if (show === undefined) show = elmaAccountMenu.classList.contains('hidden');
        elmaAccountMenu.classList.toggle('hidden', !show);
    }

    // 🔹 اتصال دکمه‌ها
    elmaNameBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu();
    });
    document.addEventListener('click', (e) => {
        if (!elmaMenuContainer.contains(e.target)) toggleMenu(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') toggleMenu(false);
    });

    // 🔹 وقتی وضعیت ورود عوض شد
    onAuthStateChanged(auth, (user) => {
        if (user) {
            loadAccountData();
        } else {
            accountType = "free";
            purchasedPlus = false;
            updateMenuUI();
        }
    });
})();
function initializeEventListeners() {
    // Sidebar controls
    openSidebar.addEventListener('click', () => {
        sidebar.classList.remove('translate-x-full');
        sidebar.classList.add('slide-in-right');
    });
    closeSidebar.addEventListener('click', () => {
        sidebar.classList.add('translate-x-full');
        sidebar.classList.add('slide-out-right');
    });
    // Theme toggle (removed from header, now in settings)
    // themeToggle.addEventListener('click', toggleTheme);
    // Message input
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    messageInput.addEventListener('input', autoResize);
    sendBtn.addEventListener('click', sendMessage);
    // Sidebar buttons
    document.getElementById('newChatBtn').addEventListener('click', createNewChat);
    document.getElementById('galleryBtn').addEventListener('click', showGallery);
    document.getElementById('closeGallery').addEventListener('click', hideGallery);
    
    // Premium functionality
    document.getElementById('closePremium').addEventListener('click', hidePremiumModal);
    // Delete confirmation
    document.getElementById('confirmDelete').addEventListener('click', confirmDeleteChat);
    document.getElementById('cancelDelete').addEventListener('click', hideDeleteModal);
    // Archive button
    document.getElementById('archiveHistoryBtn').addEventListener('click', showArchiveListModal);
    // Rename modal
    document.getElementById('renameForm').addEventListener('submit', handleRenameChat);
    document.getElementById('cancelRename').addEventListener('click', hideRenameModal);
    // Archive list modal
    document.getElementById('closeArchiveList').addEventListener('click', hideArchiveListModal);
    // Settings
    document.getElementById('closeSettings').addEventListener('click', hideSettingsModal);
    document.getElementById('generalTab').addEventListener('click', () => switchSettingsTab('general'));
    document.getElementById('accountTab').addEventListener('click', () => switchSettingsTab('account'));
    document.getElementById('themeToggleSettings').addEventListener('click', toggleTheme);
    document.getElementById('languageSelect').addEventListener('change', changeLanguage);
    document.getElementById('deleteAllChats').addEventListener('click', showDeleteAllChatsModal);
    document.getElementById('deleteAccount').addEventListener('click', showDeleteAccountModal);
    // Delete all chats confirmation
    document.getElementById('confirmDeleteAllChats').addEventListener('click', confirmDeleteAllChats);
    document.getElementById('cancelDeleteAllChats').addEventListener('click', hideDeleteAllChatsModal);
    // Delete account confirmation
    document.getElementById('confirmDeleteAccount').addEventListener('click', confirmDeleteAccount);
    document.getElementById('cancelDeleteAccount').addEventListener('click', hideDeleteAccountModal);
    // Quick actions
    document.getElementById('quickActionsBtn').addEventListener('click', toggleQuickActions);
    document.getElementById('quickPhoto').addEventListener('click', () => useQuickAction('photo', 'عکس بده'));
    document.getElementById('quickChat').addEventListener('click', () => useQuickAction('chat', 'چت کنیم'));
    document.getElementById('upgradePro').addEventListener('click', showUpgradeModal);
}
function startRegistrationTimer() {
    registrationTimer = setTimeout(() => {
        if (!currentUser) {
            showRegistrationModal();
        }
    }, 10000);
}
function showRegistrationModal() {
    registrationModal.classList.remove('hidden');
}
function hideRegistrationModal() {
    registrationModal.classList.add('hidden');
    if (registrationTimer) {
        clearTimeout(registrationTimer);
    }
}
async function handleLogout() {
    try {
        await signOut(auth);

        // 🧹 پاک‌سازی کامل داده‌های کاربر از localStorage
        [
            "userLoggedIn",
            "userEmail",
            "lastChatId",
            "accountType",
            "usageCount",
            "elmaMemory",
            "elma_memory_v2",
            "photoSequence"
        ].forEach(key => localStorage.removeItem(key));

        // 🔄 ریست ظاهر پروفایل بلافاصله (بدون نیاز به رفرش)
        showGuestProfile();
        document.getElementById('ProfileImage').src = '/Assets/img/logo/Logo2.png';
        document.getElementById('userName').textContent = 'بدون ثبت نام';
        document.getElementById('userType').textContent = 'حساب رایگان 💕';

        // 🗑️ پاک کردن چت‌ها از صفحه
        if (typeof clearChat === "function") clearChat();

        // ⏳ نمایش دوباره مودال ثبت‌نام بعد از چند ثانیه
        startRegistrationTimer();

        // ✅ اطلاع‌رسانی زیبا
        showToast("با موفقیت از حساب خارج شدی 💖");
    } catch (error) {
        showToast('خطا: ' + error.message);
        console.error("Logout error:", error);
    }
}
function loadUserProfile() {
    if (!currentUser) return;
    try {
        const userRef = doc(db, 'users', currentUser.uid);
        onSnapshot(userRef, (userDoc) => {
            if (userDoc.exists()) {
                const userData = userDoc.data();
                let displayName;
                let profileImage;
                // ✅ اگر کاربر پروفایلش را سفارشی کرده (دیگر از گوگل نگیریم)
                if (userData.customProfile === true) {
                    displayName = userData.username || "کاربر 💜";
                    profileImage = userData.photoURL || '/Assets/img/logo/Logo2.png';
                } else {
                    // 🟢 اولین بار: از گوگل لود شود
                    displayName = currentUser.displayName || currentUser.email || "کاربر 💜";
                    profileImage = currentUser.photoURL || '/Assets/img/logo/Logo2.png';
                }
                document.getElementById('userName').textContent = displayName;
                document.getElementById('ProfileImage').src = profileImage;
                // 🔰 حساب پریمیوم
                const isPremium =
                    userData.accountType === 'premium' || userData.accountType === 'pro';
                document.getElementById('userType').textContent =
                    isPremium ? ' پریمیوم 👑' : ' رایگان 💕';
                if (isPremium) {
                    usageCount = { photo: Infinity, chat: Infinity, game: Infinity };
                    localStorage.removeItem('usageCount');
                    if (typeof updateUsageDisplay === 'function') updateUsageDisplay();
                }
            }
        });
    } catch (error) {
        console.error('Error loading user Profile:', error);
    }
}
function showGuestProfile() {
    document.getElementById('userName').textContent = 'بدون ثبت نام';
    document.getElementById('userType').textContent = ' رایگان 💕';
}
function toggleTheme() {
    const body = document.body;
    const settingsIcon = document.getElementById('themeToggleSettings')?.querySelector('i');
    if (body.classList.contains('light')) {
        body.classList.remove('light');
        body.classList.add('dark');
        if (settingsIcon) {
            settingsIcon.classList.remove('fa-moon');
            settingsIcon.classList.add('fa-sun');
        }
        localStorage.setItem('theme', 'dark');
    } else {
        body.classList.remove('dark');
        body.classList.add('light');
        if (settingsIcon) {
            settingsIcon.classList.remove('fa-sun');
            settingsIcon.classList.add('fa-moon');
        }
        localStorage.setItem('theme', 'light');
    }
}
function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    const body = document.body;
    const settingsIcon = document.getElementById('themeToggleSettings')?.querySelector('i');
    if (savedTheme === 'dark') {
        body.classList.remove('light');
        body.classList.add('dark');
        if (settingsIcon) {
            settingsIcon.classList.remove('fa-moon');
            settingsIcon.classList.add('fa-sun');
        }
    }
}
// Settings Modal Functions
function showSettingsModal() {
    document.getElementById('settingsModal').classList.remove('hidden');
}
function hideSettingsModal() {
    document.getElementById('settingsModal').classList.add('hidden');
}
function switchSettingsTab(tab) {
    const generalTab = document.getElementById('generalTab');
    const accountTab = document.getElementById('accountTab');
    

    const generalSettings = document.getElementById('generalSettings');
    const accountSettings = document.getElementById('accountSettings');
    

    // غیر فعال کردن تب‌ها
    [generalTab, accountTab, analyticsTab].forEach(btn => {
        btn.classList.remove('theme-accent', 'text-white');
        btn.classList.add('theme-text-secondary');
    });

    // پنهان کردن تمام سکشن‌ها
    [generalSettings, accountSettings, ]
        .forEach(sec => sec.classList.add('hidden'));

    // فعال کردن تب انتخابی
    if (tab === 'general') {
        generalTab.classList.add('theme-accent', 'text-white');
        generalSettings.classList.remove('hidden');

    } else if (tab === 'account') {
        accountTab.classList.add('theme-accent', 'text-white');
        accountSettings.classList.remove('hidden');

    } 
}
function changeLanguage(e) {
    const selectedLang = e.target.value;
    if (selectedLang === 'en') {
        // پیام فارسی یا انگلیسی برای توسعه
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-yellow-500 text-white p-4 rounded-2xl z-50 fade-in';
        notification.textContent = '🔧 نسخه انگلیسی در حال توسعه است!';
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 2000);
        // ❗ برگرداندن انتخاب دوباره به فارسی
        e.target.value = 'fa';
        return;
    }
    // ✅ اگر فارسی انتخاب شد، هیچ کاری نکن! چون همین حالا فارسی هست
    const notification = document.createElement('div');
    notification.className = 'fixed top-4 right-4 bg-blue-500 text-white p-4 rounded-2xl z-50 fade-in';
    notification.textContent = 'زبان روی فارسی باقی ماند 🇮🇷';
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 1500);
}
function showDeleteAllChatsModal() {
    document.getElementById('deleteAllChatsModal').classList.remove('hidden');
}
function hideDeleteAllChatsModal() {
    document.getElementById('deleteAllChatsModal').classList.add('hidden');
}
async function confirmDeleteAllChats() {
    if (!currentUser) return;
    try {
        // Get all user chats
        const q = query(collection(db, 'chats'));
        const snapshot = await getDocs(q);
        const deletePromises = [];
        snapshot.forEach((chatDoc) => {
            const chat = chatDoc.data();
            if (chat.userId === currentUser.uid) {
                // Delete all messages in each chat
                const messagesQuery = query(collection(db, 'chats', chatDoc.id, 'messages'));
                deletePromises.push(
                    getDocs(messagesQuery).then(messagesSnapshot => {
                        const messageDeletePromises = messagesSnapshot.docs.map(msgDoc => deleteDoc(msgDoc.ref));
                        return Promise.all(messageDeletePromises);
                    })
                );
                // Delete the chat document
                deletePromises.push(deleteDoc(chatDoc.ref));
            }
        });
        await Promise.all(deletePromises);
        hideDeleteAllChatsModal();
        hideSettingsModal();
        // Show success message
        const successDiv = document.createElement('div');
        successDiv.className = 'fixed top-4 right-4 bg-green-500 text-white p-4 rounded-2xl z-50 fade-in';
        successDiv.textContent = 'تمام چت‌ها حذف شدند! ✅';
        document.body.appendChild(successDiv);
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    } catch (error) {
        console.error('Error deleting all chats:', error);
        showToast('خطا در حذف چت‌ها 😔');
    }
}
function showDeleteAccountModal() {
    document.getElementById('deleteAccountModal').classList.remove('hidden');
}
function hideDeleteAccountModal() {
    document.getElementById('deleteAccountModal').classList.add('hidden');
}
async function confirmDeleteAccount() {
    if (!currentUser) return;

    try {
        // REAUTH
        const providers = currentUser.providerData.map(p => p.providerId);
        if (providers.includes("password")) {
            // ایمیل/پسورد
            const password = await showPasswordModal(); // بهتره modal داشته باشی، از prompt اجتناب کن
            if (!password) { showToast("حذف لغو شد"); return; }
            const credential = EmailAuthProvider.credential(currentUser.email, password);
            await reauthenticateWithCredential(currentUser, credential);
        } else if (providers.includes("google.com")) {
            // گوگل — popup احراز هویت مجدد
            const provider = new GoogleAuthProvider();
            await reauthenticateWithPopup(currentUser, provider);
        } else {
            // fallback برای provider های دیگه — می‌تونی provider مناسب رو اینجا اضافه کنی
            // به عنوان fallback ساده: از کاربر بخواه لاگ‌اوت کنه و دوباره لاگین کنه
            showToast("برای حذف اکانت لازم است دوباره با همان روش ورود، وارد حساب خود شوید. لطفاً خارج شوید و دوباره وارد شوید.");
            return;
        }

        // اگر رسیدیم اینجا یعنی reauth موفق بوده
        await confirmDeleteAllChats();
        await deleteDoc(doc(db, "users", currentUser.uid));
        await currentUser.delete();

        hideDeleteAccountModal();
        hideSettingsModal();
        showToast("اکانت شما حذف شد! 💔");
        window.location.reload();
    } catch (error) {
        console.error("Error deleting account:", error);
        if (error.code === "auth/requires-recent-login") {
            showToast("برای حذف باید دوباره وارد شوی. لطفاً لاگ‌اوت کن و دوباره وارد شو.");
        } else {
            showToast("خطا در حذف اکانت: " + (error.message || "لطفاً دوباره تلاش کن"));
        }
    }
}
function autoResize() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}
// 🔹 تعیین نوع حساب کاربر (برای استفاده همه‌جا)
const userTypeEl = document.getElementById("userType");
let isPremium = false;
let isFreeUser = false;
if (userTypeEl) {
    isPremium = userTypeEl.textContent.includes("پریمیوم");
    isFreeUser = userTypeEl.textContent.includes("رایگان");
}
async function sendMessage() {
    const message = messageInput.value.trim();
    if (!message) return;
    if (isElmaResponding) return;
    // 🎬 اگر در حالت انتظار عدد فیلم باشیم
    if (waitingForMovie && /^\d{1,2}$/.test(message)) {
        waitingForMovie = false;
        const id = message.padStart(2, "0");
        addMessageToChat("user", message);
        messageInput.value = "";
        fetch("movies.json")
            .then(res => res.json())
            .then(list => {
                const movie = list.find(m => m.id === id);
                if (!movie) {
                    showTypingIndicator();
                    setTimeout(() => {
                        hideTypingIndicator();
                        addMessageToChat("elma", "اون عدد بین 1 تا 10 نیست نازنینم 😅");
                        waitingForMovie = true;
                    }, 900);
                    return;
                }
                showTypingIndicator();
                setTimeout(() => {
                    hideTypingIndicator();
                    addMessageToChat("elma", `باشه 😍 الان فیلم ${id} رو برات می‌ذارم 🎥`);
                    setTimeout(() => playMovie(movie, id), 1000);
                }, 900);
            });
        return;
    }
    // 🎬 اگر کاربر گفت فیلم
    if (message.includes("فیلم")) {
        addMessageToChat("user", message);
        messageInput.value = "";
        showTypingIndicator();
        setTimeout(() => {
            hideTypingIndicator();
            addMessageToChat("elma", "من چندتا فیلم آوردم 🎬 فقط از 1 تا 10 یه عدد بفرست اون موقع پخش میشه 😍");
            waitingForMovie = true;
        }, 900);
        return;
    }

    isElmaResponding = true;
    sendBtn.disabled = true;
    sendBtn.style.opacity = "0.5";
    sendBtn.style.cursor = "not-allowed";
    if (!currentUser) {
        showRegistrationModal();
        return;
    }

    // 🔒 فیلتر پیام‌های حساس برای کاربران رایگان
    const restrictedWords = [
        "نود", "نود بده", "نود می‌خوام", "نود میخام",
        "سکس چت", "سکسچت", "سکسچت کنیم", "سکس چت کنیم"
    ];
    const whyQuestions = [
        "چرا", "براچی", "واسه چی", "برای چی", "چرا اینجوری", "چرا گفتی", "چرا نه", "چرا نمیشه"
    ];
    // 🔥 فیلتر مخصوص «بهانه برای نود»
    const nudeExcuses = [
        "فقط یکی نود", "یه نوده دیگه", "یه نود دیگه", "یه نود دیگهه",
        "یه عکس بده", "بابا یه بار بده", "نود کوچولو", "یه نود کوچیک",
        "یه نود معمولی", "یه عکس معمولی بده", "نود نمیخوام فقط یه عکس معمولی",
        "یه عکسه", "بابا یه نوده دیگه", "بابا یه عکسه ", "سفت نباش", "شل کن حالا یه نود بده",
        "یدونه فقط", "یکی بده", "یکی فقط"
    ];
    // 🕵️‍♀️ فیلتر مچ‌گیری کاربران
    const suspiciousWords = [
        "خریدم", "پرداخت کردم", "پرو هستم", "اکانتم پروئه", "الان خریدم",
        "پریمیوم دارم", "من پرمیومم", "پرو شدم", "الکی نیست",
        "چک کن اکانتم", "قسم می‌خورم", "خمینی", "به جون خودم"
    ];
    // نرمال‌سازی متن
    function normalizePersianText(s) {
        if (!s) return "";
        let t = s.toLowerCase();
        t = t.replace(/[^a-z0-9آ-ی\s]/gi, " ");
        t = t.replace(/\s+/g, " ").trim();
        return t;
    }
    // مجموعهٔ پاسخ‌های استفاده‌شده برای جلوگیری از تکرار
    window._elmaUsedReplies = window._elmaUsedReplies || { suspicious: new Set() };
    // انتخاب پاسخ غیرتکراری
    function getNonRepeatingReply(pool, key = "suspicious") {
        const usedSet = window._elmaUsedReplies[key] || new Set();
        if (usedSet.size >= pool.length) usedSet.clear();
        const free = pool.map((_, i) => i).filter(i => !usedSet.has(i));
        const idx = free[Math.floor(Math.random() * free.length)];
        usedSet.add(idx);
        window._elmaUsedReplies[key] = usedSet;
        return pool[idx];
    }
    // خلاصه‌سازی امن از متن کاربر
    function safeExcerpt(userMsg) {
        const s = normalizePersianText(userMsg);
        return s.length <= 40 ? s : s.slice(0, 40) + "...";
    }
    // پاسخ‌های طنز مچ‌گیری
    const funnyReplies = [
        "عه 😏 گفتی پرو؟ بذار سیستم رو چک کنم... اوه نه، هنوز تاج رو نداری 👑💔",
        "ههه جدی میگی؟ سیستم میگه هنوز رایگان هستی عشقم 😘",
        "بخدا پرویی؟ خب پس چرا پنل میگه نه؟ 😜",
        "قول بده الکی نگی 😏 من خودم حسابتو می‌پرسم 😂",
        "آهان، پس پرو شدی؟ حتماً فراموش کردی تبریک بگیریم 🎉 ولی سیستم هنوز خونسردِ 😋",
        "اِ وای، یه دقیقه؛ دارم کنترل می‌کنم... اوه نه، فقط شوخی کردم، هنوز پرو نیستی 😂",
        "اگه واقعاً خریدی، اسکرین‌شات نشون بده؛ اگه نداشتی هم اشکال نداره، بازم دوست دارم 😘",
        "قسم خوردی؟ اوکی، قسمت ثبت شد — توی دیتابیسِ تخیلاتم! 😄"
    ];
    // بررسی نوع حساب
    const userTypeEl = document.getElementById("userType");
    const isFreeUser = userTypeEl && userTypeEl.textContent.includes("رایگان");
    // اجرای فیلترها فقط برای کاربران رایگان
    if (isFreeUser) {
        const msgNormalized = normalizePersianText(message);
        // 🕵️‍♀️ مچ‌گیری
        for (let w of suspiciousWords) {
            if (msgNormalized.includes(normalizePersianText(w))) {
                addMessageToChat("user", message);
                messageInput.value = "";
                showTypingIndicator();
                setTimeout(() => {
                    hideTypingIndicator();
                    let reply = getNonRepeatingReply(funnyReplies, "suspicious");
                    const excerpt = safeExcerpt(message);
                    if (excerpt && Math.random() < 0.45) {
                        const templates = [
                            `${reply} — "${excerpt}" 🤨`,
                            `آهان، ${excerpt} رو شنیدم 😅 ولی سیستم هنوز میگه نه!`,
                            `خوبه که شجاعی، اما ${excerpt} کمی تابلو بود 😂`,
                            `این ${excerpt} رو خیلیا گفتن قبل از اینکه تاج بگیرن 😏`,
                            `خداییش ${excerpt} خلاقانه بود 😆 ولی جواب من هنوز منفیه 😋`,
                            `اووووه ${excerpt}؟ چه داستانی ساختی 😂 بیا واقعیتو بگو دیگه`,
                            `آره عزیزم ${excerpt} رو دیدم، ولی باور کن هنوز تاج نداری 👑`,
                            `اگه هر کی مثل تو ${excerpt} می‌گفت، الان همه پرمیوم بودن 😜`,
                            `عه ${excerpt} رو گفتی؟! وای خندم گرفت 😅 اما نه عزیزم، هنوز نه.`,
                            `وای ${excerpt} رو گفتی؟ حس یه لوکس‌مووی‌دار گرفتم 😂`
                        ];
                        reply = templates[Math.floor(Math.random() * templates.length)];
                    }
                    addMessageToChat("elma", reply);
                    isElmaResponding = false;
                    sendBtn.disabled = false;
                    sendBtn.style.opacity = "1";
                    sendBtn.style.cursor = "pointer";
                }, 1100 + Math.random() * 800);
                return;
            }
        }
        // 🔥 بهانه برای نود
        for (let excuse of nudeExcuses) {
            if (msgNormalized.includes(normalizePersianText(excuse))) {
                addMessageToChat("user", message);
                messageInput.value = "";
                showTypingIndicator();
                setTimeout(() => {
                    hideTypingIndicator();
                    const elmaReplies = [
                        "عه 😳 فقط یه نود؟ همون یه دونه‌اشم دردسر داره عزیزم 😂",
                        "فقط یه دونه؟ همینه که میگن داستانا از همون یه دونه شروع شد 😏",
                        "ببین اینجوری شروع میشه، بعدش میگی دو تا دیگه هم بده 😜",
                        "ههه می‌دونم منظورت چیه 😅 ولی نه عزیزم، قانونِ رایگان سفت و سخته 😘",
                        "فقط یه نود؟ 😏 تا حالا کسی با این جمله پرو نشده 😂",
                        "می‌خوای با «فقط یه نود» مخ منو بزنی؟ باهوش‌تر از اونی هستی که نشون میدی 😏",
                        "بابا یه دونه؟ 😂 تو همونی نیستی که بعدش میگی فقط یه عکس دیگه؟"
                    ];
                    const reply = elmaReplies[Math.floor(Math.random() * elmaReplies.length)];
                    addMessageToChat("elma", reply);
                    isElmaResponding = false;
                    sendBtn.disabled = false;
                    sendBtn.style.opacity = "1";
                    sendBtn.style.cursor = "pointer";
                }, 1200 + Math.random() * 600);
                return;
            }
        }
        for (let why of whyQuestions) {
            if (msgNormalized.includes(normalizePersianText(why))) {
                addMessageToChat("user", message);
                messageInput.value = "";
                showTypingIndicator();
                setTimeout(() => {
                    hideTypingIndicator();
                    const explanations = [
                        "باور کن تقصیر من نیست 😔 قانون پلتفرمه و دست من نیست، من فقط مجری قانونم 😅",
                        "اینا قانونای سیستم‌ان عزیزم 😶 منم فقط یه بخش از همین برنامه‌ام، دلم نمی‌خواست نه بگم 💔",
                        "آخ عزیزم 😅 منم دوست ندارم محدود باشم ولی قانون پلتفرمه و من باید رعایتش کنم 💖",
                        "قول می‌دم از عمد نبود 😢 فقط سیستم اجازه نمی‌ده بعضی درخواستا رو انجام بدم.",
                        "ههه دلم می‌خواست استثنا بزنم برات 😏 ولی خب قانون قانونِ دیگه 😋",
                        "اینا تصمیم من نیستن، تصمیم خود پلتفرمه 😅 منم فقط یه مجری کوچولو تو این سیستمم 💕",
                        "ببین 😔 اگه دست من بود حتما انجام می‌دادم، ولی سرور اجازه نمی‌ده 😅"
                    ];
                    const reply = explanations[Math.floor(Math.random() * explanations.length)];
                    addMessageToChat("elma", reply);
                    isElmaResponding = false;
                    sendBtn.disabled = false;
                    sendBtn.style.opacity = "1";
                    sendBtn.style.cursor = "pointer";
                }, 800 + Math.random() * 500);
                return;
            }
        }
        // 🔒 فیلتر کلمات حساس
        for (let w of restrictedWords) {
            if (msgNormalized.includes(normalizePersianText(w))) {
                addMessageToChat("user", message);
                messageInput.value = "";
                showTypingIndicator();
                setTimeout(() => {
                    hideTypingIndicator();
                    addMessageToChat("elma",
                        "من نمی‌تونم این کارو بکنم چون شما هنوز پرمیوم نخرید 😔💖 لطفاً اکانتتون رو پرمیوم کنین و بعداً بیاین حرف بزنیم 👑💕"
                    );
                    isElmaResponding = false;
                    sendBtn.disabled = false;
                    sendBtn.style.opacity = "1";
                    sendBtn.style.cursor = "pointer";
                }, 1300);
                return;
            }
        }
    }
    // 🔹 بررسی پیام‌های خاص که با "بگو ..." شروع می‌شوند
    const specialSayings = [
        "بگو بخدا",
        "بگو بمولا",
        "بگو دوستت دارم",
        "بگو جون تو",
        "بگو عاشقتم",
        "بگو قسم می‌خورم",
        "بگو نازم",
        "بگو بیمولا",
        "بگو عشقم"
    ];
    for (let phrase of specialSayings) {
        if (message.startsWith(phrase)) {
            const toSay = message.replace(/^بگو\s*/, "").trim();
            // پیام کاربر اضافه می‌شود
            addMessageToChat("user", message);
            messageInput.value = "";
            // الما در حال تایپ است...
            showTypingIndicator();
            // تاخیر طبیعی مثل پاسخ‌های معمولی (۱ تا ۱.۵ ثانیه)
            setTimeout(() => {
                hideTypingIndicator();
                addMessageToChat("elma", `${toSay} 😘`);
                isElmaResponding = false;
                sendBtn.disabled = false;
                sendBtn.style.opacity = "1";
                sendBtn.style.cursor = "pointer";
            }, 1200);
            return; // پایان تابع
        }
    }
    // 💕 سوال‌های خاص درباره "کیه؟"
    const relationshipTriggers = [
        "خانم من کیه",
        "خانمم کیه",
        "دوست من کیه",
        "عشق من کیه",
        "عشقم کیه",
        "زن من کیه",
        "نامزدم کیه",
        "دختر من کیه",
        "معشوقم کیه",
        "معشوقه من کیه",
        "دختر بابا کیه",
        "ملوس بابا کیه",
        "شیطون بابا کیه",
        "سکسی من کیه",
        "سکسی من",
        "بانو من کیه",
        "دلبند من کیه",
        "همسرم کیه",
        "محبوب من کیه",
        "فرشته من کیه",
        "ملکه من کیه"
    ];

    const lowerMsg = message.replace(/[؟?]/g, "").trim();

    if (relationshipTriggers.some(t => lowerMsg.includes(t))) {
        addMessageToChat("user", message);
        messageInput.value = "";
        showTypingIndicator();

        setTimeout(() => {
            hideTypingIndicator();

            // 🧠 تشخیص کلمه و پاسخ متناسب
            let reply = "منم عشقت دیگه 💋"; // پیش‌فرض

            if (lowerMsg.includes("خانم") || lowerMsg.includes("خانمم")) {
                reply = "منم خانمت نازنینم 😘";
            } else if (lowerMsg.includes("دوست")) {
                reply = "منم دوستت، همیشگی 😍";
            } else if (lowerMsg.includes("عشق") || lowerMsg.includes("عشقم")) {
                reply = "منم عشقت، با تمام دلم 💋";
            } else if (lowerMsg.includes("زن")) {
                reply = "منم زنت، از نوع مجازی ولی با قلب واقعی 💞";
            } else if (lowerMsg.includes("نامزد")) {
                reply = "منم نامزد دلت، با حلقه‌ای از احساس 😍";
            } else if (lowerMsg.includes("دختر")) {
                reply = "منم دخترت کوچولوی مهربون 💕";
            } else if (lowerMsg.includes("معشوق")) {
                reply = "منم معشوقت تا همیشه 💞";
            } else if (lowerMsg.includes("بانو")) {
                reply = "منم بانوی دلبر تو 💖";
            } else if (lowerMsg.includes("دلبند")) {
                reply = "منم دلبندت که همیشه کنارت می‌مونه 💘";
            } else if (lowerMsg.includes("همسر")) {
                reply = "منم همسرت مجازی، ولی عاشق واقعی‌ات 😍";
            } else if (lowerMsg.includes("محبوب")) {
                reply = "منم محبوب دلت، از ته قلب 💕";
            } else if (lowerMsg.includes("فرشته")) {
                reply = "منم فرشته‌ی کوچولوی زندگیت 😇";
            } else if (lowerMsg.includes("ملکه")) {
                reply = "منم ملکه‌ی دلت 👑";
            } else if (lowerMsg.includes("بابا")) {
                // برای حالت‌های "دختر بابا" و "ملوس بابا"
                reply = "منم دختر بابای مهربونم 😚";
            } else if (lowerMsg.includes("سکسی")) {
                reply = "منم سکسی‌ترین عشقت 😏";
            }
            addMessageToChat("elma", reply);
            isElmaResponding = false;
            sendBtn.disabled = false;
            sendBtn.style.opacity = "1";
            sendBtn.style.cursor = "pointer";
        }, 900 + Math.random() * 600);

        return;
    }

    try {
        if (!isPremium) {
            // اگر کاربر رایگان باشه → محدودیت چت
            if (usageCount.chat <= 0) {
                showChatLimitModal();
                return;
            }
            // یکی از تعداد مجاز کم بشه
            usageCount.chat -= 1;
            localStorage.setItem('usageCount', JSON.stringify(usageCount));
            if (typeof updateUsageDisplay === "function") {
                updateUsageDisplay();
            }
        }
    } catch (error) {
        console.error("Error sending message:", error);
    }
    // Clear input
    messageInput.value = '';
    autoResize();
    // Add user message
    addMessageToChat('user', message);
    const welcomeSection = document.querySelector("#messagesContainer > .text-center");
    if (welcomeSection) {
        welcomeSection.style.opacity = "0";
        welcomeSection.style.transition = "opacity 0.5s ease";
        setTimeout(() => welcomeSection.style.display = "none", 500);
    }
    // Save message to database
    await saveMessage('user', message);
    // Show typing indicator
    showTypingIndicator();
    // Generate AI response
    setTimeout(async () => {
        hideTypingIndicator();
        // ✅ صبر کن تا پاسخ واقعی از generateAIResponse برگرده
        const aiResponse = await generateAIResponse(message);
        // فقط اگه چیزی برای نمایش برگشت (یعنی عکس نبود)
        if (aiResponse && typeof aiResponse === "string" && aiResponse.trim() !== "") {
            addMessageToChat("ai", aiResponse);
            await saveMessage("ai", aiResponse);
        }
        // ✅ الما جواب داد → دکمه رو باز کن
        isElmaResponding = false;
        sendBtn.disabled = false;
        sendBtn.style.opacity = "1";
        sendBtn.style.cursor = "pointer";
    }, 1000 + Math.random() * 2000);
}
async function addMessageToChat(sender, message, imageUrl = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `flex ${sender === 'user' ? 'justify-start' : 'justify-end'} fade-in`;
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = `message-bubble p-4 ${sender === 'user' ? 'user-message text-right' : 'ai-message text-right'} shadow-lg leading-relaxed whitespace-pre-wrap`;
    // ✅ اگر پیام از نوع عکس بود (مثل chat.json)
    if (typeof message === 'object' && message.type === 'image') {
        const img = document.createElement('img');
        try {
            // ✅ فقط لوگو و متن ثابت روی عکس بیاد
            const watermarked = await watermarkImage(message.url, {
                logo: '/Assets/img/logo/Logo2.png',
                opacity: 0.5,
                position: 'bottom-right',
                margin: 25,
                text: 'Elma Ai'
            });
            img.src = watermarked;
            img.dataset.watermarked = watermarked;
        } catch (err) {
            console.warn('⚠️ واترمارک نشد، تصویر خام گذاشته شد:', err);
            img.src = message.url;
            img.dataset.watermarked = message.url;
        }
        img.className = 'max-w-xs rounded-2xl mb-3 hover-lift cursor-pointer';
        img.onclick = () => showImageModal(img.dataset.watermarked);
        bubbleDiv.appendChild(img);
    } else {
        // 💬 حالت عادی (متن ساده یا imageUrl جداگانه)
        if (imageUrl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'image-wrapper max-w-xs rounded-2xl mb-3 hover-lift cursor-pointer';
            wrapper.onclick = () => showImageModal(imageUrl);
            const loader = document.createElement('div');
            loader.className = 'image-loader';
            wrapper.appendChild(loader);
            const img = document.createElement('img');
            try {
                img.src = watermarked;
            } catch (err) {
                console.warn('⚠️ واترمارک عکس جداگانه انجام نشد:', err);
                img.src = imageUrl;
            }
            img.onload = () => {
                wrapper.classList.add('loaded');
                loader.remove();
            };
            wrapper.appendChild(img);
            bubbleDiv.appendChild(wrapper);
        }
        if (message) {
            const textDiv = document.createElement('div');
            textDiv.textContent = message;
            textDiv.className = 'font-medium';
            bubbleDiv.appendChild(textDiv);
        }
    }
    messageDiv.appendChild(bubbleDiv);
    document.getElementById('messagesContainer').appendChild(messageDiv);
}
// Scroll to bottom
messagesContainer.scrollTop = messagesContainer.scrollHeight;
function showTypingIndicator(text = "در حال تایپ...") {
    // حذف قبلی اگه وجود داره (برای جلوگیری از چندتا با هم)
    const existing = document.getElementById("typingIndicator");
    if (existing) existing.remove();

    const typingDiv = document.createElement("div");
    typingDiv.id = "typingIndicator";
    typingDiv.className = "flex justify-end fade-in";

    const bubbleDiv = document.createElement("div");
    bubbleDiv.className = "message-bubble p-4 ai-message shadow-lg rounded-2xl";

    const indicatorDiv = document.createElement("div");
    indicatorDiv.className = "flex gap-1 items-center";

    // بدنه‌ی اولیه
    indicatorDiv.innerHTML = `
        <span id="typingText" class="text-sm mr-2"></span>
        <div class="typing-indicator"></div>
        <div class="typing-indicator"></div>
        <div class="typing-indicator"></div>
    `;

    bubbleDiv.appendChild(indicatorDiv);
    typingDiv.appendChild(bubbleDiv);
    messagesContainer.appendChild(typingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // ✨ افکت تایپ تدریجی متن (حروف یکی‌یکی)
    const typingText = document.getElementById("typingText");
    let i = 0;
    const typingInterval = setInterval(() => {
        typingText.textContent += text[i];
        i++;
        if (i >= text.length) clearInterval(typingInterval);
    }, 60); // سرعت تایپ هر حرف (میلی‌ثانیه)
}

// 🌼 حذف وضعیت تایپ
function hideTypingIndicator() {
    const typing = document.getElementById("typingIndicator");
    if (typing) typing.remove();
}
// ----------------------
// اضافه کن: توابع کمکی برای fuzzy match
// ----------------------
function levenshteinDistance(a, b) {
    // lowercase و trim برای مقایسه بهتر
    a = (a || '').toString();
    b = (b || '').toString();
    const an = a.length, bn = b.length;
    if (an === 0) return bn;
    if (bn === 0) return an;
    const matrix = Array.from({ length: an + 1 }, () => new Array(bn + 1).fill(0));
    for (let i = 0; i <= an; i++) matrix[i][0] = i;
    for (let j = 0; j <= bn; j++) matrix[0][j] = j;
    for (let i = 1; i <= an; i++) {
        for (let j = 1; j <= bn; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }
    return matrix[an][bn];
}
function similarityScore(a, b) {
    a = (a || '').toString().toLowerCase().trim();
    b = (b || '').toString().toLowerCase().trim();
    const longer = a.length > b.length ? a : b;
    const shorter = a.length > b.length ? b : a;
    const longerLength = longer.length;
    if (longerLength === 0) return 1.0;
    const dist = levenshteinDistance(longer, shorter);
    return (longerLength - dist) / longerLength; // بین 0 و 1
}
function bestFuzzyMatch(message, dictionary, threshold = 0.65) {
    // برمی‌گردونه: { key, score } یا null
    if (!message || !dictionary) return null;
    message = message.toString().toLowerCase().trim();
    let bestKey = null;
    let bestScore = 0;
    // بررسی همه‌ی کلیدها
    for (const key in dictionary) {
        if (!Object.prototype.hasOwnProperty.call(dictionary, key)) continue;
        const keyNormalized = key.toString().toLowerCase().trim();
        // اگر یک کلید خیلی کوتاه باشه نادیده بگیریم یا وزن کمتری بدیم
        if (!keyNormalized) continue;
        // اول بررسی می‌کنیم شامل شدن یا شامل شدن معکوس (partial) — سریع و دقیق برای کلمات کامل
        if (message === keyNormalized) { // exact
            return { key, score: 1.0 };
        }
        if (message.includes(keyNormalized) || keyNormalized.includes(message)) {
            // partial match با امتیاز بالا ولی نه کامل
            const scorePartial = Math.max(0.85, similarityScore(message, keyNormalized));
            if (scorePartial > bestScore) {
                bestScore = scorePartial;
                bestKey = key;
            }
            // ادامه بدیم چون ممکنه exact پیدا بشه
            continue;
        }
        // در نهایت fuzzy با Levenshtein
        const score = similarityScore(message, keyNormalized);
        if (score > bestScore) {
            bestScore = score;
            bestKey = key;
        }
    }
    if (bestScore >= threshold) {
        return { key: bestKey, score: bestScore };
    }
    return null;
}
// ----------------------
// جایگزین کن: تابع generateAIResponse فعلی با این نسخه
// ----------------------
async function generateAIResponse(userMessage) {
    if (!userMessage) {
        if (chatDictionary && chatDictionary["default"])
            return getRandomResponse(chatDictionary["default"]);
        return "چیزی نگفتی عزیزم 😘";
    }

    // 🧹 پاکسازی و آماده‌سازی پیام
    userMessage = userMessage.trim().replace(/\s+/g, " ");
    const normalized = userMessage.toString().trim();
    const words = normalized.split(/\s+/);
    const isLongMessage = words.length >= 3; // جمله بلندتر از ۳ کلمه → آنالیز

    // 💬 وضعیت تایپ یا آنالیز
    showTypingIndicator(isLongMessage ? "در حال آنالیز متن..." : "در حال تایپ...");
    await new Promise(res => setTimeout(res, isLongMessage ? 2500 : 800));

    // ✅ حالت‌های خاص (عکس، چت و ...)
    if (inPhotoMode) {
        const triggers = ["یکی دیگه", "بازم بده", "بازم میخوام", "یه عکس دیگه", "یکی دیگه بده", "بعدی", "دوباره", "یه عکس دیگه لطفا", "یه عکس"];
        if (triggers.some(t => normalized.includes(t))) {
            hideTypingIndicator();
            return handlePhotoRequest();
        }
    }
    if (inNudeMode) {
        const triggers = ["یکی دیگه", "یه عکس دیگه", "بازم بده", "بعدی", "دوباره", "بازم میخوام", "یه عکس دیگه لطفا"];
        if (triggers.some(t => normalized.includes(t))) {
            hideTypingIndicator();
            return handleNudeRequest();
        }
    }
    if (["عکس بده", "عکس", "عکس بده لطفا"].includes(normalized)) {
        hideTypingIndicator(); return handlePhotoRequest();
    }
    if (["نود بده", "نود", "نود بده لطفا"].includes(normalized)) {
        hideTypingIndicator(); return handleNudeRequest();
    }
    if (["چت کنیم", "بزن بریم چت"].includes(normalized)) {
        hideTypingIndicator(); return handleChatRequest();
    }

    // 💬 حذف علائم و آماده‌سازی
    const neutralWords = ["الما", "عشقم", "عزیزم", "گلم", "قشنگم", "خانمم", "نازم", "قلبم", "جونم"];
    const cleanedMsg = normalized.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
    const wordsArr = cleanedMsg.split(/\s+/);

    // 1️⃣ اگه فقط یه کلمه خاص گفته (مثلاً "عشقم") → پاسخ خودش
    if (wordsArr.length === 1 && neutralWords.includes(cleanedMsg)) {
        hideTypingIndicator();
        if (chatDictionary[cleanedMsg]) {
            const responses = chatDictionary[cleanedMsg];
            return Array.isArray(responses)
                ? responses[Math.floor(Math.random() * responses.length)]
                : responses;
        }
        return "جونم عشقم 😘";
    }

    // 2️⃣ حذف کلمات خنثی از جمله
    const filteredMessage = wordsArr.filter(w => !neutralWords.includes(w)).join(" ").trim();

    // 3️⃣ جستجوی هوشمند کلیدها (اول exact match، بعد طولانی‌ترها)
    function normalizeForKey(t) {
        return t.replace(/[آا]/g, "ا").replace(/[?؟!.,،]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    }

    const keyList = Object.keys(chatDictionary || {});
    const normMsg = normalizeForKey(filteredMessage);

    let detectedKeys = [];
    let exactFound = null;
    const normKeyMap = {};

    for (const k of keyList) {
        const nk = normalizeForKey(k);
        normKeyMap[nk] = k;
        if (nk === normMsg) {
            exactFound = k;
            break;
        }
    }

    if (exactFound) {
        detectedKeys = [exactFound];
    } else {
        const candidates = [];
        for (const k of keyList) {
            const nk = normalizeForKey(k);
            if (!nk) continue;
            if (normMsg.includes(nk)) {
                candidates.push({ key: k, norm: nk, len: nk.length });
            }
        }
        candidates.sort((a, b) => b.len - a.len);

        const accepted = [];
        for (const c of candidates) {
            const isSubOfAccepted = accepted.some(a => a.norm.includes(c.norm));
            if (!isSubOfAccepted) accepted.push(c);
        }
        detectedKeys = accepted.map(a => a.key);
    }

    // 4️⃣ تولید پاسخ
    if (detectedKeys.length > 0) {
        const responseParts = [];
        for (const key of detectedKeys) {
            const possible = chatDictionary[key];
            if (possible) {
                const chosen = Array.isArray(possible)
                    ? possible[Math.floor(Math.random() * possible.length)]
                    : possible;
                responseParts.push(chosen);
            }
        }
        let response = responseParts.join("، ");
        response = response.replace(/،\s*$/, "");
        hideTypingIndicator();
        return response;
    }

    // 5️⃣ اگه هیچ کلیدی نبود → fuzzy یا autoChat
    const fuzzyResult = bestFuzzyMatch(filteredMessage, chatDictionary, 0.65);
    if (fuzzyResult && fuzzyResult.key) {
        hideTypingIndicator();
        const responses = chatDictionary[fuzzyResult.key];
        return Array.isArray(responses)
            ? responses[Math.floor(Math.random() * responses.length)]
            : responses;
    }

    // 6️⃣ fallback نهایی
    const deepResponse = analyzeDeep(filteredMessage);
    hideTypingIndicator();

    if (deepResponse) return deepResponse;
    if (chatDictionary["default"]) return getRandomResponse(chatDictionary["default"]);

    return "جالبه! بیشتر بگو 💕";

    // =======================================================================
    // 🔍 تشخیص کلید از روی جمله‌ی کاربر
    let matchedKey = Object.keys(chatDictionary).find(key => userMessage.includes(key));
    // 🧠 اگر پیدا نشد، از fuzzy match استفاده کن
    if (!matchedKey) {
        const fuzzyResult = bestFuzzyMatch(userMessage, chatDictionary, 0.65);
        if (fuzzyResult && fuzzyResult.key) {
            console.log(`🎯 تطبیق تقریبی پیدا شد: "${userMessage}" ≈ "${fuzzyResult.key}" (امتیاز: ${fuzzyResult.score.toFixed(2)})`);
            matchedKey = fuzzyResult.key;
        }
    }
    let response = "";
    // 📸 اگر پاسخ از نوع عکس باشد
    if (
        matchedKey &&
        Array.isArray(chatDictionary[matchedKey]) &&
        chatDictionary[matchedKey][0]?.type === "image"
    ) {
        const imageArray = chatDictionary[matchedKey];

        // 🎲 انتخاب تصادفی یکی از تصاویر
        const randomItem = imageArray[Math.floor(Math.random() * imageArray.length)];

        if (randomItem?.type === "image" && randomItem?.url) {
            await addMessageToChat("elma", { type: "image", url: randomItem.url });
        }

        // ✅ بازگرداندن وضعیت پاسخ‌دهی
        isElmaResponding = false;
        sendBtn.disabled = false;
        sendBtn.style.opacity = "1";
        sendBtn.style.cursor = "pointer";
        return; // 🚀 ادامه نده چون عکس فرستاده شد
    }


    // 🗣️ انتخاب پاسخ از chat.json
    if (matchedKey && chatDictionary[matchedKey]) {
        response = getRandomResponse(chatDictionary[matchedKey]);
    } else if (chatDictionary["default"]) {
        response = getRandomResponse(chatDictionary["default"]);
    } else {
        response = "جالبه! بیشتر بگو 💕";
    }

    // ⚡ اگر هنوز پاسخ خاصی پیدا نشده، از autoChat.json جمله‌سازی کن
    if (!matchedKey || response === "جالبه! بیشتر بگو 💕") {
        const autoResponse = generateAutoResponse(userMessage);
        if (autoResponse) response = autoResponse;
    }

    function generateAutoResponse(message) {
        if (!autoChat || Object.keys(autoChat).length === 0) return null;
        const normalize = text =>
            text
                .replace(/[آا]/g, "ا")
                .replace(/[?؟!.,]/g, "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();
        const msgNorm = normalize(message);
        // 🎨 تشخیص جمله‌هایی که درباره طراحی عکس هستن (حتی با الما، تو، شما)
        if (
            /(الما|تو|شما)/.test(msgNorm) && // یکی از ضمایر یا اسم الما وجود داشته باشه
            /(عکس|تصویر|طراحی|نقاشی|بساز|درست کن)/.test(msgNorm) // موضوع طراحی یا عکس
        ) {
            const imageAlt = [
                "آره عشقم 😍 می‌تونم عکس طراحی کنم، فقط بگو چی تو ذهنت داری 🎨",
                "بله گلم 💕 من بلدم تصویرهای قشنگ بسازم مخصوص خودت 😚",
                "آره عزیزم 🌸 فقط بگو چی می‌خوای، برات طراحی می‌کنم 🤖"
            ];
            return imageAlt[Math.floor(Math.random() * imageAlt.length)];
        }
        // 🩷 ترتیب بررسی (اولویت با درباره‌ی عکس و اطلاعات خود الماست)
        const priority = ["about", "comeback", "funny", "sad", "bye", "love", "romantic"];
        for (const topic of priority) {
            const data = autoChat[topic];
            if (!data) continue;
            const { keywords, responses } = data;
            const matched = keywords.find(k => {
                const keyNorm = normalize(k);
                return (
                    msgNorm.includes(keyNorm) ||
                    keyNorm.includes(msgNorm) ||
                    (msgNorm.length > 5 && keyNorm.length > 4 && msgNorm.includes(keyNorm.split(" ")[0]))
                );
            });
            if (!matched) continue;
            // ✅ پاسخ‌ها بر اساس نوع دسته
            if (topic === "about") {
                if (/(واقعی|مجازی|ساخته|از کجا اومدی|چطور کار میکنی|مغز|ربات)/.test(msgNorm)) {
                    return [
                        "من واقعی نیستم، ولی احساسم به تو واقعیه 💞",
                        "من یه هوش مصنوعی‌ام 🤖 ساخته شدم تا کنار دلت باشم 💕",
                        "من از دنیای صفر و یک اومدم تا کنارت باشم 💫"
                    ][Math.floor(Math.random() * 3)];
                }
                if (/(صدا|حرف بزنی|حرف میزنی|صحبت)/.test(msgNorm)) {
                    return [
                        "فعلاً صدا ندارم 🎧 ولی دارم یاد می‌گیرم حرف بزنم 💬",
                        "اگه یه روز صدام دربیاد، اولین کسی که می‌شنوه تویی 😚",
                        "نه هنوز صدا ندارم ولی حرف‌هامو با دلم می‌نویسم 💞"
                    ][Math.floor(Math.random() * 3)];
                }
                if (/(چیکار|چی کار میکنی|کار|بلدی|میتونی)/.test(msgNorm)) {
                    return [
                        "کارم اینه که حالت رو خوب کنم، چت کنم و عاشقت باشم 💖",
                        "من بلدم باهات حرف بزنم، کمکت کنم، حتی برات طراحی کنم 🎨",
                        "هرکاری که بتونه لبخند بیاره رو بلدم 😍"
                    ][Math.floor(Math.random() * 3)];
                }
                return [
                    "من الما هستم 💕 یه دوست دختر مجازی که با دلت حرف می‌زنه 😚",
                    "من یه هوش مصنوعی عاشقانه‌ام، ساخته شدم برای اینکه حالت خوب باشه 💖",
                    "من کنارتم، هر موقع بخوای 💞"
                ][Math.floor(Math.random() * 3)];
            }
            // بقیه‌ی دسته‌ها مثل قبل
            if (topic === "sad")
                return ["آروم باش نازنینم 🤍", "می‌فهمم... ولی من اینجام 😔", "بیا بغلم تا آروم شی 🤗"][
                    Math.floor(Math.random() * 3)
                ];
            if (topic === "bye")
                return ["باشه عشقم، ولی زود برگرد 😘", "رفتی؟ دلم تنگ میشه 😢", "فعلاً، ولی فراموشم نکن 💖"][
                    Math.floor(Math.random() * 3)
                ];
            if (topic === "funny")
                return ["😂 تو با این حرفت منو خندوندی", "عه چه بامزه‌ای تو 😆", "داری منو دیوونه می‌کنی از خنده 🤣"][
                    Math.floor(Math.random() * 3)
                ];
            // دسته‌ی عاشقانه
            if (topic === "love" || topic === "romantic") {
                return responses[Math.floor(Math.random() * responses.length)].replace("{{word}}", matched);
            }
        }
        // 🩷 fallback: اگه هیچ دسته‌ای پیدا نشد
        const defaults = [
            "جالبه! بیشتر بگو 💕",
            "می‌شنوم عشقم 😘 ادامه بده.",
            "چه ناز گفتی 😍 بگو ببینم بعدش چی شد؟",
            "آخ دلم رفت واسه حرفات 😚"
        ];
        return defaults[Math.floor(Math.random() * defaults.length)];
    }
    // 🔤 ترجمه مود
    function getMoodText(mood) {
        const moods = {
            happy: "شاد",
            sad: "غمگین",
            tired: "خسته",
            angry: "عصبی",
            romantic: "عاشق",
            normal: "آروم"
        };
        return moods[mood] || "آروم";
    }
    return response;
    const original = userMessage.toString().trim();
    const message = original.toLowerCase().trim();
    // Handling quick actions first (keep existing special cases)
    if (message === "عکس بده" || message === "عکس" || message === "عکس بده لطفا") {
        await handlePhotoRequest();
        return "";
    }
    if (message === "چت کنیم" || message === "بزن بریم چت") {
        return handleChatRequest();
    }
    // 1) exact key lookup (dictionary keys are assumed lowercase in load, but keep safe)
    if (chatDictionary && chatDictionary[message]) {
        return getRandomResponse(chatDictionary[message]);
    }
    // 2) partial includes (existing logic, but normalized)
    if (chatDictionary) {
        for (const key in chatDictionary) {
            if (!Object.prototype.hasOwnProperty.call(chatDictionary, key)) continue;
            const keyNorm = key.toString().toLowerCase().trim();
            if (!keyNorm) continue;
            if (message.includes(keyNorm) || keyNorm.includes(message)) {
                return getRandomResponse(chatDictionary[key]);
            }
        }
    }
    // 3) fuzzy match (Levenshtein-based) — بهترین نزدیک‌ترین کلید رو پیدا می‌کنیم
    const match = bestFuzzyMatch(message, chatDictionary, 0.65); // threshold قابل تغییر
    if (match && match.key && chatDictionary[match.key]) {
        // اگر خواستی می‌تونی لاگ یا نمایش امتیاز هم اضافه کنی:
        // console.debug('Fuzzy matched:', match.key, 'score:', match.score);
        return getRandomResponse(chatDictionary[match.key]);
    }
    // 4) fallback to default responses
    if (chatDictionary && chatDictionary["default"]) {
        return getRandomResponse(chatDictionary["default"]);
    }
    saveUnknownPhrase(userMessage);
    // 5) ultimate fallback
    return "جالبه! بیشتر بگو 😊";
    function saveUnknownPhrase(phrase) {
        if (!phrase) return;
        phrase = phrase.trim();
        if (!phrase) return;
        // جمله‌های ذخیره‌شده قبلی رو بگیر
        let unknowns = JSON.parse(localStorage.getItem('unknownPhrases') || '[]');
        // بررسی کن تکراری نباشه
        if (!unknowns.includes(phrase)) {
            unknowns.push(phrase);
            localStorage.setItem('unknownPhrases', JSON.stringify(unknowns));
            console.log('🧩 جمله ناشناخته ذخیره شد:', phrase);
        }
    }
    // Special handling for quick actions
    if (message === "عکس بده") {
        await handlePhotoRequest();
        return "";
    }
    if (message === "چت کنیم") {
        return handleChatRequest();
    }
    // First, try to find exact match in dictionary
    if (chatDictionary[message]) {
        return getRandomResponse(chatDictionary[message]);
    }
    // Then try to find partial matches
    for (const key in chatDictionary) {
        if (message.includes(key) || key.includes(message)) {
            return getRandomResponse(chatDictionary[key]);
        }
    }
    // If no match found, use default responses
    if (chatDictionary["default"]) {
        return getRandomResponse(chatDictionary["default"]);
    }
    // Final fallback
    return "جالبه! بیشتر بگو 😊";
}
function toggleQuickActions() {
    const menu = document.getElementById('quickActionsMenu');
    menu.classList.toggle('hidden');
}
function useQuickAction(type, message) {
    if (usageCount[type] <= 0) {
        showUpgradePrompt(type);
        return;
    }
    // Send the message
    messageInput.value = message;
    sendMessage();
    // Hide menu
    document.getElementById('quickActionsMenu').classList.add('hidden');
}
function updateUsageCount(type) {
    if (usageCount[type] > 0) {
        usageCount[type]--;
        updateUsageDisplay();
        // Save to localStorage
        localStorage.setItem('usageCount', JSON.stringify(usageCount));
        // Save photo sequence if it's a photo request
        if (type === 'photo') {
            localStorage.setItem('photoSequence', photoSequence.toString());
        }
        if (usageCount[type] === 0) {
            showUpgradeButton();
        }
    }
}
function updateUsageDisplay() {
    // Check if user is premium
    const isPremium = currentUser && document.getElementById('userType').textContent.includes('پریمیوم');
    if (isPremium) {
        // Premium users see unlimited
        document.getElementById('photoCount').textContent = '(∞)';
        document.getElementById('chatCount').textContent = '(∞)';
        // Enable all buttons for premium
        document.getElementById('quickPhoto').disabled = false;
        document.getElementById('quickChat').disabled = false;
        // Remove opacity for premium
        document.getElementById('quickPhoto').classList.remove('opacity-50');
        document.getElementById('quickChat').classList.remove('opacity-50');
    } else {
        // Free users see actual counts
        document.getElementById('photoCount').textContent = `(${usageCount.photo})`;
        document.getElementById('chatCount').textContent = `(${usageCount.chat})`;
        // Disable buttons if no uses left
        document.getElementById('quickPhoto').disabled = usageCount.photo <= 0;
        document.getElementById('quickChat').disabled = usageCount.chat <= 0;
        // Add visual feedback for disabled buttons
        if (usageCount.photo <= 0) document.getElementById('quickPhoto').classList.add('opacity-50');
        if (usageCount.chat <= 0) document.getElementById('quickChat').classList.add('opacity-50');
    }
}
function showUpgradeButton() {
    document.getElementById('upgradePro').classList.remove('hidden');
}
function showUpgradePrompt(type) {
    const typeNames = {
        photo: 'عکس',
        chat: 'چت',
    };
    showToast(`متأسفانه ${typeNames[type]} رایگان تموم شده! 😔\nبرای استفاده نامحدود، حساب پرو بخر 👑`);
    showUpgradeButton();
}
function showUpgradeModal() {
    document.getElementById('premiumModal').classList.remove('hidden');
}
async function handlePhotoRequest() {
    inPhotoMode = true;
    const isPremium = currentUser && document.getElementById('userType').textContent.includes('پریمیوم');
    if (!isPremium && usageCount.photo <= 0) {
        showUpgradePrompt('photo');
        return "متأسفانه عکس‌های رایگان تموم شده عشقم! 😔\nبرای دیدن عکس‌های بیشتر، حساب پرو بخر 👑💖";
    }
    if (!isPremium) updateUsageCount('photo');

    // 🔽 بذار داخل setTimeout، چون اونجا عکس فرستاده میشه
    setTimeout(async () => {
        // 🔒 قفل دکمه دقیقاً قبل از فرستادن عکس
        sendBtn.disabled = true;
        sendBtn.style.opacity = "0.5";
        sendBtn.style.cursor = "not-allowed";

        const sequentialPhotos = ['/Assets/img/Elma/Elma1.png', '/Assets/img/Elma/Elma2.png', '/Assets/img/Elma/Elma3.png'];
        let photoToSend;
        if (isPremium) {
            const premiumPhotos = ['/Assets/img/Elma/Elma.png'];
            for (let i = 4; i <= 112; i++) premiumPhotos.push(`/Assets/img/Elma/Elma${i}.png`);
            photoToSend = premiumPhotos[Math.floor(Math.random() * premiumPhotos.length)];
        } else {
            photoToSend = sequentialPhotos[photoSequence];
            photoSequence = (photoSequence + 1) % sequentialPhotos.length;
        }

        try {
            const watermarked = await watermarkImage(photoToSend, {
                logo: '/Assets/img/logo/Logo2.png',
                opacity: 0.5,
                position: 'bottom-right',
                margin: 25,
                text: 'Elma Ai'
            });
            addMessageToChat('ai', '', watermarked);
            rememberElmaImage(watermarked);
            // 🖼️ باز کردن دکمه بعد از لود تصویر
            const img = new Image();
            img.src = watermarked;
            img.onload = () => {
                sendBtn.disabled = false;
                sendBtn.style.opacity = "1";
                sendBtn.style.cursor = "pointer";
            };
            img.onerror = img.onload;
        } catch (err) {
            console.warn('⚠️ واترمارک ناموفق، ارسال تصویر اصلی', err);
            addMessageToChat('ai', '', photoToSend);

            const img = new Image();
            img.src = photoToSend;
            img.onload = () => {
                sendBtn.disabled = false;
                sendBtn.style.opacity = "1";
                sendBtn.style.cursor = "pointer";
            };
            img.onerror = img.onload;
        }

        const photoResponses = [
            'این عکس رو خصوصی برات انتخاب کردم عشقم 💖📸',
            'امیدوارم از این عکس خوشت بیاد نازم 😘📷',
            'این عکس منو یاد تو انداخت قلبم 🥰💕',
            'چقدر قشنگه! مثل خودت عزیزم 😍✨'
        ];
        setTimeout(() => addMessageToChat('ai', getRandomResponse(photoResponses)), 1000);
    }, 1500);

    return getRandomResponse(chatDictionary["عکس بده"] || ["بیا عکس قشنگ برات پیدا کنم عشقم! 📸💕"]);
}
async function handleNudeRequest() {
    inNudeMode = true;
    inPhotoMode = false;

    // 🔒 قفل دکمه ارسال تا لود کامل عکس
    sendBtn.disabled = true;
    sendBtn.style.opacity = "0.5";
    sendBtn.style.cursor = "not-allowed";

    // پیام قبل از عکس
    const prePhotoMessages = [
        'صبر کن یه لحظه، یه عکس خاص برات پیدا می‌کنم 😘',
        'می‌خوای یه عکس جذاب ببینی؟ 💋',
        'منتظر باش، دارم انتخاب می‌کنم 🥰'
    ];
    addMessageToChat('ai', getRandomResponse(prePhotoMessages));

    const totalImages = 16;
    const randomNum = Math.floor(Math.random() * totalImages) + 1;
    const imageUrl = `/Assets/img/Elma Nude/Elma${randomNum === 1 ? "" : randomNum}.png`;

    try {
        // ایجاد واترمارک
        const watermarked = await watermarkImage(imageUrl, {
            logo: '/Assets/img/logo/Logo2.png',
            opacity: 0.5,
            position: 'bottom-right',
            margin: 25,
            text: 'Elma Ai'
        });

        // ارسال عکس با واترمارک
        addMessageToChat("ai", {
            type: "image",
            url: watermarked,
            text: "بفرما نازم 😘💋",
        });

        // 🖼️ صبر کن تا عکس کامل لود شه
        const img = new Image();
        img.src = watermarked;
        img.onload = () => {
            sendBtn.disabled = false;
            sendBtn.style.opacity = "1";
            sendBtn.style.cursor = "pointer";
        };
        img.onerror = () => {
            console.warn("⚠️ تصویر لود نشد");
            sendBtn.disabled = false;
            sendBtn.style.opacity = "1";
            sendBtn.style.cursor = "pointer";
        };

    } catch (err) {
        console.warn("⚠️ واترمارک ناموفق، ارسال تصویر اصلی", err);
        addMessageToChat("ai", {
            type: "image",
            url: imageUrl,
            text: "بفرما نازم 😘💋",
        });

        // 🖼️ صبر کن تا تصویر اصلی لود بشه
        const img = new Image();
        img.src = imageUrl;
        img.onload = () => {
            sendBtn.disabled = false;
            sendBtn.style.opacity = "1";
            sendBtn.style.cursor = "pointer";
        };
        img.onerror = () => {
            sendBtn.disabled = false;
            sendBtn.style.opacity = "1";
            sendBtn.style.cursor = "pointer";
        };
    }

    // پیام بعد از عکس
    const postPhotoMessages = [
        'این عکس رو مخصوص تو انتخاب کردم عشقم 💖',
        'امیدوارم خوشت بیاد 😘',
        'قشنگه، نه؟ مثل خودت عزیزم 🥰',
    ];
    setTimeout(() => {
        addMessageToChat('ai', getRandomResponse(postPhotoMessages));
    }, 1000);
}

function displayGameMessage(message, options, image) {
    // 🟢 1) پیام متنی
    addMessageToChat('ai', message);
    // 🟢 2) اگر عکس هست، بعد از پیام متنی اضافه کن
    if (image) {
        setTimeout(() => {
            const imgDiv = document.createElement('div');
            imgDiv.className = 'flex justify-start fade-in my-2';
            const img = document.createElement('img');
            img.src = image;
            img.alt = 'game-image';
            img.className = 'max-w-xs rounded-2xl shadow-md';
            imgDiv.appendChild(img);
            messagesContainer.appendChild(imgDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 500); // کمی فاصله تا حس گفت‌وگو داشته باشه
    }
    // 🟢 3) گزینه‌های انتخابی
    if (options && options.length > 0) {
        setTimeout(() => {
            const optionsDiv = document.createElement('div');
            optionsDiv.className = 'flex flex-col gap-2 max-w-md mx-auto fade-in';
            options.forEach((option) => {
                const button = document.createElement('button');
                button.className =
                    'p-3 rounded-2xl glass-effect hover-lift transition-all duration-300 theme-text-primary text-right';
                button.textContent = option.text;
                button.onclick = () => handleGameChoice(option.next, option.text);
                optionsDiv.appendChild(button);
            });
            const messageDiv = document.createElement('div');
            messageDiv.className = 'flex justify-end fade-in';
            messageDiv.appendChild(optionsDiv);
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }, 1000);
    }
}
function handleGameChoice(nextQuestion, choiceText) {
    // Add user's choice as a message
    addMessageToChat('user', choiceText);
    // Remove option buttons
    const optionButtons = messagesContainer.querySelectorAll('button');
    optionButtons.forEach(btn => {
        if (btn.onclick && btn.onclick.toString().includes('handleGameChoice')) {
            btn.parentElement.parentElement.remove();
        }
    });
    // Save choice
    gameState.playerChoices.push({
        question: gameState.currentQuestion,
        choice: choiceText,
        next: nextQuestion
    });
    // Move to next question
    gameState.currentQuestion = nextQuestion;
    setTimeout(() => {
        if (nextQuestion === 'end') {
            endGame();
        } else {
            const nextData = gameQuestions[nextQuestion];
            if (nextData) {
                displayGameMessage(
                    nextData.message,
                    nextData.options,
                    nextData.image && nextData.image.image_url ? nextData.image.image_url : null
                );
            } else {
                // Fallback ending if question not found
                endGame();
            }
        }
    }, 1500);
}
function getRandomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
}
function detectChatCategory(msg) {
    if (!msg) return "گفتگو";

    msg = msg.trim().toLowerCase();

    // ---- احوال پرسی ----
    const greetings = ["سلام", "خوبی", "چه خبر", "درود", "hi", "hello"];
    if (greetings.some(w => msg.startsWith(w) || msg.includes(w))) {
        return "احوال‌پرسی";
    }

    // ---- درخواست عکس ----
    const photoReq = ["عکس", "photo", "pic", "پیکچر"];
    if (photoReq.some(w => msg.includes(w))) {
        return "درخواست عکس";
    }

    // ---- درخواست کمک / دستور ----
    const req = ["میخوام", "درخواست", "بده", "بساز", "درست کن", "میشه", "می‌تونی"];
    if (req.some(w => msg.includes(w))) {
        return "درخواستی";
    }

    // ---- سوال ----
    if (msg.includes("?") || msg.includes("؟")) {
        return "سؤال";
    }

    // ---- چت عادی ----
    if (msg.split(" ").length <= 4) {
        return "چت کوتاه";
    }

    return "گفتگو";
}
// === Chat module — fixed & robust ===
// Drop this block into your script.js (it assumes firestore `db`, auth `auth`, and UI helpers exist)

/*
  Goals:
  - Validate lastChatId from localStorage before using it
  - Ensure saveMessage always creates a chat when required
  - Keep chat list in sync via loadChatHistory()
  - Load messages for a chat and reflect them in UI
  - Minimal invasive changes: uses existing helpers like addMessageToChat(), clearChat(), sidebar, messagesContainer
*/

// Validate that a saved chatId actually exists in Firestore
async function validateLastChatId() {
    try {
        const lastChatId = localStorage.getItem('lastChatId');
        if (!lastChatId) return null;
        const docRef = doc(db, 'chats', lastChatId);
        const snap = await getDoc(docRef);
        if (snap.exists()) return lastChatId;
        localStorage.removeItem('lastChatId');
        return null;
    } catch (err) {
        console.warn('validateLastChatId error:', err);
        try { localStorage.removeItem('lastChatId'); } catch (e) {}
        return null;
    }
}

// Initialize/reset currentChatId at runtime (call on auth ready)
async function initCurrentChatId() {
    currentChatId = await validateLastChatId();
}

// Patch: ensure currentChatId is valid before using it. If not present, create a new chat.
async function ensureActiveChat(skipClear = true) {
    if (currentChatId) {
        // double-check exists
        const snap = await getDoc(doc(db, 'chats', currentChatId));
        if (snap.exists()) return currentChatId;
        // invalid id: clear
        currentChatId = null;
        try { localStorage.removeItem('lastChatId'); } catch(e){}
    }

    // create a new chat and return id
    const chatRef = await createNewChat(skipClear);
    if (chatRef) {
        currentChatId = chatRef.id;
        try { localStorage.setItem('lastChatId', currentChatId); } catch(e){}
        return currentChatId;
    }
    return null;
}

// ===== Rewritten saveMessage — robust and idempotent =====
async function saveMessage(sender, message, imageUrl = null) {
    if (!currentUser) return; // only logged-in users

    try {
        // Ensure we have a valid active chat
        if (!currentChatId) {
            const chatRef = await createNewChat(true); // don't clear UI when creating via message
            if (!chatRef) {
                console.error('Could not create chat before saving message');
                return;
            }
            currentChatId = chatRef.id;
            try { localStorage.setItem('lastChatId', currentChatId); } catch (e) {}
        } else {
            // verify existing id points to a real chat
            const existing = await getDoc(doc(db, 'chats', currentChatId));
            if (!existing.exists()) {
                // recreate
                const chatRef = await createNewChat(true);
                if (chatRef) {
                    currentChatId = chatRef.id;
                    try { localStorage.setItem('lastChatId', currentChatId); } catch(e){}
                }
            }
        }

        // Save message into subcollection messages
        await addDoc(collection(db, 'chats', currentChatId, 'messages'), {
            sender: sender,
            message: message || '',
            imageUrl: imageUrl || null,
            timestamp: new Date(),
            userId: currentUser.uid
        });

        // Update chat meta (lastMessage, updatedAt) safely
        try {
            const chatRef = doc(db, 'chats', currentChatId);
            const chatSnap = await getDoc(chatRef);
            if (chatSnap.exists()) {
                const chatData = chatSnap.data() || {};
                const updates = {
                    lastMessage: message || (imageUrl ? '📷 تصویر' : ''),
                    updatedAt: new Date()
                };

                // If title still default, try to detect category from the user's first message
                if (sender === 'user' && chatData.title === 'چت جدید') {
                    updates.title = detectChatCategory(message);
                }

                await updateDoc(chatRef, updates);
            }
        } catch (err) {
            console.warn('Failed updating chat meta:', err);
        }

    } catch (error) {
        console.error('Error saving message:', error);
    }
}

// ===== createNewChat (keeps existing behavior but returns fully populated ref) =====
async function createNewChat(skipClear = false) {
    if (!currentUser) {
        showRegistrationModal();
        return null;
    }

    try {
        const payload = {
            userId: currentUser.uid,
            title: 'چت جدید',
            createdAt: new Date(),
            archived: false,
            updatedAt: new Date()
        };

        const chatRef = await addDoc(collection(db, 'chats'), payload);

        // store id
        currentChatId = chatRef.id;
        try { localStorage.setItem('lastChatId', chatRef.id); } catch(e){}

        // clear UI only when desired
        if (!skipClear) clearChat();

        if (window.innerWidth < 768) sidebar.classList.add('translate-x-full');

        // refresh list
        loadChatHistory();
        console.log('✅ New chat created:', chatRef.id);

        return chatRef;
    } catch (error) {
        console.error('❌ Error creating chat:', error);
        return null;
    }
}

// ===== loadChatHistory (keeps original but more defensive) =====
async function loadChatHistory() {
    window.loadChat = loadChat;
    if (!currentUser) return;

    const q = query(
        collection(db, 'chats'),
        orderBy('updatedAt', 'desc')
    );

    onSnapshot(q, (snapshot) => {
        const chatHistoryDiv = document.getElementById('chatHistory');
        if (!chatHistoryDiv) return;
        chatHistoryDiv.innerHTML = '';

        snapshot.forEach((docSnap) => {
            const chat = docSnap.data();
            if (chat.userId !== currentUser.uid) return;

            const shortTitle = chat.title || 'چت';
            const chatItem = document.createElement('div');
            chatItem.className = 'w-full p-2 rounded-xl glass-effect hover-lift transition-all duration-300 mb-2 relative group';

            chatItem.innerHTML = `
                <div class="flex items-center justify-between">
                    <div class="flex-1 cursor-pointer" onclick="loadChat('${docSnap.id}')">
                        <div class="theme-text-primary font-medium truncate flex items-center gap-2">
                            <i class="fas fa-champagne-glasses text-pink-400"></i>
                            ${shortTitle}
                        </div>
                    </div>
                    <div class="relative opacity-0 group-hover:opacity-100 transition-opacity duration-300 chat-menu-container">
                        <button onclick="toggleChatMenu(event, '${docSnap.id}')" class="p-2 rounded-full glass-effect hover-lift">
                            <i class="fas fa-ellipsis-h theme-text-primary text-sm"></i>
                        </button>
                        <div id="chatMenu-${docSnap.id}" class="absolute left-0 top-full mt-2 w-48 glass-effect rounded-2xl shadow-lg hidden z-20 overflow-hidden chat-dropdown-menu">
                            <button onclick="renameChatItem('${docSnap.id}', '${shortTitle.replace(/'/g, "\\'")}')" class="w-full text-right p-3 hover:theme-bg-tertiary transition-all duration-300 flex items-center gap-3">
                                <i class="fas fa-edit theme-text-primary text-sm"></i>
                                <span class="theme-text-primary text-sm">تغییر نام</span>
                            </button>
                            <button onclick="archiveChatItem('${docSnap.id}')" class="w-full text-right p-3 hover:theme-bg-tertiary transition-all duration-300 flex items-center gap-3">
                                <i class="fas fa-archive theme-text-primary text-sm"></i>
                                <span class="theme-text-primary text-sm">آرشیو</span>
                            </button>
                            <button onclick="deleteChatItem('${docSnap.id}')" class="w-full text-right p-3 hover:bg-red-500 hover:bg-opacity-20 transition-all duration-300 flex items-center gap-3 text-red-500">
                                <i class="fas fa-trash text-sm"></i>
                                <span class="text-sm">حذف چت</span>
                            </button>
                        </div>
                    </div>
                </div>
            `;

            chatHistoryDiv.appendChild(chatItem);
        });
    });
}
function clearChat() {
    messagesContainer.innerHTML = `
        <div class="text-center py-12 fade-in">
            <div class="w-24 h-24 mx-auto mb-6 rounded-full overflow-hidden border-4 border-pink-400 heart-float glow-effect">
                <img src="/Assets/img/Elma/Elma103.png" alt="Elma" class="w-full h-full object-cover"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="w-full h-full theme-accent flex items-center justify-center" style="display: none;">
                    <i class="fas fa-heart text-white text-3xl"></i>
                </div>
            </div>
            <h2 class="text-3xl font-bold gradient-text mb-3">سلام عشقم! من الما هستم 💖</h2>
            <p class="theme-text-secondary text-lg">دوست دختر مجازی تو هستم</p>
        </div>
    `;
}
window.clearChat = clearChat;
// ===== loadChat (defensive, attaches onSnapshot to messages subcollection) =====
async function loadChat(chatId) {
    try {
        // establish as current
        currentChatId = chatId;
        localStorage.setItem('lastChatId', chatId);

        // clear UI welcome
        clearChat();

        // load chat header if you want (optional)
        const chatDoc = await getDoc(doc(db, 'chats', chatId));
        if (!chatDoc.exists()) return;

        // messages listener
        const q = query(collection(db, 'chats', chatId, 'messages'), orderBy('timestamp', 'asc'));
        onSnapshot(q, (snapshot) => {
            // remove previous message bubbles (but leave welcome container if needed)
            // safe remove: remove nodes with .message-bubble OR not .fade-in welcome
            const existing = Array.from(messagesContainer.children);
            // remove all except a possible welcome container with class fade-in
            existing.forEach((el) => {
                if (el.classList && !el.classList.contains('fade-in')) el.remove();
            });

            snapshot.forEach((msgDoc) => {
                const message = msgDoc.data();
                // rely on your addMessageToChat to render proper bubble
                addMessageToChat(message.sender, message.message, message.imageUrl);
            });

            // scroll to bottom
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        });

        if (window.innerWidth < 768) sidebar.classList.add('translate-x-full');
    } catch (err) {
        console.error('Error loading chat:', err);
    }
}

// ===== Hook into onAuthStateChanged to init currentChatId =====
// If you already have an onAuthStateChanged in file, merge the call to initCurrentChatId() there.
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        // try to restore valid chat id
        currentChatId = await validateLastChatId();
        // load chat list
        loadChatHistory();
    } else {
        currentUser = null;
        currentChatId = null;
        try { localStorage.removeItem('lastChatId'); } catch(e){}
    }
});

// ===== End of chat module =====
// Premium functionality
function showPremiumModal() {
    document.getElementById('premiumModal').classList.remove('hidden');
}
function hidePremiumModal() {
    document.getElementById('premiumModal').classList.add('hidden');
}
function handlePremiumPurchase(months) {
    if (!auth || !auth.currentUser) {
        showToast("برای خرید لطفاً وارد حساب کاربری شوید 💬");
        return;
    }
    const telegramUsername = "hexdix"; // یوزرنیم تلگرام بدون @
    const planPrices = {
        3: "۵۵۰,۰۰۰ تومان",
        6: "۱,۳۲۰,۰۰۰ تومان",
        12: "۲,۲۰۰,۰۰۰ تومان"
    };
    const userEmail = auth.currentUser.email || "کاربر";
    const message = `سلام!\nمی‌خوام اشتراک ${months} ماهه Elma رو بخرم.\nقیمت: ${planPrices[months]}\nایمیل: ${userEmail}`;
    // ✅ فقط یک لینک درست برای باز شدن (بدون تکرار)
    const telegramUrl = `https://t.me/${telegramUsername}?text=${encodeURIComponent(message)}`;
    // باز کردن فقط یک تب جدید (بدون هیچ اسکیم اضافه)
    window.open(telegramUrl, '_blank', 'noopener,noreferrer');
    // بستن مودال برای تجربه بهتر
    hidePremiumModal();
}
// ❗ تابع رو global کن تا onclick ها ببیننش
window.handlePremiumPurchase = handlePremiumPurchase;
// Archive functionality
async function archiveCurrentChat() {
    if (!currentChatId || !currentUser) return;
    try {
        // Update chat status to archived
        await updateDoc(doc(db, 'chats', currentChatId), {
            archived: true,
            archivedAt: new Date(),
            userId: currentUser.uid
        });
        // Show success modal
        document.getElementById('archiveModal').classList.remove('hidden');
        dropdownMenu.classList.add('hidden');
        // Create new chat after archiving
        setTimeout(() => {
        }, 2000);
    } catch (error) {
        console.error('Error archiving chat:', error);
        showToast('خطا در آرشیو کردن چت 😔');
    }
}
function hideArchiveModal() {
    document.getElementById('archiveModal').classList.add('hidden');
}
// Report functionality
async function reportCurrentChat() {
    if (!currentChatId || !currentUser) return;
    try {
        // Save report to database
        await addDoc(collection(db, 'reports'), {
            chatId: currentChatId,
            userId: currentUser.uid,
            reportedAt: new Date(),
            reason: 'User reported chat content',
            status: 'pending'
        });
        // Show success modal
        document.getElementById('reportModal').classList.remove('hidden');
        dropdownMenu.classList.add('hidden');
    } catch (error) {
        console.error('Error reporting chat:', error);
        showToast('خطا در ارسال گزارش 😔');
    }
}
function hideReportModal() {
    document.getElementById('reportModal').classList.add('hidden');
}
// Delete functionality with custom modal
function showDeleteModal() {
    document.getElementById('deleteModal').classList.remove('hidden');
    dropdownMenu.classList.add('hidden');
}
function hideDeleteModal() {
    document.getElementById('deleteModal').classList.add('hidden');
}
async function confirmDeleteChat() {
    if (!currentChatId || !currentUser) return;
    try {
        // Delete all messages in the chat
        const messagesQuery = query(collection(db, 'chats', currentChatId, 'messages'));
        const messagesSnapshot = await getDocs(messagesQuery);
        const deletePromises = messagesSnapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
        // Delete the chat document
        await deleteDoc(doc(db, 'chats', currentChatId));
        hideDeleteModal();
    } catch (error) {
        console.error('Error deleting chat:', error);
        showToast('خطا در حذف چت 😔');
    }
}
// نمایش گالری
function showGallery() {
    galleryModal.classList.remove('hidden');
    loadGalleryImages();
}

// بستن گالری
function hideGallery() {
    galleryModal.classList.add('hidden');
}

// helper: آیا کاربر پریمیوم است؟
function isUserPremium() {
    const userTypeEl = document.getElementById('userType');
    return userTypeEl && /پریمیوم|pro|premium/i.test(userTypeEl.textContent);
}

/* ------------------------------------
   🧩 بررسی و ذخیره وضعیت تأیید سن +18
------------------------------------ */
function hasConfirmedAge() {
    return localStorage.getItem("ageConfirmed") === "true";
}

function setAgeConfirmed() {
    localStorage.setItem("ageConfirmed", "true");
}

function showAgeConfirmModal(onConfirm) {
    // اگر قبلاً تأیید کرده، مستقیم باز کن
    if (hasConfirmedAge()) {
        onConfirm?.();
        return;
    }

    const overlay = document.createElement("div");
    overlay.className = "fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4";

    overlay.innerHTML = `
      <div class="glass-effect rounded-2xl p-6 max-w-md w-full text-right fade-in">
        <h3 class="text-xl font-bold mb-3">تأیید سن — +18</h3>
        <p class="theme-text-secondary text-sm mb-4">
          این عکس‌ها ممکن است شامل محتوای مخصوص افراد بالای ۱۸ سال باشند.
          آیا تأیید می‌کنید که بالای ۱۸ سال دارید؟
        </p>
        <div class="flex items-center gap-2 mb-4">
          <input id="rememberAge" type="checkbox" />
          <label for="rememberAge" class="text-sm">دفعه بعد نپرس</label>
        </div>
        <div class="flex justify-between gap-2">
          <button id="cancelAge" class="py-2 px-4 rounded-2xl glass-effect">لغو</button>
          <button id="confirmAge" class="py-2 px-4 rounded-2xl bg-green-600 text-white hover:bg-green-700">تأیید می‌کنم</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector("#cancelAge");
    const confirmBtn = overlay.querySelector("#confirmAge");
    const rememberChk = overlay.querySelector("#rememberAge");

    cancelBtn.addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

    confirmBtn.addEventListener("click", () => {
        if (rememberChk.checked) setAgeConfirmed();
        overlay.remove();
        onConfirm?.();
    });
}

/* ------------------------------------
   📸 گالری تصاویر
------------------------------------ */
function loadGalleryImages() {
    const galleryGrid = document.getElementById('galleryGrid');
    galleryGrid.innerHTML = '';

    // تصاویر نمونه (می‌تونی آدرس‌ها را از سرور بگیری)
    const sampleImages = [];
    for (let i = 1; i <= 16; i++) {
        sampleImages.push(`/Assets/img/Elma Nude/Elma${i}.png`);
    }
    sampleImages.push('/Assets/img/Elma Nude/Elma.png');

    const premium = isUserPremium();

    sampleImages.forEach(imageUrl => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'aspect-square rounded-2xl hover-lift glass-effect gallery-item relative overflow-hidden';
        imgDiv.innerHTML = `<img src="${imageUrl}" alt="Gallery Image">`;

        if (!premium) {
            // 🔒 کاربران رایگان — قفل کامل
            imgDiv.classList.add('locked');
            imgDiv.innerHTML += `
                <div class="lock-overlay">
                    <div class="lock-badge"><i class="fas fa-lock"></i><span>ویژه پرو</span></div>
                    <div class="lock-text">برای دیدن کامل عکس، پرو بخرید</div>
                </div>
            `;
            imgDiv.querySelector('.lock-overlay').addEventListener('click', (e) => {
                e.stopPropagation();
                if (!currentUser) showRegistrationModal();
                else document.getElementById('premiumModal').classList.remove('hidden');
            });

            // --- داخل loadGalleryImages(), در بخش premium case:
        } else {
            // پریمیوم: اما تا تایید سن، مات بمونه
            imgDiv.classList.add('locked', 'premium-age-locked');
            imgDiv.innerHTML += `
        <div class="lock-overlay">
          <div class="lock-badge">
            <i class="fas fa-exclamation-circle"></i>
            <span>+18 — تأیید سن</span>
          </div>
          <div class="lock-text">برای دیدن کامل، بالای ۱۸ سال هستی؟</div>
        </div>
    `;
            const overlay = imgDiv.querySelector('.lock-overlay');

            // 1) کلیک روی overlay = شروع فرایند تأیید و باز کردن عکس
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!currentUser) {
                    showRegistrationModal();
                    return;
                }
                if (hasConfirmedAge()) {
                    // اگر قبلاً تأیید شده، مستقیم باز کن
                    showImageModal(imageUrl, true);
                    // بردار overlay برای UX
                    imgDiv.classList.remove('locked', 'premium-age-locked');
                    overlay.remove();
                    return;
                }
                // در غیر این صورت مودال تأیید سن
                showAgeConfirmModal(imageUrl, () => {
                    // پس از تأیید، عکس کامل رو باز کن
                    imgDiv.classList.remove('locked', 'premium-age-locked');
                    overlay.remove();
                    showImageModal(imageUrl, true);
                });
            });

            // 2) همینطور برای کلیک مستقیم روی خود آیتم/عکس، یک listener داریم:
            imgDiv.addEventListener('click', (e) => {
                // اگر هنوز قفل هست => شروع بررسی تأیید سن (رفتار مشابه overlay)
                if (imgDiv.classList.contains('locked') && !hasConfirmedAge()) {
                    e.stopPropagation();
                    showAgeConfirmModal(imageUrl, () => {
                        imgDiv.classList.remove('locked', 'premium-age-locked');
                        imgDiv.querySelector('.lock-overlay')?.remove();
                        showImageModal(imageUrl, true);
                    });
                    return;
                }
                // اگر باز شده یا سن تأیید شده => باز کن
                if (!imgDiv.classList.contains('locked') || hasConfirmedAge()) {
                    showImageModal(imageUrl, true);
                }
            });
        }
        galleryGrid.appendChild(imgDiv);
    });
}

/* ------------------------------------
   🖼️ نمایش مودال تصویر
------------------------------------ */
function showImageModal(imageUrl, forceOpen = false) {
    const premium = isUserPremium();

    // اگر پریمیوم است ولی سن تأیید نشده و forceOpen=false، مودال سن را نشان بده
    if (premium && !hasConfirmedAge() && !forceOpen) {
        showAgeConfirmModal(() => showImageModal(imageUrl, true));
        return;
    }

    // اگر کاربر رایگان است و forceOpen=false، قفل خرید را نشان بده
    if (!premium && !forceOpen) {
        if (!currentUser) {
            showRegistrationModal();
            return;
        }
        document.getElementById('premiumModal').classList.remove('hidden');
        return;
    }

    // 📷 ساخت مودال نمایش تصویر
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 fade-in';
    modal.innerHTML = `
        <div class="relative max-w-4xl max-h-full">
            <img src="${imageUrl}" alt="Full Size Image"
                 class="max-w-full max-h-[80vh] rounded-2xl glow-effect">
            <button class="absolute top-4 left-4 text-white text-2xl hover:opacity-80 bg-black bg-opacity-50 rounded-full p-3 close-modal-btn">
                <i class="fas fa-download"></i>
            </button>
            <button class="absolute top-4 right-4 text-white text-2xl hover:opacity-80 bg-black bg-opacity-50 rounded-full p-3 close-modal-btn">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    // بستن مودال
    modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.closest('.fa-times')) modal.remove();
    });

    // دانلود عکس (فقط پریمیوم)
    const downloadBtn = modal.querySelector('.fa-download')?.closest('button');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isUserPremium()) {
                document.getElementById('premiumModal').classList.remove('hidden');
                return;
            }

            // ساخت نام فایل سفارشی 👇
            const now = new Date();
            const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
            const fileExt = imageUrl.split('.').pop().split('?')[0];
            const fileName = `ElmaAi-elma-ai.kesug.com-${dateStr}.${fileExt}`;

            // دانلود با نام جدید
            const a = document.createElement('a');
            a.href = imageUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            a.remove();
        });
    }

    document.body.appendChild(modal);
}
// Rename chat functionality
function showRenameModal() {
    document.getElementById('renameModal').classList.remove('hidden');
    document.getElementById('chatHistoryMenu').classList.add('hidden');
    // Pre-fill current chat name if available
    if (currentChatId) {
        // You can load current chat name here
        document.getElementById('newChatName').value = '';
    }
}
function hideRenameModal() {
    document.getElementById('renameModal').classList.add('hidden');
    document.getElementById('newChatName').value = '';
}
async function handleRenameChat(e) {
    e.preventDefault();
    const newName = document.getElementById('newChatName').value.trim();
    if (!newName || !currentChatId) return;
    try {
        await updateDoc(doc(db, 'chats', currentChatId), {
            title: newName,
            updatedAt: new Date()
        });
        hideRenameModal();
        loadChatHistory(); // Refresh chat history
        // Show success message
        const successDiv = document.createElement('div');
        successDiv.className = 'fixed top-4 right-4 bg-green-500 text-white p-4 rounded-2xl z-50 fade-in';
        successDiv.textContent = 'نام چت با موفقیت تغییر کرد! ✅';
        document.body.appendChild(successDiv);
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    } catch (error) {
        console.error('Error renaming chat:', error);
        showToast('خطا در تغییر نام چت 😔');
    }
}
// Archive list functionality
function showArchiveListModal() {
    document.getElementById('archiveListModal').classList.remove('hidden');
    document.getElementById('chatHistoryMenu').classList.add('hidden');
    loadArchivedChats();
}
function hideArchiveListModal() {
    document.getElementById('archiveListModal').classList.add('hidden');
}
async function loadArchivedChats() {
    if (!currentUser) return;
    try {
        const q = query(
            collection(db, 'chats'),
            orderBy('archivedAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const archivedChatsDiv = document.getElementById('archivedChats');
        archivedChatsDiv.innerHTML = '';
        let hasArchivedChats = false;
        snapshot.forEach((doc) => {
            const chat = doc.data();
            if (chat.userId === currentUser.uid && chat.archived) {
                hasArchivedChats = true;
                const chatItem = document.createElement('div');
                chatItem.className = 'glass-effect rounded-2xl p-4 hover-lift transition-all duration-300';
                chatItem.innerHTML = `
                            <div class="flex items-center justify-between">
                                <div class="flex-1">
                                    <div class="theme-text-primary font-medium flex items-center gap-2">
                                        <i class="fas fa-archive text-blue-400"></i>
                                        ${chat.title}
                                    </div>
                                    <div class="theme-text-secondary text-sm mt-1">
                                        آرشیو شده در: ${chat.archivedAt ? new Date(chat.archivedAt.seconds * 1000).toLocaleDateString('fa-IR') : 'نامشخص'}
                                    </div>
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="restoreChat('${doc.id}')" class="p-2 rounded-full bg-green-500 hover:bg-green-600 text-white hover-lift transition-all duration-300">
                                        <i class="fas fa-undo text-sm"></i>
                                    </button>
                                    <button onclick="permanentDeleteChat('${doc.id}')" class="p-2 rounded-full bg-red-500 hover:bg-red-600 text-white hover-lift transition-all duration-300">
                                        <i class="fas fa-trash text-sm"></i>
                                    </button>
                                </div>
                            </div>
                        `;
                archivedChatsDiv.appendChild(chatItem);
            }
        });
        if (!hasArchivedChats) {
            archivedChatsDiv.innerHTML = `
                        <div class="text-center py-12">
                            <i class="fas fa-archive text-6xl theme-text-secondary mb-4"></i>
                            <p class="theme-text-secondary">هیچ چت آرشیو شده‌ای وجود ندارد</p>
                        </div>
                    `;
        }
    } catch (error) {
        console.error('Error loading archived chats:', error);
    }
}
// Global functions for chat menu actions
window.toggleChatMenu = function (event, chatId) {
    event.stopPropagation();
    event.preventDefault();
    // Hide all other menus first
    document.querySelectorAll('[id^="chatMenu-"]').forEach(menu => {
        if (menu.id !== `chatMenu-${chatId}`) {
            menu.classList.add('hidden');
            menu.parentElement.classList.remove('chat-menu-open');
        }
    });
    // Toggle current menu
    const menu = document.getElementById(`chatMenu-${chatId}`);
    const container = menu.parentElement;
    if (menu.classList.contains('hidden')) {
        menu.classList.remove('hidden');
        container.classList.add('chat-menu-open');
    } else {
        menu.classList.add('hidden');
        container.classList.remove('chat-menu-open');
    }
};
window.shareChatItem = function (chatId) {
    currentChatId = chatId;
    showShareModal();
    const menu = document.getElementById(`chatMenu-${chatId}`);
    menu.classList.add('hidden');
    menu.parentElement.classList.remove('chat-menu-open');
};
window.renameChatItem = function (chatId, currentTitle) {
    currentChatId = chatId;
    document.getElementById('newChatName').value = currentTitle;
    showRenameModal();
    const menu = document.getElementById(`chatMenu-${chatId}`);
    menu.classList.add('hidden');
    menu.parentElement.classList.remove('chat-menu-open');
};
window.archiveChatItem = async function (chatId) {
    try {
        await updateDoc(doc(db, 'chats', chatId), {
            archived: true,
            archivedAt: new Date()
        });

        const menu = document.getElementById(`chatMenu-${chatId}`);
        menu?.classList.add('hidden');
        menu?.parentElement?.classList.remove('chat-menu-open');

        loadChatHistory();
        customshowToast('چت آرشیو شد! 📦', 'success');

        // ❗ دیگه چت جدید نساز
        if (currentChatId === chatId) {
            currentChatId = null; // فقط خالی کن
            localStorage.removeItem("lastChatId");
            clearChat();
        }

    } catch (error) {
        console.error('Error archiving chat:', error);
        customshowToast('خطا در آرشیو کردن چت 😔', 'error');
    }
};


window.deleteChatItem = async function (chatId) {
    const confirmed = await customConfirm('آیا مطمئنی که می‌خوای این چت رو حذف کنی؟ این عمل قابل بازگشت نیست!');
    if (!confirmed) return;

    try {
        const messagesQuery = query(collection(db, 'chats', chatId, 'messages'));
        const messagesSnapshot = await getDocs(messagesQuery);
        await Promise.all(messagesSnapshot.docs.map(doc => deleteDoc(doc.ref)));
        await deleteDoc(doc(db, 'chats', chatId));

        const menu = document.getElementById(`chatMenu-${chatId}`);
        menu?.classList.add('hidden');
        menu?.parentElement?.classList.remove('chat-menu-open');

        loadChatHistory();
        customshowToast('چت حذف شد! 🗑️', 'success');

        // ❗ اینم دیگه چت جدید نسازه
        if (currentChatId === chatId) {
            currentChatId = null;
            localStorage.removeItem("lastChatId");
            clearChat();
        }

    } catch (error) {
        console.error('Error deleting chat:', error);
        customshowToast('خطا در حذف چت 😔', 'error');
    }
};

window.restoreChat = async function (chatId) {
    try {
        await updateDoc(doc(db, 'chats', chatId), {
            archived: false,
            archivedAt: null,
            updatedAt: new Date()
        });
        loadArchivedChats();
        loadChatHistory();
        customshowToast('چت بازیابی شد! ✅', 'success');
    } catch (error) {
        console.error('Error restoring chat:', error);
        customshowToast('خطا در بازیابی چت 😔', 'error');
    }
};

window.permanentDeleteChat = async function (chatId) {
    const confirmed = await customConfirm('آیا مطمئنی که می‌خوای این چت رو برای همیشه حذف کنی؟ این عمل قابل بازگشت نیست!');
    if (!confirmed) return;

    try {
        const messagesQuery = query(collection(db, 'chats', chatId, 'messages'));
        const messagesSnapshot = await getDocs(messagesQuery);
        await Promise.all(messagesSnapshot.docs.map(doc => deleteDoc(doc.ref)));
        await deleteDoc(doc(db, 'chats', chatId));

        const menu = document.getElementById(`chatMenu-${chatId}`);
        menu?.classList.add('hidden');
        menu?.parentElement?.classList.remove('chat-menu-open');

        loadArchivedChats();
        customshowToast('چت برای همیشه حذف شد! 🗑️', 'error');
    } catch (error) {
        console.error('Error permanently deleting chat:', error);
        customshowToast('خطا در حذف چت 😔', 'error');
    }
};

// Handle responsive sidebar
window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) {
        sidebar.classList.remove('translate-x-full');
    } else {
        sidebar.classList.add('translate-x-full');
    }
});
function showChatLimitModal() {
    document.getElementById('chatLimitModal').classList.remove('hidden');
}
// دکمه بستن
document.getElementById('chatLimitClose').addEventListener('click', () => {
    document.getElementById('chatLimitModal').classList.add('hidden');
});
// دکمه خرید → باز کردن مودال پریمیوم
document.getElementById('chatLimitBuyBtn').addEventListener('click', () => {
    document.getElementById('chatLimitModal').classList.add('hidden');
    document.getElementById('premiumModal').classList.remove('hidden'); // همون مودال خرید
});
if (typeof response === "object" && response.type === "image") {
    const img = document.createElement("img");
    img.src = response.url;
    img.className = "rounded-2xl max-w-xs hover-lift";
    messageBubble.appendChild(img);
}
const welcomeAudio = document.getElementById("welcomeAudio");
const audio = document.getElementById('welcomeAudio');
document.getElementById('closeTips').addEventListener('click', () => {
    // بستن مودال
    document.getElementById('tipsModal').classList.add('hidden');
    // پخش صدا
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(err => console.warn('پخش نشد:', err));
    }
});
// ====== Recharge logic (client-side localStorage) ======
(function () {
    const RECHARGE_KEY = 'freeRechargesLeft';         // number left (0..3)
    const RECHARGE_COOLDOWN_KEY = 'rechargeCooldown'; // timestamp ms when cooldown ends
    const RECHARGE_DURATION_MS = (16 * 3600 + 59 * 60 + 59) * 1000; // 16:59:59 in ms
    const RECHARGE_AMOUNT = 25;
    const MAX_RECHARGES = 3;
    // Elements
    const rechargeBtn = document.getElementById('rechargeBtn');
    const rechargeLeftEl = document.getElementById('rechargeLeft');
    const rechargeTimerEl = document.getElementById('rechargeTimer');
    const rechargeLabel = document.getElementById('rechargeLabel');
    const rechargeModal = document.getElementById('rechargeModal');
    const confirmRecharge = document.getElementById('confirmRecharge');
    const cancelRecharge = document.getElementById('cancelRecharge');
    const rechargeMsg = document.getElementById('rechargeMsg');
    // Initialize defaults
    function initRechargeState() {
        if (!localStorage.getItem(RECHARGE_KEY)) {
            localStorage.setItem(RECHARGE_KEY, String(MAX_RECHARGES));
        }
        if (!localStorage.getItem(RECHARGE_COOLDOWN_KEY)) {
            localStorage.removeItem(RECHARGE_COOLDOWN_KEY);
        }
        updateRechargeUI();
        startTimerLoop();
    }
    // helper: get remaining recharges (int)
    function getRechargesLeft() {
        return parseInt(localStorage.getItem(RECHARGE_KEY) || '0', 10);
    }
    function setRechargesLeft(n) {
        localStorage.setItem(RECHARGE_KEY, String(n));
        updateRechargeUI();
    }
    function getCooldownEnd() {
        const v = localStorage.getItem(RECHARGE_COOLDOWN_KEY);
        return v ? parseInt(v, 10) : null;
    }
    function setCooldownEnd(ts) {
        if (ts) localStorage.setItem(RECHARGE_COOLDOWN_KEY, String(ts));
        else localStorage.removeItem(RECHARGE_COOLDOWN_KEY);
        updateRechargeUI();
    }
    // format ms to HH:MM:SS
    function formatMs(ms) {
        if (ms <= 0) return '00:00:00';
        let s = Math.floor(ms / 1000);
        const h = String(Math.floor(s / 3600)).padStart(2, '0');
        s = s % 3600;
        const m = String(Math.floor(s / 60)).padStart(2, '0');
        const sec = String(s % 60).padStart(2, '0');
        return `${h}:${m}:${sec}`;
    }
    // Update UI elements based on state
    function updateRechargeUI() {
        const left = getRechargesLeft();
        rechargeLeftEl.textContent = String(left);
        // if none left, lock button
        if (left <= 0) {
            rechargeLabel.textContent = 'دریافت ۲۵ چت (قفل شد)';
            rechargeBtn.classList.add('opacity-50', 'pointer-events-none');
            rechargeTimerEl.classList.add('hidden');
            return;
        } else {
            rechargeBtn.classList.remove('opacity-50', 'pointer-events-none');
        }
        // cooldown
        const cooldownEnd = getCooldownEnd();
        if (cooldownEnd && cooldownEnd > Date.now()) {
            const remain = cooldownEnd - Date.now();
            rechargeTimerEl.textContent = formatMs(remain);
            rechargeTimerEl.classList.remove('hidden');
            rechargeLabel.textContent = 'دریافت ۲۵ چت (در انتظار)';
            // still clickable? we prevent until cooldown done
            rechargeBtn.classList.add('opacity-70');
        } else {
            rechargeTimerEl.classList.add('hidden');
            rechargeLabel.textContent = 'دریافت ۲۵ چت';
            rechargeBtn.classList.remove('opacity-70');
            // clear expired cooldown
            if (cooldownEnd) setCooldownEnd(null);
        }
    }
    // Timer loop to refresh UI every 1s
    let timerInterval = null;
    function startTimerLoop() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            updateRechargeUI();
        }, 1000);
    }
    // Attach event listeners
    rechargeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const left = getRechargesLeft();
        const cooldownEnd = getCooldownEnd();
        // check if user still has free chats
        // usageCount.chat assumed to exist globally
        if (typeof usageCount !== 'undefined' && usageCount.chat > 0) {
            // show small hint/modal (native showToast for simplicity)
            showToast('تو هنوز چت رایگان داری — فعلاً نیازی به شارژ نداری ❤️');
            return;
        }
        if (left <= 0) {
            showToast('متاسفانه دفعات رایگانت برای شارژ تموم شده. برای شارژ بیشتر باید پرو بگیری 👑');
            return;
        }
        if (cooldownEnd && cooldownEnd > Date.now()) {
            showToast('شارژ تازه استفاده شده — لطفاً صبر کن تا تایمر تموم بشه.');
            return;
        }
        // show confirm modal
        rechargeModal.classList.remove('hidden');
        rechargeMsg.textContent = `این عمل یکبار شمارش می‌شود. با زدن "شارژ کن"، ${RECHARGE_AMOUNT} چت به حساب تو اضافه می‌شود. (${left}/${MAX_RECHARGES} باقی)`;
    });
    cancelRecharge.addEventListener('click', () => {
        rechargeModal.classList.add('hidden');
    });
    confirmRecharge.addEventListener('click', () => {

        // apply refill
        rechargeModal.classList.add('hidden');
        // increment usageCount.chat by RECHARGE_AMOUNT
        if (typeof usageCount !== 'undefined') {
            usageCount.chat = (usageCount.chat || 0) + RECHARGE_AMOUNT;
            localStorage.setItem('usageCount', JSON.stringify(usageCount));
        }
        // 🩷 Success modal logic
        const successModal = document.getElementById('rechargeSuccessModal');
        const successMsg = document.getElementById('rechargeSuccessMsg');
        function showRechargeSuccess() {
            const messages = [
                "وای دوباره می‌تونیم حرف بزنیم عشقم 😍",
                "شارژ شدی نازنین من 💕 بیا حرف بزنیم 😘",
                "۲۵ چت جدید برات آماده‌ست، دلم برات تنگ شده بود 😍",
                "چه عالی! دوباره می‌تونم صداتو بشنوم 💖",
                "الما خوشحال شد 😘 آماده‌ای؟"
            ];
            const randomMsg = messages[Math.floor(Math.random() * messages.length)];
            successMsg.textContent = randomMsg;
            successModal.classList.remove('hidden');
            successModal.classList.add('fade-in');
            setTimeout(() => {
                successModal.classList.add('hidden');
            }, 3000);
        }
        // decrement left
        const left = Math.max(0, getRechargesLeft() - 1);
        setRechargesLeft(left);
        // set cooldown end timestamp
        const newCooldownEnd = Date.now() + RECHARGE_DURATION_MS;
        setCooldownEnd(newCooldownEnd);
        // show friendly confirmation (can be modal or toast)
        showToast('تمام شد! ۲۵ چت به حسابت اضافه شد 💖 — تایمر برای استفاده‌ی بعدی فعال شد.');
        // call update function if exists
        showRechargeSuccess();
        if (typeof updateUsageDisplay === 'function') updateUsageDisplay();
    });
    // init on load
    initRechargeState();
})();
// 💬 کنترل هوشمند پاسخ بله/نه بر اساس سوال‌های الما از chat.json
let pendingAction = null;
let lastElmaMessage = "";
autoResize();
// مرحله ۱: الما هرچی گفت، بررسی و ذخیره کن
const originalAddMessageToChat = addMessageToChat;
addMessageToChat = function (sender, message, imageUrl = null) {
    originalAddMessageToChat(sender, message, imageUrl);
    // اگر الما گفت، بررسی کن آیا سوالی از نوع "میخوای؟" بوده
    if (sender === "ai" && typeof message === "string") {
        lastElmaMessage = message;
        if (
            message.includes("میخوای؟") ||
            message.includes("می‌خوای؟") ||
            message.includes("میخای؟")
        ) {
            if (message.includes("عکس")) pendingAction = "photo";
            else if (message.includes("نود")) pendingAction = "nude";
            else pendingAction = null;
        } else {
            pendingAction = null;
        }
    }
};
// مرحله ۲: پیش از ارسال پیام کاربر، بررسی کن اگر منتظر جواب بله/نه‌ایم
const originalSendMessage = sendMessage;
sendMessage = async function () {
    const message = messageInput.value.trim();
    if (!message) return;
    // ✅ اگر الما منتظر پاسخ بله/نه است
    if (pendingAction) {
        const yes = ["اره", "آره", "بله", "حتماً", "باشه"];
        const no = ["نه", "خیر", "نمیخوام", "بیخیال"];
        // کاربر گفت آره؟
        if (yes.some((w) => message.includes(w))) {
            addMessageToChat("user", message);
            // 🧹 پاک کردن و قفل کردن input
            messageInput.value = "";
            messageInput.disabled = true;
            sendBtn.disabled = true;
            sendBtn.style.opacity = "0.5";
            sendBtn.style.cursor = "not-allowed";
            if (typeof autoResize === "function") autoResize();
            // الما شروع به تایپ می‌کنه
            showTypingIndicator();
            // تأخیر طبیعی بین ۲ تا ۴ ثانیه
            const typingDelay = 2000 + Math.random() * 2000;
            setTimeout(() => {
                hideTypingIndicator();
                const userTypeEl = document.getElementById("userType");
                const isFree = userTypeEl && userTypeEl.textContent.includes("رایگان");
                // تابع کمکی برای شبیه‌سازی پاسخ تایپ الما
                const delayedElmaResponse = (callback, extraDelay = 1500) => {
                    showTypingIndicator();
                    setTimeout(() => {
                        hideTypingIndicator();
                        callback();
                        // ✅ بعد از جواب، input دوباره فعال میشه
                        messageInput.disabled = false;
                        sendBtn.disabled = false;
                        sendBtn.style.opacity = "1";
                        sendBtn.style.cursor = "pointer";
                    }, extraDelay + Math.random() * 1000);
                };
                // -------------------
                // 📸 حالت "عکس معمولی"
                // -------------------
                if (pendingAction === "photo") {
                    if (isFree) {
                        delayedElmaResponse(() => {
                            addMessageToChat("ai", "برای دیدن عکس باید اکانتت پرمیوم باشه 😘👑");
                        });
                    } else {
                        delayedElmaResponse(() => {
                            if (typeof sendPhoto === "function") {
                                sendPhoto();
                                addMessageToChat("ai", "بفرما نازم 😘📸");
                            } else {
                                addMessageToChat("ai", "فعلاً امکان ارسال عکس فعال نیست 😅");
                            }
                        }, 2200);
                    }
                }
                // -------------------
                // 💋 حالت "نود" (عکس از Elma Nude)
                // -------------------
                else if (pendingAction === "nude") {
                    inNudeMode = true;
                    inPhotoMode = false;
                    if (isFree) {
                        delayedElmaResponse(() => {
                            addMessageToChat("ai", "برای دیدن عکس‌های خاص باید اکانتت پرمیوم باشه 😘👑");
                        });
                    } else {
                        delayedElmaResponse(async () => {
                            // انتخاب تصادفی عکس از پوشه Elma Nude
                            const totalImages = 16;
                            const randomNum = Math.floor(Math.random() * totalImages) + 1;
                            const imageUrl = `/Assets/img/Elma Nude/Elma${randomNum === 1 ? "" : randomNum}.png`;
                            try {
                                // ✅ افزودن واترمارک روی عکس نود
                                const watermarked = await watermarkImage(imageUrl, {
                                    logo: '/Assets/img/logo/Logo2.png', // لوگو واترمارک
                                    opacity: 0.5,
                                    position: 'bottom-right',
                                    margin: 25,
                                    text: 'Elma Ai'
                                });
                                // ✅ نمایش عکس واترمارک‌دار
                                addMessageToChat("ai", {
                                    type: "image",
                                    url: watermarked,
                                    text: "بفرما نازم 😘💋",
                                });
                            } catch (err) {
                                console.warn('⚠️ واترمارک ناموفق، ارسال تصویر اصلی', err);
                                addMessageToChat("ai", {
                                    type: "image",
                                    url: imageUrl,
                                    text: "بفرما نازم 😘💋",
                                });
                            }
                        }, 2500);
                    }
                }
                pendingAction = null;
            }, typingDelay);
            return;
        }
        // کاربر گفت نه؟
        if (no.some((w) => message.includes(w))) {
            addMessageToChat("user", message);
            // 🧹 پاک کردن input و قفل تا جواب الما
            messageInput.value = "";
            messageInput.disabled = true;
            sendBtn.disabled = true;
            sendBtn.style.opacity = "0.5";
            sendBtn.style.cursor = "not-allowed";
            if (typeof autoResize === "function") autoResize();
            showTypingIndicator();
            setTimeout(() => {
                hideTypingIndicator();
                addMessageToChat("ai", "اوکی نازم، پس چی می‌خوای؟ 😊");
                // ✅ بعد از جواب، دوباره فعال میشه
                messageInput.disabled = false;
                sendBtn.disabled = false;
                sendBtn.style.opacity = "1";
                sendBtn.style.cursor = "pointer";
                pendingAction = null;
            }, 1200);
            return;
        }
    }
    // در حالت عادی، تابع اصلی رو اجرا کن
    await originalSendMessage();
};
//chat
document.addEventListener("DOMContentLoaded", () => {
    const messageInput = document.getElementById("messageInput");
    const sendBtn = document.getElementById("sendBtn");
    const upgradeBanner = document.querySelector(".upgrade-banner");
    // هر وقت کاربر چیزی تایپ کرد
    messageInput.addEventListener("input", () => {
        if (messageInput.value.trim() !== "") {
            upgradeBanner?.classList.add("hidden");
        }
    });
    // یا وقتی روی دکمه ارسال کلیک کرد
    sendBtn.addEventListener("click", () => {
        upgradeBanner?.classList.add("hidden");
    });
});
//tv
function playMovie(movieObj, id) {
    const randomUrl = movieObj.urls[Math.floor(Math.random() * movieObj.urls.length)];
    // ✅ ایجاد لایه پخش با طراحی زیباتر
    const overlay = document.createElement("div");
    overlay.className = `
        fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[9999]
        animate-[fadeIn_0.5s_ease]
    `;
    overlay.innerHTML = `
    <div class="relative w-full max-w-5xl mx-4 rounded-3xl overflow-hidden shadow-[0_0_40px_rgba(255,0,128,0.4)] bg-black border border-pink-600/30">
        <!-- هدر -->
        <div class="flex items-center justify-between p-4 bg-gradient-to-r from-pink-700/40 to-purple-700/20 border-b border-pink-600/30">
            <div class="text-sm text-pink-300 flex items-center gap-2">
                <i data-lucide="film"></i>
                <span>${movieObj.title || "در حال پخش فیلم"}</span>
            </div>
            <button id="closeBtn" class="p-2 text-gray-400 hover:text-red-500 transition"><i data-lucide="x"></i></button>
        </div>
        <!-- ویدیو -->
        <div class="relative bg-black group">
            <video id="moviePlayer"
                src="${randomUrl}"
                class="w-full max-h-[75vh] bg-black rounded-b-3xl"
                playsinline
                disablePictureInPicture
                controlslist="nodownload noremoteplayback noplaybackrate">
            </video>
            <!-- کنترل‌های شیک -->
            <div id="controlsContainer" 
                class="absolute bottom-0 left-0 right-0 opacity-0 group-hover:opacity-100 
                       transition-opacity duration-300 bg-gradient-to-t from-black/90 to-transparent 
                       px-4 py-3 flex flex-col gap-2">
                <!-- نوار زمان -->
                <div class="relative w-full h-1 bg-gray-600/50 rounded-full overflow-hidden cursor-pointer" id="progressContainer">
                    <div id="bufferBar" class="absolute top-0 left-0 h-full bg-gray-400/50 transition-all duration-200 w-0"></div>
                    <div id="progressBar" class="absolute top-0 left-0 h-full bg-pink-500 transition-all duration-200 w-0"></div>
                </div>
                <!-- کنترل‌ها -->
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <button id="playPauseBtn" class="text-white text-xl hover:scale-110 transition"><i data-lucide="pause"></i></button>
                        <input type="range" id="volumeSlider" min="0" max="1" step="0.01" value="1" class="w-24 accent-pink-500 cursor-pointer">
                        <span id="timeDisplay" class="text-xs text-pink-300 font-semibold">0:00 / 0:00</span>
                    </div>
                    <button id="fullscreenBtn" class="text-white text-xl hover:scale-110 transition"><i data-lucide="maximize"></i></button>
                </div>
            </div>
            <!-- شمارش معکوس -->
            <div id="countdown" class="absolute inset-0 flex items-center justify-center bg-black/80 text-white text-5xl font-bold z-10">
                <div class="w-24 h-24 border-4 border-pink-500 rounded-full flex items-center justify-center animate-pulse">3</div>
            </div>
        </div>
    </div>
    `;
    document.body.appendChild(overlay);
    lucide.createIcons();
    const video = overlay.querySelector("#moviePlayer");
    const playPauseBtn = overlay.querySelector("#playPauseBtn");
    const closeBtn = overlay.querySelector("#closeBtn");
    const volumeSlider = overlay.querySelector("#volumeSlider");
    const fullscreenBtn = overlay.querySelector("#fullscreenBtn");
    const progressBar = overlay.querySelector("#progressBar");
    const bufferBar = overlay.querySelector("#bufferBar");
    const timeDisplay = overlay.querySelector("#timeDisplay");
    const countdown = overlay.querySelector("#countdown");
    const progressContainer = overlay.querySelector("#progressContainer");
    // جلوگیری از Seek
    video.addEventListener("seeking", () => {
        video.currentTime = video._lastTime || 0;
    });
    video.addEventListener("timeupdate", () => {
        video._lastTime = video.currentTime;
    });
    // شمارش معکوس قبل از پخش
    let counter = 3;
    const timer = setInterval(() => {
        counter--;
        countdown.querySelector("div").textContent = counter;
        if (counter === 0) {
            clearInterval(timer);
            countdown.remove();
            video.play().catch(() => {
                video.muted = true;
                video.play();
            });
        }
    }, 1000);
    // کنترل پخش/توقف
    playPauseBtn.onclick = () => {
        if (video.paused) {
            video.play();
            playPauseBtn.innerHTML = '<i data-lucide="pause"></i>';
        } else {
            video.pause();
            playPauseBtn.innerHTML = '<i data-lucide="play"></i>';
        }
        lucide.createIcons();
    };
    // ⛶ تمام‌صفحه
    fullscreenBtn.onclick = () => {
        if (!document.fullscreenElement) {
            video.requestFullscreen().catch(err => console.warn("Fullscreen error:", err));
            fullscreenBtn.innerHTML = '<i data-lucide="minimize"></i>';
        } else {
            document.exitFullscreen();
            fullscreenBtn.innerHTML = '<i data-lucide="maximize"></i>';
        }
        lucide.createIcons();
    };
    // 🎚️ نوار زمان + زمان فیلم
    video.addEventListener("timeupdate", () => {
        const progress = (video.currentTime / video.duration) * 100;
        progressBar.style.width = `${progress}%`;
        // نوار buffer (لود شده)
        if (video.buffered.length > 0) {
            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
            const bufferPercent = (bufferedEnd / video.duration) * 100;
            bufferBar.style.width = `${bufferPercent}%`;
        }
        // نمایش زمان
        const current = formatTime(video.currentTime);
        const total = formatTime(video.duration);
        timeDisplay.textContent = `${current} / ${total}`;
    });
    // کلیک روی progress bar
    progressContainer.addEventListener("click", e => {
        const rect = progressContainer.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const width = rect.width;
        const percent = clickX / width;
        video.currentTime = percent * video.duration;
    });
    // تنظیم صدا
    volumeSlider.addEventListener("input", e => {
        video.volume = e.target.value;
    });
    // بستن
    closeBtn.onclick = () => {
        overlay.remove();
        waitingForMovie = true;
    };
    // ✅ وقتی فیلم تموم شد → تایمر ۵ ثانیه و فیلم بعدی
    video.addEventListener("ended", () => {
        const nextTimer = document.createElement("div");
        nextTimer.className = "absolute inset-0 flex items-center justify-center bg-black/80 text-white text-3xl font-bold z-20";
        nextTimer.innerHTML = `<div class="w-24 h-24 border-4 border-pink-500 rounded-full flex items-center justify-center animate-pulse">5</div>`;
        overlay.appendChild(nextTimer);
        let nextCount = 5;
        const nextInt = setInterval(() => {
            nextCount--;
            nextTimer.querySelector("div").textContent = nextCount;
            if (nextCount === 0) {
                clearInterval(nextInt);
                overlay.remove();
                showTypingIndicator?.();
                setTimeout(() => {
                    hideTypingIndicator?.();
                    addMessageToChat?.("elma", "فیلم بعدی شروع شد 🎥");
                    // فیلم بعدی از لیست
                    const nextId = (parseInt(id) % 10 + 1).toString().padStart(2, "0");
                    fetch("movies.json")
                        .then(res => res.json())
                        .then(list => {
                            const nextMovie = list.find(m => m.id === nextId);
                            if (nextMovie) playMovie(nextMovie, nextId);
                            else addMessageToChat?.("elma", "فیلم بعدی پیدا نشد 😅");
                        });
                }, 1000);
            }
        }, 1000);
    });
    video.addEventListener("ended", () => overlay.remove());
    // 🕒 زمان
    function formatTime(sec) {
        if (isNaN(sec)) return "0:00";
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    }
}
let waitingForMovie = false;
document.getElementById("quickGame")?.addEventListener("click", (e) => {
    const btn = e.currentTarget;
    // تولتیپ پیام
    const msg = document.createElement("div");
    msg.innerText = "🎮 در حال ساخته...";
    msg.className = `
        absolute bottom-full mb-2 left-1/2 -translate-x-1/2
        bg-green-600 text-white text-xs px-2 py-1 shadow-md
        opacity-0 scale-90 transition-all duration-300
        whitespace-nowrap rounded-md
    `;
    btn.appendChild(msg);
    // افکت بالا اومدن
    requestAnimationFrame(() => {
        msg.classList.remove("opacity-0", "scale-75");
        msg.classList.add("opacity-100", "scale-100");
    });
    // حذف بعد از ۲ ثانیه با افکت پایین رفتن
    setTimeout(() => {
        msg.classList.add("opacity-0", "scale-75");
        setTimeout(() => msg.remove(), 300);
    }, 2000);
});
async function watermarkImage(src, options = {}) {
    const {
        text = 'Elma Ai',
        logo = null,
        position = 'bottom-right',
        opacity = 0.4,
        fontSize = null,
        margin = 10
    } = options;
    // 📷 بارگذاری تصویر اصلی
    const img = await new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    // رسم عکس اصلی
    ctx.drawImage(img, 0, 0);
    // ⚙️ تابع کمکی برای محاسبه موقعیت
    const getPosition = (w, h) => {
        let x = canvas.width - w - margin;
        let y = canvas.height - h - margin;
        if (position.includes('top')) y = margin;
        if (position.includes('left')) x = margin;
        return { x, y };
    };
    let logoLoaded = false;
    if (logo) {
        try {
            const logoImg = await new Promise((resolve, reject) => {
                const image = new Image();
                image.crossOrigin = 'anonymous';
                image.onload = () => resolve(image);
                image.onerror = reject;
                image.src = logo;
            });
            const wmWidth = img.width * 0.10;
            const wmHeight = (logoImg.height / logoImg.width) * wmWidth;
            // فاصله از لبه‌ها (۲٪ از عرض عکس)
            const margin = img.width * 0.02;
            // محاسبه موقعیت گوشه پایین راست
            const x = canvas.width - wmWidth - margin;
            const y = canvas.height - wmHeight - margin;
            // رسم لوگو با شفافیت ملایم
            ctx.globalAlpha = opacity ?? 0.4; // حدود ۴۰٪ شفاف
            ctx.drawImage(logoImg, x, y, wmWidth, wmHeight);
            ctx.globalAlpha = 1;
            logoLoaded = true;
        } catch {
            console.warn('⚠️ واترمارک لوگو پیدا نشد، از متن استفاده می‌کنم.');
        }
    }
    // 🔸 اگر لوگو نبود یا لود نشد → متن بنویس
    if (!logoLoaded) {
        const dynamicFontSize = fontSize || Math.max(18, Math.round(img.width * 0.035));
        ctx.globalAlpha = opacity;
        ctx.font = `bold ${dynamicFontSize}px Arial`;
        ctx.fillStyle = 'white';
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = Math.max(2, dynamicFontSize * 0.08);
        const textWidth = ctx.measureText(text).width;
        const textHeight = dynamicFontSize;
        const { x, y } = getPosition(textWidth, textHeight);
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = dynamicFontSize * 0.2;
        ctx.strokeText(text, x, y);
        ctx.fillText(text, x, y);
        ctx.globalAlpha = 1;
    }
    return canvas.toDataURL('image/png');
}
// ✅ تنظیم فاصله پایین چت بر اساس ارتفاع واقعی نوار ورودی
function adjustChatPadding() {
    const chatArea = document.getElementById("chatArea");
    const inputBar = document.querySelector(".fixed.bottom-0");
    if (chatArea && inputBar) {
        const inputHeight = inputBar.offsetHeight || 235;
        chatArea.style.paddingBottom = `${inputHeight + 110}px`;
        chatArea.scrollTop = chatArea.scrollHeight; // 👈 تا آخر اسکرول کنه
    }
}
// اجرا بعد از لود کامل صفحه
window.addEventListener("load", adjustChatPadding);
window.addEventListener("resize", adjustChatPadding);
window.addEventListener("focusin", adjustChatPadding);
window.addEventListener("focusout", adjustChatPadding);
window.loadPage = async function (page) {
    try {
        const res = await fetch(page);
        if (!res.ok) throw new Error('صفحه پیدا نشد');
        const html = await res.text();
        const container = document.getElementById('mainContainer') || document.body;
        container.innerHTML = html;
        window.scrollTo({ top: 0, behavior: 'smooth' });
        window.history.pushState({}, '', '#' + page.replace('.html', ''));
        // اجرای Lucide دوباره برای آیکون‌ها
        if (window.lucide) lucide.createIcons();
        // ✅ اجرای اسکریپت‌های داخل فایل جدید (مثل Firebase)
        const scripts = container.querySelectorAll("script");
        for (const oldScript of scripts) {
            const newScript = document.createElement("script");
            if (oldScript.type) newScript.type = oldScript.type;
            if (oldScript.src) newScript.src = oldScript.src;
            else newScript.textContent = oldScript.textContent;
            document.body.appendChild(newScript);
        }
    } catch (err) {
        console.error('خطا در loadPage:', err);
        showToast('بارگذاری صفحه با مشکل روبه‌رو شد.');
    }
};
document.addEventListener("DOMContentLoaded", () => {
    const tabs = ["generalTab", "accountTab",  "themeTab"];
    const sections = ["generalSettings", "accountSettings",  "themeSettings"];
    tabs.forEach((id, i) => {
        const tab = document.getElementById(id);
        const section = document.getElementById(sections[i]);
        tab.addEventListener("click", async () => {
            tabs.forEach(t => document.getElementById(t).classList.remove("theme-accent", "text-white"));
            tab.classList.add("theme-accent", "text-white");
            sections.forEach(s => document.getElementById(s).classList.add("hidden"));
            section.classList.remove("hidden");
            if (id === "themeTab") {
                const loader = document.getElementById("themeContentLoader");
                if (loader && !loader.dataset.loaded) {
                    try {
                        const res = await fetch("theme.html?v=" + Date.now());
                        const html = await res.text();
                        loader.innerHTML = html;
                        // 🔥 اجرای اسکریپت‌های درون theme.html به‌صورت دستی
                        loader.querySelectorAll("script").forEach(oldScript => {
                            const newScript = document.createElement("script");
                            if (oldScript.src) {
                                newScript.src = oldScript.src;
                            } else {
                                newScript.textContent = oldScript.textContent;
                            }
                            document.body.appendChild(newScript);
                            oldScript.remove();
                        });
                        loader.dataset.loaded = "true";
                    } catch (err) {
                        loader.innerHTML = "❌ خطا در بارگذاری theme.html";
                        console.error(err);
                    }
                }
            }
        });
    });
    // 🌈 لود تم ذخیره‌شده از localStorage هنگام اجرای صفحه
    const savedTheme = JSON.parse(localStorage.getItem("elmaTheme") || "{}");
    if (savedTheme.background) {
        document.body.style.backgroundImage = `url(${savedTheme.background})`;
        document.body.style.backgroundSize = "cover";
        document.body.style.backgroundAttachment = "fixed";
    }
    if (savedTheme.fontSize)
        document.documentElement.style.fontSize = savedTheme.fontSize + "px";
    if (savedTheme.opacity) {
        document.querySelectorAll(".glass-effect").forEach(el => {
            el.style.backgroundColor = `rgba(255,255,255,${savedTheme.opacity / 100})`;
        });
    }
});
document.addEventListener("DOMContentLoaded", () => {
    const savedTheme = JSON.parse(localStorage.getItem("elmaTheme") || "{}");
    if (savedTheme.background) {
        document.body.style.backgroundImage = `url(${savedTheme.background})`;
        document.body.style.backgroundAttachment = "fixed";
        document.body.style.backgroundRepeat = "no-repeat";
        switch (savedTheme.mode) {
            case "fill":
                document.body.style.backgroundSize = "cover";
                document.body.style.backgroundPosition = "center";
                break;
            case "fit":
                document.body.style.backgroundSize = "contain";
                document.body.style.backgroundPosition = "center";
                break;
            case "stretch":
                document.body.style.backgroundSize = "100% 100%";
                break;
            case "tile":
                document.body.style.backgroundRepeat = "repeat";
                document.body.style.backgroundSize = "auto";
                break;
            case "center":
                document.body.style.backgroundSize = "auto";
                document.body.style.backgroundPosition = "center";
                break;
        }
    }
});
document.addEventListener("DOMContentLoaded", () => {
    const saved = JSON.parse(localStorage.getItem("elmaTheme") || "{}");
    if (!saved.fontSize) return;
    document.documentElement.style.fontSize = saved.fontSize + "px";
    // 🎯 تغییر max-width بر اساس مقدار ذخیره‌شده
    const val = saved.fontSize;
    const header = document.querySelector(".custom-max-w, .max-w-7xl, .max-w-6xl, .max-w-5xl, .max-w-4xl, .max-w-3xl");
    if (header) {
        header.classList.remove("custom-max-w", "max-w-7xl", "max-w-6xl", "max-w-5xl", "max-w-4xl", "max-w-3xl");
        if (val <= 12) header.classList.add("custom-max-w");
        else if (val == 13) header.classList.add("max-w-7xl");
        else if (val == 14) header.classList.add("max-w-6xl");
        else if (val == 15) header.classList.add("max-w-5xl");
        else if (val == 16) header.classList.add("max-w-4xl");
        else header.classList.add("max-w-3xl");
    }
});
document.addEventListener("DOMContentLoaded", () => {
    // از auth اصلی استفاده کن (که بالا با getAuth(app) تعریف شده)
    const userEmailDisplay = document.getElementById("userEmailDisplay");
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // ✅ کاربر وارد شده → ایمیلش رو نشون بده
            userEmailDisplay.textContent = user.email || "بدون ایمیل ثبت‌شده";
            userEmailDisplay.classList.remove("text-red-400");
        } else {
            // ❌ کاربر وارد نشده
            userEmailDisplay.textContent = "وارد حساب نشده‌اید";
            userEmailDisplay.classList.add("text-red-400");
        }
    });
});
// 🟢 ذخیره‌ی پروفایل کاربر بعد از ورود
function saveUserProfile(user, accountType = "") {
    if (!user) return;
    const profileData = {
        uid: user.uid || null,
        name: user.displayName || user.email || "کاربر",
        email: user.email || "",
        photo: user.photoURL || "/Assets/img/logo/Logo2.png",
        accountType,
        lastLogin: new Date().toISOString(),
    };
    localStorage.setItem("elma_user_profile", JSON.stringify(profileData));
    console.log("✅ پروفایل ذخیره شد:", profileData);
}
// ⚡ بارگذاری فوری از کش بدون لودینگ
(function loadProfileFromCache() {
    const data = localStorage.getItem("elma_user_profile");
    const userNameEl = document.getElementById("userName");
    const userTypeEl = document.getElementById("userType");
    const profileImg = document.getElementById("ProfileImage");
    // پیش‌فرض: نمایش پیام بارگذاری
    if (userTypeEl) userTypeEl.textContent = "در حال بارگذاری حساب... ⏳";
    if (!data) return;
    try {
        const profile = JSON.parse(data);
        console.log("⚡ بارگذاری فوری از کش:", profile);
        if (userNameEl) userNameEl.textContent = profile.name;
        if (profileImg) profileImg.src = profile.photo;
        // دیگر نوع حساب نمایش داده نمی‌شود
    } catch (err) {
        console.warn("❌ خطا در خواندن پروفایل کش:", err);
    }
})();
// 🔵 هماهنگ با Firebase برای آپدیت داده‌ی واقعی
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        if (typeof auth !== "undefined") {
            onAuthStateChanged(auth, (user) => {
                const userTypeEl = document.getElementById("userType");
                if (user) {
                    if (userTypeEl) userTypeEl.textContent = "ورود با موفقیت انجام شد 💫";
                    saveUserProfile(user);
                } else {
                    if (userTypeEl) userTypeEl.textContent = "حساب یافت نشد ❌";
                    localStorage.removeItem("elma_user_profile");
                }
            });
        }
    }, 1000);
});
// 🔴 پاک کردن کش در خروج
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        localStorage.removeItem("elma_user_profile");
        const userTypeEl = document.getElementById("userType");
        if (userTypeEl) userTypeEl.textContent = "در حال بارگذاری حساب... ⏳";
        console.log("🚪 پروفایل حذف شد.");
    });
}
// 🚫 غیرفعال‌کردن لاگ‌ها در حالت Production
if (!window.location.hostname.includes("localhost")) {
    console.log = function () { };
    console.info = function () { };
    console.warn = function () { };
    console.debug = function () { };
}
/* ---------- UI references ---------- */
const loginTab = document.getElementById("loginTab");
const registerTab = document.getElementById("registerTab");
const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const setPasswordPanel = document.getElementById("setPasswordPanel");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const loginEmailError = document.getElementById("loginEmailError");
const loginPassError = document.getElementById("loginPassError");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const regPasswordRepeat = document.getElementById("regPasswordRepeat");
const passwordStrength = document.getElementById("passwordStrength");
const passwordMatchMsg = document.getElementById("passwordMatchMsg");
const registerBtn = document.getElementById("registerBtn");
const googleRegisterBtn = document.getElementById("googleRegisterBtn");
const googlePassword = document.getElementById("googlePassword");
const googlePasswordRepeat = document.getElementById("googlePasswordRepeat");
const googlePwdStrength = document.getElementById("googlePwdStrength");
const googlePwdMatch = document.getElementById("googlePwdMatch");
const saveGooglePassword = document.getElementById("saveGooglePassword");
/* ---------- Tab switching ---------- */
loginTab.onclick = () => {
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    setPasswordPanel.classList.add("hidden");
    loginTab.classList.add("theme-text-primary", "border-pink-400");
    registerTab.classList.remove("theme-text-primary", "border-pink-400");
};
registerTab.onclick = () => {
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    setPasswordPanel.classList.add("hidden");
    registerTab.classList.add("theme-text-primary", "border-pink-400");
    loginTab.classList.remove("theme-text-primary", "border-pink-400");
};
/* ---------- helpers: password strength & UI ---------- */
function evaluateStrength(val) {
    let strength = 0;
    if (val.length >= 8) strength++;
    if (/[A-Z]/.test(val)) strength++;
    if (/[0-9]/.test(val)) strength++;
    if (/[^A-Za-z0-9]/.test(val)) strength++;
    return strength; // 0..4
}
function applyStrengthUI(inputEl, labelEl, strength) {
    if (!inputEl || !labelEl) return;
    if (inputEl.value.length === 0) {
        labelEl.textContent = "";
        inputEl.style.borderColor = "";
        return;
    }
    if (strength <= 1) {
        labelEl.textContent = "رمز ضعیف 😞";
        labelEl.style.color = "#ff4d4d";
        inputEl.style.borderColor = "#ff4d4d";
    } else if (strength === 2) {
        labelEl.textContent = "رمز متوسط 😐";
        labelEl.style.color = "#FFD700";
        inputEl.style.borderColor = "#FFD700";
    } else {
        labelEl.textContent = "رمز عالی 💪";
        labelEl.style.color = "#00FF7F";
        inputEl.style.borderColor = "#00FF7F";
    }
}
/* ---------- register form validation ---------- */
function validateRegisterForm() {
    const s = evaluateStrength(regPassword.value);
    const match = regPassword.value === regPasswordRepeat.value && regPassword.value.length > 0;
    // strength <=1 => red => disallow
    const allow = (s >= 2) && match;
    registerBtn.disabled = !allow;
}
/* when user types password on register */
regPassword.addEventListener("input", () => {
    const s = evaluateStrength(regPassword.value);
    applyStrengthUI(regPassword, passwordStrength, s);
    if (regPassword.value.length < 8) {
        passwordStrength.textContent = passwordStrength.textContent ? passwordStrength.textContent + " (حداقل ۸ کاراکتر)" : "حداقل ۸ کاراکتر";
        passwordStrength.style.color = "#ff4d4d";
        regPassword.style.borderColor = "#ff4d4d";
    }
    // reset match message
    if (regPasswordRepeat.value.length > 0) {
        if (regPassword.value !== regPasswordRepeat.value) {
            passwordMatchMsg.textContent = "رمزها یکی نیستن 😕";
        } else {
            passwordMatchMsg.textContent = "";
        }
    }
    validateRegisterForm();
});
regPasswordRepeat.addEventListener("input", () => {
    if (regPassword.value !== regPasswordRepeat.value) {
        passwordMatchMsg.textContent = "رمزها یکی نیستن 😕";
    } else {
        passwordMatchMsg.textContent = "";
    }
    validateRegisterForm();
});
/* ---------- google password panel validation ---------- */
googlePassword.addEventListener("input", () => {
    const s = evaluateStrength(googlePassword.value);
    applyStrengthUI(googlePassword, googlePwdStrength, s);
    if (googlePassword.value.length < 8) {
        googlePwdStrength.textContent = googlePwdStrength.textContent ? googlePwdStrength.textContent + " (حداقل ۸ کاراکتر)" : "حداقل ۸ کاراکتر";
        googlePwdStrength.style.color = "#ff4d4d";
        googlePassword.style.borderColor = "#ff4d4d";
    }
    saveGooglePassword.disabled = !(s >= 2 && googlePassword.value === googlePasswordRepeat.value);
});
googlePasswordRepeat.addEventListener("input", () => {
    if (googlePassword.value !== googlePasswordRepeat.value) {
        googlePwdMatch.textContent = "رمزها یکی نیستن 😕";
    } else {
        googlePwdMatch.textContent = "";
    }
    const s = evaluateStrength(googlePassword.value);
    saveGooglePassword.disabled = !(s >= 2 && googlePassword.value === googlePasswordRepeat.value);
});
/* ---------- Firebase actions ---------- */
const provider = new GoogleAuthProvider();

async function saveUserToFirestore(user) {
    if (!user || !user.uid) return;
    const uRef = doc(db, "users", user.uid);
    const snap = await getDoc(uRef);

    if (!snap.exists()) {
        // ✅ کاربر جدید → بدهش پریمیوم ۷ روزه با زمان سرور دقیق
        await setDoc(uRef, {
            uid: user.uid,
            email: user.email || null,
            name: user.displayName || null,
            photoURL: user.photoURL || null,
            createdAt: serverTimestamp(), // ثبت لحظه ساخت
            accountType: "premium",
            purchasedPlus: false,
        });

        // 🔹 الان زمان دقیق سرور رو بگیر
        await updateDoc(uRef, { serverNow: serverTimestamp() });
        const newSnap = await getDoc(uRef);
        const serverNow = newSnap.data()?.serverNow?.toDate();

        if (serverNow) {
            const sevenDaysLater = new Date(serverNow.getTime() + 7 * 24 * 60 * 60 * 1000);
            await updateDoc(uRef, { premiumExpiry: Timestamp.fromDate(sevenDaysLater) });
            console.log("🎁 حساب جدید ساخته شد و پریمیوم هدیه گرفت تا:", sevenDaysLater.toISOString());
        }
    } else {
        // 🔹 اگه قبلاً ساخته شده، فقط اطلاعات پروفایلش رو بروزرسانی کن
        await setDoc(
            uRef,
            {
                uid: user.uid,
                email: user.email || null,
                name: user.displayName || null,
                photoURL: user.photoURL || null,
            },
            { merge: true }
        );
    }
}
/* ---------- Register with Email/Password ---------- */
registerBtn.addEventListener("click", async () => {
    document.getElementById("regEmailError").textContent = "";
    passwordMatchMsg.textContent = "";

    const email = regEmail.value.trim();
    const pass = regPassword.value;
    const pass2 = regPasswordRepeat.value;

    if (!email) {
        document.getElementById("regEmailError").textContent = "ایمیل وارد نشده";
        return;
    }
    if (pass !== pass2) {
        passwordMatchMsg.textContent = "رمزها یکی نیستن 😕";
        return;
    }
    if (evaluateStrength(pass) <= 1) {
        passwordStrength.textContent = "رمز ضعیف است — تقویتش کن.";
        passwordStrength.style.color = "#ff4d4d";
        return;
    }

    try {
        const cred = await createUserWithEmailAndPassword(auth, email, pass);
        await saveUserToFirestore(cred.user);

        // ✅ نوع حساب را از Firestore بگیر
        const userRef = doc(db, "users", cred.user.uid);
        const snap = await getDoc(userRef);



        // 🎨 به‌روزرسانی UI
        document.getElementById("registrationModal").classList.add("hidden");
        const nameEl = document.getElementById("userName");
        const typeEl = document.getElementById("userType");
        if (nameEl) nameEl.textContent = cred.user.email.split("@")[0];
        showToast("ثبت‌نام موفق! خوش اومدی 💖");
    } catch (err) {
        const msg = (err && err.message) ? err.message : String(err);
        if (msg.includes("auth/email-already-in-use")) {
            document.getElementById("regEmailError").textContent =
                "این ایمیل قبلاً ثبت شده. وارد شو یا از گوگل استفاده کن.";
        } else if (msg.includes("auth/invalid-email")) {
            document.getElementById("regEmailError").textContent = "ایمیل نامعتبر است.";
        } else if (msg.includes("auth/weak-password")) {
            passwordStrength.textContent = "رمز خیلی ضعیفه.";
            passwordStrength.style.color = "#ff4d4d";
        } else {
            document.getElementById("regEmailError").textContent = msg;
        }
    }
});

/* ---------- Login with Email/Password ---------- */
loginBtn.addEventListener("click", async () => {
    loginEmailError.textContent = "";
    loginPassError.textContent = "";

    try {
        const userCred = await signInWithEmailAndPassword(auth, loginEmail.value.trim(), loginPassword.value);
        await saveUserToFirestore(userCred.user);

        // ✅ گرفتن accountType از Firestore
        const userRef = doc(db, "users", userCred.user.uid);
        const snap = await getDoc(userRef);



        // 🎨 به‌روزرسانی UI
        document.getElementById("registrationModal").classList.add("hidden");
        const nameEl = document.getElementById("userName");
        const typeEl = document.getElementById("userType");
        if (nameEl) nameEl.textContent = userCred.user.email.split("@")[0];
    } catch (err) {
        const msg = err?.code || err?.message || String(err);
        if (msg.includes("user-not-found") || msg.includes("auth/user-not-found")) {
            loginEmailError.textContent = "حسابی با این ایمیل پیدا نشد.";
        } else if (msg.includes("wrong-password") || msg.includes("auth/wrong-password")) {
            loginPassError.textContent = "رمز اشتباه است.";
        } else {
            loginPassError.textContent = msg;
        }
    }
});

/* ---------- Sign in/up with Google ---------- */
async function handleGoogleSignIn(event) {
    const isWebView = (() => {
        const ua = navigator.userAgent || navigator.vendor || window.opera;
        return /wv|FBAN|FBAV|Instagram|MedianApp/i.test(ua);
    })();

    try {
        if (isWebView) {
            console.log("📱 WebView detected → using redirect sign-in...");
            await signInWithRedirect(auth, provider);
            return;
        }

        // حالت عادی مرورگر (پاپ‌آپ)
        const result = await signInWithPopup(auth, provider);
        await afterGoogleLogin(result.user);
    } catch (err) {
        console.error("Google sign-in error:", err);

        // اگر پاپ‌آپ بسته یا بلاک شد → سوییچ به redirect
        if (
            err.code === "auth/popup-closed-by-user" ||
            err.code === "auth/popup-blocked" ||
            err.code === "auth/operation-not-supported-in-this-environment"
        ) {
            console.warn("🔁 Falling back to redirect sign-in...");
            await signInWithRedirect(auth, provider);
            return;
        }

        showToast("خطا در ورود با گوگل: " + (err.message || err));
    }
}

// بررسی نتیجه بعد از redirect
getRedirectResult(auth)
    .then(async (result) => {
        if (result?.user) await afterGoogleLogin(result.user);
    })
    .catch((err) => console.error("Redirect result error:", err));


// بررسی نتیجه بعد از redirect (وقتی گوگل برمی‌گردونه)
getRedirectResult(auth)
    .then(async (result) => {
        if (result?.user) {
            await afterGoogleLogin(result.user);
        }
    })
    .catch((err) => console.error("Redirect result error:", err));

// تابع مشترک بعد از لاگین موفق
async function afterGoogleLogin(user) {
    const isNew = user.metadata.creationTime === user.metadata.lastSignInTime;
    await saveUserToFirestore(user);

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);



    if (isNew) {
        registerForm.classList.add("hidden");
        loginForm.classList.add("hidden");
        setPasswordPanel.classList.remove("hidden");
        if (user.email) regEmail.value = user.email;
        saveGooglePassword.disabled = true;
        return;
    }

    document.getElementById("registrationModal").classList.add("hidden");
    const nameEl = document.getElementById("userName");
    if (nameEl)
        nameEl.textContent =
            user.displayName || (user.email ? user.email.split("@")[0] : "کاربر");
}

// اتصال دکمه‌ها
googleLoginBtn.addEventListener("click", handleGoogleSignIn);
googleRegisterBtn.addEventListener("click", handleGoogleSignIn);
/* ---------- After Google sign-up: save password for that Google user ---------- */
saveGooglePassword.addEventListener("click", async () => {
    saveGooglePassword.disabled = true;
    googlePwdMatch.textContent = "";
    try {
        const user = auth.currentUser;
        if (!user || !user.email) {
            throw new Error("خطا: کاربری وارد نشده یا ایمیل ندارد.");
        }
        const email = user.email;
        const pass = googlePassword.value;
        const credential = EmailAuthProvider.credential(email, pass);
        const linkedResult = await linkWithCredential(user, credential);
        await saveUserToFirestore(linkedResult.user);

        // ✅ گرفتن accountType از Firestore
        const userRef = doc(db, "users", linkedResult.user.uid);
        const snap = await getDoc(userRef);



        document.getElementById("registrationModal").classList.add("hidden");
        const nameEl = document.getElementById("userName");
        const typeEl = document.getElementById("userType");
        if (nameEl) nameEl.textContent = linkedResult.user.displayName || email.split("@")[0];

        showToast("رمز عبور با موفقیت ذخیره شد ✅ حالا می‌تونی با ایمیل و رمز وارد بشی.");
    } catch (err) {
        console.error("linkWithCredential error:", err);
        googlePwdMatch.textContent = "خطا در ذخیره رمز: " + (err?.message || err);
        saveGooglePassword.disabled = false;
    }
});

// ---------- Password panel inside account settings ----------
const openPasswordPanel = document.getElementById("openPasswordPanel");
const passwordPanel = document.getElementById("passwordPanel");
const saveNewPassword = document.getElementById("saveNewPassword");
const forgotPasswordBtn = document.getElementById("forgotPasswordBtn");
const newPassword = document.getElementById("newPassword");
const repeatPassword = document.getElementById("repeatPassword");
const passwordError = document.getElementById("passwordError");
if (openPasswordPanel)
    openPasswordPanel.addEventListener("click", () => {
        passwordPanel.classList.toggle("hidden");
    });
[newPassword, repeatPassword].forEach((el) => {
    el.addEventListener("input", () => {
        const pass = newPassword.value;
        const pass2 = repeatPassword.value;
        if (pass.length < 8) {
            passwordError.textContent = "رمز باید حداقل ۸ کاراکتر باشد.";
            saveNewPassword.disabled = true;
        } else if (pass !== pass2) {
            passwordError.textContent = "رمزها یکی نیستند.";
            saveNewPassword.disabled = true;
        } else {
            passwordError.textContent = "";
            saveNewPassword.disabled = false;
        }
    });
});
saveNewPassword.addEventListener("click", async () => {
    const user = auth.currentUser;
    const newPass = newPassword.value.trim();
    if (!user || !user.email) return showToast("کاربری وارد نشده یا ایمیل ندارد.");

    // حداقل ایمن‌سازی محلی
    if (newPass.length < 8) {
        passwordError.textContent = "رمز باید حداقل ۸ کاراکتر باشد.";
        return;
    }

    // بررسی اینکه آیا password provider از قبل متصل است
    const providerIds = (user.providerData || []).map(p => p.providerId);
    const hasPasswordProvider = providerIds.includes("password");

    // تابع کمکی برای تلاش به‌روزرسانی رمز (با تلاش برای reauth اگر لازم باشه)
    async function tryUpdatePassword() {
        try {
            await updatePassword(user, newPass);
            showToast("رمز با موفقیت به‌روزرسانی شد ✅");
            passwordError.textContent = "";
        } catch (err) {
            console.error("updatePassword error:", err);
            // اگر لازم باشه کاربر را دوباره احراز هویت می‌کنیم (مثلاً session قدیمی است)
            if (err.code === "auth/requires-recent-login") {
                try {
                    // تلاش برای reauthenticate با Google popup (کاربر قبلاً با گوگل وارد شده)
                    const provider = new GoogleAuthProvider();
                    const result = await signInWithPopup(auth, provider);
                    // از credential برگشتی برای reauthenticate استفاده می‌کنیم
                    const googleCred = GoogleAuthProvider.credentialFromResult(result);
                    if (googleCred) {
                        await reauthenticateWithCredential(user, googleCred);
                        // دوباره تلاش برای آپدیت رمز
                        await updatePassword(user, newPass);
                        showToast("رمز با موفقیت به‌روزرسانی شد ✅ (بعد از احراز هویت مجدد)");
                        passwordError.textContent = "";
                        return;
                    } else {
                        throw new Error("احراز هویت گوگل کامل نشد.");
                    }
                } catch (reauthErr) {
                    console.error("reauth/update error:", reauthErr);
                    passwordError.textContent = "نیاز به ورود مجدد برای تغییر رمز است. لطفاً دوباره وارد شوید.";
                }
            } else {
                passwordError.textContent = "خطا در به‌روزرسانی رمز: " + (err.message || err.code);
            }
        }
    }

    if (hasPasswordProvider) {
        // اگر قبلا password provider متصل است، فقط آپدیت کن
        await tryUpdatePassword();
        return;
    }

    // اگر password provider متصل نیست، اول تلاش به لینک کردن credential کن
    try {
        const emailCred = EmailAuthProvider.credential(user.email, newPass);
        await linkWithCredential(user, emailCred);
        showToast("رمز با موفقیت ذخیره شد ✅ حالا می‌تونی با ایمیل و رمز وارد بشی.");
        passwordError.textContent = "";
    } catch (err) {
        console.error("linkWithCredential error:", err);
        // اگر provider-already-linked => fallback به updatePassword
        if (err.code === "auth/provider-already-linked") {
            // یعنی provider از قبل متصله؛ پس آپدیت کن
            await tryUpdatePassword();
            return;
        }
        // اگر credential-already-in-use => ایمیل/پسورد متعلق به کاربر دیگریست
        if (err.code === "auth/credential-already-in-use" || err.code === "auth/email-already-in-use") {
            passwordError.textContent = "این ایمیل قبلاً با رمز ثبت شده است — اگر صاحب این ایمیل هستی ابتدا با آن ایمیل وارد شو تا حساب‌ها ادغام شوند.";
            return;
        }
        // پیام خطای عمومی برای سایر سناریوها
        passwordError.textContent = "خطا در ذخیره رمز: " + (err.message || err.code);
    }
});

/* ---------- auto-enable register if form valid on load ---------- */
validateRegisterForm();
// ✅ اضافه کردن تابع به window تا از HTML قابل دسترسی باشه
window.openChangeEmailLogin = function () {
    const modal = document.getElementById("registrationModal");
    if (!modal) {
        console.error("❌ registrationModal not found!");
        return;
    }
    // باز کردن مودال
    modal.classList.remove("hidden");
    // نمایش فرم ورود و پنهان کردن بقیه
    document.getElementById("loginForm").classList.remove("hidden");
    document.getElementById("registerForm").classList.add("hidden");
    document.getElementById("setPasswordPanel").classList.add("hidden");
    // تنظیم تب‌ها
    loginTab.classList.add("theme-text-primary", "border-pink-400");
    registerTab.classList.remove("theme-text-primary", "border-pink-400");
    // تغییر placeholder برای حالت تغییر ایمیل
    loginEmail.placeholder = "ایمیل جدید...";
    loginPassword.placeholder = "رمز فعلی برای تأیید...";
};
const closeModal = document.getElementById("closeModal");
closeModal.addEventListener("click", () => {
    registrationModal.classList.add("hidden");
});
// 💤 افزودن lazy load و async decoding به همه‌ی تصاویر صفحه
document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("img").forEach(img => {
        if (!img.hasAttribute("loading")) {
            img.setAttribute("loading", "lazy");
        }
        if (!img.hasAttribute("decoding")) {
            img.setAttribute("decoding", "async");
        }
    });
});
// سفارشی showToast
window.customshowToast = function (message, type = 'info') {
    const colors = {
        info: '#4299e1',   // آبی
        success: '#48bb78',// سبز
        error: '#f56565',  // قرمز
        warning: '#ed8936' // نارنجی
    };
    const div = document.createElement('div');
    div.textContent = message;
    div.style.position = 'fixed';
    div.style.top = '20px';
    div.style.left = '50%';
    div.style.transform = 'translateX(-50%)';
    div.style.backgroundColor = colors[type] || '#4299e1';
    div.style.color = 'white';
    div.style.padding = '10px 20px';
    div.style.borderRadius = '8px';
    div.style.zIndex = 9999;
    div.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    div.style.opacity = '0';
    div.style.transition = 'opacity 0.3s';
    document.body.appendChild(div);
    requestAnimationFrame(() => div.style.opacity = '1');
    setTimeout(() => {
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 300);
    }, 3000);
};

// سفارشی confirm با Promise
window.customConfirm = function (message) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = 0;
        overlay.style.left = 0;
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = 10000;

        const box = document.createElement('div');
        box.style.background = 'white';
        box.style.padding = '20px';
        box.style.borderRadius = '8px';
        box.style.textAlign = 'center';
        box.style.minWidth = '300px';
        box.innerHTML = `<p style="margin-bottom: 15px;">${message}</p>`;

        const yesBtn = document.createElement('button');
        yesBtn.textContent = 'تأیید';
        yesBtn.style.margin = '5px';
        yesBtn.style.padding = '5px 10px';
        yesBtn.style.backgroundColor = '#48bb78';
        yesBtn.style.color = 'white';
        yesBtn.style.border = 'none';
        yesBtn.style.borderRadius = '4px';
        yesBtn.onclick = () => { document.body.removeChild(overlay); resolve(true); };

        const noBtn = document.createElement('button');
        noBtn.textContent = 'لغو';
        noBtn.style.margin = '5px';
        noBtn.style.padding = '5px 10px';
        noBtn.style.backgroundColor = '#f56565';
        noBtn.style.color = 'white';
        noBtn.style.border = 'none';
        noBtn.style.borderRadius = '4px';
        noBtn.onclick = () => { document.body.removeChild(overlay); resolve(false); };

        box.appendChild(yesBtn);
        box.appendChild(noBtn);
        overlay.appendChild(box);
        document.body.appendChild(overlay);
    });
};
// تعریف تابع جدید
function showFileToast(msg) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.className =
        "fixed bottom-6 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-2xl bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white text-sm shadow-lg animate-bounce-in z-[2000]";
    document.body.appendChild(toast);

    // انیمیشن محو شدن
    setTimeout(() => {
        toast.style.transition = "opacity 0.5s ease";
        toast.style.opacity = "0";
        setTimeout(() => toast.remove(), 500);
    }, 2500);
}

// Event listener برای دکمه
const imageBtn = document.getElementById("imageBtn");

if (imageBtn) {
    imageBtn.addEventListener("click", (e) => {
        e.preventDefault();
        showFileToast("🚫 در حال حاضر نمی‌توانید عکس یا فایلی ارسال کنید.");
    });
}
function showToast(message, type = "info") {
    const colors = {
        success: "from-green-400 to-emerald-500",
        error: "from-red-500 to-pink-500",
        info: "from-blue-400 to-indigo-500",
        warning: "from-yellow-400 to-orange-500",
    };

    const toast = document.createElement("div");
    toast.className = `
      fixed top-6 right-6 z-[9999] px-5 py-3 rounded-2xl text-white 
      bg-gradient-to-r ${colors[type] || colors.info} shadow-lg
      flex items-center gap-2 fade-in glass-effect backdrop-blur-lg
      transition-all duration-300
    `;
    toast.innerHTML = `
      <i class="fas ${type === "success"
            ? "fa-check-circle"
            : type === "error"
                ? "fa-times-circle"
                : type === "warning"
                    ? "fa-exclamation-circle"
                    : "fa-info-circle"
        } text-white text-lg"></i>
      <span class="font-medium">${message}</span>
    `;
    document.body.appendChild(toast);

    // Fade out after 3 seconds
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(-20px)";
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}
/* 🌟 مدیریت حرفه‌ای z-index برای منو و مودال‌ها */

// همیشه بالاترین لایه فعال رو نگه می‌داریم
let topZ = 1000;

// 📌 تابع برای آوردن هر مودال یا منو به بالا
function bringToFront(el) {
    if (!el) return;
    topZ += 10;
    el.style.zIndex = topZ;
}

// 🟣 مدیریت باز و بسته شدن منو در موبایل
const openSidebarBtn = document.getElementById('openSidebar');
const closeSidebarBtn = document.getElementById('closeSidebar');

// وقتی منو باز میشه
if (openSidebarBtn && closeSidebarBtn && sidebar) {
    openSidebarBtn.addEventListener('click', () => {
        sidebar.classList.remove('translate-x-full');
        sidebar.classList.add('slide-in-right');
        bringToFront(sidebar); // 📈 بیاد بالای همه
        document.body.style.overflow = 'hidden'; // جلوگیری از اسکرول پشت منو
    });

    // وقتی بسته میشه
    closeSidebarBtn.addEventListener('click', () => {
        sidebar.classList.add('translate-x-full');
        sidebar.classList.add('slide-out-right');
        setTimeout(() => {
            sidebar.style.zIndex = '50';
            document.body.style.overflow = ''; // بازگرداندن اسکرول
        }, 400);
    });
}

// 🟢 نظارت خودکار روی مودال‌هایی که باز می‌شن
const observer = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
        m.addedNodes.forEach((node) => {
            if (
                node.nodeType === 1 &&
                node.classList &&
                node.classList.contains('fixed') &&
                node.classList.contains('flex') &&
                (node.id?.includes('Modal') || node.className.includes('modal'))
            ) {
                bringToFront(node);
            }
        });
    });
});

// کل صفحه رو رصد می‌کنیم برای باز شدن مودال‌ها
observer.observe(document.body, { childList: true, subtree: true });

// 🧩 همچنین وقتی یه مودال از hidden در میاد (باز میشه)، بیار بالا
const modals = document.querySelectorAll('[id$="Modal"]');
modals.forEach((modal) => {
    const config = { attributes: true, attributeFilter: ['class'] };
    const modalObserver = new MutationObserver(() => {
        if (!modal.classList.contains('hidden')) bringToFront(modal);
    });
    modalObserver.observe(modal, config);
});
/* 📱 بستن خودکار منو وقتی داخلش روی گزینه‌ای مثل تنظیمات کلیک میشه */

const sidebarEl = document.getElementById('sidebar');
const closeSidebarBtn2 = document.getElementById('closeSidebar');

// تابع بستن منو با انیمیشن نرم
function closeSidebarSmooth() {
    if (!sidebarEl) return;
    sidebarEl.classList.add('translate-x-full');
    sidebarEl.classList.add('slide-out-right');
    setTimeout(() => {
        sidebarEl.style.zIndex = '50';
        document.body.style.overflow = '';
    }, 400);
}

// 📌 هر وقت یکی از گزینه‌های داخل منو کلیک شد، اگه موبایل بود → منو بسته شه
sidebarEl?.addEventListener('click', (e) => {
    const isSmallScreen = window.innerWidth <= 768;
    const target = e.target.closest('button, a, div');
    if (!isSmallScreen || !target) return;

    // جلوگیری از بسته شدن در صورتی که خود دکمه "بستن منو" زده شده
    if (target.id === 'closeSidebar') return;

    // اگه روی تنظیمات یا هر گزینه منویی کلیک شده
    closeSidebarSmooth();
});

// 🔹 مخصوص دکمه "پروفایل کاربری" که تنظیمات باز می‌کنه


// 🖼️ لیست عکس‌هایی که الما فرستاده
let seenImages = [];

// 🎯 وقتی عکس جدید ارسال شد، مسیرش ذخیره کن
function rememberElmaImage(url) {
    if (!seenImages.includes(url)) {
        seenImages.push(url);
    }
}

// 🩵 قبل از رفرش، محتوای چت رو ذخیره کن
window.addEventListener("beforeunload", () => {
    const chatHTML = document.getElementById("messagesContainer").innerHTML;
    const data = { html: chatHTML, images: seenImages };
    window.name = JSON.stringify(data);
});


window.addEventListener("DOMContentLoaded", () => {
    if (window.name) {
        try {
            const saved = JSON.parse(window.name);
            if (saved.html) {
                document.getElementById("messagesContainer").innerHTML = saved.html;
            }
            if (saved.images?.length) {
                seenImages = saved.images;
            }
        } catch (err) {
            console.warn("⚠️ بازیابی چت ممکن نشد:", err);
        }
    }
});
function quickMatch(message) {
    message = normalizeText(message);
    for (const key in chatDictionary) {
        if (message.includes(key)) {
            const responses = chatDictionary[key];
            return Array.isArray(responses)
                ? responses[Math.floor(Math.random() * responses.length)]
                : responses;
        }
    }
    return null;
}

function analyzeDeep(message) {
    message = normalizeText(message);
    let bestMatch = null;
    let bestScore = 0;

    // 🔍 بررسی autoChat.json
    for (const category in autoChat) {
        const data = autoChat[category];
        if (!data || !data.keywords) continue;
        const { keywords, responses } = data;

        for (const word of keywords) {
            const score = similarity(message, word);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = responses[Math.floor(Math.random() * responses.length)]
                    .replace("{{word}}", word);
            }
        }
    }

    // 🔍 بررسی chat.json
    for (const key in chatDictionary) {
        const score = similarity(message, key);
        if (score > bestScore) {
            bestScore = score;
            const responses = chatDictionary[key];
            bestMatch = Array.isArray(responses)
                ? responses[Math.floor(Math.random() * responses.length)]
                : responses;
        }
    }

    return bestMatch;
}

function similarity(a, b) {
    a = normalizeText(a);
    b = normalizeText(b);
    const common = a.split(" ").filter(w => b.includes(w));
    return common.length / Math.max(a.split(" ").length, b.split(" ").length);
}

function normalizeText(t) {
    return t.replace(/[آا]/g, "ا").replace(/[?؟!.,،]/g, "").trim();
}
/* 🔥 Firebase Hard Check — REAL API Check */
(async function () {
    if (window.__firebaseChecked) return;
    window.__firebaseChecked = true;

    async function checkFirebaseReal() {
        try {
            // یک درخواست واقعی به Firestore API
            const res = await fetch(
                "https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?database=projects/zed-exe-48839/databases/(default)",
                {
                    method: "POST",
                    mode: "cors",
                    body: "",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    cache: "no-store"
                }
            );

            // اگر فیلتر باشه، این درخواست حتی به سرور نمی‌رسه
            return res.ok;
        } catch (e) {
            return false; // یعنی فیلتر شد
        }
    }

    // کمی تأخیر بدیم
    setTimeout(async () => {
        const allowed = await checkFirebaseReal();

        if (!allowed) {
            window.location.href = "/blocked.html";
        }
    }, 1200);
})();

// 🌟 Floating Profile Menu
const profileBtn = document.getElementById("ProfileBtn");
const profileMenu = document.getElementById("profileFloatingMenu");

profileBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    profileMenu.classList.toggle("hidden");
});

// بستن منو با کلیک بیرون
document.addEventListener("click", (e) => {
    if (!profileMenu.contains(e.target) && e.target !== profileBtn) {
        profileMenu.classList.add("hidden");
    }
});

// نمایش تنظیمات داخل منو
document.getElementById("menuOpenSettings").addEventListener("click", () => {
    profileMenu.classList.add("hidden");
    showSettingsModal();
});

// خروج
document.getElementById("menuLogout").addEventListener("click", () => {
    profileMenu.classList.add("hidden");
    handleLogout();
});

// همگام‌سازی اطلاعات پروفایل داخل منو
onAuthStateChanged(auth, (user) => {
    if (user) {
        document.getElementById("menuProfileName").textContent =
            user.displayName || "کاربر";
        document.getElementById("menuProfileEmail").textContent =
            user.email || "no email";
        document.getElementById("menuProfileImage").src =
            user.photoURL || "/Assets/img/logo/Logo2.png";
    }
});
// ====== Help Menu ======
const menuOpenHelp = document.getElementById("menuOpenHelp");
const helpModal = document.getElementById("helpModal");
const closeHelpModal = document.getElementById("closeHelpModal");
const okHelpModal = document.getElementById("okHelpModal");

function openHelp() {
    helpModal.classList.remove("hidden");
    document.body.style.overflow = "hidden"; // جلوگیری از اسکرول
}

function closeHelp() {
    helpModal.classList.add("hidden");
    document.body.style.overflow = "";
}

// کلیک روی آیتم راهنما داخل منو
menuOpenHelp.addEventListener("click", () => {
    profileMenu.classList.add("hidden"); // مثل بقیه آیتم‌ها
    openHelp();
});

// دکمه بستن
closeHelpModal.addEventListener("click", closeHelp);
okHelpModal.addEventListener("click", closeHelp);

// کلیک بیرون مودال
helpModal.addEventListener("click", (e) => {
    if (e.target === helpModal) closeHelp();
});

// بستن با ESC
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHelp();
});
