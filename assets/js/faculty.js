import { supabase } from './supabase-client.js';
import { academicData } from './notes-data.js';
import { initTrackingSheets } from './tracking-sheets.js';

// ─── Constants ──────────────────────────────────────────────────────────────
const BUCKET_NAME = 'notes';
const ROLE_COLORS = {
    admin:   { bg: 'bg-red-100',    text: 'text-red-700',    dot: 'bg-red-500' },
    faculty: { bg: 'bg-blue-100',   text: 'text-blue-700',   dot: 'bg-blue-500' },
    mentor:  { bg: 'bg-violet-100', text: 'text-violet-700', dot: 'bg-violet-500' },
    student: { bg: 'bg-emerald-100',text: 'text-emerald-700',dot: 'bg-emerald-500' },
};

// ─── State ──────────────────────────────────────────────────────────────────
let currentUser = null;
let userRole = null;
let activeSemester = null;
let activeSubject  = null;
let allNotes       = [];
let userProfilesCache = {}; 
let allAnnouncements = [];

// ─── UI Helpers ───────────────────────────────────────────────────────────
function roleBadge(role) {
    const c = ROLE_COLORS[role] || ROLE_COLORS.student;
    return `<span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${c.bg} ${c.text}">
        <span class="size-1.5 rounded-full ${c.dot}"></span>${role}
    </span>`;
}

window.switchTab = function(tabName) {
    console.log(`[FacultyPortal] Switching to tab: ${tabName}`);
    if (!tabName) return;
    
    // Hide all contents
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(t => t.classList.add('hidden'));
    
    const target = document.getElementById('tab-' + tabName);
    if (!target) {
        console.warn(`[FacultyPortal] Tab content for 'tab-${tabName}' not found in DOM.`);
        return;
    }
    
    target.classList.remove('hidden');

    // Section Loaders
    if (tabName === 'interactions') {
        if (typeof initDoubtLogs === 'function') initDoubtLogs();
    } else if (tabName === 'exams') {
        if (typeof loadFacultyExams === 'function') loadFacultyExams();
    } else if (tabName === 'overview') {
        if (typeof loadAnalytics === 'function') loadAnalytics();
    } else if (tabName === 'tracking-sheets') {
        initTrackingSheets('tracking-pairs-list');
    } else if (tabName === 'cloud-sync') {
        // No specific init logic needed for now, but hook is here
    }
    
    // Auto-refresh logic for oversight
    if (window._oversightInterval) clearInterval(window._oversightInterval);
    if (tabName === 'overview') {
        window._oversightInterval = setInterval(loadAnalytics, 20000);
    }
    
    // Update navigation styles
    document.querySelectorAll('.nav-tab').forEach(a => {
        const tab = a.getAttribute('data-tab');
        const active = tab === tabName;
        a.classList.toggle('bg-blue-50', active);
        a.classList.toggle('text-primary', active);
        a.classList.toggle('font-bold', active);
        a.classList.toggle('text-slate-600', !active);
        a.classList.toggle('hover:bg-slate-50', !active);
    });

    // Lazy load data for the active tab
    try {
        if (tabName === 'overview') { loadOverviewStats(); loadRecentUsers(); }
        if (tabName === 'users') window.loadUsers();
        if (tabName === 'notes') fetchAllNotes();
        if (tabName === 'announcements') loadAnnouncements();
        if (tabName === 'analytics') window.loadAnalytics();
        if (tabName === 'live-classes') window.loadLiveClasses();
    } catch (err) {
        console.error(`[FacultyPortal] Error loading tab ${tabName}:`, err);
    }
};

// ─── Init ──────────────────────────────────────────────────────────────────
async function init() {
    console.log("[FacultyPortal] Initializing...");
    
    // 1. Authenticate & Verify Permissions
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { 
        console.warn("[FacultyPortal] No session found, redirecting to landing.");
        window.location.href = '/landing.html'; return; 
    }
    currentUser = session.user;
    console.log("[FacultyPortal] Session authenticated:", currentUser.email);

    const { data: profile, error: profileErr } = await supabase.from('users').select('*').eq('id', session.user.id).single();
    if (profileErr) console.error("[FacultyPortal] Profile fetch error:", profileErr);
    
    if (!profile || (profile.role !== 'faculty' && profile.role !== 'admin')) {
        console.warn("[FacultyPortal] Unauthorized access or missing profile. Role:", profile?.role);
        window.location.href = '/index.html'; return;
    }
    userRole = profile.role;
    console.log("[FacultyPortal] Profile verified. Role:", userRole);

    // 2. Setup Profile UI
    const name = profile.name || session.user.email.split('@')[0];
    const el = document.getElementById('faculty-name-display');
    const av = document.getElementById('faculty-avatar');
    if (el) el.innerText = profile.name || currentUser.email;
    if (av) {
        av.innerHTML = `<img src="${window.getAvatarUrl(currentUser.email, 40)}" class="size-full rounded-full object-cover" alt="Profile">`;
        av.classList.remove('bg-gradient-to-br', 'from-blue-500', 'to-blue-700', 'flex', 'items-center', 'justify-center', 'text-white', 'font-bold', 'text-sm');
    }

    // 3. Initialize Modules
    console.log("[FacultyPortal] Initializing modules...");
    try {
        initNotesModule();
        initAnnouncementModule();
        await initLiveClassesModule();
        await initMentorshipOversight();
    } catch (e) {
        console.error("[FacultyPortal] Module initialization failed:", e);
    }

    // 4. Attach Unified Event Delegation for Navigation
    console.log("[FacultyPortal] Attaching event listeners...");
    document.addEventListener('click', (e) => {
        const navTab = e.target.closest('.nav-tab');
        if (navTab) {
            e.preventDefault();
            const tabName = navTab.getAttribute('data-tab');
            console.log("[FacultyPortal] Nav link clicked:", tabName);
            if (tabName) {
                window.switchTab(tabName);
            } else {
                console.warn("[FacultyPortal] Nav link missing 'data-tab' attribute:", navTab);
            }
        }
        
        // Handle Dashboard deep links (e.g. View All)
        const dashboardLink = e.target.closest('[data-switch-tab]');
        if (dashboardLink) {
            e.preventDefault();
            const tabName = dashboardLink.getAttribute('data-switch-tab');
            console.log("[FacultyPortal] Dashboard link clicked:", tabName);
            if (tabName) window.switchTab(tabName);
        }
    });

    // 5. Initial Selection
    console.log("[FacultyPortal] Performing initial switch to 'overview'...");
    window.switchTab('overview');

    // 6. User Management Real-time Sync
    document.getElementById('role-filter')?.addEventListener('change', () => window.loadUsers());
    
    // Auto-refresh users table every 15s if currently viewing the users tab
    setInterval(() => {
        const activeTab = document.querySelector('.tab-content:not(.hidden)');
        if (activeTab?.id === 'tab-users') {
            window.loadUsers();
        }
    }, 15000);
}

async function loadOverviewStats() {
    const { data: users } = await supabase.from('users').select('role');
    const { data: notes } = await supabase.from('notes').select('id');
    if (users) {
        const s = document.getElementById('stat-students');
        const m = document.getElementById('stat-mentors');
        const t = document.getElementById('stat-total');
        if (s) s.textContent = users.filter(u => u.role === 'student').length;
        if (m) m.textContent = users.filter(u => u.role === 'mentor').length;
        if (t) t.textContent  = users.length;
    }
    if (notes) {
        const n = document.getElementById('stat-notes');
        if (n) n.textContent = notes.length;
    }
}

async function loadRecentUsers() {
    const { data: users } = await supabase.from('users').select('name,email,role,created_at').order('created_at', { ascending: false }).limit(5);
    const container = document.getElementById('recent-users-list');
    if (!container || !users) return;
    container.innerHTML = users.map(u => `
        <div class="px-6 py-4 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <img src="${window.getAvatarUrl(u.email, 36)}" class="size-9 rounded-full object-cover bg-slate-100">
                <div><p class="text-sm font-semibold">${u.name || '—'}</p><p class="text-xs text-slate-400 font-medium">${u.email}</p></div>
            </div>
            ${roleBadge(u.role)}
        </div>
    `).join('');
}

window.loadUsers = async function() {
    const filter = document.getElementById('role-filter')?.value || '';
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    let query = supabase.from('users').select('id,name,email,role,created_at').order('created_at', { ascending: false });
    if (filter) query = query.eq('role', filter);
    
    const { data: users, error } = await query;
    if (error || !users) {
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-8 text-center text-red-500 font-bold">Failed to load users: ${error?.message}</td></tr>`;
        return;
    }

    // Use Presence state from layout.js
    const onlineUserIds = Object.keys(window.onlineUsers || {});

    tbody.innerHTML = users.map(u => {
        const joined = u.created_at ? new Date(u.created_at).toLocaleDateString() : '—';
        const isOnline = onlineUserIds.includes(u.id);

        // Privacy Logic: Admin sees everyone. Faculty sees students & mentors only.
        const canSeeStatus = (userRole === 'admin') || 
                             (userRole === 'faculty' && (u.role === 'student' || u.role === 'mentor'));

        const statusHTML = canSeeStatus 
            ? `<div class="flex items-center gap-1.5">
                <span class="relative flex h-2 w-2">
                    <span class="${isOnline ? 'animate-ping' : ''} absolute inline-flex h-full w-full rounded-full ${isOnline ? 'bg-emerald-400 opacity-75' : 'bg-slate-200'}"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 ${isOnline ? 'bg-emerald-500' : 'bg-slate-300'}"></span>
                </span>
                <span class="text-[10px] font-black uppercase tracking-widest ${isOnline ? 'text-emerald-500' : 'text-slate-400'}">${isOnline ? 'Online' : 'Offline'}</span>
               </div>`
            : `<span class="text-[9px] font-black text-slate-200 uppercase tracking-widest italic select-none">Private</span>`;

        return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <img src="${window.getAvatarUrl(u.email, 36)}" class="size-9 rounded-full object-cover bg-slate-100">
                        <div>
                            <p class="font-bold text-sm text-slate-900">${u.name || '—'}</p>
                            <p class="text-xs text-slate-400 font-medium">${u.email}</p>
                        </div>
                    </div>
                </td>
                <td class="px-6 py-4">${statusHTML}</td>
                <td class="px-6 py-4">${roleBadge(u.role)}</td>
                <td class="px-6 py-4 text-xs font-semibold text-slate-400">${joined}</td>
                <td class="px-6 py-4 text-right">
                    <select onchange="window.facultyPortal.updateRole('${u.id}', this.value)" class="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white font-black uppercase tracking-tight outline-none cursor-pointer hover:border-primary transition-all">
                        <option value="">Update Role…</option>
                        <option value="student">To Student</option>
                        <option value="mentor">To Mentor</option>
                        <option value="faculty">To Faculty</option>
                        <option value="admin">To Admin</option>
                    </select>
                </td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 italic">No users found matching this filter.</td></tr>';
};

// ─── Notes Module ───────────────────────────────────────────────────────────
function initNotesModule() {
    renderSemesterTabs();
    document.getElementById('open-upload-modal')?.addEventListener('click', () => openModal('upload-modal', 'modal-box'));
    document.getElementById('close-upload-modal')?.addEventListener('click', () => closeModal('upload-modal', 'modal-box'));
    document.getElementById('close-edit-modal')?.addEventListener('click', () => closeModal('edit-modal', 'edit-modal-box'));
    document.getElementById('modal-semester')?.addEventListener('change', e => populateSubjectSelect(e.target.value, 'modal-subject'));
    document.getElementById('upload-form')?.addEventListener('submit', handleUpload);
    document.getElementById('edit-form')?.addEventListener('submit', handleSaveEdit);
    document.getElementById('clear-filters')?.addEventListener('click', resetFilters);
    document.getElementById('note-file')?.addEventListener('change', e => {
        const f = e.target.files[0];
        if (f) {
            const el = document.getElementById('file-name-display');
            if (el) el.textContent = f.name;
        }
    });
}

function initAnnouncementModule() {
    document.getElementById('edit-ann-form')?.addEventListener('submit', handleSaveAnnEdit);
}

window.facultyPortal = {
    updateRole: async (userId, newRole) => {
        if (!newRole) return;
        const { error } = await supabase.from('users').update({ role: newRole }).eq('id', userId);
        if (error) { alert('Update failed: ' + error.message); return; }
        showPortalToast(`Role updated to ${newRole}`);
        window.loadUsers();
    },
    postAnnouncement: async () => {
        const title = document.getElementById('ann-title').value.trim();
        const body = document.getElementById('ann-body').value.trim();
        const target = document.getElementById('ann-target').value;
        const duration = document.getElementById('ann-duration').value;
        const btn = document.getElementById('post-ann-btn');
        if (!title || !body) return;
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[18px]">sync</span> Publishing...';
        let expires_at = null;
        if (duration !== 'infinite') {
            const now = new Date();
            if (duration === '30m') expires_at = new Date(now.getTime() + 30 * 60 * 1000);
            else if (duration === '1d') expires_at = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            else if (duration === '10d') expires_at = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
        }
        const { error } = await supabase.from('announcements').insert([{ title, body, target_role: target, author_id: currentUser.id, expires_at: expires_at?.toISOString() }]);
        btn.disabled = false;
        btn.innerHTML = 'Post Announcement';
        if (error) { alert('Failed: ' + error.message); }
        else { showPortalToast('Broadcast sent!'); document.getElementById('ann-title').value = ''; document.getElementById('ann-body').value = ''; loadAnnouncements(); }
    }
};

async function fetchAllNotes() {
    const grid = document.getElementById('notes-grid');
    if (!grid) return;
    grid.innerHTML = '<div class="col-span-full py-20 flex flex-col items-center"><div class="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div><p class="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Hydrating Repository...</p></div>';
    const { data, error } = await supabase.from('notes').select('*').order('uploaded_at', { ascending: false });
    if (error) { grid.innerHTML = `<div class="col-span-full text-center text-red-500 font-bold p-10">Error: ${error.message}</div>`; return; }
    allNotes = data || [];
    filterAndDisplay();
}

function renderSemesterTabs() {
    const container = document.getElementById('semester-filters');
    if (!container) return;
    container.innerHTML = '';
    Object.keys(academicData).forEach(sem => {
        const btn = document.createElement('button');
        btn.className = 'sem-btn whitespace-nowrap px-4 py-2 rounded-xl border border-slate-200 text-xs font-black uppercase tracking-tight text-slate-500 hover:border-primary hover:text-primary transition-all';
        btn.textContent = sem;
        btn.onclick = () => selectSemester(sem, btn);
        container.appendChild(btn);
    });
}

function selectSemester(sem, el) {
    if (activeSemester === sem) { resetFilters(); return; }
    document.querySelectorAll('.sem-btn').forEach(b => b.classList.remove('bg-primary', 'text-white', 'border-primary'));
    el.classList.add('bg-primary', 'text-white', 'border-primary');
    activeSemester = sem;
    activeSubject = null;
    renderSubjectPills(sem);
    document.getElementById('subject-section')?.classList.remove('hidden');
    document.getElementById('clear-filters')?.classList.remove('hidden');
    filterAndDisplay();
}

function renderSubjectPills(sem) {
    const container = document.getElementById('subject-filters');
    if (!container) return;
    const subjects = academicData[sem] || [];
    container.innerHTML = `<button onclick="window.selectSubject(null, this)" class="subj-pill px-4 py-2 rounded-xl bg-primary text-white text-[11px] font-black uppercase tracking-tight transition-all">All Subjects</button>`;
    subjects.forEach(sub => {
        const btn = document.createElement('button');
        btn.className = 'subj-pill px-4 py-2 rounded-xl border border-slate-200 text-[11px] font-black uppercase tracking-tight text-slate-600 hover:border-primary hover:text-primary transition-all';
        btn.textContent = `${sub.code} - ${sub.name}`;
        btn.onclick = () => window.selectSubject(sub.name, btn);
        container.appendChild(btn);
    });
    const countEl = document.getElementById('subject-count');
    if (countEl) countEl.textContent = `${subjects.length} Subjects`;
}

window.selectSubject = function(sub, el) {
    document.querySelectorAll('.subj-pill').forEach(b => {
        b.classList.remove('bg-primary', 'text-white', 'border-primary');
        b.classList.add('border-slate-200', 'text-slate-600');
    });
    el.classList.remove('border-slate-200', 'text-slate-600');
    el.classList.add('bg-primary', 'text-white', 'border-primary');
    activeSubject = sub;
    filterAndDisplay();
};

function filterAndDisplay() {
    let filtered = allNotes;
    if (activeSemester) filtered = filtered.filter(n => n.semester === activeSemester);
    if (activeSubject) filtered = filtered.filter(n => n.subject_name === activeSubject);
    
    const breadcrumb = document.getElementById('breadcrumb-text');
    if (breadcrumb) breadcrumb.textContent = activeSemester ? (activeSubject ? `${activeSemester} > ${activeSubject}` : activeSemester) : 'All Resources';
    
    document.getElementById('filter-breadcrumb')?.classList.toggle('hidden', !activeSemester);
    
    const badge = document.getElementById('notes-count-badge');
    if (badge) badge.textContent = `${filtered.length} Indexed Resources`;
    
    const grid = document.getElementById('notes-grid');
    if (grid) grid.innerHTML = '';
    renderNotesGrid(filtered);
}

function renderNotesGrid(notes) {
    const grid = document.getElementById('notes-grid');
    if (!grid) return;
    document.getElementById('empty-state')?.classList.toggle('hidden', notes.length > 0);
    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'group bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-5 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative';
        const isPdf = note.file_url?.toLowerCase().includes('.pdf');
        card.innerHTML = `
            <div class="flex items-start justify-between mb-4">
                <div class="size-12 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-center text-primary transition-colors group-hover:bg-primary group-hover:text-white">
                    <span class="material-symbols-outlined text-[28px]">${isPdf ? 'picture_as_pdf' : 'image'}</span>
                </div>
                ${userRole === 'admin' ? `
                <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onclick="window.editNote('${note.id}')" class="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                    <button onclick="window.deleteNote('${note.id}', '${note.file_url}')" class="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><span class="material-symbols-outlined text-[18px]">delete</span></button>
                </div>
                ` : ''}
            </div>
            <div class="mb-4">
                <p class="text-[10px] font-black text-primary uppercase tracking-widest mb-1">${note.course_code || note.semester}</p>
                <h3 class="font-black text-slate-900 dark:text-white line-clamp-2 leading-tight mb-1 font-sans">${note.title}</h3>
                <p class="text-xs text-slate-400 font-medium line-clamp-1">${note.subject_name}</p>
                ${note.description ? `<p class="mt-2 text-[11px] text-slate-500 italic bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg">"${note.description}"</p>` : ''}
            </div>
            <div class="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-black text-slate-400 uppercase">${new Date(note.uploaded_at).toLocaleDateString()}</span>
                    <button onmouseenter="window.showUploaderInfo(event, '${note.uploader_id}')" onmouseleave="window.hideUploaderInfo()" class="uploader-info-btn text-slate-300 hover:text-primary transition-colors">
                        <span class="material-symbols-outlined text-[16px]">info</span>
                    </button>
                </div>
                <a href="${note.file_url}" target="_blank" class="flex items-center gap-1 text-[11px] font-black text-primary hover:underline uppercase tracking-tighter">
                    Download <span class="material-symbols-outlined text-[14px]">download</span>
                </a>
            </div>
        `;
        grid.appendChild(card);
    });
}

// ─── Uploader Info Logic ───────────────────────────────────────────────────
window.showUploaderInfo = async function(e, uploaderId) {
    if (!uploaderId || uploaderId === 'null') return;
    const popover = document.getElementById('uploader-popover');
    if (!popover) return;
    const rect = e.target.getBoundingClientRect();
    
    // Position
    popover.style.left = `${rect.left - 100}px`;
    popover.style.top = `${rect.top - 140}px`;
    
    // Reveal
    popover.classList.remove('hidden');
    requestAnimationFrame(() => {
        popover.classList.remove('opacity-0', 'translate-y-2');
    });

    // Cache check
    if (userProfilesCache[uploaderId]) {
        renderPopoverContent(userProfilesCache[uploaderId]);
        return;
    }

    // Fetch user details
    const { data: user } = await supabase.from('users').select('*').eq('id', uploaderId).single();
    if (user) {
        userProfilesCache[uploaderId] = user;
        renderPopoverContent(user);
    }
};

window.hideUploaderInfo = function() {
    const popover = document.getElementById('uploader-popover');
    if (!popover) return;
    popover.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => popover.classList.add('hidden'), 200);
};

function renderPopoverContent(user) {
    const avatar = document.getElementById('pop-avatar');
    const name = document.getElementById('pop-name');
    const roleEl = document.getElementById('pop-role');
    const email = document.getElementById('pop-email');
    const classEl = document.getElementById('pop-class');
    
    if (avatar) avatar.innerHTML = `<img src="${window.getAvatarUrl(user.email, 40)}" class="size-full rounded-full object-cover">`;
    if (name) name.textContent = user.name || 'Anonymous User';
    if (roleEl) roleEl.textContent = user.role;
    if (email) email.textContent = user.email || '—';
    if (classEl) classEl.textContent = user.section ? `${user.year}nd Year - ${user.section}` : '—';
}

// ─── CRUD Operations ────────────────────────────────────────────────────────
window.deleteNote = async function(id, fileUrl) {
    if (userRole !== 'admin') { alert('Permission Denied: Admin role required.'); return; }
    const { error: dbErr } = await supabase.from('notes').delete().eq('id', id);
    if (dbErr) { alert('Action failed: ' + dbErr.message); return; }
    
    // Try to delete file from storage if URL is provided
    if (fileUrl) {
        try { 
            const path = fileUrl.split(`${BUCKET_NAME}/`).pop(); 
            if (path) await supabase.storage.from(BUCKET_NAME).remove([path]); 
        } catch(e) { console.error('Storage cleanup failed', e); }
    }
    
    showPortalToast('Resource removed');
    fetchAllNotes();
};

window.loadAnnouncements = async function() {
    const list = document.getElementById('announcements-list');
    if (!list) return;
    const now = new Date().toISOString();
    const { data: anns, error } = await supabase.from('announcements')
        .select('*')
        .or(`expires_at.is.null,expires_at.gt.${now}`)
        .order('created_at', { ascending: false });
    if (error || !anns) return;
    allAnnouncements = anns;
    if (anns.length === 0) { 
        list.innerHTML = '<div class="text-center py-8 text-slate-400">No active broadcasts.</div>'; 
        return; 
    }
    
    // Main feed in Announcements Tab
    list.innerHTML = anns.map(a => {
        const isAuthor = currentUser && (a.author_id === currentUser.id);
        return `
            <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1"><h4 class="font-black text-slate-900 dark:text-white">${a.title}</h4><span class="text-[9px] font-black px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 uppercase">${a.target_role}</span></div>
                        <p class="text-sm text-slate-600 dark:text-slate-300">${a.body}</p>
                        <div class="flex items-center gap-3 mt-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><span>${new Date(a.created_at).toLocaleDateString()}</span><span>${a.expires_at ? '⌛ Auto-Expire Set' : '∞ Permanent'}</span></div>
                    </div>
                    ${isAuthor ? `
                    <div class="flex gap-1">
                        <button onclick="window.editAnnouncement('${a.id}')" class="size-8 rounded-lg text-slate-300 hover:bg-slate-50 hover:text-primary transition-all flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">edit</span></button>
                        <button onclick="window.deleteAnnouncement('${a.id}')" class="size-8 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-600 transition-all flex items-center justify-center"><span class="material-symbols-outlined text-[18px]">delete</span></button>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    // ALSO populate the mini-dashboard widget on Overview tab
    const dashList = document.getElementById('dashboard-announcements');
    if (dashList) {
        dashList.innerHTML = anns.slice(0, 5).map(a => `
            <div class="group relative pl-6 border-l-2 border-slate-100 dark:border-slate-800 pb-4 last:pb-0">
                <div class="absolute -left-[5px] top-0 size-2 rounded-full bg-primary ring-4 ring-white dark:ring-slate-900 group-hover:scale-125 transition-transform"></div>
                <div class="flex items-center gap-2 mb-1">
                    <span class="text-[9px] font-black text-slate-400 uppercase tracking-widest">${new Date(a.created_at).toLocaleDateString()}</span>
                    <span class="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/10 text-blue-600 dark:text-blue-400 text-[8px] font-black uppercase tracking-widest">${a.target_role}</span>
                </div>
                <h4 class="text-sm font-bold text-slate-900 dark:text-white leading-tight mb-1">${a.title}</h4>
                <p class="text-xs text-slate-500 line-clamp-2">${a.body}</p>
            </div>
        `).join('');
    }
}

window.deleteAnnouncement = async function(id) {
    const ann = allAnnouncements.find(a => a.id === id);
    if (!ann) return;
    if (ann.author_id !== (currentUser?.id)) {
        alert("Action Denied: You can only delete your own broadcasts.");
        return;
    }
    
    if (!confirm("Are you sure you want to delete this broadcast?")) return;

    const { error } = await supabase.from('announcements').delete().eq('id', id);
    if (error) { alert('Failed: ' + error.message); return; }
    showPortalToast('Announcement removed');
    loadAnnouncements();
};

window.loadAnalytics = async function() {
    const slowGrid = document.getElementById('slow-learners-grid');
    const mentorGrid = document.getElementById('mentor-students-grid');
    const tableBody = document.getElementById('analytics-table-body');
    
    if (!slowGrid || !mentorGrid || !tableBody) return;

    // Fetch all users
    const { data: users, error } = await supabase.from('users').select('*');
    if (error) {
        console.error('Failed to load analytics data:', error);
        return;
    }
    
    // Fetch analytics for all users
    const { data: analytics, error: analyticsError } = await supabase.from('user_analytics').select('*');
    if (analyticsError) console.warn("Could not load analytics table:", analyticsError);

    // Merge analytics into user objects
    const enrichedUsers = (users || []).map(u => {
        const stats = (analytics || []).find(a => a.user_id === u.id) || {};
        return { ...u, analytics: stats };
    });

    const students = enrichedUsers.filter(u => u.role === 'student');
    const slowLearners = students.filter(u => u.is_slow_learner);
    const mentoredStudents = students.filter(u => u.mentor_id);
    const activeCount = students.length; 

    // 1. Summaries
    const sTotal = document.getElementById('stat-students-total');
    const slTotal = document.getElementById('stat-slow-total');
    const aTotal = document.getElementById('stat-active-total');
    if (sTotal) sTotal.textContent = students.length;
    if (slTotal) slTotal.textContent = slowLearners.length;
    if (aTotal) aTotal.textContent = activeCount;
    const avgEl = document.getElementById('stat-avg');
    if (avgEl) avgEl.textContent = '84%'; 

    // 2. Slow Learners Details
    slowGrid.innerHTML = slowLearners.map(s => {
        const displayName = s.name || s.email.split('@')[0] || 'User';
        return `
            <div class="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-2xl p-4">
                <div class="flex items-center gap-3 mb-3">
                    <img src="${window.getAvatarUrl(s.email, 40)}" class="size-10 rounded-full object-cover bg-amber-500">
                    <div><p class="text-sm font-bold truncate max-w-[120px]">${displayName}</p><p class="text-[10px] text-amber-600 uppercase font-black tracking-widest">Low Engagement</p></div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[11px] font-bold">
                    <div class="p-2 bg-white/50 dark:bg-slate-800/50 rounded-lg"><p class="text-slate-400">Notes Read</p><p>${s.analytics?.notes_viewed || 0}</p></div>
                    <div class="p-2 bg-white/50 dark:bg-slate-800/50 rounded-lg"><p class="text-slate-400">Time Spent</p><p>${s.analytics?.time_spent || 0}m</p></div>
                </div>
            </div>
        `;
    }).join('') || '<p class="col-span-full text-center text-slate-400 text-sm py-8">No students tagged as slow learners.</p>';

    // 3. Mentor's Students Details
    mentorGrid.innerHTML = mentoredStudents.map(s => {
        const mentor = users.find(u => u.id === s.mentor_id);
        const displayName = s.name || s.email.split('@')[0] || 'User';
        const timeSpent = s.analytics?.time_spent || 0;
        const formattedActivity = timeSpent >= 60 ? Math.floor(timeSpent / 60) + 'h ' + (timeSpent % 60) + 'm' : timeSpent + 'm';
        return `
            <div class="bg-violet-50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-900/20 rounded-2xl p-4">
                <div class="flex items-center gap-3 mb-3">
                    <img src="${window.getAvatarUrl(s.email, 40)}" class="size-10 rounded-full object-cover bg-violet-500">
                    <div><p class="text-sm font-bold truncate max-w-[120px]">${displayName}</p><p class="text-[10px] text-violet-600 uppercase font-black tracking-widest leading-none">Mentor: ${mentor?.name || 'Assigned'}</p></div>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[11px] font-bold">
                    <div class="p-2 bg-white/50 dark:bg-slate-800/50 rounded-lg"><p class="text-slate-400">Sync</p><p class="text-emerald-500">Connected</p></div>
                    <div class="p-2 bg-white/50 dark:bg-slate-800/50 rounded-lg"><p class="text-slate-400">Activity</p><p>${formattedActivity}</p></div>
                </div>
            </div>
        `;
    }).join('') || '<p class="col-span-full text-center text-slate-400 text-sm py-8">No mentor assignments detected.</p>';

    // 4. Unified Matrix
    tableBody.innerHTML = (students.length > 0) ? students.map(s => {
        const mentor = users.find(u => u.id === s.mentor_id);
        const classification = s.is_slow_learner ? 
            '<span class="px-2 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-black rounded-full uppercase">Slow Learner</span>' : 
            '<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[9px] font-black rounded-full uppercase">Standard</span>';
        const displayName = s.name || s.email.split('@')[0] || 'Unknown';
        const timeSpent = s.analytics?.time_spent || 0;
        const formattedTime = timeSpent >= 60 ? Math.floor(timeSpent / 60) + 'h' : timeSpent + ' min';
        return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-50 dark:border-slate-800/50">
                <td class="px-6 py-4 font-bold text-sm flex items-center gap-3">
                    <img src="${window.getAvatarUrl(s.email, 32)}" class="size-8 rounded-full object-cover">
                    ${displayName}
                </td>
                <td class="px-6 py-4 text-xs font-semibold text-slate-500">${mentor?.name || '—'}</td>
                <td class="px-6 py-4 text-center font-black text-sm">${s.analytics?.notes_viewed || 0}</td>
                <td class="px-6 py-4 text-center font-black text-primary text-sm">${formattedTime}</td>
                <td class="px-6 py-4">${classification}</td>
            </tr>
        `;
    }).join('') : '<tr><td colspan="5" class="px-6 py-12 text-center text-slate-400 italic">No student records available for analysis.</td></tr>';
};

async function handleUpload(e) {
    e.preventDefault();
    const btn = document.getElementById('submit-upload');
    if (!btn) return;
    const orig = btn.innerHTML;

    const title       = document.getElementById('note-title').value.trim();
    const semester    = document.getElementById('modal-semester').value;
    const subjectName = document.getElementById('modal-subject').value;
    const file        = document.getElementById('note-file').files[0];
    const description = document.getElementById('note-desc').value.trim();

    if (!title || !semester || !subjectName || !file) {
        alert('Please fill in all fields and choose a file.');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[20px]">sync</span> Uploading...`;

    try {
        // 1. Upload to storage
        const ext      = file.name.split('.').pop();
        const path     = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: storageErr } = await supabase.storage.from(BUCKET_NAME).upload(path, file);
        if (storageErr) throw storageErr;

        // 2. Get public URL
        const { data: urlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);

        // 3. Insert row
        const { error: dbErr } = await supabase.from('notes').insert([{
            title,
            semester,
            subject_name: subjectName,
            description,
            file_url: urlData.publicUrl,
            uploader_id: currentUser.id,
            uploaded_at: new Date().toISOString()
        }]);
        if (dbErr) throw dbErr;
        
        if (window.trackInteraction) window.trackInteraction('notesUploaded', title);

        closeModal('upload-modal', 'modal-box');
        document.getElementById('upload-form').reset();
        const display = document.getElementById('file-name-display');
        if (display) display.textContent = 'Click to browse file';
        showPortalToast('Resource published successfully!');
        await fetchAllNotes();

    } catch (err) {
        console.error('Upload error:', err);
        alert('Upload failed: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">check_circle</span> Publish Note`;
    }
}

async function handleSaveEdit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-note-id').value;
    const title = document.getElementById('edit-note-title').value.trim();
    const description = document.getElementById('edit-note-desc').value.trim();
    
    if (!id || !title) return;

    const { error } = await supabase.from('notes').update({ title, description }).eq('id', id);
    if (error) { alert('Update failed: ' + error.message); return; }
    
    closeModal('edit-modal', 'edit-modal-box');
    showPortalToast('Resource updated');
    fetchAllNotes();
}

window.editNote = async function(id) {
    const note = allNotes.find(n => n.id === id);
    if (!note) return;
    
    const idEl = document.getElementById('edit-note-id');
    const titleEl = document.getElementById('edit-note-title');
    const descEl = document.getElementById('edit-note-desc');
    
    if (idEl) idEl.value = id;
    if (titleEl) titleEl.value = note.title;
    if (descEl) descEl.value = note.description || '';
    
    openModal('edit-modal', 'edit-modal-box');
};

async function handleSaveAnnEdit(e) {
    e.preventDefault();
    const id = document.getElementById('edit-ann-id').value;
    const title = document.getElementById('edit-ann-title').value.trim();
    const body = document.getElementById('edit-ann-body').value.trim();
    
    if (!id || !title || !body) return;

    const { error } = await supabase.from('announcements').update({ title, body }).eq('id', id);
    if (error) { alert('Update failed: ' + error.message); return; }
    
    window.closeEditAnnModal();
    showPortalToast('Broadcast updated');
    loadAnnouncements();
}

window.editAnnouncement = function(id) {
    const ann = allAnnouncements.find(a => a.id === id);
    if (!ann) return;
    
    if (ann.author_id !== (currentUser?.id)) {
        alert("Action Denied: You can only edit your own broadcasts.");
        return;
    }
    
    const idEl = document.getElementById('edit-ann-id');
    const titleEl = document.getElementById('edit-ann-title');
    const bodyEl = document.getElementById('edit-ann-body');
    
    if (idEl) idEl.value = id;
    if (titleEl) titleEl.value = ann.title;
    if (bodyEl) bodyEl.value = ann.body;
    
    openModal('edit-ann-modal', 'edit-ann-modal-box');
};

async function forceDownload(url, title) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        const ext = url.split('.').pop().split('?')[0] || 'pdf';
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = `${title}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (e) {
        console.error('Download failed', e);
    }
}

function openModal(mId, bId) { const m = document.getElementById(mId), b = document.getElementById(bId); if (m && b) { m.classList.remove('hidden'); m.classList.add('flex'); setTimeout(() => { b.classList.remove('scale-95', 'opacity-0'); b.classList.add('scale-100', 'opacity-100'); }, 10); } }
function closeModal(mId, bId) { const m = document.getElementById(mId), b = document.getElementById(bId); if (m && b) { b.classList.remove('scale-100', 'opacity-100'); b.classList.add('scale-95', 'opacity-0'); setTimeout(() => { m.classList.remove('flex'); m.classList.add('hidden'); }, 200); } }
window.closeEditAnnModal = () => closeModal('edit-ann-modal', 'edit-ann-modal-box');
function populateSubjectSelect(sem, sId) { const s = document.getElementById(sId); if (!s) return; s.innerHTML = '<option value="">Select Subject</option>'; (academicData[sem] || []).forEach(sub => { const o = document.createElement('option'); o.value = sub.name; o.textContent = `${sub.code} - ${sub.name}`; s.appendChild(o); }); }
function resetFilters() { activeSemester = null; activeSubject = null; document.querySelectorAll('.sem-btn').forEach(b => b.classList.remove('bg-primary', 'text-white', 'border-primary')); const subSec = document.getElementById('subject-section'); if (subSec) subSec.classList.add('hidden'); const clr = document.getElementById('clear-filters'); if (clr) clr.classList.add('hidden'); filterAndDisplay(); }
function showPortalToast(m) { let t = document.getElementById('portal-toast'); if (!t) { t = document.createElement('div'); t.id = 'portal-toast'; t.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#1e293b;color:white;padding:14px 22px;border-radius:14px;font-size:13px;font-weight:700;z-index:9999;box-shadow:0 8px 32px rgba(0,0,0,0.3);transform:translateY(80px);transition:all 0.3s;opacity:0;'; document.body.appendChild(t); } t.textContent = m; t.style.transform = 'translateY(0)'; t.style.opacity = '1'; setTimeout(() => { t.style.transform = 'translateY(80px)'; t.style.opacity = '0'; }, 3000); }

// ── Bulk Sync Logic ───────────────────────────────────────────────────────────
if (document.getElementById('bulk-sync-btn')) {
    document.getElementById('bulk-sync-btn').addEventListener('click', async () => {
        const btn = document.getElementById('bulk-sync-btn');
        const originalContent = btn.innerHTML;
        try {
            btn.disabled = true;
            btn.classList.add('opacity-50');
            const { data: users, error } = await supabase.from('users').select('*');
            if (error) throw error;
            let count = 0;
            const total = users.length;
            for (const user of users) {
              count++;
              btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-[18px]">sync</span><span>Syncing ${count}/${total}...</span>`;
              await syncUserToSheets(user);
            }
            btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">check_circle</span><span>Portal Synced!</span>`;
            setTimeout(() => {
              btn.disabled = false;
              btn.innerHTML = originalContent;
              btn.classList.remove('opacity-50');
            }, 3000);
        } catch (err) {
            console.error('Bulk sync failed:', err);
            btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">error</span><span>Sync Error</span>`;
            setTimeout(() => {
              btn.disabled = false;
              btn.innerHTML = originalContent;
              btn.classList.remove('opacity-50');
            }, 3000);
        }
    });
}

async function syncUserToSheets(user) {
    const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxHY3aG56hYu81KMZASXtxp3Rl15xUNcNLLeLAQ1U0vWUqxHRJoQzvmrXDzqa7ZdiM0Yw/exec';
    
    // Fetch actual analytics from the user_analytics table
    const { data: analytics } = await supabase.from('user_analytics').select('*').eq('user_id', user.id).single();
    const stats = analytics || {};
    
    const payload = {
        email: user.email,
        name: user.name || 'Anonymous',
        registerNumber: user.register_number || '—',
        role: user.role,
        date: new Date(user.created_at).toLocaleString(),
        timeSpent: Math.round((stats.time_spent || 0) / 60000),
        notesRead: stats.notes_viewed || 0,
        assignments: stats.assignments_submitted || 0,
        quizzes: stats.quizzes_started || 0,
        notesAdded: user.role === 'faculty' ? "Yes" : "No",
        subjectsAdded: "—"
    };
    try {
            const formData = new URLSearchParams();
            formData.append('action', 'sync_user');
            formData.append('data', JSON.stringify(payload));

            await fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString()
            });
    } catch (e) {}
}

// ── Live Classes Module ────────────────────────────────────────────────
function initLiveClassesModule() {
    const form = document.getElementById('schedule-class-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('submit-class');
            btn.disabled = true;
            btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Scheduling...`;

            try {
                const title = document.getElementById('class-title').value;
                const desc = document.getElementById('class-desc').value;
                const date = document.getElementById('class-date').value;
                const time = document.getElementById('class-time').value;
                const duration = document.getElementById('class-duration').value;
                const link = document.getElementById('class-meet-link').value;
                const target = document.getElementById('class-target').value;
                const metadataPrefix = `[T:${target}]`;

                const { error } = await supabase.from('online_classes').insert([{
                    faculty_id: currentUser.id,
                    title: title,
                    description: metadataPrefix + desc,
                    class_date: date,
                    class_time: time,
                    duration_minutes: duration,
                    meet_link: link
                }]);

                if (error) throw error;
                
                form.reset();
                window.loadLiveClasses();
            } catch (err) {
                console.error("Error scheduling class:", err);
                alert("Failed to schedule class: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<span class="material-symbols-outlined text-[18px]">add_circle</span> Schedule session`;
            }
        });
    }
}

window.loadLiveClasses = async function() {
    const list = document.getElementById('live-classes-list');
    if (!list) return;
    
    list.innerHTML = `<div class="p-8 text-center text-slate-400">Loading sessions...</div>`;
    
    try {
        const { data, error } = await supabase
            .from('online_classes')
            .select('*')
            .eq('faculty_id', currentUser.id)
            .order('class_date', { ascending: false })
            .order('class_time', { ascending: false });
            
        if (error) throw error;
        
        if (!data || data.length === 0) {
            list.innerHTML = `
                <div class="p-12 text-center flex flex-col items-center justify-center text-slate-400">
                    <span class="material-symbols-outlined text-4xl mb-3 text-slate-200">event_busy</span>
                    <p class="text-sm font-medium">No live classes scheduled.</p>
                </div>`;
            return;
        }
        
        list.innerHTML = data.map(c => `
            <div class="p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div>
                    <h4 class="font-bold text-slate-900 dark:text-white text-lg">${c.title}</h4>
                    <p class="text-slate-500 text-sm mt-1">${c.description || 'No description provided.'}</p>
                    <div class="flex items-center gap-4 mt-3">
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 text-xs font-bold w-fit">
                            <span class="material-symbols-outlined text-[16px]">calendar_month</span>
                            ${new Date(c.class_date).toLocaleDateString()} at ${c.class_time}
                        </span>
                        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 text-xs font-bold w-fit">
                            <span class="material-symbols-outlined text-[16px]">timer</span>
                            ${c.duration_minutes} min
                        </span>
                    </div>
                </div>
                <div class="flex flex-col gap-2 w-full md:w-auto">
                    <a href="${c.meet_link}" target="_blank" class="px-5 py-2.5 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 font-bold rounded-lg text-sm flex items-center justify-center gap-2 transition-all">
                        <span class="material-symbols-outlined text-[18px]">videocam</span> Join Meet
                    </a>
                    <button onclick="deleteLiveClass('${c.id}')" class="px-5 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 font-bold rounded-lg text-sm flex items-center justify-center gap-2 transition-all">
                        Delete
                    </button>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Error loading classes:", err);
        list.innerHTML = `<div class="p-8 text-center text-red-500">Failed to load classes.</div>`;
    }
};

window.deleteLiveClass = async function(id) {
    if (!confirm('Are you sure you want to delete this live class session?')) return;
    try {
        const { error } = await supabase.from('online_classes').delete().eq('id', id);
        if (error) throw error;
        window.loadLiveClasses();
    } catch (err) {
        console.error("Delete failed:", err);
        alert("Failed to delete class: " + err.message);
    }
};

// ============================================================================
// MENTORSHIP OVERSIGHT MODULE
// ============================================================================
async function initMentorshipOversight() {
    loadOversightMentors();
}

async function loadOversightMentors() {
    const list = document.getElementById('oversight-mentor-list');
    if (!list) return;

    try {
        const { data: mentors, error } = await supabase.from('users').select('id, name, email').eq('role', 'mentor');
        if (error) throw error;
        
        if (!mentors || mentors.length === 0) {
            list.innerHTML = `<div class="p-8 text-center text-slate-400 font-medium">No mentors registered.</div>`;
            return;
        }

        list.innerHTML = mentors.map(m => {
            const avatar = window.getAvatarUrl(m.email, 40);
            return `
                <div onclick="viewOversightChat('${m.id}', '${m.name || m.email}')" class="p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer group flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <img src="${avatar}" class="size-10 rounded-full object-cover border-2 border-slate-100 group-hover:border-indigo-500 transition-all">
                        <div>
                            <p class="font-bold text-sm text-slate-800 dark:text-slate-100 group-hover:text-indigo-600">${m.name || m.email.split('@')[0]}</p>
                            <p class="text-[9px] text-slate-400 uppercase tracking-widest font-black">Cohort Leader</p>
                        </div>
                    </div>
                    <span class="material-symbols-outlined text-slate-300 group-hover:text-indigo-500">monitoring</span>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Failed to load mentors:", err);
    }
}

// ── LIVE OVERSIGHT MONITOR ────────────────────────────────────────────────
let oversightBroadcastSub = null;
let oversightDbSub = null;
let activeOversightMentorId = null;
const oversightUsersCache = {};

// Unparliamentary word filter list
// Robust flagged words list for ecosystem maintenance
const FLAG_WORDS = ['abuse','stupid','idiot','fool','hate','kill','damn','crap','shut up','dumb','loser','hell','suck','weirdo','jerk','ass','bastard','wtf','nonsense','garbage','trash','fail','pathetic','nigger','faggot','cunt','bitch','whore','slut','dick','pussy','cock','fuck','shit'];

function flagCheck(text) {
    const lower = text.toLowerCase();
    return FLAG_WORDS.some(w => lower.includes(w));
}

function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function oversightBubble(m) {
    let rawMsg = m.message || '';
    let targetMenteeId = null;
    let conversationCtx = '';

    // Handle DM Prefix
    if (rawMsg.startsWith('DM|')) {
        const parts = rawMsg.split('|');
        targetMenteeId = parts[1];
        rawMsg = parts.slice(2).join('|');
    }

    // Determine target mentee name
    if (targetMenteeId) {
        const menteeName = typeof oversightUsersCache[targetMenteeId] === 'object' ? oversightUsersCache[targetMenteeId].name : (oversightUsersCache[targetMenteeId] || 'Student');
        conversationCtx = `<span class="text-[9px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full ml-auto">To: ${esc(menteeName)}</span>`;
    }

    const isMentor = m.sender_id === m.mentor_id;
    const cacheData = oversightUsersCache[m.sender_id];
    let userData = { name: (isMentor ? 'Mentor' : 'Student'), email: '' };
    
    if (cacheData) {
        if (typeof cacheData === 'string') userData.name = cacheData;
        else userData = cacheData;
    }

    const name = userData.name;
    const isVote = rawMsg.startsWith('SYSTEM_VOTE|');
    const isFlag = flagCheck(rawMsg);
    const ts = m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live';
    const avatar = window.getAvatarUrl(userData.email || '', 32);

    const bg = isMentor 
        ? 'bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-800' 
        : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-800';
    
    if (isVote) {
        const pts = rawMsg.split('|');
        const topic = esc(pts[1]);
        const opt = esc(pts[2]);
        const action = esc(pts[3] || 'voted for');
        return `
            <div class="flex justify-center w-full my-4" data-id="${m.id || ''}">
                <span class="text-[9px] uppercase tracking-widest font-black text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-4 py-1.5 rounded-full border border-slate-100 dark:border-slate-800 text-center max-w-[90%]">
                    ${esc(name)} ${action} "${opt}" in ${topic}
                </span>
            </div>
        `;
    } else if (rawMsg && (rawMsg.includes('SYSTEM_DOUBT_START|') || rawMsg.includes('SYSTEM_DOUBT_END|'))) {
        const parts = rawMsg.split('|');
        const isStart = rawMsg.includes('SYSTEM_DOUBT_START');
        const topic = esc(parts[1] || 'Academic Discussion');
        const sessId = parts[2] ? parts[2].substring(0, 8) : '...';
        
        const cardColor = isStart ? 'border-primary' : 'border-emerald-500';
        const icon = isStart ? 'rocket_launch' : 'task_alt';
        const label = isStart ? 'Discussion Initiated' : 'Doubt Cleared';
        const subtext = isStart ? 'Tracking Sheet Filed' : 'Academic Log Finalized';
        const authorLine = esc(name);

        return `<div class="flex justify-center w-full my-4 msg-bubble-ov" data-id="${m.id || ''}">
            <div class="bg-white dark:bg-slate-900 border-2 ${cardColor} rounded-2xl p-5 shadow-lg max-w-[420px] w-full text-center relative overflow-hidden">
                <div class="absolute top-0 right-0 p-3 opacity-10"><span class="material-symbols-outlined text-4xl">${icon}</span></div>
                <div class="flex items-center justify-center gap-2 mb-2">
                    <span class="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">${label}</span>
                </div>
                <h4 class="text-base font-black text-slate-900 dark:text-white leading-tight">"${topic}"</h4>
                <div class="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                    <div class="text-left leading-tight">
                        <p class="text-[9px] font-black text-slate-300 uppercase tracking-widest">${subtext}</p>
                        <p class="text-[11px] font-black text-primary uppercase tracking-widest mt-0.5">ID: ${sessId}</p>
                    </div>
                    <div class="flex items-center gap-1.5 grayscale opacity-50">
                        <img src="${avatar}" class="size-4 rounded-full">
                        <span class="text-[9px] font-bold text-slate-500">${authorLine} ${isMentor ? '(Mentor)' : '(Mentee)'}</span>
                    </div>
                </div>
            </div>
        </div>`;
    }

    const badge = isMentor ? `<span class="bg-indigo-600 text-white text-[8px] px-1.5 py-0.5 rounded ml-1 uppercase tracking-widest font-black">Mentor</span>` : `<span class="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 text-[8px] px-1.5 py-0.5 rounded ml-1 uppercase tracking-widest font-black">Mentee</span>`;
    const flagBadge = isFlag ? `<span class="bg-red-500 text-white text-[8px] px-2 py-0.5 rounded-full ml-2 uppercase tracking-widest font-black animate-pulse">⚠ Flagged</span>` : '';

    return `
        <div class="flex flex-col items-start w-full mb-6 ${isFlag ? 'animate-pulse' : ''} msg-bubble-ov" data-id="${m.id || ''}">
            <div class="flex items-center gap-2 mb-2 ml-1 w-full">
                <img src="${avatar}" class="size-5 rounded-full object-cover">
                <span class="text-[10px] font-black uppercase tracking-widest ${isMentor ? 'text-indigo-600' : 'text-slate-500'}">${esc(name)}</span>
                ${badge}${flagBadge}
                ${conversationCtx}
                <span class="text-[9px] text-slate-300 font-bold ml-2">${ts}</span>
            </div>
            <div class="px-5 py-3 rounded-[20px] border ${bg} shadow-sm text-sm max-w-[85%] ${isFlag ? 'text-red-700 dark:text-red-400 font-bold border-red-200 bg-red-50/50' : 'text-slate-700 dark:text-slate-200'}">
                ${(() => {
                    let content = esc(rawMsg);
                    if (rawMsg && rawMsg.startsWith('YT_VIDEO|')) {
                        const parts = rawMsg.split('|');
                        const topic = esc(parts[1] || 'Video Resource');
                        const url = parts[2] || '';
                        const vidId = url.includes('v=') ? url.split('v=')[1]?.split('&')[0] : url.split('/').pop();
                        
                        return `
                            <div class="text-[10px] font-black uppercase text-indigo-500 mb-1">Shared Resource</div>
                            <div class="font-bold mb-2">${topic}</div>
                            <div class="rounded-xl overflow-hidden aspect-video bg-black my-2">
                                    <iframe class="w-full h-full" src="https://www.youtube.com/embed/${vidId}" frameborder="0" allowfullscreen></iframe>
                            </div>
                            <a href="${url}" target="_blank" class="text-[10px] text-blue-500 underline uppercase font-bold tracking-widest flex items-center gap-1">
                                <span class="material-symbols-outlined text-[12px]">open_in_new</span> Open on YouTube
                            </a>
                        `;
                    } else if (rawMsg && rawMsg.startsWith('POLL|')) {
                        const parts = rawMsg.split('|');
                        const topic = esc(parts[1] || 'Poll');
                        const options = parts[2] ? parts[2].split(',') : [];
                        return `
                            <div class="text-[10px] font-black uppercase text-indigo-500 mb-1">Live Poll Created</div>
                            <div class="font-bold mb-3">${topic}</div>
                            <div class="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                                ${options.map(o => `
                                    <div class="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 text-[11px] font-medium">
                                        <div class="size-3 rounded-full border border-slate-300"></div>
                                        ${esc(o)}
                                    </div>
                                `).join('')}
                            </div>
                        `;
                    }
                    return content;
                })()}
            </div>
        </div>
    `;
}

window.viewOversightChat = async function(mentorId, mentorName) {
    activeOversightMentorId = mentorId;

    const title = document.getElementById('oversight-chat-title');
    if (title) title.innerHTML = `<span class="material-symbols-outlined text-[20px] text-indigo-500">monitoring</span> ${esc(mentorName)}'s Cohort <span class="ml-2 text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full uppercase tracking-widest border border-indigo-200">● LIVE MONITOR</span>`;

    const box = document.getElementById('oversight-chat-log');
    if (!box) return;
    box.innerHTML = `<div class="text-center text-slate-400 py-8">Connecting to live feed…</div>`;

    // Tear down previous subscriptions
    if (oversightBroadcastSub) { supabase.removeChannel(oversightBroadcastSub); oversightBroadcastSub = null; }
    if (oversightDbSub) { supabase.removeChannel(oversightDbSub); oversightDbSub = null; }

    // Subscribe to Broadcast channel (instant, same channel as mentor+student)
    oversightBroadcastSub = supabase.channel(`chat_broadcast:${mentorId}`, {
        config: { broadcast: { self: false } }
    });
    oversightBroadcastSub
        .on('broadcast', { event: 'new_message' }, ({ payload }) => {
            appendOversightMessage(payload, {});
        })
        .subscribe();

    // Also subscribe via DB changes as a safety net
    oversightDbSub = supabase.channel(`oversight_db:${mentorId}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'cohort_chats',
            filter: `mentor_id=eq.${mentorId}`
        }, ({ new: msg }) => {
            if (box.querySelector(`[data-id="${msg.id}"]`)) return;
            // Try to match a broadcast bubble without an id
            const existing = Array.from(box.querySelectorAll('.msg-bubble-ov')).find(el => !el.getAttribute('data-id') && el.textContent.includes(msg.message));
            if (existing) { existing.setAttribute('data-id', msg.id); return; }
            appendOversightMessage(msg, oversightUsersCache);
        })
        .subscribe();

    // Fetch history
    const { data: messages } = await supabase
        .from('cohort_chats')
        .select('*')
        .eq('mentor_id', mentorId)
        .order('created_at', { ascending: true })
        .limit(300);

    const msgs = messages || [];
    
    // Resolve all sender names and target mentee names (if DM)
    const involvedIds = new Set();
    msgs.forEach(m => {
        involvedIds.add(m.sender_id);
        if (m.message && m.message.startsWith('DM|')) {
            const pid = m.message.split('|')[1];
            if (pid) involvedIds.add(pid);
        }
    });

    if (involvedIds.size > 0) {
        const { data: usersData } = await supabase.from('users').select('id, name, email').in('id', Array.from(involvedIds));
        if (usersData) usersData.forEach(u => oversightUsersCache[u.id] = u);
    }

    if (!msgs.length) {
        box.innerHTML = `<div class="h-full flex items-center justify-center text-slate-400 flex-col gap-2">
            <span class="material-symbols-outlined text-3xl">forum</span>
            <p>No messages in this forum yet.</p>
        </div>`;
        return;
    }

    const flaggedCount = msgs.filter(m => flagCheck(m.message)).length;
    box.innerHTML = '';
    if (flaggedCount > 0) {
        box.insertAdjacentHTML('beforeend', `<div class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2">
            <span class="material-symbols-outlined text-red-500">warning</span>
            <p class="text-sm font-bold text-red-700 dark:text-red-400">${flaggedCount} flagged message${flaggedCount > 1 ? 's' : ''} detected in this forum.</p>
        </div>`);
    }
    msgs.forEach(m => box.insertAdjacentHTML('beforeend', oversightBubble(m, oversightUsersCache)));
    box.scrollTop = box.scrollHeight;
};

async function appendOversightMessage(payload, usersMap) {
    const box = document.getElementById('oversight-chat-log');
    if (!box || activeOversightMentorId !== payload.mentor_id) return;

    const initPlaceholder = box.querySelector('.text-center');
    if (initPlaceholder) initPlaceholder.remove();

    if (!oversightUsersCache[payload.sender_id] && payload.sender_name) {
        oversightUsersCache[payload.sender_id] = payload.sender_name;
    }
    if (!oversightUsersCache[payload.sender_id]) {
        const { data: u } = await supabase.from('users').select('name').eq('id', payload.sender_id).single();
        oversightUsersCache[payload.sender_id] = u?.name || 'Student';
    }

    box.insertAdjacentHTML('beforeend', oversightBubble(payload, oversightUsersCache));
    box.scrollTop = box.scrollHeight;

    // Flash alert for flagged words
    if (flagCheck(payload.message)) {
        const title = document.getElementById('oversight-chat-title');
        if (title) {
            title.classList.add('text-red-600');
            setTimeout(() => title.classList.remove('text-red-600'), 3000);
        }
    }
}

// ─── Exam Portal Logic ───────────────────────────────────────────────────────
async function loadTargetUsers() {
    const audienceSelect = document.getElementById('exam-audience');
    const specificDiv = document.getElementById('specific-audience-config');
    const specificList = document.getElementById('specific-audience-list');
    
    if (!audienceSelect || !specificDiv || !specificList) return;

    audienceSelect.addEventListener('change', async (e) => {
        if (e.target.value === 'specific') {
            specificDiv.classList.remove('hidden');
            specificList.innerHTML = '<div class="col-span-2 sm:col-span-3 text-xs text-slate-400 p-2 italic">Loading learners...</div>';
            
            const { data: users, error } = await supabase.from('users').select('id, name').in('role', ['student']).limit(50);
            if (error || !users || users.length === 0) {
                specificList.innerHTML = '<div class="col-span-2 sm:col-span-3 text-xs text-red-400 p-2 italic">No learners found.</div>';
                return;
            }
            
            specificList.innerHTML = users.map(u => `
                <label class="flex items-center gap-2 text-[10px] font-bold text-slate-700 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-2 rounded-lg cursor-pointer hover:bg-indigo-50 transition-colors">
                    <input type="checkbox" name="examTargetUsers" value="${u.id}" class="rounded text-indigo-600 focus:ring-indigo-500">
                    <span class="truncate">${u.name || 'Anonymous'}</span>
                </label>
            `).join('');
        } else {
            specificDiv.classList.add('hidden');
            specificList.innerHTML = '';
        }
    });
}

function setupExamPortal() {
    loadTargetUsers();
    loadFacultyExams();

    const generateBtn = document.getElementById('generate-mcq-fields-btn');
    const qContainer = document.getElementById('exam-questions-container');
    const submitContainer = document.getElementById('exam-submit-container');
    
    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            const countInput = document.getElementById('exam-mcq-count');
            const count = parseInt(countInput.value, 10);
            
            if (isNaN(count) || count < 1 || count > 100) {
                alert("Please enter a valid number of questions (1-100).");
                return;
            }
            
            qContainer.innerHTML = '';
            for (let i = 1; i <= count; i++) {
                qContainer.insertAdjacentHTML('beforeend', `
                    <div class="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 p-5 rounded-2xl space-y-4 mcq-question-block" data-qindex="${i}">
                        <div class="flex justify-between items-center">
                            <h4 class="text-xs font-black text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">Question ${i}</h4>
                            <div class="flex items-center gap-2">
                                <label class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Marks</label>
                                <input type="number" min="1" value="1" class="w-16 px-2 py-1 rounded bg-white border border-indigo-200 text-xs font-bold text-center mcq-marks">
                            </div>
                        </div>
                        <textarea rows="2" class="w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none resize-none mcq-text" placeholder="Enter question ${i} here..." required></textarea>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2 pr-4 pl-4">
                             <!-- Options -->
                             <label class="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 hover:border-indigo-400 transition-colors cursor-pointer">
                                 <input type="radio" name="mcq-ans-${i}" value="0" required class="text-indigo-600 focus:ring-indigo-500 mcq-correct">
                                 <input type="text" class="flex-1 text-sm outline-none bg-transparent mcq-opt" placeholder="Option A" required>
                             </label>
                             <label class="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 hover:border-indigo-400 transition-colors cursor-pointer">
                                 <input type="radio" name="mcq-ans-${i}" value="1" required class="text-indigo-600 focus:ring-indigo-500 mcq-correct">
                                 <input type="text" class="flex-1 text-sm outline-none bg-transparent mcq-opt" placeholder="Option B" required>
                             </label>
                             <label class="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 hover:border-indigo-400 transition-colors cursor-pointer">
                                 <input type="radio" name="mcq-ans-${i}" value="2" required class="text-indigo-600 focus:ring-indigo-500 mcq-correct">
                                 <input type="text" class="flex-1 text-sm outline-none bg-transparent mcq-opt" placeholder="Option C" required>
                             </label>
                             <label class="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-200 hover:border-indigo-400 transition-colors cursor-pointer">
                                 <input type="radio" name="mcq-ans-${i}" value="3" required class="text-indigo-600 focus:ring-indigo-500 mcq-correct">
                                 <input type="text" class="flex-1 text-sm outline-none bg-transparent mcq-opt" placeholder="Option D" required>
                             </label>
                        </div>
                        <p class="text-[9px] text-indigo-400 uppercase font-bold tracking-widest text-right mt-1">*Select radio to mark correct answer</p>
                    </div>
                `);
            }
            qContainer.classList.remove('hidden');
            submitContainer.classList.remove('hidden');
        });
    }

    const form = document.getElementById('build-exam-form');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('exam-submit-btn');
            btn.disabled = true;
            btn.innerHTML = 'Connecting to Mainframe...';

            try {
                // Collect Base Info
                const title = document.getElementById('exam-title').value.trim();
                const subject = document.getElementById('exam-subject').value.trim();
                const duration = parseInt(document.getElementById('exam-duration').value, 10);
                const deadlineVal = document.getElementById('exam-deadline').value;
                if (!deadlineVal) throw new Error("Please specify the Active Window Deadline");
                const dateObj = new Date(deadlineVal);
                const dateStr = dateObj.toISOString().split('T')[0];
                const audience = document.getElementById('exam-audience').value;
                const instructions = document.getElementById('exam-instructions').value.trim();

                // Collect Audience
                let targetUserIds = [];
                if (audience === 'specific') {
                    const checks = document.querySelectorAll('input[name="examTargetUsers"]:checked');
                    targetUserIds = Array.from(checks).map(c => c.value);
                    if (targetUserIds.length === 0) {
                        throw new Error("Target selected as specific, but no candidates selected.");
                    }
                }

                // Collect Questions
                const blocks = document.querySelectorAll('.mcq-question-block');
                const questions = [];
                let totalMarks = 0;

                blocks.forEach((b, idx) => {
                    const text = b.querySelector('.mcq-text').value.trim();
                    const marks = parseInt(b.querySelector('.mcq-marks').value, 10) || 1;
                    const optInputs = b.querySelectorAll('.mcq-opt');
                    const options = Array.from(optInputs).map(opt => opt.value.trim());
                    
                    const correctRadio = b.querySelector('.mcq-correct:checked');
                    if (!correctRadio) {
                        throw new Error(`You must select the correct option for Question ${idx + 1}`);
                    }
                    const answerIndex = parseInt(correctRadio.value, 10);

                    questions.push({
                        id: `q${idx + 1}`,
                        text: text,
                        options: options,
                        answer: answerIndex,
                        marks: marks
                    });
                    totalMarks += marks;
                });

                if (questions.length === 0) throw new Error("Please generate question fields first.");

                const releaseMode = document.getElementById('exam-release-mode').value;

                const payload = {
                    faculty_id: currentUser.id,
                    faculty_name: currentUser.user_metadata?.name || currentUser.email,
                    title: title,
                    description: JSON.stringify({ release_mode: releaseMode, deadline_at: deadlineVal }),
                    subject: subject,
                    exam_date: dateStr,
                    duration_minutes: duration,
                    instructions: instructions,
                    target_audience: audience,
                    target_user_ids: targetUserIds,
                    questions: questions,
                    total_marks: totalMarks
                };

                const { error } = await supabase.from('exams').insert([payload]);
                if (error) throw error;

                alert('Exam Protocol Deployed Successfully.');
                form.reset();
                qContainer.classList.add('hidden');
                submitContainer.classList.add('hidden');
                document.getElementById('specific-audience-config').classList.add('hidden');
                
                loadFacultyExams();

            } catch (err) {
                console.error("Exam Creation Error:", err);
                alert(err.message);
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<span class="material-symbols-outlined text-[20px]">cloud_upload</span> Deploy Exam Protocol`;
            }
        });
    }
}

window.publishExamResults = async function(examId) {
    if (!confirm("Are you sure you want to publish the results for this exam? Students will be notified immediately.")) return;
    try {
        // 1. Fetch exam
        const { data: exam, error } = await supabase.from('exams').select('*').eq('id', examId).single();
        if (error) throw error;
        
        let desc = {};
        if (exam.description) {
            try { desc = JSON.parse(exam.description); } catch(e){}
        }
        desc.release_mode = 'published';
        
        // 2. Update exam description to 'published'
        await supabase.from('exams').update({ description: JSON.stringify(desc) }).eq('id', examId);
        
        // 3. Update all exam_attempts from 'submitted' to 'evaluated'
        await supabase.from('exam_attempts').update({ status: 'evaluated' }).eq('exam_id', examId).eq('status', 'submitted');
        
        // 4. Send Announcement targeting all students
        function extractUserIds(audience, userIds) {
            if (audience === 'specific' && Array.isArray(userIds)) return userIds;
            return []; // all_slow_learners will just be an announcement
        }
        
        const announcePayload = {
            title: `Assessment Results Published: ${exam.title}`,
            content: `The results for "${exam.title}" (${exam.subject}) have been evaluated and published. Check your Assessment Hub to view your score.`,
            faculty_id: currentUser.id,
            faculty_name: currentUser.user_metadata?.name || currentUser.email,
            target_audience: exam.target_audience === 'specific' ? 'specific' : 'all_students',
            target_user_ids: extractUserIds(exam.target_audience, exam.target_user_ids)
        };
        await supabase.from('announcements').insert([announcePayload]);
        
        alert("Results published successfully and students notified.");
        loadFacultyExams();
    } catch(err) {
        alert("Failed to publish: " + err.message);
    }
}

async function loadFacultyExams() {
    const list = document.getElementById('faculty-exams-list');
    if (!list) return;
    
    if (!currentUser) return; // Prevent crash on load before init

    const { data: exams, error } = await supabase
        .from('exams')
        .select('*, exam_attempts(count)')
        .eq('faculty_id', currentUser.id)
        .order('created_at', { ascending: false });

    if (error || !exams || exams.length === 0) {
        list.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400 italic">No exams deployed yet.</td></tr>`;
        return;
    }

    list.innerHTML = exams.map(e => {
        let submissionCount = 0;
        if (e.exam_attempts && e.exam_attempts.length > 0) {
            submissionCount = e.exam_attempts[0].count || 0;
        }
        
        let desc = {};
        if (e.description) {
            try { desc = JSON.parse(e.description); } catch(err){}
        }
        
        let actionsHtml = `<span class="text-[10px] uppercase text-slate-400 font-bold tracking-widest block mt-1">Status: Active</span>`;
        if (desc.release_mode === 'manual') {
            actionsHtml = `<button onclick="publishExamResults('${e.id}')" class="mt-2 px-3 py-1 bg-green-500 hover:bg-green-600 text-white rounded text-[10px] uppercase font-black tracking-widest shadow shadow-green-200">Evaluate & Publish</button>`;
        } else if (desc.release_mode === 'published') {
            actionsHtml = `<span class="text-[10px] uppercase text-green-500 font-black tracking-widest block mt-1"><span class="material-symbols-outlined text-[12px] align-middle">done_all</span> Published</span>`;
        }

        return `
        <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <td class="px-4 py-4">
                <p class="font-bold text-slate-800 dark:text-slate-200">${e.title}</p>
                <p class="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">${(e.target_audience || 'unknown').replace(/_/g, ' ')}</p>
            </td>
            <td class="px-4 py-4 text-slate-600 dark:text-slate-300 font-medium">${e.subject}</td>
            <td class="px-4 py-4">
                <span class="inline-flex items-center gap-1 text-xs font-bold bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full"><span class="material-symbols-outlined text-[14px]">timer</span> ${e.duration_minutes}m</span>
                <span class="inline-flex items-center gap-1 text-xs font-bold bg-amber-50 text-amber-600 px-2.5 py-1 rounded-full ml-1"><span class="material-symbols-outlined text-[14px]">checklist</span> ${e.total_marks}pts</span>
            </td>
            <td class="px-4 py-4 flex flex-col gap-2 items-start">
                <div>
                    <span class="text-sm font-black text-slate-700 dark:text-slate-200">${submissionCount}</span> <span class="text-[10px] uppercase text-slate-400 font-bold tracking-widest">Done</span>
                </div>
                <div class="flex items-center gap-2">
                    ${actionsHtml}
                    <button id="btn-analyze-${e.id}" onclick="window.dispatchEvent(new CustomEvent('AnalyzeExam', { detail: '${e.id}' }))" class="px-3 py-1 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded text-[10px] uppercase font-black tracking-widest transition-colors flex items-center gap-1 shadow-sm">
                        <span class="material-symbols-outlined text-[14px]">analytics</span> Analyze
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
    
    // Auto-Trigger Global Assessment Metrics
    window.dispatchEvent(new Event('RunGlobalAnalytics'));
}

setupExamPortal();

// DOUBT INTERACTION LOGS Logic
async function initDoubtLogs() {
    loadInteractions();
    setupDetailModal();
}

function setupDetailModal() {
    const modal = document.getElementById('interaction-detail-modal');
    const closeBtn = document.getElementById('close-detail-modal');
    if (closeBtn) closeBtn.onclick = () => modal.classList.add('hidden');
}

async function loadInteractions() {
    const list = document.getElementById('interactions-list');
    if (!list) return;

    try {
        const { data: logs, error } = await supabase
            .from('mentorship_doubt_sessions')
            .select(`
                *,
                mentee:student_id (*),
                mentor:mentor_id (*)
            `)
            .order('created_at', { ascending: false });

        if (logs) {
            const total = logs.length;
            const completed = logs.filter(l => l.mentee_status === 'completed').length;
            const pending = total - completed;

            const tEl = document.getElementById('total-verified-logs');
            const cEl = document.getElementById('fully-verified-logs');
            const pEl = document.getElementById('pending-verified-logs');

            if (tEl) tEl.innerText = total;
            if (cEl) cEl.innerText = completed;
            if (pEl) pEl.innerText = pending;
        }

        list.innerHTML = logs.map(log => {
            const mentee = log.mentee || { name: 'Unknown Student', email: '' };
            const mentor = log.mentor || { name: 'Unknown Mentor', email: '' };
            
            const isCompleted = log.mentee_status === 'completed';
            const statusClass = isCompleted ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-amber-50 text-amber-600 border-amber-100';
            const statusLabel = isCompleted ? 'Fully Verified' : 'Under Service';
            const date = new Date(log.mentee_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

            return `
                <tr class="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-all font-display border-b border-slate-50 dark:border-slate-800">
                    <td class="px-8 py-8">
                        <div class="flex items-center gap-5">
                            <div class="size-14 rounded-[22px] bg-indigo-600 flex items-center justify-center font-black text-white shadow-lg shadow-indigo-100 dark:shadow-none">${(mentee.name || 'S').charAt(0)}</div>
                            <div class="flex flex-col">
                                <span class="text-[15px] font-black text-slate-900 dark:text-white leading-tight">${mentee.name}</span>
                                <div class="flex items-center gap-2 mt-1">
                                    <span class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">${mentee.register_number || 'No Reg No.'}</span>
                                    <span class="size-1 bg-slate-200 rounded-full"></span>
                                    <span class="text-[10px] text-slate-400 font-bold">${mentee.branch || 'General'}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="px-8 py-8">
                        <div class="flex items-center gap-5">
                            <div class="size-14 rounded-[22px] bg-emerald-500 flex items-center justify-center font-black text-white shadow-lg shadow-emerald-100 dark:shadow-none">${(mentor.name || 'M').charAt(0)}</div>
                            <div class="flex flex-col">
                                <span class="text-[15px] font-black text-slate-900 dark:text-white leading-tight">${mentor.name}</span>
                                <div class="flex items-center gap-2 mt-1">
                                    <span class="text-[10px] font-black text-emerald-500 uppercase tracking-widest">${mentor.register_number || 'No Reg No.'}</span>
                                    <span class="size-1 bg-slate-200 rounded-full"></span>
                                    <span class="text-[10px] text-slate-400 font-bold">${mentor.branch || 'General'}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="px-8 py-8 text-center">
                        <div class="flex flex-col items-center gap-2">
                             <div class="inline-flex items-center gap-2">
                                <div class="size-2.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)] animate-pulse"></div>
                                <div class="h-0.5 w-10 bg-slate-200 dark:bg-slate-700 rounded-full"></div>
                                <div class="size-2.5 rounded-full ${isCompleted ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.6)]' : 'bg-slate-300'}"></div>
                            </div>
                            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mt-1">${date}</p>
                        </div>
                    </td>
                    <td class="px-8 py-8 text-center">
                         <span class="inline-flex items-center px-4 py-1.5 rounded-full border ${statusClass} text-[10px] font-black uppercase tracking-tight shadow-sm whitespace-nowrap min-w-[120px] justify-center">${statusLabel}</span>
                    </td>
                    <td class="px-8 py-8 text-center">
                        <button onclick="triggerAuditDetail('${log.id}')" class="px-6 py-3 bg-slate-900 text-white dark:bg-indigo-600 hover:bg-white hover:text-slate-900 dark:hover:bg-indigo-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95 shadow-xl">Verify Details</button>
                    </td>
                </tr>
            `;
        }).join('');



    } catch (err) {
        console.error("Load interactions error:", err);
    }
}




// ─── AUDIT CONTROLLER (REBUILT) ───────────────────────────────────────────
window.triggerAuditDetail = async function(id) {
    console.log("--- HUB SIGNAL RECEIVED: ID " + id + " ---");
    
    try {
        const modal = document.getElementById('interaction-detail-modal');
        const container = document.getElementById('detail-modal-content');
        
        if (!modal || !container) {
            alert("UI Element Crash: interaction-detail-modal not found.");
            return;
        }

        // Show loading state
        container.innerHTML = `<div class="py-20 text-center"><div class="size-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div><p class="text-[11px] font-black text-slate-400 uppercase tracking-widest">Retrieving Full Academic Audit...</p></div>`;
        modal.style.setProperty('display', 'flex', 'important');

        const { data: log, error } = await supabase
            .from('mentorship_doubt_sessions')
            .select('*, mentee:student_id(*), mentor:mentor_id(*)')
            .eq('id', id)
            .single();
        
        if (error) {
            modal.style.setProperty('display', 'none', 'important');
            throw error;
        }

        if (!log) {
            modal.style.setProperty('display', 'none', 'important');
            return alert("Data consistency error: Record missing in database.");
        }


        const mentee = log.mentee || {};
        const mentor = log.mentor || {};

        // Combined Helper for Rendering Labels
        const field = (label, value) => `
            <div class="space-y-1">
                <p class="text-[9px] font-black text-slate-400 uppercase tracking-widest">${label}</p>
                <p class="text-xs font-bold text-slate-900 dark:text-white">${value || '—'}</p>
            </div>
        `;

        container.innerHTML = `
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
                <!-- ── Mentee (Student) Audit ── -->
                <div class="flex flex-col gap-6">
                    <div class="bg-indigo-50/40 dark:bg-slate-800/40 p-8 rounded-[40px] border border-indigo-100/50 dark:border-slate-800 flex-1">
                        <div class="flex items-center gap-5 mb-8">
                             <div class="size-16 rounded-3xl bg-indigo-600 flex items-center justify-center font-black text-white text-3xl shadow-xl shadow-indigo-100 dark:shadow-none">${(mentee.name || 'S').charAt(0)}</div>
                             <div class="flex-1">
                                <h4 class="text-2xl font-black text-slate-900 dark:text-white leading-tight">${mentee.name || 'Resident Student'}</h4>
                                <p class="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">${mentee.email || ''}</p>
                             </div>
                        </div>

                        <!-- Mentee Profile Grid -->
                        <div class="grid grid-cols-2 gap-x-6 gap-y-4 mb-8 pt-6 border-t border-indigo-100 dark:border-indigo-900/30">
                            ${field('Register Number', mentee.register_number || log.mentee_reg_no)}
                            ${field('Student Email', mentee.email || log.mentee_email)}
                            ${field('Branch / Class', mentee.branch || log.mentee_branch)}
                            ${field('Year / Sec', `${mentee.year || log.mentee_year || '—'} / ${mentee.section || log.mentee_section || '—'}`)}
                            ${field('Assigned Advisor', mentee.faculty_advisor || mentee.assigned_faculty || log.mentee_faculty_advisor)}
                        </div>

                        <!-- Mentee Session Audit -->
                        <div class="grid grid-cols-2 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-indigo-50 dark:border-slate-800 gap-x-6 gap-y-6 mb-8">
                            ${field('Submission Date', log.mentee_date)}
                            ${field('Mode of Help', `<span class="capitalize">${log.mentee_mode || 'N/A'}</span>`)}
                            ${field('Session Duration', log.mentee_duration)}
                            ${field('Next Planned Follow-up', log.mentee_next_date)}
                        </div>

                        <div class="space-y-6">
                            <div class="bg-indigo-600/5 p-6 rounded-3xl border border-indigo-100 dark:border-indigo-900/30">
                                <p class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-2">Student's Requirement Overview</p>
                                <p class="text-sm italic font-medium text-slate-700 dark:text-slate-300 leading-relaxed italic">"${log.mentee_needs || 'Gap identified during session.'}"</p>
                            </div>
                            <div class="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800">
                                 <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Support Activities Provided</p>
                                 <p class="text-sm font-black text-slate-900 dark:text-white uppercase">${log.mentee_support_requested || 'Not specified'}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- ── Mentor (Auditor) Audit ── -->
                <div class="flex flex-col gap-6">
                    <div class="bg-emerald-50/40 dark:bg-slate-800/40 p-8 rounded-[40px] border border-emerald-100/50 dark:border-slate-800 flex-1">
                        <div class="flex items-center gap-5 mb-8">
                             <div class="size-16 rounded-3xl bg-emerald-500 flex items-center justify-center font-black text-white text-3xl shadow-xl shadow-emerald-100 dark:shadow-none">${(mentor.name || 'M').charAt(0)}</div>
                             <div class="flex-1">
                                <h4 class="text-2xl font-black text-slate-900 dark:text-white leading-tight">${mentor.name || 'Peer Mentor'}</h4>
                                <p class="text-[10px] font-black text-emerald-500 uppercase tracking-widest mt-1">${mentor.email || log.mentor_email || ''}</p>
                             </div>
                        </div>

                        <!-- Mentor Profile Grid -->
                        <div class="grid grid-cols-2 gap-x-6 gap-y-4 mb-8 pt-6 border-t border-emerald-100 dark:border-emerald-900/30">
                            ${field('Register Number', mentor.register_number || log.mentor_reg_no)}
                            ${field('Mentor Email', mentor.email || log.mentor_email)}
                            ${field('Mentor Branch', mentor.branch || log.mentor_branch)}
                            ${field('Year / Sec', `${mentor.year || log.mentor_year || '—'} / ${mentor.section || log.mentor_section || '—'}`)}
                            ${field('Overseeing Advisor', mentor.faculty_advisor || mentor.assigned_faculty || log.mentor_faculty_advisor)}
                        </div>

                        ${log.mentee_status === 'completed' ? `
                            <!-- Mentor Session Audit -->
                            <div class="grid grid-cols-2 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-emerald-50 dark:border-slate-800 gap-x-6 gap-y-6 mb-8">
                                ${field('Verification Date', log.mentor_date)}
                                ${field('Verification Mode', `<span class="capitalize">${log.mentor_mode || 'N/A'}</span>`)}
                                ${field('Validated Duration', log.mentor_duration)}
                                ${field('Final Review Date', log.mentor_next_plan_date)}
                            </div>

                            <div class="space-y-6">
                                <div class="bg-emerald-500/5 p-6 rounded-3xl border border-emerald-100 dark:border-emerald-900/30">
                                    <p class="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-2">Mentor's Audit Remarks</p>
                                    <p class="text-sm font-medium text-slate-800 dark:text-slate-200 leading-relaxed">${log.mentor_needs_addressed || 'Verification finalized without additional notes.'}</p>
                                </div>
                                <div class="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800">
                                     <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Final Conclusion Provided</p>
                                     <p class="text-sm font-black text-slate-900 dark:text-white uppercase">${log.mentor_support_provided || 'Audit Task Completed'}</p>
                                </div>
                            </div>
                        ` : `
                            <div class="h-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-emerald-200 dark:border-emerald-900 rounded-[40px] bg-white/50 dark:bg-slate-900/50">
                                <span class="material-symbols-outlined text-6xl text-emerald-200 animate-pulse">pending_actions</span>
                                <div class="text-center mt-6">
                                    <p class="text-xs font-black text-emerald-600 uppercase tracking-[0.2em]">Verification In Progress</p>
                                    <p class="text-[10px] font-bold text-slate-400 mt-2 max-w-[200px] mx-auto leading-relaxed">The peer mentor has not yet finalized the academic tracking logs for this session.</p>
                                </div>
                            </div>
                        `}
                    </div>
                </div>
            </div>
        `;
        
        console.log("--- HUB RENDERED SUCCESSFULLY ---");
    } catch (err) {
        console.error("AUDIT ERROR:", err);
        alert("CRITICAL SYSTEM ERROR: " + err.message);
    }
};

init();


// ── CHAT TO GOOGLE SHEET SYNC (Fail-safe Form Method) ─────────────────────
window.syncChatsToGoogleSheet = async function() {
    const btn = document.getElementById('sync-chats-btn');
    if (!btn) return;
    const originalHTML = btn.innerHTML;
    
    try {
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-xl">sync</span> Extracting Logs...`;

        // 1. Fetch Core Data from Supabase
        const { data: chats, error: chatError } = await supabase.from('cohort_chats').select('*').order('created_at', { ascending: true });
        const { data: users, error: userError } = await supabase.from('users').select('id, name, role');
        
        if (chatError || userError) throw new Error("Supabase connection failed. Please check your network.");

        const usersMap = {};
        users.forEach(u => usersMap[u.id] = u);

        // 2. Filter & Map (Incremental Sync Logic)
        const lastSyncId = localStorage.getItem('last_synced_chat_id');
        const newChats = lastSyncId 
            ? (chats || []).filter(c => c.id > parseInt(lastSyncId)) 
            : (chats || []);

        if (newChats.length === 0) {
            alert("Digital archive is up-to-date! No new messages detected since the last synchronization.");
            btn.innerHTML = originalHTML; btn.disabled = false;
            return;
        }

        const payload = newChats.map(c => {
            const sender = usersMap[c.sender_id] || { name: 'Unknown', role: 'user' };
            const mentor = usersMap[c.mentor_id] || { name: 'Cohort Group', role: 'mentor' };
            return {
                from_name: sender.name,
                from_role: sender.role,
                date: new Date(c.created_at).toLocaleString(),
                to_name: mentor.name,
                to_role: 'mentor',
                message: c.message
            };
        });

        btn.innerHTML = `<span class="material-symbols-outlined animate-spin text-xl">sync</span> Bypassing security...`;

        // 3. Invisible Form Submission (Absolute Reliable Bridge for Google Apps Script)
        const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxm5-urPRsVdxMTf6qUxyh5zM3FWsQ4s_CvSyZzm6mkhl_BmukmqwVL5BZxrNJ0lATK/exec';
        
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.name = 'sync_chat_iframe';
        document.body.appendChild(iframe);

        const form = document.createElement('form');
        form.target = 'sync_chat_iframe';
        form.action = GOOGLE_SCRIPT_URL;
        form.method = 'POST';

        const actionInput = document.createElement('input');
        actionInput.name = 'action';
        actionInput.value = 'sync_chats';
        form.appendChild(actionInput);

        const dataInput = document.createElement('input');
        dataInput.name = 'data';
        dataInput.value = JSON.stringify(payload);
        form.appendChild(dataInput);

        document.body.appendChild(form);
        form.submit();

        // Cleanup & Success State
        setTimeout(() => {
            // Update the sync pointer ONLY after successful submission
            const maxId = Math.max(...newChats.map(c => c.id));
            localStorage.setItem('last_synced_chat_id', maxId);

            document.body.removeChild(form);
            document.body.removeChild(iframe);
            btn.innerHTML = `<span class="material-symbols-outlined text-xl">done_all</span> ${payload.length} New Logs!`;
            
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }, 3000);
        }, 2500);
        
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
        }, 3000);

    } catch (err) {
        console.error("Critical Sync Breakdown:", err);
        alert("Peer Log Sync Error: " + err.message);
        btn.innerHTML = originalHTML;
        btn.disabled = false;
    }
};
