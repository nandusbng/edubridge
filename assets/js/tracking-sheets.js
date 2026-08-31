import { supabase } from './supabase-client.js';

export async function initTrackingSheets(containerId) {
    const list = document.getElementById(containerId);
    if (!list) return;

    try {
        // Fetch all completed doubt sessions with mentee/mentor profiles
        const { data: logs, error } = await supabase
            .from('mentorship_doubt_sessions')
            .select(`
                *,
                mentee:student_id (id, name, email, register_number, branch, year, section, faculty_advisor),
                mentor:mentor_id (id, name, email, register_number, branch, year, section, faculty_advisor)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!logs || logs.length === 0) {
            list.innerHTML = `<tr><td colspan="4" class="px-8 py-20 text-center text-slate-400 italic font-medium">No interaction records found in the ecosystem.</td></tr>`;
            return;
        }

        // Group by Mentor-Mentee Pair
        const pairs = {};
        logs.forEach(log => {
            const key = `${log.mentor_id}_${log.student_id}`;
            if (!pairs[key]) {
                pairs[key] = {
                    mentor: log.mentor || { name: log.mentor_name || 'Unknown Mentor', email: log.mentor_email || '' },
                    mentee: log.mentee || { name: log.mentee_name || 'Unknown Student', email: log.mentee_email || '' },
                    sessions: [],
                    lastDate: log.mentee_date || new Date().toISOString().split('T')[0]
                };
            }
            pairs[key].sessions.push(log);
        });

        list.innerHTML = Object.values(pairs).map(pair => {
            const mName = pair.mentor.name || 'Unknown';
            const sName = pair.mentee.name || 'Unknown';
            const sessionCount = pair.sessions.length;
            const lastDate = new Date(pair.lastDate).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
            const pairKey = `${pair.mentor.id || pair.sessions[0].mentor_id}_${pair.mentee.id || pair.sessions[0].student_id}`;

            return `
                <tr class="group hover:bg-blue-50/30 dark:hover:bg-slate-800 transition-all font-display border-b border-slate-50 dark:border-slate-800 cursor-pointer" 
                    onclick="window.showPairDetails('${pairKey}')">
                    <td class="px-8 py-6">
                        <div class="flex items-center gap-4">
                            <div class="flex -space-x-3 overflow-hidden">
                                <div class="size-10 rounded-full border-2 border-white dark:border-slate-900 bg-indigo-600 flex items-center justify-center text-white text-[10px] font-black">${sName.charAt(0)}</div>
                                <div class="size-10 rounded-full border-2 border-white dark:border-slate-900 bg-emerald-500 flex items-center justify-center text-white text-[10px] font-black">${mName.charAt(0)}</div>
                            </div>
                            <div class="flex flex-col">
                                <span class="font-black text-slate-900 dark:text-white uppercase tracking-tight">${sName} <span class="text-slate-300 font-medium mx-1">&</span> ${mName}</span>
                                <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">Cohort Collaboration</span>
                            </div>
                        </div>
                    </td>
                    <td class="px-8 py-6 text-center font-black text-slate-900 dark:text-white tabular-nums">${sessionCount}</td>
                    <td class="px-8 py-6 text-center text-slate-500 tabular-nums font-bold">${lastDate}</td>
                    <td class="px-8 py-6 text-center" onclick="event.stopPropagation()">
                        <button onclick="window.generateAndPrintSheet('${pair.mentor.id || pair.sessions[0].mentor_id}', '${pair.mentee.id || pair.sessions[0].student_id}')" 
                                class="px-6 py-2.5 bg-slate-900 dark:bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg hover:shadow-blue-500/20">
                            Generate Report
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        // Store sessions globally for printing without refetching
        window._activePairs = pairs;

    } catch (err) {
        console.error("Tracking Sheets Init Failed:", err);
    }
}

window.showPairDetails = function(pairKey) {
    const pair = window._activePairs[pairKey];
    if (!pair) return;

    const modal = document.getElementById('interaction-detail-modal');
    const content = document.getElementById('detail-modal-content');
    if (!modal || !content) return;

    const { mentor, mentee } = pair;

    content.innerHTML = `
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-10">
            <!-- Mentor Details -->
            <div class="space-y-6">
                <div class="flex items-center gap-4 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-[32px] border border-slate-100 dark:border-slate-800">
                    <img src="${window.getAvatarUrl(mentor.email, 64)}" class="size-16 rounded-2xl object-cover shadow-lg">
                    <div>
                        <h4 class="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">${mentor.name}</h4>
                        <p class="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Lead Peer Mentor</p>
                    </div>
                </div>
                
                <div class="grid grid-cols-2 gap-4">
                    <div class="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Class / Section</p>
                        <p class="text-sm font-black text-slate-800 dark:text-slate-100 uppercase">${mentor.section || (pair.sessions[0].mentor_section) || "—"}</p>
                    </div>
                    <div class="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Academic Year</p>
                        <p class="text-sm font-black text-slate-800 dark:text-slate-100 uppercase">Year ${mentor.year || (pair.sessions[0].mentor_year) || "—"}</p>
                    </div>
                </div>

                <div class="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Institutional Contact</p>
                    <div class="space-y-3">
                        <div class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                            <span class="material-symbols-outlined text-sm text-indigo-500">mail</span>
                            <span class="text-xs font-bold font-mono">${mentor.email}</span>
                        </div>
                        <div class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                            <span class="material-symbols-outlined text-sm text-indigo-500">badge</span>
                            <span class="text-xs font-black uppercase tracking-widest">${mentor.register_number || (pair.sessions[0].mentor_reg_no) || "—"}</span>
                        </div>
                    </div>
                </div>

                <div class="p-6 rounded-3xl bg-indigo-600 text-white shadow-xl shadow-indigo-100 dark:shadow-none">
                    <p class="text-[9px] font-black text-indigo-200 uppercase tracking-[0.2em] mb-2">Faculty Advisor</p>
                    <p class="text-lg font-black uppercase tracking-tight">${mentor.faculty_advisor || "Standard Assignment"}</p>
                </div>
            </div>

            <!-- Mentee Details -->
            <div class="space-y-6">
                <div class="flex items-center gap-4 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-[32px] border border-slate-100 dark:border-slate-800">
                    <img src="${window.getAvatarUrl(mentee.email, 64)}" class="size-16 rounded-2xl object-cover shadow-lg">
                    <div>
                        <h4 class="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">${mentee.name}</h4>
                        <p class="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Active Mentee</p>
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-4">
                    <div class="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Class / Section</p>
                        <p class="text-sm font-black text-slate-800 dark:text-slate-100 uppercase">${mentee.section || (pair.sessions[0].mentee_section) || "—"}</p>
                    </div>
                    <div class="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                        <p class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">Academic Year</p>
                        <p class="text-sm font-black text-slate-800 dark:text-slate-100 uppercase">Year ${mentee.year || (pair.sessions[0].mentee_year) || "—"}</p>
                    </div>
                </div>

                <div class="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                    <p class="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Institutional Contact</p>
                    <div class="space-y-3">
                        <div class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                            <span class="material-symbols-outlined text-sm text-emerald-500">mail</span>
                            <span class="text-xs font-bold font-mono">${mentee.email}</span>
                        </div>
                        <div class="flex items-center gap-3 text-slate-600 dark:text-slate-300">
                            <span class="material-symbols-outlined text-sm text-emerald-500">badge</span>
                            <span class="text-xs font-black uppercase tracking-widest">${mentee.register_number || (pair.sessions[0].mentee_reg_no) || "—"}</span>
                        </div>
                    </div>
                </div>

                <div class="p-6 rounded-3xl bg-emerald-500 text-white shadow-xl shadow-emerald-100 dark:shadow-none">
                    <p class="text-[9px] font-black text-emerald-100 uppercase tracking-[0.2em] mb-2">Faculty Advisor</p>
                    <p class="text-lg font-black uppercase tracking-tight">${mentee.faculty_advisor || "Standard Assignment"}</p>
                </div>
            </div>
        </div>
    `;

    modal.style.setProperty('display', 'flex', 'important');
};

window.generateAndPrintSheet = async function(mentorId, menteeId) {
    const key = `${mentorId}_${menteeId}`;
    const pair = window._activePairs ? window._activePairs[key] : null;
    
    if (!pair) {
        alert("Unable to find pair data. Please refresh.");
        return;
    }

    // Generate high-fidelity HTML populated with database data
    const mentorHtml = generateTrackingSheetHTML(pair, false, 8);  // Dynamic natural length
    const menteeHtml = generateTrackingSheetHTML(pair, true, 8);   // Dynamic natural length
    const reportHtml = `<div style="min-height: 1187mm;">${mentorHtml}</div>\n<div style="page-break-before: always;"></div>\n${menteeHtml}`;
    const reportStyles = `
        <style>
            @page { 
                margin: 0; 
                size: A4; 
            }
            * { margin:0; padding:0; box-sizing:border-box; }
            body { 
                font-family: "Times New Roman", serif; 
                background: #fff; 
                color: #000; 
                -webkit-print-color-adjust: exact; 
                print-color-adjust: exact;
            }
            .page { 
                width: 100%; 
                margin: 0 auto; 
                padding: 18mm 18mm 18mm 18mm;
                position: relative; 
                background: #fff; 
            }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
            .logo-box { width: 85px; height: 85px; border: 1.5px solid #000; display: flex; align-items: center; justify-content: center; }
            .right-logos { display: flex; gap: 10px; }
            .small-logo { width: 75px; height: 75px; border: 1.5px solid #000; display: flex; align-items: center; justify-content: center; }
            .heading { flex: 1; text-align: center; padding: 0 15px; }
            .heading h1 { font-size: 21px; font-weight: bold; line-height: 1.2; text-transform: uppercase; }
            .heading h2 { font-size: 16px; margin-top: 5px; font-weight: bold; }
            .main-title { text-align: center; margin-top: 25px; font-size: 20px; font-weight: bold; text-decoration: underline; line-height: 1.3; }
            .sub-title { text-align: center; font-size: 14px; margin-top: 6px; font-style: italic; margin-bottom: 25px; }
            .info { margin-top: 15px; font-size: 16px; line-height: 2; margin-bottom: 10px; }
            .section-title { margin-top: 25px; margin-bottom: 10px; font-size: 17px; font-weight: bold; text-decoration: underline; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 15px; }
            td, th { border: 1.2px solid #000; padding: 8px 12px; vertical-align: middle; font-size: 14px; color: #000; }
            th { font-weight: bold; text-align: center; background: #fafafa; font-size: 13px; text-transform: uppercase; }
            .label { width: 40%; font-weight: bold; background: #fcfcfc; }
            .big-box { height: 90px; }
            .track-table td { height: 60px; }
            .center { text-align: center; }
            .data-fill { font-weight: bold; text-transform: uppercase; padding-left: 5px; }
            
            /* Multi-page Spacing Hacks */
            thead { display: table-header-group; }
            /* This spacer adds a "top margin" to every page the table breaks across */
            .thead-spacer { height: 18mm; border: none !important; }
            .thead-spacer th { border: none !important; background: transparent !important; padding: 0 !important; }
            
            tr { page-break-inside: avoid; break-inside: avoid; }
            
            @media print {
                body { padding: 0; margin: 0; }
                .page { box-shadow: none; margin: 0; width: 100%; min-height: 297mm; }
            }
        </style>
    `;

    const fullContent = `<!DOCTYPE html><html><head>${reportStyles}</head><body>${reportHtml}</body></html>`;

    // Create hidden Iframe for isolated printing
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    iframe.style.zIndex = '-1';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(fullContent);
    doc.close();

    // Trigger Print after brief render delay
    setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 500);
}

function generateTrackingSheetHTML(pair, isMentee = false, minRows = 8) {
    const { mentor, mentee, sessions } = pair;
    const sortedSessions = [...sessions].sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const firstSession = sortedSessions[0] || {};

    // Local Public Assets (logo_left.jpeg, logo_mid.png, logo_right.png)
    const logoHtmlLeft = `<img src="/logo_left.jpeg" style="width:100%; height:100%; object-fit:contain;">`;
    const logoHtmlMid = `<img src="/logo_mid.png" style="width:100%; height:100%; object-fit:contain;">`;
    const logoHtmlRight = `<img src="/logo_right.png" style="width:100%; height:100%; object-fit:contain;">`;

    const dept = "Computer Science and Engineering";
    const prog = mentee.section || firstSession.mentee_section || '';

    // Data-mapped table rows - DYNAMIC (Show all sessions)
    const rows = sortedSessions.map((s, idx) => {
        const date = isMentee ? s.mentee_date : s.mentor_date;
        const needs = isMentee ? s.mentee_needs : s.mentor_needs_addressed;
        const support = isMentee ? s.mentee_support_requested : s.mentor_support_provided;
        const mode = isMentee ? s.mentee_mode : s.mentor_mode;
        const duration = isMentee ? s.mentee_duration : s.mentor_duration;
        const nextDate = isMentee ? s.mentee_next_date : s.mentor_next_plan_date;

        return `
        <tr>
            <td class="center">${idx + 1}</td>
            <td class="center">${date || ''}</td>
            <td>${needs || ''}</td>
            <td>${support || ''}</td>
            <td class="center">${mode || ''} ${duration ? '/ ' + duration + 'm' : ''}</td>
            <td class="center">${nextDate || ''}</td>
            <td></td>
        </tr>
        `;
    });

    // Minimum row padding logic
    const MIN_ROWS = minRows;
    if (rows.length < MIN_ROWS) {
        let count = rows.length;
        while (count < MIN_ROWS) {
            rows.push(`<tr><td class="center">${count + 1}</td><td></td><td></td><td></td><td></td><td></td><td></td></tr>`);
            count++;
        }
    }

    return `
        <style>
            thead { display: table-header-group; }
            tfoot { display: table-footer-group; }
            tr { page-break-inside: avoid; break-inside: avoid; }
            .page { page-break-after: always; }
        </style>
        <div class="page">
            <div class="header">
                <div class="logo-box">${logoHtmlLeft}</div>
                <div class="heading">
                    <h1>SRI VENKATESWARA COLLEGE OF ENGINEERING</h1>
                    <h2>OFFICE OF DEAN ACADEMIC DEVELOPMENT</h2>
                </div>
                <div class="right-logos">
                    <div class="small-logo">${logoHtmlMid}</div>
                    <div class="small-logo">${logoHtmlRight}</div>
                </div>
            </div>

            <div class="main-title">PEER MENTORING - ACADEMIC TRACKING SHEET FOR ${isMentee ? 'MENTEE' : 'MENTOR'}</div>
            <div class="sub-title">${isMentee ? '( To be filled by Peer mentee )' : '(To be filled and maintained by the Peer Mentor as an individual sheet for every mentee)'}</div>

            <div class="info">
                Department: <span class="data-fill">${dept}</span><br>
                Programme: <span class="data-fill">${prog}</span>
            </div>

            <div class="section-title">Peer Mentor Details</div>
            <table>
                <tr>
                    <td class="label">Mentor Name / Registration number:</td>
                    <td class="data-fill">${mentor.name || firstSession.mentor_name || '—'} / ${mentor.register_number || firstSession.mentor_reg_no || '—'}</td>
                </tr>
                <tr>
                    <td class="label">Mentor Branch /Year/ Semester/ Section:</td>
                    <td class="data-fill">${mentor.branch || firstSession.mentor_branch || '—'} / ${mentor.year || firstSession.mentor_year || '—'} / ${mentor.semester || '—'} / ${mentor.section || firstSession.mentor_section || '—'}</td>
                </tr>
            </table>

            <div class="section-title" style="margin-top:20px;">Individual Mentee Academic Profile</div>
            <table>
                <tr>
                    <td class="label">Mentee Name / Registration number:</td>
                    <td class="data-fill">${mentee.name || firstSession.mentee_name || '—'} / ${mentee.register_number || firstSession.mentee_reg_no || '—'}</td>
                </tr>
                <tr>
                    <td class="label">Mentee Branch /Year/ Semester/ Section:</td>
                    <td class="data-fill">${mentee.branch || firstSession.mentee_branch || '—'} / ${mentee.year || firstSession.mentee_year || '—'} / ${mentee.semester || '—'} / ${mentee.section || firstSession.mentee_section || '—'}</td>
                </tr>
                <tr>
                    <td class="label">Observed general academic needs/ support:</td>
                    <td class="big-box data-fill">${firstSession.mentee_needs || '—'}</td>
                </tr>
            </table>

            <div class="section-title" style="margin-top:20px;">Academic Tracking Sheet to be filled by the Peer ${isMentee ? 'Mentee' : 'Mentor'}</div>
            <table class="track-table">
                <thead>
                    <tr class="thead-spacer"><th colspan="7"></th></tr>
                    <tr>
                        <th style="width:6%">S. No</th>
                        <th style="width:10%">Date</th>
                        <th style="width:17%">Needs Identified</th>
                        <th style="width:29%">Activities / Support Provided</th>
                        <th style="width:12%">Mode & Duration</th>
                        <th style="width:14%">Next Plan</th>
                        <th style="width:12%">Signature</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.join('')}
                </tbody>
            </table>

            <div style="page-break-inside: avoid; break-inside: avoid; margin-top: 30px; padding-top: 10px;">
                <div style="font-size: 13px; line-height: 1.6;">
                    <p style="font-weight: bold; text-decoration: underline; margin-bottom: 8px;">Important note:</p>
                    <ul style="list-style-type: disc; margin-left: 20px;">
                        <li>Peer mentoring should take place every week, either within college hours (during seminar/library hours) in physical mode or outside college hours, in online mode.</li>
                        <li>Entries in the sheet must be legible and neatly handwritten.</li>
                        <li>The sheet should be updated by the peer ${isMentee ? 'mentee' : 'mentor'} after every mentoring interaction and should be given to the student leader two weeks once.</li>
                    </ul>
                </div>

                <div style="margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div style="font-size: 14px; line-height: 2;">
                        <p style="font-weight: bold;">Signature of AO Coordinator</p>
                        <p>Name: __________________________</p>
                        <p>Department: _____________________</p>
                    </div>
                </div>
            </div>
        </div>
    `;
}
