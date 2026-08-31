import { supabase } from '/assets/js/supabase-client.js';

let currentUser = null;
let broadcastChannel = null;
let dbChannel = null;
let activeMenteeId = null;
let allChatHistory = [];
const usersCache = {};

async function init() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    currentUser = session.user;

    const { data: profile } = await supabase.from('users').select('*').eq('id', currentUser.id).single();
    if (!profile || profile.role !== 'mentor') {
        window.location.href = '/index.html';
        return;
    }

    const nameEl = document.getElementById('mentor-name-display');
    const avEl = document.getElementById('mentor-avatar');
    if (nameEl) nameEl.textContent = profile.name || currentUser.email.split('@')[0];
    if (avEl) {
        avEl.innerHTML = `<img src="${window.getAvatarUrl(currentUser.email, 64)}" class="size-full rounded-2xl object-cover" alt="Profile">`;
        avEl.innerText = ''; // Clear fallback text if any
    }

    usersCache[currentUser.id] = { name: profile.name || currentUser.email.split('@')[0], email: currentUser.email };

    setupTabs();
    setupChat();
    setupDoubtCompletion();
    initMentorLiveClasses();
    
    // Read from URL query param to allow external pages to route into specific tabs
    // Default to 'overview' (now labeled Dashboard) on initial load or refresh
    const params = new URLSearchParams(window.location.search);
    const initialTab = params.get('tab') || 'overview';
    switchTab(initialTab);
    
    pollPendingRequests();
    loadGlobalAnnouncements();
    initOverviewDashboard();
    loadFacultySessionsForMentors();

    // Hide the loader once ready
    const loader = document.getElementById('page-loader');
    if (loader) {
        loader.classList.add('opacity-0');
        setTimeout(() => loader.remove(), 300);
    }
}

window.loadGlobalAnnouncements = loadGlobalAnnouncements;

function setupTabs() {
    document.querySelectorAll('.nav-tab').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            switchTab(btn.getAttribute('data-tab'));
        });
    });
}

// Global variable to hold the refresh interval
let menteeRefreshInterval = null;

async function switchTab(tabName) {
    console.log("Switching to tab:", tabName);
    document.querySelectorAll('.tab-content').forEach(c => { c.classList.add('hidden'); c.classList.remove('block'); });
    document.querySelectorAll('.nav-tab').forEach(b => {
        const m = b.getAttribute('data-tab') === tabName;
        b.classList.toggle('bg-indigo-50', m);
        b.classList.toggle('text-indigo-700', m);
        b.classList.toggle('dark:bg-indigo-900/20', m);
        b.classList.toggle('dark:text-indigo-400', m);
        b.classList.toggle('font-bold', m);
        b.classList.toggle('text-slate-600', !m);
        b.classList.toggle('font-semibold', !m);
        b.classList.toggle('hover:bg-slate-50', !m);
    });
    const target = document.getElementById('tab-' + tabName);
    if (target) { target.classList.remove('hidden'); target.classList.add('block'); }
    
    // Clear any existing intervals to prevent memory leaks or multiple loops
    if (menteeRefreshInterval) {
        clearInterval(menteeRefreshInterval);
        menteeRefreshInterval = null;
    }

    if (tabName === 'overview') {
        initOverviewDashboard();
    }

    if (tabName === 'dashboard') {
        loadMentees();
        // Start a real-time refresh every 15 seconds while on dashboard
        menteeRefreshInterval = setInterval(loadMentees, 15000);
    }
    if (tabName === 'requests') loadRequests();
    if (tabName === 'chat') loadChat();
    if (tabName === 'announcements') loadAnnouncements();
    if (tabName === 'live-classes') loadMentorLiveClasses();
}
window.switchTab = switchTab;

async function loadMentees() {
    const grid = document.getElementById('active-mentees-grid');
    if (!grid) return;
    grid.innerHTML = `<div class="col-span-full py-12 text-center text-slate-400 italic">Syncing mentees...</div>`;

    try {
        const { data: requests, error } = await supabase
            .from('mentorship_requests')
            .select('mentee_id')
            .eq('mentor_id', currentUser.id)
            .eq('status', 'accepted');

        if (error) throw error;

        if (!requests || requests.length === 0) {
            grid.innerHTML = `<div class="col-span-full p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl">
                <span class="material-symbols-outlined text-4xl text-slate-300">sentiment_dissatisfied</span>
                <h3 class="text-slate-500 font-bold mt-2">No active mentees yet</h3>
                <p class="text-xs text-slate-400 mt-1">Accept incoming requests to start guiding peers.</p>
            </div>`;
            return;
        }

        const menteeIds = requests.map(r => r.mentee_id);
        const [{ data: usersData }, { data: analyticsData }] = await Promise.all([
            supabase.from('users').select('id, name, email, section, year, faculty_advisor').in('id', menteeIds),
            supabase.from('user_analytics').select('user_id, time_spent, notes_viewed').in('user_id', menteeIds)
        ]);

        const analyticsMap = {};
        if (analyticsData) analyticsData.forEach(a => analyticsMap[a.user_id] = a);

        grid.innerHTML = (usersData || []).map(u => {
            const stats = analyticsMap[u.id] || { time_spent: 0, notes_viewed: 0 };
            const timeMins = stats.time_spent || 0;
            const avatar = window.getAvatarUrl(u.email, 64);
            
            // Update cache for modal use
            usersCache[u.id] = { ...u };

            return `<div onclick="showMenteeDetails('${u.id}')" class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[32px] p-6 shadow-sm hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all duration-300 group border-l-8 border-l-indigo-600 cursor-pointer">
                <div class="flex items-center gap-4 mb-6">
                    <img src="${avatar}" class="size-16 rounded-2xl object-cover bg-slate-100 dark:bg-slate-800 border-2 border-slate-50 group-hover:rotate-6 transition-transform">
                    <div class="flex-1 min-w-0">
                        <p class="font-black text-slate-800 dark:text-slate-100 truncate text-lg tracking-tight">${u.name}</p>
                        <p class="text-[9px] font-black uppercase tracking-widest text-indigo-500 mt-1">Active Peer Student</p>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-3">
                    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-center border border-slate-100 dark:border-slate-800">
                        <span class="material-symbols-outlined text-indigo-600 text-[18px] mb-1">timer</span>
                        <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Active Time</p>
                        <p class="text-sm font-black text-slate-800 dark:text-slate-200">${timeMins} min</p>
                    </div>
                    <div class="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-center border border-slate-100 dark:border-slate-800">
                        <span class="material-symbols-outlined text-indigo-600 text-[18px] mb-1">menu_book</span>
                        <p class="text-[8px] font-black text-slate-400 uppercase tracking-widest">Notes Read</p>
                        <p class="text-sm font-black text-slate-800 dark:text-slate-200">${stats.notes_viewed || 0}</p>
                    </div>
                </div>
            </div>`;
        }).join('');

    } catch (err) {
        console.error("Load mentees failed:", err);
    }
}

window.showMenteeDetails = function(userId) {
    const u = usersCache[userId];
    if (!u) return;

    document.getElementById('modal-mentee-name').textContent = u.name;
    document.getElementById('modal-mentee-email').textContent = u.email;
    document.getElementById('modal-mentee-class').textContent = u.section || 'Not Set';
    document.getElementById('modal-mentee-year').textContent = `Year ${u.year || '0'}`;
    document.getElementById('modal-mentee-advisor').textContent = u.faculty_advisor || 'Not Assigned';
    document.getElementById('modal-mentee-avatar').src = window.getAvatarUrl(u.email, 128);

    document.getElementById('mentee-details-modal').classList.remove('hidden');
};

async function loadRequests() {
    const list = document.getElementById('requests-list');
    list.innerHTML = `<div class="p-12 text-center text-slate-400">Loading requests...</div>`;

    try {
        const { data: requests, error } = await supabase
            .from('mentorship_requests')
            .select('id, mentee_id, created_at')
            .eq('mentor_id', currentUser.id)
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!requests || requests.length === 0) {
            list.innerHTML = `<div class="p-12 text-center text-slate-400 font-medium">No pending requests right now.</div>`;
            return;
        }

        const menteeIds = requests.map(r => r.mentee_id);
        const { data: usersData } = await supabase.from('users').select('id, name, email').in('id', menteeIds);
        const usersMap = {};
        if (usersData) usersData.forEach(u => usersMap[u.id] = u);

        list.innerHTML = requests.map(r => {
            const u = usersMap[r.mentee_id];
            if (!u) return '';
            return `<div class="flex items-center justify-between p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <div class="flex items-center gap-4">
                    <img src="${window.getAvatarUrl(u.email, 48)}" class="size-12 rounded-full object-cover bg-slate-100">
                    <div>
                        <h4 class="font-bold text-slate-900 dark:text-white">${u.name || u.email.split('@')[0]}</h4>
                        <p class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Requested ${new Date(r.created_at).toLocaleDateString()}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <button onclick="handleRequest('${r.id}', 'accepted')" class="size-10 bg-green-50 text-green-600 hover:bg-green-500 hover:text-white rounded-xl shadow-sm transition-all flex items-center justify-center border border-green-200 hover:border-green-500">
                        <span class="material-symbols-outlined">check</span>
                    </button>
                    <button onclick="handleRequest('${r.id}', 'rejected')" class="size-10 bg-red-50 text-red-600 hover:bg-red-500 hover:text-white rounded-xl shadow-sm transition-all flex items-center justify-center border border-red-200 hover:border-red-500">
                        <span class="material-symbols-outlined">close</span>
                    </button>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error("Load requests:", err);
    }
}

window.handleRequest = async function(requestId, status) {
    try {
        const { error } = await supabase.from('mentorship_requests').update({ status }).eq('id', requestId);
        if (error) throw error;
        loadRequests();
        pollPendingRequests();
        loadMentees();
    } catch (err) {
        alert("Failed to update request: " + err.message);
    }
};

async function pollPendingRequests() {
    const badge = document.getElementById('request-badge');
    if (!badge || !currentUser) return;
    const { count } = await supabase.from('mentorship_requests').select('*', { count: 'exact', head: true }).eq('mentor_id', currentUser.id).eq('status', 'pending');
    if (count && count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// ── COHORT CHAT with Broadcast ────────────────────────────────────────────
async function preloadNames(ids) {
    const missing = ids.filter(id => !usersCache[id]);
    if (!missing.length) return;
    const { data } = await supabase.from('users').select('id, name, email').in('id', missing);
    if (data) data.forEach(u => usersCache[u.id] = { name: u.name, email: u.email });
}

function esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function mentorBubble(m, isMe) {
    let cached = usersCache[m.sender_id];
    let userData = { name: 'Student', email: '' };

    if (cached) {
        if (typeof cached === 'string') {
            userData.name = cached;
        } else {
            userData = cached;
        }
    } else if (m.sender_name) {
        userData.name = m.sender_name;
    }

    const name = isMe ? 'You' : userData.name;
    const id = m.id ? `data-id="${m.id}"` : 'data-temp="true"';
    const msgKey = `data-msg="${esc(m.message)}"`;
    const avatar = window.getAvatarUrl(userData.email || '', 40);

    let rawMsg = m.message || '';
    if (rawMsg.startsWith('DM|')) {
        const parts = rawMsg.split('|');
        rawMsg = parts.slice(2).join('|');
    }

    // Detection for YouTube / Poll feature
    let content = esc(rawMsg);
    let extraCard = '';
    let isRich = false;

    if (rawMsg && rawMsg.startsWith('YT_VIDEO|')) {
        const parts = rawMsg.split('|');
        const topic = esc(parts[1] || 'Unknown Topic');
        const url = parts[2] || '';
        const videoId = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([^& \n]+)/)?.[1];
        
        if (videoId) {
            isRich = true;
            content = `<div class="font-black text-[10px] uppercase tracking-widest ${isMe?'text-white/70':'text-indigo-400'} mb-1">Educational Resource</div><div class="font-bold text-sm mb-2 ${isMe?'text-white':'text-slate-800 dark:text-white'}">${topic}</div>`;
            extraCard = `
                <div class="mt-3 rounded-xl overflow-hidden shadow-lg bg-black aspect-video relative group">
                    <iframe class="w-full h-full" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>
                </div>
                <a href="${url}" target="_blank" class="mt-2 block text-[9px] font-black uppercase tracking-widest ${isMe?'text-indigo-200 hover:text-white':'text-indigo-500 hover:text-indigo-600'} underline transition-colors">Open in YouTube <span class="material-symbols-outlined text-[10px] align-middle">open_in_new</span></a>
            `;
        }
    } else if (rawMsg && rawMsg.startsWith('POLL|')) {
        isRich = true;
        const parts = rawMsg.split('|');
        const topic = esc(parts[1] || 'Community Poll');
        const options = parts[2] ? parts[2].split(',') : [];
        content = `<div class="font-black text-[10px] uppercase tracking-widest ${isMe?'text-white/70':'text-indigo-400'} mb-1">Live Poll</div><div class="font-bold text-sm mb-3 poll-card-topic ${isMe?'text-white':'text-slate-800 dark:text-white'}">${topic}</div>`;
        extraCard = '<div class="space-y-2 mt-2">' + options.map((opt, idx) => `
            <button class="w-full text-left px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${isMe?'border-indigo-400/30 hover:bg-indigo-500/50':'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'} flex items-center justify-between group poll-opt-btn" data-opt="${esc(opt)}" data-opt-idx="${idx}" onclick="window.castVote(this)">
                <div class="flex items-center">
                    <span>${esc(opt)}</span>
                    <span class="vote-badge"></span>
                </div>
                <span class="size-4 rounded-full border ${isMe?'border-indigo-300':'border-slate-300'} group-hover:bg-indigo-400/20 flex items-center justify-center transition-colors mark-circle"></span>
            </button>
        `).join('') + '</div><p class="text-[9px] font-bold mt-3 opacity-70 italic tracking-wide">Select an option to vote</p>';
    } else if (rawMsg && (rawMsg.includes('SYSTEM_DOUBT_START|') || rawMsg.includes('SYSTEM_DOUBT_END|'))) {
        const parts = rawMsg.split('|');
        const isStart = rawMsg.includes('SYSTEM_DOUBT_START');
        const topic = esc(parts[1] || 'Academic Discussion');
        const sessId = parts[2] ? parts[2].substring(0, 8) : '...';
        
        const cardColor = isStart ? 'border-primary' : 'border-emerald-500';
        const icon = isStart ? 'rocket_launch' : 'task_alt';
        const label = isStart ? 'Discussion Initiated' : 'Doubt Cleared';
        const subtext = isStart ? 'Tracking Sheet Filed' : 'Academic Log Finalized';
        const authorLine = isMe ? 'You' : esc(userData.name);

        return `<div class="flex justify-center w-full my-4 msg-bubble" ${id} data-msg="${esc(rawMsg)}">
            <div class="bg-white dark:bg-slate-900 border-2 ${cardColor} rounded-2xl p-5 shadow-lg max-w-[420px] w-full text-center relative overflow-hidden">
                <div class="absolute top-0 right-0 p-3 opacity-10"><span class="material-symbols-outlined text-4xl">${icon}</span></div>
                <div class="flex items-center justify-center gap-2 mb-2">
                    <span class="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">${label}</span>
                </div>
                <h4 class="text-base font-black text-slate-900 dark:text-white leading-tight">"${topic}"</h4>
                <div class="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center justify-between">
                    <div class="text-left leading-tight">
                        <p class="text-[9px] font-black text-slate-300 uppercase tracking-widest">${subtext}</p>
                        <p class="text-[11px] font-black font-mono text-indigo-500 uppercase tracking-widest mt-0.5">ID: ${sessId}</p>
                    </div>
                </div>
            </div>
        </div>`;
    } else if (rawMsg && rawMsg.startsWith('SYSTEM_VOTE|')) {
        const parts = rawMsg.split('|');
        const topic = esc(parts[1]);
        const opt = esc(parts[2]);
        const action = esc(parts[3] || 'voted for');
        
        return `<div class="flex justify-center w-full my-2 msg-bubble" ${id} data-msg="${esc(rawMsg)}" data-sender-name="${esc(userData.name)}">
            <span class="text-[10px] uppercase tracking-widest font-bold text-slate-500 bg-slate-100 dark:bg-slate-800/80 px-4 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 max-w-[90%] text-center leading-tight">
                ${isMe ? 'You' : esc(userData.name)} ${action} <span class="text-indigo-500 dark:text-indigo-400">"${opt}"</span> in <span class="opacity-80">${topic}</span>
            </span>
        </div>`;
    }

    if (isMe) {
        return `<div class="flex flex-col items-end w-full msg-bubble" ${id} ${msgKey}>
            <div class="flex items-center gap-2 mb-1">
                <span class="text-[10px] font-bold text-slate-400">You</span>
                <img src="${window.getAvatarUrl(currentUser.email || '', 24)}" class="size-5 rounded-full object-cover border border-slate-200">
            </div>
            <div class="px-4 py-2.5 rounded-2xl rounded-tr-none ${isRich ? 'bg-indigo-600 max-w-[85%]' : 'bg-indigo-600 max-w-[75%]'} text-white shadow-sm text-sm msg-body">
                ${content}${extraCard}
            </div>
        </div>`;
    }

    return `<div class="flex flex-col items-start w-full msg-bubble" ${id} ${msgKey}>
        <div class="flex items-center gap-2 mb-1">
            <img src="${avatar}" class="size-6 rounded-full object-cover border border-slate-100">
            <span class="text-[10px] font-bold text-slate-400">${esc(name)}</span>
        </div>
        <div class="px-4 py-2.5 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-800 dark:bg-slate-800/50 bg-white ${isRich ? 'max-w-[85%]' : 'max-w-[75%]'} shadow-sm text-sm msg-body text-slate-700 dark:text-slate-200">
            ${content}${extraCard}
        </div>
    </div>`;
}

function setupChat() {
    const form = document.getElementById('cohort-chat-form');
    if (!form) return;

    const doSend = async () => {
        const input = document.getElementById('cohort-chat-input');
        const text = input.value.trim();
        if (!text || !activeMenteeId) return;

        input.value = '';

        const isSystem = text.startsWith('SYSTEM_VOTE|') || 
                         text.startsWith('SYSTEM_DOUBT_START|') || 
                         text.startsWith('SYSTEM_DOUBT_END|');

        const finalMsg = isSystem ? text : `DM|${activeMenteeId}|${text}`;
        const msgObj = { sender_id: currentUser.id, message: finalMsg, mentor_id: currentUser.id };

        // 1. Instant optimistic render for sender
        const tempMsg = { ...msgObj, id: 'temp-'+Date.now() };
        allChatHistory.push(tempMsg);
        renderChatBox();

        // 2. Broadcast to all subscribers instantly (WebSocket, <100ms)
        if (broadcastChannel) {
            broadcastChannel.send({
                type: 'broadcast',
                event: 'new_message',
                payload: { ...msgObj, sender_name: usersCache[currentUser.id]?.name || 'Mentor' }
            });
        }

        // 3. Persist to Supabase DB (for history & faculty monitoring)
        const { error } = await supabase.from('cohort_chats').insert({
            mentor_id: currentUser.id,
            sender_id: currentUser.id,
            message: finalMsg
        });
        if (error) console.error('Chat insert error:', error);
    };

    form.addEventListener('submit', e => { e.preventDefault(); doSend(); });
    document.getElementById('cohort-chat-input')?.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
    });

    // YouTube Share Logic
    const ytBtn = document.getElementById('yt-share-btn');
    const ytModal = document.getElementById('yt-modal');
    const ytForm = document.getElementById('yt-share-form');
    if (ytBtn && ytModal) {
        ytBtn.onclick = () => ytModal.classList.remove('hidden');
        document.getElementById('yt-cancel').onclick = () => ytModal.classList.add('hidden');
        ytForm.onsubmit = async (e) => {
            e.preventDefault();
            const topic = document.getElementById('yt-topic').value.trim();
            const link = document.getElementById('yt-link').value.trim();
            if (topic && link) {
                const oldVal = document.getElementById('cohort-chat-input').value;
                document.getElementById('cohort-chat-input').value = `YT_VIDEO|${topic}|${link}`;
                await doSend();
                document.getElementById('cohort-chat-input').value = oldVal;
                ytForm.reset();
                ytModal.classList.add('hidden');
                updateResourcesList();
            }
        };
    }

    // Poll Share Logic
    const pollBtn = document.getElementById('poll-share-btn');
    const pollModal = document.getElementById('poll-modal');
    const pollForm = document.getElementById('poll-share-form');
    const addOptBtn = document.getElementById('add-poll-opt');
    const optsContainer = document.getElementById('poll-opts-container');
    if (pollBtn && pollModal) {
        pollBtn.onclick = () => pollModal.classList.remove('hidden');
        document.getElementById('poll-cancel').onclick = () => pollModal.classList.add('hidden');
        
        addOptBtn.onclick = () => {
            const num = optsContainer.children.length + 1;
            optsContainer.insertAdjacentHTML('beforeend', `<input type="text" required class="poll-opt-input w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm outline-none dark:bg-slate-800 dark:border-slate-700 dark:text-white mt-2" placeholder="Option ${num}">`);
        };

        pollForm.onsubmit = async (e) => {
            e.preventDefault();
            const topic = document.getElementById('poll-topic').value.trim();
            const opts = Array.from(document.querySelectorAll('.poll-opt-input')).map(input => input.value.trim()).filter(Boolean);
            if (topic && opts.length >= 2) {
                const oldVal = document.getElementById('cohort-chat-input').value;
                document.getElementById('cohort-chat-input').value = `POLL|${topic}|${opts.join(',')}`;
                await doSend();
                document.getElementById('cohort-chat-input').value = oldVal;
                pollForm.reset();
                pollModal.classList.add('hidden');
                updateResourcesList();
            } else {
                alert("Please provide a topic and at least 2 options.");
            }
        };
    }

    // Toggle Tabs
    const tabMembersBtn = document.getElementById('tab-members-btn');
    const tabResourcesBtn = document.getElementById('tab-resources-btn');
    const viewMembers = document.getElementById('members-list-view');
    const viewResources = document.getElementById('resources-list-view');

    if (tabMembersBtn && tabResourcesBtn) {
        tabMembersBtn.onclick = () => {
            tabMembersBtn.classList.replace('text-slate-400', 'text-indigo-600');
            tabMembersBtn.classList.add('border-indigo-600');
            tabResourcesBtn.classList.replace('text-indigo-600', 'text-slate-400');
            tabResourcesBtn.classList.remove('border-indigo-600');
            viewMembers.classList.remove('hidden');
            viewResources.classList.add('hidden');
        };
        tabResourcesBtn.onclick = () => {
            tabResourcesBtn.classList.replace('text-slate-400', 'text-indigo-600');
            tabResourcesBtn.classList.add('border-indigo-600');
            tabMembersBtn.classList.replace('text-indigo-600', 'text-slate-400');
            tabMembersBtn.classList.remove('border-indigo-600');
            viewResources.classList.remove('hidden');
            viewMembers.classList.add('hidden');
            updateResourcesList();
        };
    }
}

// Extract YT/Poll msgs from current DOM instead of refetching for simplicity
function updateResourcesList() {
    const list = document.getElementById('resources-content-list');
    if (!list) return;

    if (!activeMenteeId) {
        list.innerHTML = '<p class="text-xs text-slate-400 italic">Select a mentee to view resources.</p>';
        return;
    }

    const resources = [];
    
    // Filter history for currently active room
    const filtered = allChatHistory.filter(m => 
        m.sender_id === activeMenteeId || 
        (m.sender_id === currentUser.id && m.message.startsWith(`DM|${activeMenteeId}|`))
    );

    filtered.forEach(m => {
        let msg = m.message || '';
        if (msg.startsWith('DM|')) msg = msg.split('|').slice(2).join('|');

        if (msg.startsWith('YT_VIDEO|')) {
            const p = msg.split('|');
            resources.push({ type: 'YT', topic: p[1] || 'Video', url: p[2] });
        } else if (msg.startsWith('POLL|')) {
            const p = msg.split('|');
            resources.push({ type: 'POLL', topic: p[1] || 'Poll Forum', opts: p[2] ? p[2].split(',').length : 0 });
        }
    });

    if (resources.length === 0) {
        list.innerHTML = '<p class="text-xs text-slate-400 italic">No resources or polls shared yet.</p>';
        return;
    }

    list.innerHTML = resources.map(r => {
        if (r.type === 'YT') {
            return `
                <a href="${esc(r.url)}" target="_blank" class="block p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 transition-colors group">
                    <div class="flex gap-2">
                        <div class="size-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[16px]">play_circle</span></div>
                        <div>
                            <p class="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600">${esc(r.topic)}</p>
                            <p class="text-[10px] text-slate-400 mt-1 uppercase tracking-widest font-black">Video Resource</p>
                        </div>
                    </div>
                </a>
            `;
        } else {
            return `
                <div class="p-3 rounded-xl border border-indigo-100 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-900/10">
                    <div class="flex gap-2 mb-2">
                        <div class="size-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0"><span class="material-symbols-outlined text-[16px]">poll</span></div>
                        <div>
                            <p class="text-xs font-bold text-slate-800 dark:text-slate-200">${esc(r.topic)}</p>
                            <p class="text-[10px] text-indigo-400 mt-1 uppercase tracking-widest font-black">Live Poll - ${r.opts} Options</p>
                        </div>
                    </div>
                </div>
            `;
        }
    }).reverse().join('');
}

window.castVote = async function(btn) {
    const parent = btn.parentElement;
    const isAlreadySelected = btn.classList.contains('bg-indigo-50');

    parent.querySelectorAll('button').forEach(b => {
        b.classList.remove('bg-indigo-50', 'dark:bg-indigo-900/40', 'border-indigo-500');
        const r = b.querySelector('.mark-circle') || b.querySelector('span:last-child');
        if (r) {
            r.classList.remove('bg-indigo-500', 'border-indigo-500');
            r.innerHTML = '';
        }
    });

    if (!isAlreadySelected) {
        btn.classList.add('bg-indigo-50', 'dark:bg-indigo-900/40', 'border-indigo-500');
        const radio = btn.querySelector('.mark-circle') || btn.querySelector('span:last-child');
        if (radio) {
            radio.classList.add('bg-indigo-500', 'border-indigo-500');
            radio.innerHTML = '<span class="material-symbols-outlined text-[10px] text-white font-black">check</span>';
        }
    }

    if (!activeMenteeId) return;
    const bubbleNode = btn.closest('.msg-bubble');
    let rawMsg = bubbleNode ? bubbleNode.getAttribute('data-msg') : '';
    if (rawMsg.startsWith('DM|')) rawMsg = rawMsg.split('|').slice(2).join('|');
    const parts = rawMsg.split('|');
    const topic = parts[1] || 'Poll';
    const spanTextNode = btn.querySelector('div span:first-child') || btn.querySelector('span');
    const optName = spanTextNode.innerText;
    const optIdx = btn.getAttribute('data-opt-idx') || Array.from(parent.querySelectorAll('button')).indexOf(btn);
    const action = isAlreadySelected ? 'removed vote from' : 'voted for';
    
    const textMsg = `DM|${activeMenteeId}|SYSTEM_VOTE|${topic}|${optName}|${action}|${optIdx}`;
    
    const myData = usersCache[currentUser.id] || {};
    const msgObj = { 
        sender_id: currentUser.id, 
        message: textMsg, 
        mentor_id: currentUser.id,
        sender_name: myData.name,
        sender_email: myData.email
    };

    const tempMsg = { ...msgObj, id: 'temp-'+Date.now() };
    allChatHistory.push(tempMsg);
    renderChatBox();

    if (broadcastChannel) {
        broadcastChannel.send({
            type: 'broadcast',
            event: 'new_message',
            payload: { ...msgObj, sender_name: usersCache[currentUser.id]?.name || 'Mentor' }
        });
    }

    await supabase.from('cohort_chats').insert({
        mentor_id: currentUser.id,
        sender_id: currentUser.id,
        message: textMsg
    });
};

async function loadChat() {
    const box = document.getElementById('cohort-chat-box');
    const memberList = document.getElementById('forum-members-list');

    if (box) box.innerHTML = '<div class="text-center text-slate-400 py-8 text-sm chat-placeholder">Loading messages…</div>';

    // Tear down old channels
    if (broadcastChannel) { await supabase.removeChannel(broadcastChannel); broadcastChannel = null; }
    if (dbChannel) { await supabase.removeChannel(dbChannel); dbChannel = null; }

    // ── BROADCAST subscription — instant messages ─────────────────────
    broadcastChannel = supabase.channel(`chat_broadcast:${currentUser.id}`, {
        config: { broadcast: { self: false } }
    });
    broadcastChannel
        .on('broadcast', { event: 'new_message' }, ({ payload }) => {
            handleIncomingBroadcast(payload);
        })
        .subscribe();

    // ── DB subscription — catches messages from other devices/sessions ──
    dbChannel = supabase.channel(`mentor_db:${currentUser.id}`)
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'cohort_chats',
            filter: `mentor_id=eq.${currentUser.id}`
        }, ({ new: msg }) => {
            if (msg.sender_id === currentUser.id) return; // Mentor's own handled by broadcast+optimistic
            if (!allChatHistory.find(m => m.id === msg.id)) {
                allChatHistory.push(msg);
                renderChatBox();
            }
        })
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'mentorship_doubt_sessions'
        }, () => {
            checkDoubtSessionStatus();
        })
        .subscribe();

    // Fetch members + history in parallel
    const [menteeRes, msgRes] = await Promise.all([
        supabase.from('mentorship_requests').select('mentee_id').eq('mentor_id', currentUser.id).eq('status', 'accepted'),
        supabase.from('cohort_chats').select('*').eq('mentor_id', currentUser.id).order('created_at', { ascending: true }).limit(500)
    ]);

    allChatHistory = msgRes.data || [];
    await preloadNames([...new Set(allChatHistory.map(m => m.sender_id))]);

    // Render members sidebar
    if (!menteeRes.error && menteeRes.data?.length) {
        const ids = menteeRes.data.map(m => m.mentee_id);
        const { data: membersData } = await supabase.from('users').select('id, name').in('id', ids);
        if (memberList && membersData) {
            membersData.forEach(u => usersCache[u.id] = u.name);
            memberList.innerHTML = membersData.map(u => `
                <button class="w-full text-left flex items-center gap-2 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors mentor-mentee-btn group" data-mentee="${u.id}" onclick="window.selectChatRoom('${u.id}', '${esc(u.name)}')">
                    <div class="size-7 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px] shrink-0">${u.name.charAt(0).toUpperCase()}</div>
                    <span class="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate flex-1 group-hover:text-indigo-600">${esc(u.name)}</span>
                    <span class="size-2 bg-slate-200 dark:bg-slate-700 rounded-full status-indicator"></span>
                </button>
            `).join('');
            
            // Auto open first mentee
            if (membersData.length > 0) {
                window.selectChatRoom(membersData[0].id, membersData[0].name);
            }
        }
    } else if (memberList) {
        memberList.innerHTML = '<div class="text-xs text-slate-400 p-2 italic">No mentees yet.</div>';
        renderChatBox();
    }
}

window.selectChatRoom = function(id, name) {
    activeMenteeId = id;
    
    // UI Updates
    document.querySelectorAll('.mentor-mentee-btn').forEach(b => {
        b.classList.remove('bg-indigo-50', 'dark:bg-indigo-900/30', 'border', 'border-indigo-100', 'dark:border-indigo-800');
        b.querySelector('.status-indicator').classList.replace('bg-green-400', 'bg-slate-200');
    });
    
    const activeBtn = document.querySelector(`.mentor-mentee-btn[data-mentee="${id}"]`);
    if (activeBtn) {
        activeBtn.classList.add('bg-indigo-50', 'dark:bg-indigo-900/30', 'border', 'border-indigo-100', 'dark:border-indigo-800');
        activeBtn.querySelector('.status-indicator').classList.replace('bg-slate-200', 'bg-green-400');
    }
    
    const hubTitle = document.querySelector('.size-10.bg-indigo-200').nextElementSibling.querySelector('h3');
    if (hubTitle) hubTitle.textContent = name + "'s Forum";

    renderChatBox();
    checkDoubtSessionStatus();
};

let currentDoubtSession = null;

async function checkDoubtSessionStatus() {
    const actionArea = document.getElementById('mentor-session-action');
    const chatInput = document.getElementById('cohort-chat-input');
    if (!currentUser || !actionArea) return;
    
    if (!activeMenteeId) { 
        actionArea.classList.add('hidden'); 
        if (chatInput) {
            chatInput.disabled = true;
            chatInput.placeholder = "Select a mentee to chat.";
        }
        return; 
    }

    const { data: session } = await supabase
        .from('mentorship_doubt_sessions')
        .select('*')
        .eq('student_id', activeMenteeId)
        .eq('mentor_id', currentUser.id)
        .eq('mentee_status', 'open')
        .maybeSingle();

    if (session) {
        currentDoubtSession = session;
        actionArea.classList.remove('hidden');
        actionArea.classList.add('flex');
        if (chatInput) {
            chatInput.disabled = false;
            const name = usersCache[activeMenteeId]?.name || 'Student';
            chatInput.placeholder = `Message ${name}...`;
        }
    } else {
        currentDoubtSession = null;
        actionArea.classList.add('hidden');
        actionArea.classList.remove('flex');
        if (chatInput) {
            chatInput.disabled = true;
            chatInput.placeholder = "Select an active mentee to enable chat, or wait for them to start a doubt.";
        }
    }
}

function setupDoubtCompletion() {
    const trigger = document.getElementById('trigger-complete-modal');
    const modal = document.getElementById('session-complete-modal');
    const form = document.getElementById('mentor-complete-form');

    if (trigger) trigger.onclick = () => {
        modal.classList.remove('hidden');
        document.getElementById('mentor-date').valueAsDate = new Date();
    };

    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            if (!currentDoubtSession) return;

            const btn = form.querySelector('button[type="submit"]');
            btn.disabled = true;
            btn.innerText = 'Syncing Audit Profile...';

            try {
                // 1. Fetch Mentor Snapshot for Verification Integrity
                const { data: mentor, error: mentorErr } = await supabase.from('users').select('*').eq('id', currentUser.id).single();
                if (mentorErr) console.warn("Mentor profile snap failed:", mentorErr);

                const payload = {
                    mentor_date: document.getElementById('mentor-date').value,
                    mentor_mode: document.getElementById('mentor-mode').value,
                    mentor_needs_addressed: document.getElementById('mentor-needs').value,
                    mentor_support_provided: document.getElementById('mentor-support').value,
                    mentor_duration: document.getElementById('mentor-duration').value,
                    mentor_next_plan_date: document.getElementById('mentor-next-date').value || null,
                    mentee_status: 'completed',
                    completed_at: new Date().toISOString(),

                    // Update snapshots on completion
                    mentor_name: mentor?.name || currentUser.email,
                    mentor_email: mentor?.email || currentUser.email,
                    mentor_reg_no: mentor?.register_number || 'N/A',
                    mentor_branch: mentor?.branch || 'N/A',
                    mentor_year: mentor?.year || '—',
                    mentor_section: mentor?.section || '—',
                    mentor_faculty_advisor: mentor?.faculty_advisor || mentor?.assigned_faculty || 'Unassigned'
                };

                const { error } = await supabase.from('mentorship_doubt_sessions').update(payload).eq('id', currentDoubtSession.id);
                if (error) throw error;

                const cachedSession = currentDoubtSession;

                alert('Academic Tracking Session Completed successfully.');
                form.reset();
                modal.classList.add('hidden');
                await checkDoubtSessionStatus();

                // 3. System Message to notify everyone
                const topic = cachedSession?.mentee_needs || "This Doubt";
                const finalMsg = `SYSTEM_DOUBT_END|${topic}|${cachedSession?.id || '...'}`;
                const { data: insertedMsg, error: chatErr } = await supabase.from('cohort_chats').insert([{
                    mentor_id: currentUser.id,
                    sender_id: currentUser.id,
                    message: finalMsg
                }]).select().single();
                
                // Optimistically render in mentor's own view
                if (insertedMsg) {
                    allChatHistory.push(insertedMsg);
                    renderChatBox();
                }

                // Trigger broadcast
                if (broadcastChannel && insertedMsg) {
                    broadcastChannel.send({
                        type: 'broadcast',
                        event: 'new_message',
                        payload: insertedMsg
                    });
                }

            } catch (err) {
                alert("Failed to complete session: " + err.message);
            } finally {
                btn.disabled = false;
                btn.innerText = 'Submit Evaluation & Complete Session';
            }
        };
    }
}

function renderChatBox() {
    const box = document.getElementById('cohort-chat-box');
    if (!box) return;

    if (!activeMenteeId) {
        box.innerHTML = '<div class="text-center text-slate-400 py-8 text-sm">Select a mentee to start chatting.</div>';
        const input = document.getElementById('cohort-chat-input');
        if(input) input.disabled = true;
        updateResourcesList();
        return;
    }

    const filteredMsgs = allChatHistory.filter(m => {
        const isSystem = m.message?.includes('SYSTEM_VOTE|') || 
                         m.message?.includes('SYSTEM_DOUBT_START|') || 
                         m.message?.includes('SYSTEM_DOUBT_END|');
        
        if (m.sender_id === activeMenteeId) return true;
        if (m.sender_id === currentUser.id) {
            if (isSystem) return true;
            return m.message && m.message.startsWith(`DM|${activeMenteeId}|`);
        }
        return false;
    });

    if (filteredMsgs.length === 0) {
        box.innerHTML = '<div class="text-center text-slate-400 py-8 text-sm chat-placeholder">No messages yet. Start the discussion!</div>';
    } else {
        box.innerHTML = filteredMsgs.map(m => mentorBubble(m, m.sender_id === currentUser.id)).join('');
    }
    box.scrollTop = box.scrollHeight;
    updateResourcesList();
    updatePollVotes();
}

window.updatePollVotes = function() {
    const box = document.getElementById('cohort-chat-box');
    if (!box) return;

    const votes = {}; 
    let hasVotes = false;

    box.querySelectorAll('.msg-bubble').forEach(el => {
        const rawMsg = el.getAttribute('data-msg') || '';
        if (rawMsg.startsWith('SYSTEM_VOTE|')) {
            const parts = rawMsg.split('|');
            const topic = parts[1];
            const opt = parts[2];
            const action = parts[3];
            const optIdx = parts[4];
            const senderName = el.getAttribute('data-sender-name') || 'User';

            if (!votes[topic]) votes[topic] = {};
            const key = optIdx !== undefined ? `${optIdx}_${opt}` : opt;
            if (!votes[topic][key]) votes[topic][key] = new Set();

            if (action === 'voted for') {
                votes[topic][key].add(senderName);
            } else {
                votes[topic][key].delete(senderName);
            }
            hasVotes = true;
        }
    });

    if (!hasVotes) return;

    box.querySelectorAll('.poll-card-topic').forEach(topicEl => {
        const topic = topicEl.innerText;
        const parentBtnArea = topicEl.nextElementSibling;
        if (!parentBtnArea) return;
        
        parentBtnArea.querySelectorAll('.poll-opt-btn').forEach(btn => {
            const optName = btn.getAttribute('data-opt');
            const optIdx = btn.getAttribute('data-opt-idx');
            const key = optIdx !== null ? `${optIdx}_${optName}` : optName;
            const badge = btn.querySelector('.vote-badge');
            const voters = votes[topic]?.[key];

            if (voters && voters.size > 0) {
                const names = Array.from(voters).join(', ');
                badge.innerHTML = `<span class="text-[9px] font-bold bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 rounded-md ml-2">${voters.size} (${names})</span>`;
            } else {
                badge.innerHTML = '';
            }
        });
    });
};

async function handleIncomingBroadcast(payload) {
    if (!payload?.message) return;
    if (!usersCache[payload.sender_id]) {
        usersCache[payload.sender_id] = payload.sender_name || 'Student';
    }

    // Remove any temp msgs from optimistic render that matches
    const exists = allChatHistory.findIndex(m => m.message === payload.message && m.id && m.id.startsWith('temp-'));
    if (exists !== -1) {
        allChatHistory[exists] = payload;
    } else {
        if (!allChatHistory.find(m => m.id === payload.id)) {
            allChatHistory.push(payload);
        }
    }
    renderChatBox();
}

// ============================================================================
// ANNOUNCEMENT MODULE
// ============================================================================
window.postAnnouncement = async function() {
    const title = document.getElementById('ann-title').value.trim();
    const body = document.getElementById('ann-body').value.trim();
    const target = document.getElementById('ann-target').value;
    const duration = document.getElementById('ann-duration').value;
    const btn = document.getElementById('post-ann-btn');
    
    if (!title || !body) {
        alert("Please fill in both title and message.");
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[20px]">sync</span> Publishing...';

    let expires_at = null;
    if (duration !== 'infinite') {
        const now = new Date();
        if (duration === '1d') expires_at = new Date(now.getTime() + 24 * 60 * 60 * 1000);
        else if (duration === '10d') expires_at = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    }

    try {
        const { error } = await supabase.from('announcements').insert([{
            title,
            body,
            target_role: target,
            author_id: currentUser.id,
            expires_at: expires_at?.toISOString()
        }]);

        if (error) throw error;

        // Reset form
        document.getElementById('ann-title').value = '';
        document.getElementById('ann-body').value = '';
        
        // Reload
        loadAnnouncements();
        alert("Broadcast sent successfully!");
    } catch (err) {
        console.error("Broadcast failed:", err);
        alert("Failed to send broadcast: " + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span class="material-symbols-outlined text-[20px]">send</span><span>Post Broadcast</span>';
    }
};

async function loadGlobalAnnouncements() {
    const list = document.getElementById('mentor-announcements-list');
    const container = document.getElementById('mentor-announcements');
    const dashboardList = document.getElementById('dashboard-broadcasts');
    if (!list || !container) return;

    try {
        const now = new Date().toISOString();
        const { data: anns, error } = await supabase
            .from('announcements')
            .select('*')
            .or(`target_role.eq.all,target_role.eq.mentor`)
            .or(`expires_at.is.null,expires_at.gt.${now}`)
            .order('created_at', { ascending: false })
            .limit(10);

        if (error) throw error;
        
        // Filter for ONLY faculty/admin authors
        const authorIds = [...new Set(anns.map(a => a.author_id))];
        const { data: usersData } = await supabase.from('users').select('id, name, role, email').in('id', authorIds);
        const usersMap = {};
        if (usersData) usersData.forEach(u => usersMap[u.id] = u);

        const filtered = (anns || []).filter(a => {
            const author = usersMap[a.author_id];
            return author && (author.role === 'faculty' || author.role === 'admin');
        });

        if (filtered.length === 0) {
            container.classList.add('hidden');
            if (dashboardList) dashboardList.innerHTML = `<div class="text-center py-6 text-slate-400 italic text-xs">No official institutional announcements currently active. Stay tuned for updates from faculty.</div>`;
            return;
        }

        container.classList.remove('hidden');
        list.className = "grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[180px] overflow-y-auto pr-2 no-scrollbar scroll-smooth";
        
        const html = filtered.map(a => {
            const author = usersMap[a.author_id] || { name: 'Faculty', role: 'faculty', email: '' };
            return `
                <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 shadow-sm relative group overflow-hidden border-l-4 border-l-blue-500">
                    <div class="flex items-center gap-2 mb-2">
                        <img src="${window.getAvatarUrl(author.email, 24)}" class="size-5 rounded-full object-cover">
                        <span class="text-[8px] font-black uppercase text-slate-400 tracking-widest">${author.name}</span>
                        <button onclick="window.readFullAnnouncement('${a.id}', \`${a.title.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`, \`${a.body.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` )" class="text-[8px] font-black uppercase text-blue-500 hover:underline ml-auto">Read Full</button>
                    </div>
                    <h4 class="text-xs font-bold text-slate-900 dark:text-white mb-1 truncate">${a.title}</h4>
                    <p class="text-[11px] text-slate-500 line-clamp-1">${a.body}</p>
                </div>
            `;
        }).join('');

        list.innerHTML = html;

        // Also populate Dashboard Overview if it exists
        if (dashboardList) {
            dashboardList.innerHTML = filtered.slice(0, 3).map(a => {
                const author = usersMap[a.author_id] || { name: 'Faculty', role: 'faculty', email: '' };
                return `
                    <div class="space-y-2 group cursor-pointer" onclick="window.readFullAnnouncement('${a.id}', \`${a.title.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`, \`${a.body.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\` )">
                        <div class="flex items-center justify-between">
                            <span class="text-[9px] font-black text-rose-500 uppercase tracking-widest">URGENT BCAST</span>
                            <span class="text-[8px] text-slate-400 font-bold">${new Date(a.created_at).toLocaleDateString([], {month:'short', day:'numeric'})}</span>
                        </div>
                        <h4 class="text-xs font-black text-slate-800 dark:text-slate-100 group-hover:text-rose-500 transition-colors uppercase tracking-tight">${a.title}</h4>
                        <p class="text-xs text-slate-500 line-clamp-2 leading-relaxed">${a.body}</p>
                    </div>
                `;
            }).join('<div class="h-px bg-slate-50 dark:bg-slate-700/50 my-4"></div>');
        }

    } catch (err) {
        console.error("Global announcements failed:", err);
    }
}

window.loadAnnouncements = async function() {
    const list = document.getElementById('announcements-list');
    if (!list) return;

    list.innerHTML = '<div class="h-64 flex items-center justify-center text-slate-400 italic"><div class="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mr-3"></div>Syncing broadcasts...</div>';

    const now = new Date().toISOString();
    try {
        const { data: anns, error } = await supabase
            .from('announcements')
            .select('*')
            .eq('author_id', currentUser.id)
            .or(`expires_at.is.null,expires_at.gt.${now}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!anns || anns.length === 0) {
            list.innerHTML = `
                <div class="bg-indigo-50/50 dark:bg-indigo-900/5 border-2 border-dashed border-indigo-100 dark:border-indigo-900/20 rounded-3xl p-12 text-center">
                    <span class="material-symbols-outlined text-indigo-200 text-5xl mb-4">campaign</span>
                    <h3 class="font-bold text-slate-800 dark:text-slate-200">No active broadcasts</h3>
                    <p class="text-sm text-slate-400 mt-2">Use the form on the left to reach out to your mentees.</p>
                </div>
            `;
            return;
        }

        list.innerHTML = anns.map(a => `
            <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <h4 class="font-black text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">${esc(a.title)}</h4>
                            <span class="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[9px] font-black text-slate-400 uppercase tracking-widest border border-slate-200 dark:border-slate-700">${a.target_role}</span>
                        </div>
                        <p class="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">${esc(a.body)}</p>
                        <div class="flex items-center gap-4 mt-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">calendar_today</span> ${new Date(a.created_at).toLocaleDateString()}</span>
                            <span class="flex items-center gap-1.5"><span class="material-symbols-outlined text-[14px]">timer</span> ${a.expires_at ? ' Expires: ' + new Date(a.expires_at).toLocaleDateString() : 'Permanent'}</span>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="deleteAnnouncement('${a.id}')" class="size-10 rounded-2xl text-slate-300 hover:bg-red-50 hover:text-red-500 transition-all flex items-center justify-center">
                            <span class="material-symbols-outlined text-[20px]">delete</span>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

    } catch (err) {
        console.error("Load failed:", err);
        list.innerHTML = `<div class="p-8 text-center text-red-500">Failed to load broadcasts.</div>`;
    }
}

window.deleteAnnouncement = async function(id) {
    // Additional security check
    const { data: ann } = await supabase.from('announcements').select('author_id').eq('id', id).single();
    if (ann && ann.author_id !== currentUser.id) {
        alert("Action Denied: You can only delete your own broadcasts.");
        return;
    }

    if (!confirm("Are you sure you want to remove this broadcast? Students will no longer see it.")) return;

    try {
        const { error } = await supabase.from('announcements').delete().eq('id', id);
        if (error) throw error;
        loadAnnouncements();
    } catch (err) {
        alert("Failed to delete: " + err.message);
    }
};

document.addEventListener('DOMContentLoaded', init);

// ── Live Classes Module for Peer Mentors ───────────────────────────────
function initMentorLiveClasses() {
    const form = document.getElementById('mentor-class-form');
    if (!form) return;

    let selectedAudience = 'all'; // 'all' or 'select'
    const btnAll = document.getElementById('btn-audience-all');
    const btnSelect = document.getElementById('btn-audience-select');
    const selectionBox = document.getElementById('mentee-selection-box');
    const checkboxList = document.getElementById('mentee-checkbox-list');

    const updateUI = () => {
        if (selectedAudience === 'all') {
            btnAll.className = 'flex-1 py-3 px-4 rounded-xl border-2 border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest transition-all';
            btnSelect.className = 'flex-1 py-3 px-4 rounded-xl border-2 border-slate-100 dark:border-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all';
            selectionBox.classList.add('hidden');
        } else {
            btnSelect.className = 'flex-1 py-3 px-4 rounded-xl border-2 border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 text-[10px] font-black uppercase tracking-widest transition-all';
            btnAll.className = 'flex-1 py-3 px-4 rounded-xl border-2 border-slate-100 dark:border-slate-800 text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all';
            selectionBox.classList.remove('hidden');
            loadMenteesForSelection();
        }
    };

    btnAll.onclick = () => { selectedAudience = 'all'; updateUI(); };
    btnSelect.onclick = () => { selectedAudience = 'select'; updateUI(); };

    async function loadMenteesForSelection() {
        if (!currentUser) return;
        checkboxList.innerHTML = `<p class="text-[10px] text-slate-400 italic text-center py-4">Syncing mentees...</p>`;
        
        const { data: menteeReqs } = await supabase.from('mentorship_requests').select('mentee_id').eq('mentor_id', currentUser.id).eq('status', 'accepted');
        if (!menteeReqs || menteeReqs.length === 0) {
            checkboxList.innerHTML = `<p class="text-[10px] text-red-400 text-center py-4 uppercase font-bold">No accepted mentees found.</p>`;
            return;
        }

        const menteeIds = menteeReqs.map(r => r.mentee_id);
        const { data: profiles } = await supabase.from('users').select('id, name').in('id', menteeIds);
        
        if (!profiles || profiles.length === 0) {
            checkboxList.innerHTML = `<p class="text-[10px] text-slate-400 text-center py-4">Error loading profiles.</p>`;
            return;
        }

        checkboxList.innerHTML = profiles.map(p => `
            <label class="flex items-center gap-3 p-2 hover:bg-white dark:hover:bg-slate-900 rounded-lg cursor-pointer transition-colors group">
                <input type="checkbox" name="target-mentee" value="${p.id}" class="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500">
                <span class="text-xs font-bold text-slate-600 dark:text-slate-300 group-hover:text-indigo-600">${p.name}</span>
            </label>
        `).join('');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('submit-mentor-class');
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> Scheduling...`;

        try {
            const title = document.getElementById('mentor-class-title').value;
            const desc = document.getElementById('mentor-class-desc').value;
            const date = document.getElementById('mentor-class-date').value;
            const time = document.getElementById('mentor-class-time').value;
            const link = document.getElementById('mentor-class-link').value;
            const duration = document.getElementById('mentor-class-duration').value || 60;
            
            let targetTag = '[T:student]';
            if (selectedAudience === 'select') {
                const checked = [...form.querySelectorAll('input[name="target-mentee"]:checked')].map(el => el.value);
                if (checked.length === 0) {
                    alert("Please select at least one mentee.");
                    btn.disabled = false;
                    btn.innerHTML = `Launch Session`;
                    return;
                }
                targetTag = `[S:${checked.join(',')}]`;
            }

            const metadataPrefix = `${targetTag}[M:${currentUser.id}]`;

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
            
            alert("Mentorship Session Broadcasted!");
            form.reset();
            selectedAudience = 'all';
            updateUI();
            loadMentorLiveClasses();
        } catch (err) {
            console.error("Error scheduling class:", err);
            alert("Failed to schedule: " + err.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = `Launch Session`;
        }
    });
}

async function loadMentorLiveClasses() {
    const list = document.getElementById('mentor-live-classes-list');
    if (!list) return;

    if (!currentUser) {
        setTimeout(loadMentorLiveClasses, 100);
        return;
    }

    try {
        const { data: classesData, error } = await supabase
            .from('online_classes')
            .select('*')
            .eq('faculty_id', currentUser.id)
            .order('class_date', { ascending: true });

        if (error) throw error;

        const parseMeta = (d) => {
            if (!d) return { target: 'student', mentorId: null, body: d, selectedCount: null };
            const m = d.match(/\[M:(.*?)\]/);
            const t = d.match(/\[T:(.*?)\]/);
            const s = d.match(/\[S:(.*?)\]/);
            let b = d;
            if (m) b = b.replace(m[0], '');
            if (t) b = b.replace(t[0], '');
            if (s) b = b.replace(s[0], '');
            return { 
                target: t ? t[1] : (s ? 'select' : 'student'), 
                mentorId: m ? m[1] : null, 
                body: b.trim(),
                selectedCount: s ? s[1].split(',').length : null
            };
        };

        const classes = (classesData || []).filter(c => parseMeta(c.description).mentorId === currentUser.id);

        if (classes.length === 0) {
            list.innerHTML = `<div class="p-12 text-center text-slate-400 italic">No guidance sessions scheduled yet.</div>`;
            return;
        }

        list.innerHTML = classes.map(c => {
            const meta = parseMeta(c.description);
            const targetLabel = meta.selectedCount ? `${meta.selectedCount} Selected Students` : 'All Mentees';
            const targetColor = meta.selectedCount ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-indigo-50 text-indigo-600 border-indigo-100';

            return `
            <div class="px-6 py-5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                <div class="flex items-start justify-between">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 text-[9px] font-black uppercase tracking-widest border border-slate-200 dark:border-slate-700">${new Date(c.class_date).toLocaleDateString()}</span>
                            <span class="px-2 py-0.5 rounded-md ${targetColor} text-[9px] font-black uppercase tracking-widest border">${targetLabel}</span>
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">${c.class_time.substring(0, 5)}</span>
                        </div>
                        <h4 class="font-black text-slate-800 dark:text-white group-hover:text-indigo-600 transition-colors uppercase tracking-tight">${c.title}</h4>
                        <p class="text-xs text-slate-500 mt-1">${meta.body || 'No agenda provided.'}</p>
                    </div>
                    <div class="flex items-center gap-3">
                        <button onclick="window.open('${c.meet_link}', '_blank')" class="size-10 rounded-xl bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center">
                            <span class="material-symbols-outlined text-[18px]">videocam</span>
                        </button>
                        <button onclick="deleteMentorClass('${c.id}')" class="size-10 rounded-xl hover:bg-red-50 text-slate-300 hover:text-red-500 transition-all flex items-center justify-center">
                            <span class="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (err) {
        console.error("Load classes failed:", err);
        list.innerHTML = `<div class="p-8 text-center text-red-500">Sync Error.</div>`;
    }
}

window.deleteMentorClass = async function(id) {
    if (!confirm("Are you sure you want to cancel this mentorship session?")) return;
    const { error } = await supabase.from('online_classes').delete().eq('id', id);
    if (error) alert("Failed: " + error.message);
    else loadMentorLiveClasses();
};

async function loadFacultySessionsForMentors() {
    const list = document.getElementById('mentor-dashboard-sessions-list');
    const container = document.getElementById('mentor-dashboard-sessions');
    if (!list || !container) return;

    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const { data: rawData, error } = await supabase
            .from('online_classes')
            .select('*')
            .gte('class_date', todayStr)
            .order('class_date', { ascending: true })
            .limit(20);

        if (error || !rawData) {
            container.classList.add('hidden');
            return;
        }

        const parseMeta = (d) => {
            if (!d) return { target: 'student', mentorId: null };
            const t = d.match(/\[T:(.*?)\]/);
            const m = d.match(/\[M:(.*?)\]/);
            return { target: t ? t[1] : 'student', mentorId: m ? m[1] : null };
        };

        const classes = rawData.filter(c => {
            const meta = parseMeta(c.description);
            return meta.target === 'mentor';
        });

        if (classes.length === 0) {
            container.classList.add('hidden');
            return;
        }

        // Resolve faculty names
        const facultyIds = [...new Set(classes.map(c => c.faculty_id))];
        const { data: profiles } = await supabase.from('users').select('id, name').in('id', facultyIds);
        const nameMap = {};
        if (profiles) profiles.forEach(p => nameMap[p.id] = p.name);

        container.classList.remove('hidden');
        list.innerHTML = classes.map(c => `
            <div class="bg-indigo-600 rounded-3xl p-6 shadow-xl shadow-indigo-100 dark:shadow-none flex items-center justify-between group overflow-hidden relative">
                <div class="flex flex-col gap-1 relative z-10">
                    <p class="text-[9px] font-black text-indigo-300 uppercase tracking-widest">${new Date(c.class_date).toLocaleDateString([], {month:'short', day:'numeric'})} • ${c.class_time.substring(0,5)}</p>
                    <h4 class="font-black text-white text-base leading-tight">${c.title}</h4>
                    <p class="text-[10px] font-bold text-indigo-200 mt-1 uppercase tracking-widest leading-none">PROF. ${nameMap[c.faculty_id] || 'STAFF'}</p>
                </div>
                <button onclick="window.open('${c.meet_link}', '_blank')" class="size-12 rounded-2xl bg-white/10 text-white backdrop-blur-md hover:bg-white hover:text-indigo-600 transition-all flex items-center justify-center relative z-10 group-hover:scale-110">
                    <span class="material-symbols-outlined text-[20px]">videocam</span>
                </button>
                <div class="absolute -right-4 -bottom-4 opacity-10 group-hover:opacity-20 transition-opacity">
                    <span class="material-symbols-outlined text-8xl">school</span>
                </div>
            </div>
        `).join('');
    } catch (err) {
        console.error("Dashboard sessions failed:", err);
    }
}

async function initOverviewDashboard() {
    try {
        console.log("[Overview] Loading mentor KPIs...");
        
        // 1. Fetch Mentees and Stats
        const { data: requests, error: reqError } = await supabase
            .from('mentorship_requests')
            .select('*')
            .eq('mentor_id', currentUser.id);

        if (reqError) throw reqError;

        const activeMenteesCount = requests ? requests.filter(r => r.status === 'accepted').length : 0;
        const pendingRequestsCount = requests ? requests.filter(r => r.status === 'pending').length : 0;

        const todayStr = new Date().toISOString().split('T')[0];
        const { data: classes } = await supabase
            .from('online_classes')
            .select('*')
            .eq('faculty_id', currentUser.id)
            .gte('class_date', todayStr);
        const liveSessionsCount = classes ? classes.length : 0;

        document.getElementById('stat-total-mentees').textContent = activeMenteesCount;
        document.getElementById('stat-pending-requests').textContent = pendingRequestsCount;
        document.getElementById('stat-live-sessions').textContent = liveSessionsCount;

        // 2. Fetch Recent Mentee Activity
        const accepted = requests ? requests.filter(r => r.status === 'accepted') : [];
        const menteeIds = accepted.map(r => r.mentee_id);
        
        if (menteeIds.length > 0) {
            const { data: analytics } = await supabase
                .from('user_analytics')
                .select('*')
                .in('user_id', menteeIds);

            const activityList = document.getElementById('dashboard-mentee-activity');
            
            // Resolve Names
            const { data: users } = await supabase.from('users').select('id, name, email').in('id', menteeIds);
            const userMap = {};
            if (users) users.forEach(u => userMap[u.id] = u);

            if (analytics && analytics.length > 0) {
                // Sort by time_spent descending for activity
                const topActivity = [...analytics].sort((a,b) => b.time_spent - a.time_spent).slice(0, 5);
                
                activityList.innerHTML = topActivity.map(a => {
                    const u = userMap[a.user_id] || { name: 'Student', email: '' };
                    return `
                        <div class="px-8 py-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all cursor-pointer" onclick="switchTab('dashboard')">
                            <div class="flex items-center gap-4">
                                <img src="${window.getAvatarUrl(u.email, 48)}" class="size-12 rounded-2xl border-2 border-white dark:border-slate-800 shadow-sm">
                                <div>
                                    <p class="font-black text-slate-800 dark:text-slate-100 tracking-tight text-base">${u.name}</p>
                                    <p class="text-[9px] text-slate-400 font-black uppercase tracking-widest leading-none mt-1">Institutional Mentee</p>
                                </div>
                            </div>
                            <div class="text-right">
                                <p class="font-black text-indigo-600 text-base">${a.time_spent}m</p>
                                <p class="text-[9px] text-slate-400 font-black uppercase tracking-widest">Active Time</p>
                            </div>
                        </div>
                    `;
                }).join('');

                // Impact calculation (Simplified: avg time spent)
                const totalMinutes = analytics.reduce((sum, a) => sum + a.time_spent, 0);
                const avg = Math.round(totalMinutes / activeMenteesCount) || 0;
                document.getElementById('stat-avg-engagement').textContent = `${avg}m`;
            } else {
                activityList.innerHTML = `<div class="p-16 text-center text-slate-400 italic font-medium">No system activity logs found for your mentorship group.</div>`;
            }
        }

        // 3. Pending Requests Preview
        const pendingPeek = requests ? requests.filter(r => r.status === 'pending').slice(0, 3) : [];
        const requestPreviewList = document.getElementById('dashboard-requests-preview');
        if (pendingPeek.length > 0) {
            const { data: requesters } = await supabase.from('users').select('id, name, email').in('id', pendingPeek.map(p => p.mentee_id));
            const reqMap = {};
            if (requesters) requesters.forEach(r => reqMap[r.id] = r);

            requestPreviewList.innerHTML = pendingPeek.map(r => {
                const u = reqMap[r.mentee_id] || { name: 'User', email: '' };
                return `
                    <div class="flex items-center justify-between p-4 rounded-3xl bg-amber-50/50 dark:bg-amber-900/20 border border-amber-100/50 dark:border-amber-800/30">
                        <div class="flex items-center gap-3">
                            <img src="${window.getAvatarUrl(u.email, 32)}" class="size-10 rounded-xl">
                            <div>
                                <p class="text-xs font-black text-slate-800 dark:text-slate-200">${u.name}</p>
                                <p class="text-[8px] font-black text-amber-600 uppercase tracking-widest">New Request</p>
                            </div>
                        </div>
                        <button onclick="switchTab('requests')" class="size-8 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center text-amber-600 shadow-sm"><span class="material-symbols-outlined text-sm">chevron_right</span></button>
                    </div>
                `;
            }).join('');
        } else {
            requestPreviewList.innerHTML = `<div class="text-center py-10"><span class="material-symbols-outlined text-3xl text-slate-200 mb-2">check_circle</span><p class="text-xs text-slate-400 font-bold uppercase tracking-widest">All caught up!</p></div>`;
        }

        // 4. Next Session Preview
        const { data: sessions } = await supabase
            .from('online_classes')
            .select('*')
            .eq('faculty_id', currentUser.id)
            .gte('class_date', new Date().toISOString().split('T')[0])
            .order('class_date', { ascending: true })
            .order('class_time', { ascending: true })
            .limit(1);

        const sessionBox = document.getElementById('dashboard-next-session');
        if (sessions && sessions.length > 0) {
            const s = sessions[0];
            sessionBox.innerHTML = `
                <div class="p-6 bg-white/10 dark:bg-slate-800/40 rounded-3xl backdrop-blur-md border border-white/10 mt-4">
                    <div class="flex items-center gap-4 mb-4">
                        <div class="size-12 rounded-2xl bg-white flex items-center justify-center text-indigo-600">
                            <span class="material-symbols-outlined">event</span>
                        </div>
                        <div>
                            <p class="text-xl font-black">${s.title}</p>
                            <p class="text-[10px] font-black text-indigo-200 uppercase tracking-widest">${new Date(s.class_date).toLocaleDateString([], {weekday:'long', month:'short', day:'numeric'})} @ ${s.class_time.substring(0,5)}</p>
                        </div>
                    </div>
                    <div class="flex items-center justify-between mt-6">
                        <span class="text-xs font-bold text-indigo-100/80">${s.duration_minutes} Minute Session</span>
                        <button onclick="window.open('${s.meet_link}', '_blank')" class="px-6 py-2.5 bg-white text-indigo-600 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">Join Call</button>
                    </div>
                </div>
            `;
        }

    } catch (err) {
        console.error("Overview Dashboard Error:", err);
    }
}
