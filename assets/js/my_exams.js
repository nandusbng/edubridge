let currentUser = null;

async function checkAuth() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
        window.location.href = 'landing.html';
        return null;
    }
    return session.user;
}

async function loadMyExams() {
    const list = document.getElementById('full-page-exams-list');
    if (!list) return;

    try {
        // Query assigned exams
        let query = supabase.from('exams').select('*, exam_attempts(*)').eq('is_active', true);
        
        // If mentor role, load 'mentors' exams too. For now we fetch everything and filter client side.
        const { data: exams, error } = await query.order('created_at', { ascending: false });
        if (error) throw error;

        let applicableExams = exams.filter(e => {
            if (e.target_audience === 'specific' && e.target_user_ids.includes(currentUser.id)) return true;
            if (e.target_audience === 'all_slow_learners') return true; 
            if (e.target_audience === 'mentors' && currentUser.user_metadata?.role === 'student_mentor') return true;
            return false;
        });

        if (applicableExams.length === 0) {
            list.innerHTML = `<div class="col-span-full py-16 text-center text-slate-400 font-medium">No pending or completed assessments in your syllabus.</div>`;
            return;
        }

        list.innerHTML = applicableExams.map(e => {
            const attempt = e.exam_attempts.find(a => a.student_id === currentUser.id);
            let statusBadge = `<span class="px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-black uppercase tracking-widest rounded-full">Pending</span>`;
            let actionBtn = `<button onclick="window.location.href='exam.html?id=${e.id}'" class="mt-4 w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors">Start Assessment</button>`;
            let scoreStr = '';
            
            let desc = {};
            try { if(e.description) desc = JSON.parse(e.description); } catch(err){}
            
            let isExpired = false;
            if (desc.deadline_at && new Date() > new Date(desc.deadline_at)) {
                isExpired = true;
            }

            if (attempt) {
                if (attempt.status === 'in_progress') {
                    if (isExpired) {
                        statusBadge = `<span class="px-3 py-1 bg-red-100 text-red-700 text-xs font-black uppercase tracking-widest rounded-full">Expired</span>`;
                        actionBtn = `<button disabled class="mt-4 w-full py-3 bg-slate-100/50 text-slate-400 rounded-xl font-bold uppercase tracking-widest text-xs cursor-not-allowed">Timeout Reached</button>`;
                    } else {
                        statusBadge = `<span class="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-black uppercase tracking-widest rounded-full">In Progress</span>`;
                        actionBtn = `<button onclick="window.location.href='exam.html?id=${e.id}'" class="mt-4 w-full py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold uppercase tracking-widest text-xs transition-colors">Resume Assessment</button>`;
                    }
                } else if (attempt.status === 'submitted') {
                    statusBadge = `<span class="px-3 py-1 bg-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest rounded-full">Under Evaluation</span>`;
                    actionBtn = `<button disabled class="mt-4 w-full py-3 bg-slate-100/50 text-slate-400 rounded-xl font-bold uppercase tracking-widest text-xs cursor-not-allowed">Awaiting Result</button>`;
                } else if (attempt.status === 'evaluated') {
                    statusBadge = `<span class="px-3 py-1 bg-green-100 text-green-700 text-xs font-black uppercase tracking-widest rounded-full">Completed</span>`;
                    scoreStr = `<p class="mt-2 text-3xl font-black text-slate-900 dark:text-white">${attempt.score} <span class="text-sm font-medium text-slate-400">/ ${e.total_marks}</span></p>`;
                    actionBtn = `<button disabled class="mt-4 w-full py-3 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-xl font-bold uppercase tracking-widest text-xs cursor-not-allowed">Finished</button>`;
                }
            } else if (isExpired) {
                statusBadge = `<span class="px-3 py-1 bg-red-100 text-red-700 text-xs font-black uppercase tracking-widest rounded-full">Expired</span>`;
                actionBtn = `<button disabled class="mt-4 w-full py-3 bg-slate-100/50 text-slate-400 rounded-xl font-bold uppercase tracking-widest text-xs cursor-not-allowed">Deadline Passed</button>`;
            }

            return `
            <div class="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-6 flex flex-col hover:border-indigo-300 transition-colors">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h4 class="font-bold text-slate-800 dark:text-slate-100 text-lg">${e.title}</h4>
                        <p class="text-xs text-indigo-500 font-bold uppercase tracking-widest mt-1">${e.subject}</p>
                    </div>
                    ${statusBadge}
                </div>
                
                <div class="flex items-center gap-4 text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">
                    <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">timer</span> ${e.duration_minutes}m</span>
                    <span class="flex items-center gap-1"><span class="material-symbols-outlined text-[16px]">quiz</span> ${e.questions.length} MCQs</span>
                </div>
                
                <div class="mt-auto pt-4 flex-1 flex flex-col justify-end">
                    ${scoreStr}
                    ${actionBtn}
                </div>
            </div>`;
        }).join('');

    } catch(err) {
        console.error(err);
        list.innerHTML = `<div class="col-span-full py-16 text-center text-red-400 font-medium">Failed to sync: ${err.message}</div>`;
    }
}

async function loadMenteePerformance() {
    const list = document.getElementById('mentee-performance-list');
    if (!list) return;

    try {
        // 1. Get accepted mentees for this mentor
        const { data: menteeReqs } = await supabase
            .from('mentorship_requests')
            .select('mentee_id')
            .eq('mentor_id', currentUser.id)
            .eq('status', 'accepted');

        if (!menteeReqs || menteeReqs.length === 0) {
            list.innerHTML = `<div class="py-12 text-center text-slate-400 font-medium">You don't have any active mentees yet.</div>`;
            return;
        }

        const menteeIds = menteeReqs.map(r => r.mentee_id);

        // 2. Get mentee profiles and their exam attempts (joined with exams)
        const [{ data: menteeProfiles }, { data: allAttempts }] = await Promise.all([
            supabase.from('users').select('id, name, email, register_number').in('id', menteeIds),
            supabase.from('exam_attempts').select('*, exams(*)').in('student_id', menteeIds).order('completed_at', { ascending: false })
        ]);

        if (!menteeProfiles || menteeProfiles.length === 0) {
            list.innerHTML = `<div class="py-12 text-center text-slate-400 font-medium">Mentee profile data not found.</div>`;
            return;
        }

        list.innerHTML = menteeProfiles.map(profile => {
            const attempts = allAttempts ? allAttempts.filter(a => a.student_id === profile.id) : [];
            
            // Basic Analysis Calc
            let totalPossible = 0;
            let totalObtained = 0;
            attempts.forEach(a => {
                const s = a.status;
                if(s === 'evaluated' || (s === 'submitted' && a.score !== null && a.score !== undefined)) {
                    totalObtained += (a.score || 0);
                    totalPossible += (a.exams?.total_marks || 100);
                }
            });
            const avgPercentage = totalPossible > 0 ? ((totalObtained / totalPossible) * 100).toFixed(1) : '0.0';
            
            const avatar = window.getAvatarUrl ? window.getAvatarUrl(profile.email, 48) : '';

            return `
                <div class="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 transition-all hover:shadow-lg border-l-4 border-l-emerald-500">
                    <div class="flex flex-col lg:flex-row gap-8">
                        <!-- Left: Mentee Profile & Stats -->
                        <div class="lg:w-1/4 border-r-0 lg:border-r border-slate-100 dark:border-slate-800 lg:pr-8">
                            <div class="flex items-center gap-4 mb-6">
                                <img src="${avatar}" class="size-14 rounded-2xl bg-emerald-50 border-2 border-white shadow-sm object-cover">
                                <div class="min-w-0">
                                    <h4 class="font-black text-slate-800 dark:text-slate-100 truncate text-base">${profile.name}</h4>
                                    <p class="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">${profile.register_number || 'REG—NO'}</p>
                                </div>
                            </div>
                            
                            <div class="grid grid-cols-2 lg:grid-cols-1 gap-3">
                                <div class="bg-emerald-50 dark:bg-emerald-900/10 rounded-2xl p-4 border border-emerald-100/50 dark:border-emerald-800/30">
                                    <p class="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-1">Success Rate</p>
                                    <p class="text-2xl font-black text-slate-900 dark:text-white">${avgPercentage}%</p>
                                </div>
                                <div class="bg-indigo-50 dark:bg-indigo-900/10 rounded-2xl p-4 border border-indigo-100/50 dark:border-indigo-800/30">
                                    <p class="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-1">Total Exams</p>
                                    <p class="text-2xl font-black text-slate-900 dark:text-white">${attempts.length}</p>
                                </div>
                            </div>
                        </div>

                        <!-- Right: History Analysis -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between mb-4 px-2">
                                <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Historical Performance Breakdown</p>
                                <span class="text-[9px] font-bold text-slate-400 italic">Showing last 5 attempts</span>
                            </div>
                            
                            <div class="overflow-x-auto">
                                ${attempts.length === 0 ? `
                                    <div class="h-32 flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                                        <span class="material-symbols-outlined text-slate-300 mb-2">history</span>
                                        <p class="text-xs text-slate-400 font-medium">No assessment data recorded yet.</p>
                                    </div>
                                ` : `
                                    <table class="w-full text-left">
                                        <thead>
                                            <tr class="text-[9px] font-black text-slate-300 dark:text-slate-600 uppercase tracking-widest border-b border-slate-50 dark:border-slate-800">
                                                <th class="px-3 py-2">Module / Exam</th>
                                                <th class="px-3 py-2">Date</th>
                                                <th class="px-3 py-2">Status</th>
                                                <th class="px-3 py-2 text-right">Result</th>
                                            </tr>
                                        </thead>
                                        <tbody class="divide-y divide-slate-50 dark:divide-slate-800">
                                            ${attempts.slice(0, 5).map(a => {
                                                const s = a.status === 'evaluated';
                                                return `
                                                    <tr class="group hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                        <td class="px-3 py-4">
                                                            <p class="text-xs font-bold text-slate-700 dark:text-slate-200">${a.exams?.title || 'Unknown Assessment'}</p>
                                                            <p class="text-[9px] font-medium text-slate-400 mt-0.5">${a.exams?.subject || 'General'}</p>
                                                        </td>
                                                        <td class="px-3 py-4 text-[10px] font-medium text-slate-500 whitespace-nowrap">
                                                            ${new Date(a.completed_at || a.started_at).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}
                                                        </td>
                                                        <td class="px-3 py-4">
                                                            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight ${s ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'}">
                                                                ${a.status}
                                                            </span>
                                                        </td>
                                                        <td class="px-3 py-4 text-right">
                                                            <p class="text-xs font-black text-slate-800 dark:text-white">${a.score || 0} <span class="text-[10px] text-slate-400 font-medium">/ ${a.exams?.total_marks || 100}</span></p>
                                                            <div class="w-16 h-1 bg-slate-100 dark:bg-slate-800 rounded-full mt-1.5 ml-auto overflow-hidden">
                                                                <div class="h-full bg-emerald-500" style="width: ${((a.score / (a.exams?.total_marks || 100))*100)}%;"></div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                `;
                                            }).join('')}
                                        </tbody>
                                    </table>
                                `}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error("Analysis load error:", err);
        list.innerHTML = `<div class="py-12 text-center text-red-500 text-sm">Error aggregating performance analysis.</div>`;
    }
}

async function init() {
    currentUser = await checkAuth();
    if (!currentUser) return;
    
    // Add routing for Mentor Portal navigation links
    document.querySelectorAll('.nav-tab[data-tab]').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            window.location.href = 'mentor.html';
        });
    });

    loadMyExams();
    loadMenteePerformance();
}

init();
