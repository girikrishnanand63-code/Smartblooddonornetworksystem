/* Smart Blood Donor Network - Frontend JS */
let me = null;
let pendingEmail = null;
let resendTimer = null;

const ROLE_LABELS = { 
    admin: "Administrator", 
    donor: "Blood Donor", 
    recipient: "Blood Seeker (Patient)" 
};

const LOGIN_REQUIRED = ["register-donor", "request-blood", "my-requests", "notifications", "emergency"];

/* ---------- Helpers & Popup (Toast) ---------- */
async function api(path, options = {}) {
    const init = { 
        method: options.method || "GET", 
        headers: { "Accept": "application/json" } 
    };
    if (options.body) {
        init.headers["Content-Type"] = "application/json";
        init.body = JSON.stringify(options.body);
    }
    
    let res;
    try {
        res = await fetch("/api" + path, init);
    } catch (networkErr) {
        throw new Error("Cannot connect to server. Check your network or server status.");
    }

    let data = null;
    try { 
        data = await res.json(); 
    } catch (e) { 
        /* empty response */ 
    }

    if (!res.ok) {
        const errorMsg = (data && data.error) || (data && data.message) || `Request failed (${res.status})`;
        throw new Error(errorMsg);
    }
    return data;
}

function esc(text) {
    const div = document.createElement("div");
    div.textContent = String(text ?? "");
    return div.innerHTML;
}

function showToast(message, type) {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.setAttribute("role", "status");
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = "show " + (type || "error");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => { 
        toast.className = ""; 
    }, 4000);
}

async function guarded(form, handler) {
    const btn = form ? form.querySelector("button[type=submit]") : null;
    if (btn) btn.disabled = true;
    try {
        await handler();
    } catch (err) {
        showToast(err.message, "error");
    } finally {
        if (btn) btn.disabled = false;
    }
}

/* ---------- Session & UI ---------- */
async function refreshMe() {
    try {
        me = (await api("/auth/me")).user;
    } catch (e) {
        me = null;
    }
    updateAuthUI();
}

function updateAuthUI() {
    const toggle = (id, hide) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("hidden", hide);
    };

    toggle("loginBtn", !!me);
    toggle("signupBtn", !!me);
    toggle("notifBtn", !me);
    toggle("adminBtn", !(me && me.role === "admin"));
    toggle("logoutButton", !me);

    const profileLogin = document.querySelector("#profile > button:not(.secondary)");
    if (profileLogin) profileLogin.classList.toggle("hidden", !!me);

    const badge = document.getElementById("notifBadge");
    if (badge) {
        const count = me ? me.pending : 0;
        badge.textContent = count;
        badge.classList.toggle("hidden", count === 0);
    }
}

/* ---------- Navigation ---------- */
async function showSection(id) {
    if (!document.getElementById(id)) id = "home";

    if (LOGIN_REQUIRED.includes(id) && !me) {
        showToast("Please log in first.", "error");
        id = "login";
    }
    if (id === "verify-otp" && !pendingEmail) id = "signup";
    if (id === "admin" && (!me || me.role !== "admin")) {
        showToast("Admin access only.", "error");
        id = me ? "home" : "login";
    }

    document.querySelectorAll(".page").forEach(p => p.classList.add("hidden"));
    const target = document.getElementById(id);
    if (target) target.classList.remove("hidden");

    if (location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
        if (id === "profile") await renderProfile();
        if (id === "history") await renderHistory();
        if (id === "find-donor") await searchDonors();
        if (id === "notifications") { await refreshMe(); await renderNotifications(); }
        if (id === "my-requests") await renderMyRequests();
        if (id === "admin") await renderAdmin();
    } catch (err) {
        showToast(err.message, "error");
    }
}

window.addEventListener("hashchange", () => {
    showSection(location.hash.replace("#", "") || "home");
});

/* ---------- Sign Up & OTP ---------- */
function startResendCooldown(seconds) {
    const btn = document.getElementById("resendOtpBtn");
    if (!btn) return;
    let left = seconds || 60;
    clearInterval(resendTimer);
    btn.disabled = true;
    btn.textContent = "Resend OTP (" + left + "s)";

    resendTimer = setInterval(() => {
        left--;
        if (left <= 0) {
            clearInterval(resendTimer);
            btn.disabled = false;
            btn.textContent = "Resend OTP";
        } else {
            btn.textContent = "Resend OTP (" + left + "s)";
        }
    }, 1000);
}

document.getElementById("signupForm")?.addEventListener("submit", e => {
    e.preventDefault();
    guarded(e.target, async () => {
        const email = document.getElementById("signupEmail").value.trim().toLowerCase();
        await api("/auth/signup", {
            method: "POST",
            body: {
                name: document.getElementById("signupName").value,
                email,
                password: document.getElementById("signupPassword").value,
                role: document.getElementById("signupRole").value
            }
        });
        pendingEmail = email;
        const label = document.getElementById("otpEmailLabel");
        if (label) label.textContent = email;
        e.target.reset();
        showToast("Verification code sent to your email.", "success");
        showSection("verify-otp");
        startResendCooldown(60);
    });
});

document.getElementById("otpForm")?.addEventListener("submit", e => {
    e.preventDefault();
    guarded(e.target, async () => {
        await api("/auth/verify-otp", {
            method: "POST",
            body: { email: pendingEmail, otp: document.getElementById("otpCode").value }
        });
        pendingEmail = null;
        e.target.reset();
        showToast("Email verified! Please log in.", "success");
        showSection("login");
    });
});

document.getElementById("resendOtpBtn")?.addEventListener("click", async () => {
    if (!pendingEmail) return showSection("signup");
    try {
        await api("/auth/resend-otp", { method: "POST", body: { email: pendingEmail } });
        showToast("A new OTP has been sent.", "success");
        startResendCooldown(60);
    } catch (err) {
        showToast(err.message, "error");
    }
});

/* ---------- Login & Logout ---------- */
document.getElementById("loginForm")?.addEventListener("submit", e => {
    e.preventDefault();
    guarded(e.target, async () => {
        await api("/auth/login", {
            method: "POST",
            body: {
                email: document.getElementById("loginEmail").value,
                password: document.getElementById("loginPassword").value
            }
        });
        e.target.reset();
        await refreshMe();
        showToast("Welcome back, " + me.name + "!", "success");
        showSection(me.role === "admin" ? "admin" : "profile");
    });
});

document.getElementById("logoutButton")?.addEventListener("click", async () => {
    try { await api("/auth/logout", { method: "POST" }); } catch (e) { /* ignore */ }
    me = null;
    updateAuthUI();
    showToast("You have been logged out.", "success");
    showSection("home");
});

/* ---------- Donor Registration ---------- */
document.getElementById("donorForm")?.addEventListener("submit", e => {
    e.preventDefault();
    guarded(e.target, async () => {
        const result = await api("/donors", {
            method: "POST",
            body: {
                name: document.getElementById("donorName").value,
                age: document.getElementById("donorAge").value,
                bloodGroup: document.getElementById("bloodGroup").value,
                city: document.getElementById("donorCity").value,
                phone: document.getElementById("donorPhone").value,
                lastDonation: document.getElementById("lastDonation").value
            }
        });
        e.target.reset();
        showToast("Registered! Your Donor ID is " + result.donorId, "success");
        showSection("profile");
    });
});

/* ---------- Search Donors ---------- */
function renderDonorCards(list, boxId) {
    const box = document.getElementById(boxId);
    if (!box) return;
    if (list.length === 0) {
        box.innerHTML = "<p>No donors found. Try a different blood group or city.</p>";
        return;
    }
    box.innerHTML = "<p><strong>" + list.length + "</strong> donor(s) found.</p>" +
        list.map(d => `
        <div class="donor-card">
            <div>
                <h4>${esc(d.name)} <small>(${esc(d.id)})</small></h4>
                <p>📍 ${esc(d.city)} &nbsp;|&nbsp; Age: ${esc(d.age)}</p>
                <p>📞 ${d.phone ? esc(d.phone) : "Login to view contact number"}</p>
                <span class="status ${d.available ? "ok" : "wait"}">
                    ${d.available ? "Available to donate" : "Recently donated"}
                </span>
            </div>
            <div class="blood-badge">${esc(d.bloodGroup)}</div>
        </div>`).join("");
}

async function searchDonors() {
    const group = document.getElementById("searchBloodGroup")?.value || "";
    const city = document.getElementById("searchCity")?.value.trim() || "";
    const params = new URLSearchParams({ bloodGroup: group, city });
    renderDonorCards(await api("/donors?" + params.toString()), "searchResults");
}

document.getElementById("searchForm")?.addEventListener("submit", e => {
    e.preventDefault();
    guarded(e.target, searchDonors);
});

/* ---------- Blood Requests ---------- */
document.getElementById("requestForm")?.addEventListener("submit", e => {
    e.preventDefault();
    guarded(e.target, async () => {
        const result = await api("/requests", {
            method: "POST",
            body: {
                patient: document.getElementById("reqPatient").value,
                bloodGroup: document.getElementById("reqGroup").value,
                units: document.getElementById("reqUnits").value,
                hospital: document.getElementById("reqHospital").value,
                city: document.getElementById("reqCity").value,
                phone: document.getElementById("reqPhone").value,
                neededBy: document.getElementById("reqDate").value,
                urgency: document.getElementById("reqUrgency").value
            }
        });
        e.target.reset();
        document.getElementById("reqUnits").value = 1;
        showToast(result.notified + " donor(s) notified (" + result.matched.length + " matched).", "success");
        showSection("my-requests");
    });
});

async function renderMyRequests() {
    const box = document.getElementById("myRequests");
    if (!box) return;
    const list = await api("/requests/mine");
    if (list.length === 0) {
        box.innerHTML = "<p>No requests yet.</p>";
        return;
    }
    box.innerHTML = list.map(r => {
        const donors = r.acceptedDonors.length
            ? r.acceptedDonors.map(d => `<p>✅ <strong>${esc(d.name)}</strong> accepted — 📞 ${esc(d.phone)}</p>`).join("")
            : "<p>No donor has accepted yet.</p>";
        const closeBtn = (r.status === "Open" || r.status === "Accepted")
            ? `<button type="button" class="small secondary" onclick="markFulfilled(${r.dbId})">Mark as Fulfilled</button>` : "";
        const urgent = r.urgency !== "Normal" ? `<span class="status wait">${esc(r.urgency)}</span>` : "";
        return `
        <div class="donor-card">
            <div>
                <h4>${esc(r.code)} — ${esc(r.patient)} ${urgent}
                    <span class="status ok">${esc(r.status)}</span></h4>
                <p>🏥 ${esc(r.hospital)}, ${esc(r.city)} &nbsp;|&nbsp; Units: ${esc(r.units)} &nbsp;|&nbsp; By ${esc(r.neededBy)}</p>
                <p>Notified: ${r.counts.total} &nbsp;|&nbsp; Pending: ${r.counts.pending} &nbsp;|&nbsp;
                   Accepted: ${r.counts.accepted} &nbsp;|&nbsp; Declined: ${r.counts.declined}</p>
                ${donors}
                ${closeBtn}
            </div>
            <div class="blood-badge">${esc(r.bloodGroup)}</div>
        </div>`;
    }).join("");
}

async function markFulfilled(id) {
    try {
        await api("/requests/" + id + "/fulfill", { method: "POST" });
        showToast("Request marked as fulfilled.", "success");
        await renderMyRequests();
    } catch (err) {
        showToast(err.message, "error");
    }
}

/* ---------- Emergency ---------- */
document.getElementById("emergencyForm")?.addEventListener("submit", e => {
    e.preventDefault();
    guarded(e.target, async () => {
        const result = await api("/requests", {
            method: "POST",
            body: {
                patient: "Emergency patient",
                bloodGroup: document.getElementById("emGroup").value,
                units: 1,
                hospital: document.getElementById("emHospital").value,
                city: document.getElementById("emCity").value,
                phone: document.getElementById("emPhone").value,
                urgency: "Emergency"
            }
        });
        renderDonorCards(result.matched, "emergencyResults");
        document.getElementById("emergencyResults").insertAdjacentHTML("afterbegin",
            `<p style="margin-bottom:12px;">Emergency request <strong>${esc(result.code)}</strong> sent to ${result.notified} donor(s).</p>`);
        showToast("Emergency alert sent.", "success");
    });
});

/* ---------- Notifications ---------- */
async function renderNotifications() {
    const box = document.getElementById("notificationList");
    if (!box) return;
    const list = await api("/notifications");
    if (list.length === 0) {
        box.innerHTML = "<p>No donation requests for you right now.</p>";
        return;
    }
    box.innerHTML = list.map(n => {
        const r = n.request;
        const urgent = r.urgency !== "Normal" ? `<span class="status wait">${esc(r.urgency)}</span>` : "";
        const actions = n.status === "pending"
            ? `<button type="button" class="small" onclick="respondToNotification(${n.id},'accepted')">Accept</button>
               <button type="button" class="small secondary" onclick="respondToNotification(${n.id},'declined')">Decline</button>`
            : "";
        const contact = r.phone ? `<p>📞 Contact: <strong>${esc(r.phone)}</strong></p>` : "";
        return `
        <div class="donor-card">
            <div>
                <h4>${esc(r.patient)} needs ${esc(r.bloodGroup)} ${urgent}
                    <span class="status ${n.status === 'accepted' ? 'ok' : 'wait'}">${esc(n.status)}</span></h4>
                <p>🏥 ${esc(r.hospital)}, ${esc(r.city)} &nbsp;|&nbsp; Units: ${esc(r.units)}</p>
                <p>📅 Needed by ${esc(r.neededBy)}</p>
                ${contact}
                <div style="margin-top:10px;">${actions}</div>
            </div>
            <div class="blood-badge">${esc(r.bloodGroup)}</div>
        </div>`;
    }).join("");
}

async function respondToNotification(id, status) {
    try {
        await api("/notifications/" + id + "/respond", { method: "POST", body: { status } });
        showToast(status === "accepted" ? "Thank you for saving a life!" : "Request declined.",
                  status === "accepted" ? "success" : "error");
        await refreshMe();
        await renderNotifications();
    } catch (err) {
        showToast(err.message, "error");
    }
}

/* ---------- Profile & History ---------- */
async function renderProfile() {
    const box = document.getElementById("profileDetails");
    if (!box) return;
    if (!me) {
        box.innerHTML = "<p>Please log in to view your profile.</p>";
        return;
    }
    let html = `
        <div class="profile-row"><span>Name</span><span>${esc(me.name)}</span></div>
        <div class="profile-row"><span>Email</span><span>${esc(me.email)}</span></div>
        <div class="profile-row"><span>Account Type</span><span>${esc(ROLE_LABELS[me.role] || me.role)}</span></div>`;
    
    if (me.role !== "admin") {
        const donors = await api("/donors/mine");
        if (donors.length === 0) {
            html += "<p style='margin-top:12px'>You have not completed donor registration yet.</p>";
        } else {
            donors.forEach(d => {
                html += `
                <h3 style="margin-top:20px;">Donor Profile Details</h3>
                <div class="profile-row"><span>Donor ID</span><span>${esc(d.id)}</span></div>
                <div class="profile-row"><span>Blood Group</span><span>${esc(d.bloodGroup)}</span></div>
                <div class="profile-row"><span>City</span><span>${esc(d.city)}</span></div>
                <div class="profile-row"><span>Phone</span><span>${esc(d.phone)}</span></div>
                <div class="profile-row"><span>Status</span><span>${d.available ? "Available" : "Recently donated"}</span></div>`;
            });
        }
        html += `<button type="button" class="secondary" onclick="showSection('history')" style="margin-top:14px">View Donation History</button>`;
    }
    box.innerHTML = html;
}

async function renderHistory() {
    const box = document.getElementById("donationHistory");
    if (!box) return;
    if (!me) {
        box.innerHTML = "<p>Please log in to see your donation history.</p>";
        return;
    }
    const records = (await api("/donors/mine")).filter(d => d.lastDonation);
    if (records.length === 0) {
        box.innerHTML = "<p>No donation history available yet.</p>";
        return;
    }
    box.innerHTML = records.map(d => `
        <div class="donor-card">
            <div>
                <h4>Donation recorded</h4>
                <p>Date: ${esc(d.lastDonation)}</p>
                <p>Donor ID: ${esc(d.id)}</p>
            </div>
            <div class="blood-badge">${esc(d.bloodGroup)}</div>
        </div>`).join("");
}

/* ---------- Admin Dashboard ---------- */
async function renderAdmin() {
    const box = document.getElementById("adminContent");
    if (!box) return;
    const data = await api("/admin/summary");
    const donorRows = data.donors.map(d => `
        <tr>
            <td>${esc(d.id)}</td><td>${esc(d.name)}</td><td>${esc(d.bloodGroup)}</td>
            <td>${esc(d.city)}</td><td>${esc(d.phone)}</td>
            <td>${d.available ? "Available" : "Recently donated"}</td>
            <td><button type="button" class="small" onclick="adminDelete('donors',${d.dbId})">Delete</button></td>
        </tr>`).join("");
    const requestRows = data.requests.map(r => `
        <tr>
            <td>${esc(r.code)}</td><td>${esc(r.patient)}</td><td>${esc(r.bloodGroup)}</td>
            <td>${esc(r.city)}</td><td>${esc(r.urgency)}</td><td>${esc(r.status)}</td>
            <td><button type="button" class="small" onclick="adminDelete('requests',${r.dbId})">Delete</button></td>
        </tr>`).join("");
    const userRows = data.users.map(u => `
        <tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td>${esc(ROLE_LABELS[u.role] || u.role)}</td></tr>`).join("");

    box.innerHTML = `
        <div class="stats" style="margin-bottom:20px;">
            <div><h2>${data.users.length}</h2><p>Users</p></div>
            <div><h2>${data.donors.length}</h2><p>Donors</p></div>
            <div><h2>${data.requests.length}</h2><p>Requests</p></div>
            <div><h2>${data.accepted}</h2><p>Accepted</p></div>
        </div>
        <h3>Donors</h3>
        <table style="width:100%; border-collapse: collapse; margin-bottom:20px;">
            <tr><th>ID</th><th>Name</th><th>Group</th><th>City</th><th>Phone</th><th>Status</th><th>Action</th></tr>
            ${donorRows || "<tr><td colspan='7'>No donors registered.</td></tr>"}
        </table>
        <h3>Blood Requests</h3>
        <table style="width:100%; border-collapse: collapse; margin-bottom:20px;">
            <tr><th>ID</th><th>Patient</th><th>Group</th><th>City</th><th>Urgency</th><th>Status</th><th>Action</th></tr>
            ${requestRows || "<tr><td colspan='7'>No requests found.</td></tr>"}
        </table>
        <h3>Users</h3>
        <table style="width:100%; border-collapse: collapse;">
            <tr><th>Name</th><th>Email</th><th>Role</th></tr>
            ${userRows}
        </table>`;
}

async function adminDelete(kind, id) {
    if (!confirm("Delete this record permanently?")) return;
    try {
        await api("/admin/" + kind + "/" + id, { method: "DELETE" });
        showToast("Record deleted successfully.", "success");
        await renderAdmin();
    } catch (err) {
        showToast(err.message, "error");
    }
}

/* ---------- Init ---------- */
(async function init() {
    const reqDate = document.getElementById("reqDate");
    if (reqDate) reqDate.min = new Date().toISOString().slice(0, 10);
    await refreshMe();
    showSection(location.hash.replace("#", "") || "home");
    setInterval(() => { if (me) refreshMe(); }, 30000);
})();