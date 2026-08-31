import { supabase } from './supabase-client.js';

let attemptsDataCache = {};

window.addEventListener('RunGlobalAnalytics', async () => {
    try {
        const { data: exams, error: exErr } = await supabase.from('exams').select('id, faculty_id').eq('faculty_id', (await supabase.auth.getUser()).data.user.id);
        if (exErr) return console.error(exErr);
        
        const examIds = exams.map(e => e.id);
        if (examIds.length === 0) return;

        const { data: attempts, error: attErr } = await supabase.from('exam_attempts').select('exam_id, score, started_at, completed_at, inactivity_count').in('exam_id', examIds);
        if (attErr) return console.error(attErr);

        let totalTimeSecs = 0;
        let totalStrikes = 0;
        attempts.forEach(a => {
            if (a.completed_at) totalTimeSecs += (new Date(a.completed_at) - new Date(a.started_at)) / 1000;
            totalStrikes += a.inactivity_count || 0;
        });

        const performanceBox = document.getElementById('global-exam-performance');
        if (performanceBox) {
            performanceBox.classList.remove('hidden');
            document.getElementById('global-total-exams').innerText = exams.length;
            document.getElementById('global-total-attempts').innerText = attempts.length;
            document.getElementById('global-avg-time').innerText = attempts.length > 0 ? `${Math.round((totalTimeSecs / attempts.length)/60)}m` : '0m';
            document.getElementById('global-avg-strikes').innerText = attempts.length > 0 ? (totalStrikes / attempts.length).toFixed(1) : '0';

            // Global Performance Chart
            if (typeof Chart !== 'undefined') {
                const ctxPerf = document.getElementById('globalPerformanceChart').getContext('2d');
                if(window.globalPerfChart) window.globalPerfChart.destroy();
                
                // Aggregate scores by exam for the chart
                const examNames = exams.map(e => "Exam " + e.id.substring(0,4)); // Use shortened IDs for brevity
                const avgScores = exams.map(e => {
                    const eAttempts = attempts.filter(a => a.exam_id === e.id && a.score !== null);
                    if(eAttempts.length === 0) return 0;
                    return (eAttempts.reduce((acc, a) => acc + (a.score || 0), 0) / eAttempts.length).toFixed(1);
                });

                window.globalPerfChart = new Chart(ctxPerf, {
                    type: 'line',
                    data: {
                        labels: examNames,
                        datasets: [{
                            label: 'Avg Score',
                            data: avgScores,
                            borderColor: '#6366f1',
                            backgroundColor: 'rgba(99, 102, 241, 0.1)',
                            fill: true,
                            tension: 0.4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.1)' }, ticks: { color: '#94a3b8' } },
                            x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                        },
                        plugins: { legend: { display: false } }
                    }
                });

                const ctxInt = document.getElementById('globalIntegrityChart').getContext('2d');
                if(window.globalIntChart) window.globalIntChart.destroy();
                
                const strikeRanges = { 'Clean': 0, '1-2 Strikes': 0, '3+ Strikes': 0 };
                attempts.forEach(a => {
                    if ((a.inactivity_count || 0) === 0) strikeRanges['Clean']++;
                    else if (a.inactivity_count <= 2) strikeRanges['1-2 Strikes']++;
                    else strikeRanges['3+ Strikes']++;
                });

                window.globalIntChart = new Chart(ctxInt, {
                    type: 'bar',
                    data: {
                        labels: Object.keys(strikeRanges),
                        datasets: [{
                            data: Object.values(strikeRanges),
                            backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                            borderRadius: 8
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            y: { beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.1)' }, ticks: { color: '#94a3b8' } },
                            x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }
        }
    } catch(err) { console.error('Global metrics error:', err); }
});

window.addEventListener('AnalyzeExam', async (e) => {
    const examId = e.detail;
    console.log("[Analytics Engine Inline] Booting up for:", examId);
    
    const btn = document.getElementById(`btn-analyze-${examId}`);
    if (!btn) return;
    const parentRow = btn.closest('tr');
    if (!parentRow) return;

    const existingPane = document.getElementById(`inline-analytics-${examId}`);
    if (existingPane) {
        existingPane.remove();
        btn.innerHTML = `<span class="material-symbols-outlined text-[14px]">analytics</span> Analyze`;
        return;
    }

    btn.innerHTML = `<span class="material-symbols-outlined text-[14px] animate-spin">sync</span> Loading`;

    try {
        const { data: exam, error: examErr } = await supabase.from('exams').select('*').eq('id', examId).single();
        if (examErr) throw examErr;

        let { data: attempts, error: attErr } = await supabase.from('exam_attempts').select('*').eq('exam_id', examId);
        if (attErr) throw attErr;

        // Fetch All Applicable Students cleanly
        let allStudents = [];
        const {data: backupUsers} = await supabase.from('users').select('id, name').neq('role', 'faculty');
        
        let targetIds = exam.target_user_ids || [];
        if (exam.target_audience === 'specific' && targetIds.length > 0) {
            allStudents = backupUsers.filter(u => targetIds.includes(u.id));
        } else if (exam.target_audience === 'mentors') {
            const {data} = await supabase.from('users').select('id, name').eq('role', 'student_mentor');
            allStudents = data && data.length > 0 ? data : backupUsers;
        } else {
            const {data} = await supabase.from('users').select('id, name').in('role', ['student', 'student_mentor']);
            allStudents = data && data.length > 0 ? data : backupUsers;
        }

        const attendedMap = {};
        let totalScore = 0;
        let evaluatedCount = 0;

        // Rank Based Sort of attempts
        attempts = attempts.sort((a,b) => (b.score || 0) - (a.score || 0));

        let rank = 1;
        const attendeesListStr = attempts.map(att => {
            attendedMap[att.student_id] = true;
            const sName = att.student_name || 'Unknown';
            const sEmail = att.student_email || 'No Email';
            const sReg = att.student_reg_no || 'N/A';
            const sClass = att.student_class || 'N/A';
            
            let scoreUI = att.status === 'evaluated' ? `<span class="text-green-500 font-bold">${att.score}</span> / ${exam.total_marks}` : `<span class="text-slate-400">Evaluating</span>`;
            if (att.status === 'evaluated') {
                totalScore += att.score;
                evaluatedCount++;
            }

            let timeStr = 'In Progress';
            if (att.completed_at) {
                let ms = new Date(att.completed_at) - new Date(att.started_at);
                let totalSecs = Math.floor(ms / 1000);
                timeStr = totalSecs < 60 ? `${totalSecs}s` : `${Math.floor(totalSecs/60)}m ${totalSecs%60}s`;
            }
            
            attemptsDataCache[att.id] = { att, exam, sName, sEmail, sReg, sClass, timeStr };

            const rankBadge = att.status === 'evaluated' ? `<div class="size-6 rounded bg-indigo-600 text-white flex items-center justify-center font-black text-[10px]">#${rank++}</div>` : '';

            return `
            <div class="flex items-center justify-between p-3 border-b border-indigo-100 dark:border-indigo-900/30 hover:bg-white/50 dark:hover:bg-slate-800/50 transition-colors">
                <div class="flex items-center gap-3">
                    ${rankBadge}
                    <div class="size-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 flex items-center justify-center font-black text-xs uppercase">${sName.substring(0,2)}</div>
                    <div>
                        <p class="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase">${sName}</p>
                        <p class="text-[10px] text-slate-400 font-black tracking-widest mt-0.5">${timeStr} • REG: ${sReg} • STRIKES: ${att.inactivity_count}</p>
                    </div>
                </div>
                <div class="flex items-center gap-4">
                    <div class="text-sm border-r border-indigo-100 dark:border-slate-700 pr-4">${scoreUI}</div>
                    <button onclick="window.dispatchEvent(new CustomEvent('ShowCandidateDetails', {detail: '${att.id}'}))" class="px-2 py-1 bg-white hover:bg-slate-50 border border-slate-200 rounded text-indigo-500 shadow-sm transition-all focus:outline-none"><span class="material-symbols-outlined text-[16px]">visibility</span> Analysis</button>
                </div>
            </div>`;
        }).join('');

        let absenteesStr = '';
        let absentCount = 0;
        allStudents.forEach(stu => {
            if (!attendedMap[stu.id]) {
                absentCount++;
                absenteesStr += `
                <div class="p-3 flex items-center gap-3 border-b border-rose-100 dark:border-rose-900/30">
                    <div class="size-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-600 flex items-center justify-center font-black text-xs">${(stu.name || 'UN').substring(0,2)}</div>
                    <p class="text-sm font-bold text-slate-800 dark:text-slate-200">${stu.name}</p>
                </div>`;
            }
        });

        const trHtml = `
            <tr id="inline-analytics-${examId}" class="bg-indigo-50/50 dark:bg-indigo-900/10">
                <td colspan="4" class="p-6">
                    <div class="rounded-2xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-800 shadow-xl overflow-hidden p-6 animate-in slide-in-from-top-2">
                        
                        <div class="flex flex-wrap items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-6 mb-6">
                            <div class="flex items-center gap-4">
                                <div class="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 p-3 rounded-xl"><span class="material-symbols-outlined h-6 w-6">troubleshoot</span></div>
                                <div>
                                    <h4 class="text-lg font-black text-slate-800 dark:text-white uppercase tracking-tight">Post-Assessment Dashboard</h4>
                                    <p class="text-xs font-bold text-slate-400 capitalize tracking-widest">${exam.title}</p>
                                </div>
                            </div>
                            <div class="flex gap-6 mt-4 md:mt-0">
                                <div class="text-center"><p class="text-3xl font-black text-slate-800 dark:text-slate-200">${allStudents.length}</p><p class="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Target Cohort</p></div>
                                <div class="text-center"><p class="text-3xl font-black text-emerald-500">${attempts.length}</p><p class="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Attended</p></div>
                                <div class="text-center"><p class="text-3xl font-black text-rose-500">${absentCount}</p><p class="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Missing</p></div>
                                <div class="text-center border-l border-slate-200 dark:border-slate-800 pl-6"><p class="text-3xl font-black text-indigo-600">${evaluatedCount > 0 ? (totalScore/evaluatedCount).toFixed(1) : '-'}</p><p class="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Avg Score</p></div>
                            </div>
                        </div>

                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 relative">
                            <div class="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-4 border border-slate-100 dark:border-slate-800 h-96 overflow-y-auto custom-scrollbar relative">
                                <h5 class="text-xs font-black text-emerald-600 uppercase tracking-widest mb-4 sticky top-0 bg-slate-50 dark:bg-[#151c2c] py-2">Ranked Attendee List</h5>
                                ${attendeesListStr || '<p class="text-xs text-slate-400 italic font-bold">No attendance records found.</p>'}
                            </div>
                            
                            <div class="bg-rose-50/50 dark:bg-rose-900/10 rounded-xl p-4 border border-rose-100 dark:border-rose-900/30 h-96 overflow-y-auto custom-scrollbar relative">
                                <h5 class="text-xs font-black text-rose-600 uppercase tracking-widest mb-4 sticky top-0 bg-rose-50/50 dark:bg-[#1a1721] py-2">Missing Candidates</h5>
                                ${absenteesStr || '<p class="text-xs text-emerald-500 italic font-bold">Absolutely 100% Attendance Achieved!</p>'}
                            </div>
                        </div>

                    </div>
                </td>
            </tr>
        `;
        
        parentRow.insertAdjacentHTML('afterend', trHtml);
        btn.innerHTML = `<span class="material-symbols-outlined text-[14px]">close</span> Close`;

    } catch (err) {
        console.error(err);
        alert(`Analysis Error: ${err.message}`);
        btn.innerHTML = `<span class="material-symbols-outlined text-[14px]">analytics</span> Analyze`;
    }
});

// Inline Candidate Overlay
window.addEventListener('ShowCandidateDetails', (e) => {
    const attemptId = e.detail;
    const data = attemptsDataCache[attemptId];
    if (!data) return alert("System Sync Error: Attempt details lost from memory.");

    const existingModals = document.querySelectorAll('.candidate-float-modal');
    existingModals.forEach(m => m.remove());

    const { att, exam, sName, sEmail, sReg, sClass, timeStr } = data;

    let totalQuestions = exam.questions ? exam.questions.length : 0;
    let scoreVal = Number(att.score) || 0;
    
    let correct = scoreVal;
    let attemptedCount = correct; // at minimum, they attempted what they got right
    
    try {
        let ansArray = typeof att.answers === 'string' ? JSON.parse(att.answers) : (att.answers || []);
        if (Array.isArray(ansArray) && ansArray.length > 0) {
            let actualAttempts = ansArray.filter(a => a.selected_answer !== null && a.selected_answer !== undefined && String(a.selected_answer).trim() !== '').length;
            if (actualAttempts >= correct) {
                attemptedCount = actualAttempts;
            }
        }
    } catch(e) { console.error("Parse error on answers", e); }

    let wrong = Math.max(0, attemptedCount - correct);
    let unans = Math.max(0, totalQuestions - attemptedCount);

    const modalHTML = `
        <div class="candidate-float-modal fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in" id="cand-modal-wrapper-${att.id}">
            <div class="bg-white dark:bg-slate-900 rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 dark:border-slate-800 p-8 relative">
                
                <button onclick="document.getElementById('cand-modal-wrapper-${att.id}').remove()" class="absolute top-6 right-6 p-2 bg-slate-100 hover:bg-rose-100 text-slate-500 hover:text-rose-600 rounded-full transition-colors flex items-center justify-center focus:outline-none shrink-0 cursor-pointer shadow-sm z-50">
                    <span class="material-symbols-outlined">close</span>
                </button>

                <div class="flex flex-col sm:flex-row items-center gap-4 mb-8 pb-8 border-b border-slate-100 dark:border-slate-800 text-center sm:text-left">
                    <div class="size-16 rounded-2xl bg-indigo-600 shrink-0 flex items-center justify-center text-white text-2xl font-black uppercase shadow-lg shadow-indigo-600/30">
                        ${sName.substring(0,2)}
                    </div>
                    <div>
                        <h2 class="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">${sName}</h2>
                        <p class="text-xs font-bold text-indigo-400 capitalize tracking-widest mt-1">${sEmail}</p>
                        <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 mt-2">CLASS: ${sClass} • REG NO: ${sReg}</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                    <div class="bg-emerald-50 dark:bg-emerald-900/10 p-4 rounded-2xl text-center border border-emerald-100 dark:border-emerald-900/30">
                        <p class="text-3xl font-black text-emerald-600">${att.score !== null ? att.score : '-'}</p>
                        <p class="text-[10px] font-black uppercase text-emerald-400 tracking-widest mt-1">Score / ${exam.total_marks}</p>
                    </div>
                    <div class="bg-indigo-50 dark:bg-indigo-900/10 p-4 rounded-2xl text-center border border-indigo-100 dark:border-indigo-900/30">
                        <p class="text-3xl font-black text-indigo-600">${timeStr}</p>
                        <p class="text-[10px] font-black uppercase text-indigo-400 tracking-widest mt-1">Total Time</p>
                    </div>
                    <div class="bg-rose-50 dark:bg-rose-900/10 p-4 rounded-2xl text-center border border-rose-100 dark:border-rose-900/30">
                        <p class="text-3xl font-black text-rose-600">${wrong}</p>
                        <p class="text-[10px] font-black uppercase text-rose-400 tracking-widest mt-1">Wrong Answers</p>
                    </div>
                    <div class="bg-amber-50 dark:bg-amber-900/10 p-4 rounded-2xl text-center border border-amber-100 dark:border-amber-900/30">
                        <p class="text-3xl font-black text-amber-600">${att.inactivity_count}</p>
                        <p class="text-[10px] font-black uppercase text-amber-500 tracking-widest mt-1">Tab Inactivity</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                    <!-- Accuracy Chart -->
                    <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center justify-between">
                        <h3 class="text-xs font-black uppercase text-slate-800 dark:text-white tracking-widest w-full text-center mb-4">Response Accuracy</h3>
                        <div class="h-44 w-full relative flex items-center justify-center">
                            <canvas id="candItemChart-${att.id}"></canvas>
                        </div>
                    </div>
                    <!-- Behavior Analysis Summary -->
                    <div class="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-center">
                        <h3 class="text-xs font-black uppercase text-slate-800 dark:text-white tracking-widest mb-6">Behavioral Analysis</h3>
                        <div class="flex items-center gap-4 mb-4">
                            <div class="size-16 rounded-2xl ${att.inactivity_count > 3 ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' : (att.inactivity_count > 0 ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400')} flex items-center justify-center text-3xl font-black shrink-0">
                                ${att.inactivity_count}
                            </div>
                            <div>
                                <h4 class="text-lg font-black text-slate-800 dark:text-white">Security Strikes</h4>
                                <p class="text-[10px] uppercase font-bold text-slate-400 tracking-widest mt-1">Recorded boundary violations</p>
                            </div>
                        </div>
                        <div class="p-4 rounded-xl ${att.inactivity_count > 3 ? 'bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-900/30 text-rose-700 dark:text-rose-400' : (att.inactivity_count > 0 ? 'bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 text-amber-700 dark:text-amber-400' : 'bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 text-emerald-700 dark:text-emerald-400')}">
                            <p class="text-xs font-bold leading-relaxed">
                                <span class="font-black uppercase tracking-wider block mb-1">System Conclusion:</span>
                                ${att.inactivity_count > 3 
                                    ? 'High Risk. The candidate continuously suspended the assessment window. This strongly suggests unauthorized resource usage.' 
                                    : (att.inactivity_count > 0 
                                        ? 'Moderate Risk. The candidate occasionally left the active assessment window. Review may be needed.' 
                                        : 'Clean Session. The candidate maintained perfect focus within the assessment environment bounds.')}
                            </p>
                        </div>
                    </div>
                </div>

                <div class="bg-slate-50 dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700">
                    <h3 class="text-xs font-black uppercase text-slate-800 dark:text-slate-300 tracking-widest mb-2">Security Performance Summary</h3>
                    <p class="text-[10px] text-slate-500 font-bold italic leading-relaxed">
                        <span class="text-rose-400 font-black">*Note:</span> A high volume of security violations (strikes) typically indicates the candidate minimized the browser, searched for answers, or was flagged by the automated anti-cheat protocol multiple times during the active module timeframe.
                    </p>
                </div>
                
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Initialize the new charts
    if (typeof Chart !== 'undefined') {
        const ctxItem = document.getElementById(`candItemChart-${att.id}`).getContext('2d');
        new Chart(ctxItem, {
            type: 'doughnut',
            data: {
                labels: ['Correct', 'Incorrect', 'Skipped'],
                datasets: [{
                    data: [correct, wrong, unans],
                    backgroundColor: ['#10b981', '#ef4444', '#cbd5e1'],
                    borderWidth: 0,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%',
                layout: { padding: 10 },
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 15, color: '#64748b', font: {family: 'Inter', weight: 'bold', size: 11} } } }
            }
        });
    }
});
