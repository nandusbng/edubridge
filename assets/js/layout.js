import { supabase } from './supabase-client.js';
window.supabase = supabase;

/**
 * ── MD5 Helper ────────────────────────────────────────────────────────────
 * Lightweight MD5 implementation for Gravatar generation.
 */
function md5(string) {
    function k(string) {
        var a = "", b = string.length, c = "0123456789abcdef", d, e;
        for (d = 0; d < b; d += 1) {
            e = string.charCodeAt(d);
            a += c.charAt(e >>> 4 & 15) + c.charAt(e & 15);
        }
        return a;
    }
    function l(a, b) {
        var c = (a & 65535) + (b & 65535), d = (a >> 16) + (b >> 16) + (c >> 16);
        return d << 16 | c & 65535;
    }
    function m(a, b) { return a << b | a >>> 32 - b; }
    function n(a, b, c, d, e, f) { return l(m(l(l(b, a), l(d, f)), e), c); }
    function o(a, b, c, d, e, f, g) { return n(b & c | ~b & d, a, b, e, f, g); }
    function p(a, b, c, d, e, f, g) { return n(b & d | c & ~d, a, b, e, f, g); }
    function q(a, b, c, d, e, f, g) { return n(b ^ c ^ d, a, b, e, f, g); }
    function r(a, b, c, d, e, f, g) { return n(c ^ (b | ~d), a, b, e, f, g); }
    function s(a) {
        var b, c = a.length, d = [1732584193, -271733879, -1732584194, 271733878], e, f, g, h, i, j;
        for (e = 0; e < c; e += 16) {
            f = d[0]; g = d[1]; h = d[2]; i = d[3];
            f = o(f, g, h, i, a[e + 0], 7, -680876936); i = o(i, f, g, h, a[e + 1], 12, -389564586); h = o(h, i, f, g, a[e + 2], 17, 606105819); g = o(g, h, i, f, a[e + 3], 22, -1044525330); f = o(f, g, h, i, a[e + 4], 7, -176418897); i = o(i, f, g, h, a[e + 5], 12, 1200080426); h = o(h, i, f, g, a[e + 6], 17, -1473231341); g = o(g, h, i, f, a[e + 7], 22, -45705983); f = o(f, g, h, i, a[e + 8], 7, 1770035416); i = o(i, f, g, h, a[e + 9], 12, -1958414417); h = o(h, i, f, g, a[e + 10], 17, -42063); g = o(g, h, i, f, a[e + 11], 22, -1990404162); f = o(f, g, h, i, a[e + 12], 7, 1804603682); i = o(i, f, g, h, a[e + 13], 12, -40341101); h = o(h, i, f, g, a[e + 14], 17, -1502002290); g = o(g, h, i, f, a[e + 15], 22, 1236535329);
            f = p(f, g, h, i, a[e + 1], 5, -165796510); i = p(i, f, g, h, a[e + 6], 9, -1069501632); h = h = p(h, i, f, g, a[e + 11], 14, 643717713); g = p(g, h, i, f, a[e + 0], 20, -373897302); f = p(f, g, h, i, a[e + 5], 5, -701558691); i = p(i, f, g, h, a[e + 10], 9, 38016083); h = p(h, i, f, g, a[e + 15], 14, -660478335); g = p(g, h, i, f, a[e + 4], 20, -405537848); f = p(f, g, h, i, a[e + 9], 5, 568446438); i = p(i, f, g, h, a[e + 14], 9, -1019803690); h = p(h, i, f, g, a[e + 3], 14, -187363961); g = p(g, h, i, f, a[e + 8], 20, 1163531501); f = p(f, g, h, i, a[e + 13], 5, -1444681467); i = p(i, f, g, h, a[e + 2], 9, -51403784); h = p(h, i, f, g, a[e + 7], 14, 1735328473); g = p(g, h, i, f, a[e + 12], 20, -1926607734);
            f = q(f, g, h, i, a[e + 5], 4, -378558); i = q(i, f, g, h, a[e + 8], 11, -2022574463); h = q(h, i, f, g, a[e + 11], 16, 1839030562); g = q(g, h, i, f, a[e + 14], 23, -35309556); f = q(f, g, h, i, a[e + 1], 4, -1530992060); i = q(i, f, g, h, a[e + 4], 11, 1272893353); h = q(h, i, f, g, a[e + 7], 16, -155497632); g = q(g, h, i, f, a[e + 10], 23, -1094730640); f = q(f, g, h, i, a[e + 13], 4, 681279174); i = q(i, f, g, h, a[e + 0], 11, -358537222); h = q(h, i, f, g, a[e + 3], 16, -722521979); g = q(g, h, i, f, a[e + 6], 23, 76029189); f = q(f, g, h, i, a[e + 9], 4, -640364487); i = q(i, f, g, h, a[e + 12], 11, -421815835); h = q(h, i, f, g, a[e + 15], 16, 530742520); g = q(g, h, i, f, a[e + 2], 23, -995338651);
            f = r(f, g, h, i, a[e + 0], 6, -198630844); i = r(i, f, g, h, a[e + 7], 10, 1126891415); h = r(h, i, f, g, a[e + 14], 15, -1416354905); g = r(g, h, i, f, a[e + 5], 21, -57434055); f = r(f, g, h, i, a[e + 12], 6, 1700485571); i = r(i, f, g, h, a[e + 3], 10, -1894946606); h = r(h, i, f, g, a[e + 10], 15, -105152333); g = r(g, h, i, f, a[e + 1], 21, -2054922799); f = r(f, g, h, i, a[e + 8], 6, 1873313359); i = r(i, f, g, h, a[e + 15], 10, -30611744); h = r(h, i, f, g, a[e + 6], 15, -1560198380); g = r(g, h, i, f, a[e + 13], 21, 1309151649); f = r(f, g, h, i, a[e + 4], 6, -145523070); i = r(i, f, g, h, a[e + 11], 10, -1120210379); h = r(h, i, f, g, a[e + 2], 15, 718787280); g = r(g, h, i, f, a[e + 9], 21, -343485551);
            d[0] = l(f, d[0]); d[1] = l(g, d[1]); d[2] = l(h, d[2]); d[3] = l(i, d[3]);
        }
        return d;
    }
    function t(a) {
        var b, c = "", d = a.length * 32;
        for (b = 0; b < d; b += 8) c += String.fromCharCode(a[b >> 5] >>> b % 32 & 255);
        return c;
    }
    function u(a) {
        var b, c = [];
        for (b = 0; b < a.length * 8; b += 8) c[b >> 5] |= (a.charCodeAt(b / 8) & 255) << b % 32;
        return c;
    }
    function v(a) {
        var b, c = "", d = a.length * 32;
        for (b = 0; b < d; b += 8) c += String.fromCharCode(a[b >> 5] >>> b % 32 & 255);
        return c;
    }
    function w(a) {
        var b, c = [80], d = a.length * 8;
        for (b = 0; b < d; b += 8) c[b >> 5] |= (a.charCodeAt(b / 8) & 255) << b % 32;
        c[d >> 5] |= 128 << d % 32;
        c[(d + 64 >>> 9 << 4) + 14] = d;
        return c;
    }
    return k(t(s(w(string))));
}

window.getAvatarUrl = function(email, size = 100) {
    if (!email) return `https://www.gravatar.com/avatar/00000000000000000000000000000000?d=mp&s=${size}`;
    const hash = md5(email.trim().toLowerCase());
    return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
};


document.addEventListener('DOMContentLoaded', async () => {

    // ── 0. Portal Guard ────────────────────────────────────────────────
    const isLanding = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');
    const { data: { session } } = await supabase.auth.getSession();

    if (!session && !isLanding) {
        window.location.href = '/index.html';
        return;
    }

    // ── 0.1 Cross-Portal Redirection Guard ────────────────────────────
    let userProfile = null;
    if (session) {
        const { data: profile } = await supabase.from('users').select('*').eq('id', session.user.id).single();
        userProfile = profile;
        
        // ── 0.2 Streak System Initialization (Excluded for Admin) ───────
        if (profile && profile.role !== 'admin' && !isLanding) {
            import('./streak.js').then(({ streakSystem }) => {
                streakSystem.init();
            });
        }

        if (profile) {
            const path = window.location.pathname;
            const role = profile.role;
            
            // Redirect to respective portals if at root/landing OR on the wrong portal
            if (path.endsWith('dashboard.html') || path.endsWith('index.html') || path === '/') {
                if (role === 'faculty') { window.location.href = '/faculty.html'; return; }
                if (role === 'mentor')  { window.location.href = '/mentor.html'; return; }
                if (role === 'student' && (path.endsWith('index.html') || path === '/')) { 
                    window.location.href = '/dashboard.html'; 
                    return; 
                }
            }
            
            // Redirect students away from specialized portals
            if (role === 'student') {
                if (path.includes('faculty.html') || path.includes('mentor.html') || path.includes('admin.html')) {
                    window.location.href = '/dashboard.html';
                    return;
                }
            }
        }
    }

    // ── 1. Build Sidebar Bottom Section on every portal page ───────────
    const path = window.location.pathname;
    const aside = document.querySelector('aside');
    if (aside && !isLanding) {
        let isAdmin = userProfile?.role === 'admin';

        const existingBottom = aside.querySelector('#sidebar-bottom');
        if (existingBottom) existingBottom.remove();

        const bottomDiv = document.createElement('div');
        bottomDiv.id = 'sidebar-bottom';
        bottomDiv.className = 'mt-auto pt-4 flex flex-col gap-1 border-t border-slate-100 dark:border-slate-800';

        bottomDiv.innerHTML = `
            ${isAdmin ? `
            <a id="manage-account-link" href="admin.html"
               class="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
                <span class="material-symbols-outlined text-[22px]">manage_accounts</span>
                <span>Manage Account</span>
            </a>` : ''}
            <a href="settings.html"
               class="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800">
                <span class="material-symbols-outlined text-[22px]">settings</span>
                <span>Settings</span>
            </a>
            <a href="#logout" id="logout-link"
               class="flex items-center gap-3 px-3 py-2 rounded-lg transition-colors duration-200 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10">
                <span class="material-symbols-outlined text-[22px]">logout</span>
                <span>Logout</span>
            </a>
        `;

        const oldStaticBottom = aside.querySelector('.mt-auto');
        if (oldStaticBottom && !oldStaticBottom.id) oldStaticBottom.remove();
        aside.appendChild(bottomDiv);
    }

    // ── 2. Highlight Active Nav Link ──────────────────────────────────
    document.querySelectorAll('nav a, aside a').forEach(link => {
        const href = link.getAttribute('href');
        if (href && !href.startsWith('#') &&
            (path.endsWith(href) || (path === '/' && href === 'index.html') || (path.endsWith('dashboard.html') && href === 'dashboard.html'))) {
            link.classList.add('nav-link-active');
            link.classList.remove('text-slate-600', 'dark:text-slate-400');
        }
    });

    // ── 3. Dark Mode Controller ───────────────────────────────────────
    if (localStorage.getItem('edubridge_dark_mode') === 'enabled') {
        document.documentElement.classList.add('dark');
    }
    const darkModeToggle = document.querySelector('#dark-mode-toggle');
    if (darkModeToggle) {
        darkModeToggle.addEventListener('click', () => {
            document.documentElement.classList.toggle('dark');
            localStorage.setItem('edubridge_dark_mode',
                document.documentElement.classList.contains('dark') ? 'enabled' : 'disabled');
        });
    }

    // ── 4. Global Logout Handler ──────────────────────────────────────
    document.addEventListener('click', async (e) => {
        const target = e.target.closest('[href="#logout"], #logout-btn, #logout-link');
        if (!target) return;
        e.preventDefault();
        if (confirm('Are you sure you want to sign out?')) {
            await supabase.auth.signOut();
            window.location.href = '/index.html';
        }
    });

    // ── 5. Mobile Sidebar Toggle ──────────────────────────────────────
    const sidebarToggle = document.querySelector('#sidebar-toggle');
    if (sidebarToggle && aside) {
        sidebarToggle.addEventListener('click', () => {
            aside.classList.toggle('hidden');
        });
    }

    // ── 6. Global Notification System & Presence ──────────────────────
    if (session) {
        initNotificationSystem(session);
        initPresence(session.user.id, userProfile?.role || 'user');
        
        window._supabaseTimeSpent = null; // Will load below
        
        const { data: analyticsRow } = await supabase
            .from('user_analytics')
            .select('time_spent')
            .eq('user_id', session.user.id)
            .single();
            
        window._supabaseTimeSpent = analyticsRow?.time_spent || 0;

        // Force the dashboard to update properly now that we have absolute truth data!
        if (window.updateDashboardStats) window.updateDashboardStats();
        if (window.loadStudentLiveClasses) window.loadStudentLiveClasses();
        if (window.loadMentorshipConnect) window.loadMentorshipConnect();
        if (window.loadAllClasses) window.loadAllClasses();
        
        // ── Clean Custom Heartbeat Tracker (Tracks pure active time natively) ──
        let isUserIdle = false;
        let idleTimeout = null;
        window._sessionActiveSeconds = 0;
        
        function resetIdleTimer() {
            isUserIdle = false;
            clearTimeout(idleTimeout);
            idleTimeout = setTimeout(() => isUserIdle = true, 15000); // 15 seconds no action = idle
        }
        ['mousemove', 'click', 'keydown', 'scroll'].forEach(e => document.addEventListener(e, resetIdleTimer, {passive: true}));
        resetIdleTimer();
        
        setInterval(async () => {
             // Only count if they are logged in, tab is completely visible, and they are not idle
            if (!session || isUserIdle || document.visibilityState !== 'visible') return;
            
            window._sessionActiveSeconds++;
            
            // Exactly every 60 seconds of PURE ACTIVE TIME, we send +1 min to Supabase
            if (window._sessionActiveSeconds >= 60) {
                window._sessionActiveSeconds = 0; // reset
                
                // Keep local UI instantly up to date
                window._supabaseTimeSpent++; 
                if (window.updateDashboardStats) window.updateDashboardStats();
                
                const stats = window.getStats ? window.getStats() : { interactions: {} };
                
                const { error } = await supabase.rpc('upsert_user_analytics', {
                    p_user_id:               session.user.id,
                    p_delta_minutes:         1,
                    p_notes_viewed:          stats.interactions.notesViewed          || 0,
                    p_notes_downloaded:      stats.interactions.notesDownloaded      || 0,
                    p_assignments_submitted: 0, // Maintained at 0 to satisfy existing DB schema
                    p_quizzes_started:       stats.interactions.quizzesStarted       || 0,
                    ...((userProfile && userProfile.role === 'student') ? {
                        p_student_name:    userProfile.name || "Unknown",
                        p_student_email:   userProfile.email || session.user.email,
                        p_student_class:   userProfile.role, 
                        p_register_number: userProfile.register_number || "—"
                    } : {})
                });
                if (error) console.error('[Heartbeat] RPC failed:', error);
            }
        }, 1000);
    }
    // ── 8. Final Flush on Page Close ──────────────────────────────────
    // Does nothing now since all logic was offloaded reliably to the active tracked heartbeats!
    window.addEventListener('beforeunload', () => {
       // Clean exit 
    });
});

/**
 * ── Supabase Presence Setup ──────────────────────────────────────────────
 * Real-time tracking of online users without database columns.
 */
window.presenceChannel = null;
window.onlineUsers = {};

async function initPresence(userId, role) {
    if (!userId) return;
    window.presenceChannel = supabase.channel('portal-presence', {
        config: { presence: { key: userId } }
    });

    window.presenceChannel
        .on('presence', { event: 'sync' }, () => {
            window.onlineUsers = window.presenceChannel.presenceState();
        })
        .subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await window.presenceChannel.track({
                    user_id: userId,
                    role: role,
                    online_at: new Date().toISOString()
                });
            }
        });
}

/**
 * ── Helper Functions ──────────────────────────────────────────────────────
 */
function initNotificationSystem(session) {
    const bell = document.getElementById('notification-bell');
    const dot = document.getElementById('notification-dot');
    if (!bell) return;

    // 1. Handle Clicks (Show/Hide Dropdown)
    bell.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleNotificationDropdown();
    });

    // 2. Listen for Real-time Announcements
    supabase.channel('public:announcements')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, payload => {
            const ann = payload.new;
            if (dot) dot.classList.remove('hidden');
            showGlobalToast(ann.title);
            
            // Trigger UI refreshes if functions exist
            if (window.loadStudentAnnouncements) window.loadStudentAnnouncements();
            if (window.loadAnnouncements) window.loadAnnouncements();
            if (window.loadGlobalAnnouncements) window.loadGlobalAnnouncements();
        })
        .subscribe();
}

async function toggleNotificationDropdown() {
    let dropdown = document.getElementById('notification-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
        if (!dropdown.classList.contains('hidden')) loadNotificationDropdown();
        return;
    }

    // Create dropdown if it doesn't exist
    dropdown = document.createElement('div');
    dropdown.id = 'notification-dropdown';
    dropdown.className = 'absolute top-16 right-6 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-[200] overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300';
    dropdown.innerHTML = `
        <div class="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
            <h3 class="font-black text-sm uppercase tracking-widest text-slate-400">Notifications</h3>
            <span class="text-[10px] font-bold text-primary hover:underline cursor-pointer" onclick="window.markAllNotificationsRead()">Mark all as read</span>
        </div>
        <div id="notification-items" class="max-h-96 overflow-y-auto p-2">
            <div class="p-8 text-center"><div class="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto"></div></div>
        </div>
        <div class="p-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <button onclick="window.viewAllNotifications()" class="text-[10px] font-black uppercase tracking-widest text-primary hover:brightness-110 transition-all">View All Activity</button>
        </div>
    `;
    document.body.appendChild(dropdown);
    loadNotificationDropdown();

    // Close on outside click
    window.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !e.target.closest('#notification-bell')) {
            dropdown.classList.add('hidden');
        }
    });
}

async function loadNotificationDropdown() {
    const list = document.getElementById('notification-items');
    if (!list) return;

    try {
        const { data: anns, error } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(5);

        if (error) throw error;

        if (!anns || anns.length === 0) {
            list.innerHTML = `
                <div class="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <div class="size-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <span class="material-symbols-outlined text-slate-300 text-3xl">notifications_off</span>
                    </div>
                    <p class="text-sm font-bold text-slate-900 dark:text-white mb-1">No New Alerts</p>
                    <p class="text-xs text-slate-400 font-medium leading-relaxed">You're all caught up!</p>
                </div>
            `;
            return;
        }

        // Fetch user metadata for these announcements
        const authorIds = [...new Set(anns.map(a => a.author_id))];
        const { data: authors } = await supabase.from('users').select('id, name, email, role').in('id', authorIds);
        const authorMap = {};
        if (authors) authors.forEach(u => authorMap[u.id] = u);

        list.innerHTML = anns.map(a => {
            const author = authorMap[a.author_id] || { name: 'Faculty', email: '', role: 'faculty' };
            return `
                <div class="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-2xl transition-colors cursor-pointer group">
                    <div class="flex items-start gap-3">
                        <img src="${window.getAvatarUrl(author.email, 32)}" class="size-8 rounded-full">
                        <div class="flex-1">
                            <div class="flex items-center justify-between mb-1">
                                <span class="text-[9px] font-black text-primary uppercase tracking-widest">${author.name}</span>
                                <span class="text-[8px] font-bold text-slate-300 uppercase">${new Date(a.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                            </div>
                            <h4 class="text-xs font-bold text-slate-900 dark:text-white mb-1 leading-tight group-hover:text-primary transition-colors">${a.title}</h4>
                            <p class="text-[10px] text-slate-500 line-clamp-2">${a.body}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Dropdown load failed:", err);
        list.innerHTML = `<p class="text-[10px] text-center p-4 text-red-500">Failed to load alerts.</p>`;
    }
}

window.markAllNotificationsRead = function() {
    const dot = document.getElementById('notification-dot');
    if (dot) dot.classList.add('hidden');
    
    // Clear/Hide the items in the dropdown
    const list = document.getElementById('notification-items');
    if (list) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center py-12 px-6 text-center animate-in fade-in duration-500">
                <div class="size-16 bg-emerald-50 dark:bg-emerald-900/10 rounded-full flex items-center justify-center mb-4">
                    <span class="material-symbols-outlined text-emerald-500 text-3xl">done_all</span>
                </div>
                <p class="text-sm font-bold text-slate-900 dark:text-white mb-1">Inbox Cleared</p>
                <p class="text-xs text-slate-400 font-medium leading-relaxed">You've dismissed all recent notifications.</p>
            </div>
        `;
    }
};

window.readFullAnnouncement = function(id, title, body) {
    let modal = document.getElementById('announcement-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'announcement-modal';
        modal.className = 'fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div class="p-8 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                <div class="flex items-center gap-3">
                    <div class="size-10 bg-primary rounded-xl flex items-center justify-center text-white">
                        <span class="material-symbols-outlined">campaign</span>
                    </div>
                    <div>
                        <h3 class="font-black text-slate-900 dark:text-white leading-tight">Broadcast Detail</h3>
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Official Platform Alert</p>
                    </div>
                </div>
                <button onclick="this.closest('#announcement-modal').classList.add('hidden')" class="p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-all">
                    <span class="material-symbols-outlined">close</span>
                </button>
            </div>
            <div class="p-8 space-y-4">
                <h2 class="text-2xl font-black text-slate-900 dark:text-white leading-tight">${title}</h2>
                <div class="prose prose-slate dark:prose-invert max-w-none">
                    <p class="text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">${body}</p>
                </div>
            </div>
            <div class="p-6 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex justify-end">
                <button onclick="this.closest('#announcement-modal').classList.add('hidden')" class="px-8 py-3 bg-primary text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-primary/20 hover:brightness-110 transition-all">Understood</button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
};

window.viewAllNotifications = function() {
    // Try to switch to announcements tab if it exists
    if (window.switchTab) {
        window.switchTab('announcements');
        document.getElementById('notification-dropdown')?.classList.add('hidden');
    } else if (window.facultyPortal && window.facultyPortal.switchTab) {
        window.facultyPortal.switchTab('announcements');
        document.getElementById('notification-dropdown')?.classList.add('hidden');
    } else {
        alert("Full activity log coming soon to this portal! For now, check your dashboard.");
    }
    
    const dot = document.getElementById('notification-dot');
    if (dot) dot.classList.add('hidden');
};

// Google Sheets sync — placeholder until the Sheets integration is wired up.
// Will be implemented in the next phase. All data is safely in user_analytics.
async function syncToGoogleSheets(session) {
    // TODO: Implement in next phase.
}


function showGlobalToast(msg) {
    let t = document.getElementById('global-portal-toast');
    if (!t) {
        t = document.createElement('div');
        t.id = 'global-portal-toast';
        t.className = 'fixed top-20 right-6 z-[200] bg-slate-900/90 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700/50 backdrop-blur-xl translate-x-[120%] transition-all duration-500';
        document.body.appendChild(t);
    }
    t.innerHTML = `
        <div class="size-8 bg-primary rounded-full flex items-center justify-center shadow-lg shadow-primary/30">
            <span class="material-symbols-outlined text-[18px]">notifications_active</span>
        </div>
        <div>
            <p class="text-[10px] font-black text-primary uppercase tracking-widest leading-none mb-1">New Broadcast</p>
            <p class="text-sm font-bold tracking-tight">${msg}</p>
        </div>
    `;
    setTimeout(() => t.classList.remove('translate-x-[120%]'), 10);
    setTimeout(() => t.classList.add('translate-x-[120%]'), 6000);
}
