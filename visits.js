// ==========================================
// visits.js - منطق صفحة الزيارات - نسخة مصححة
// تم حل مشكلة الاستيراد الدائري والملفات المعكوسة
// ==========================================
import { db } from './firebase-config.js';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let currentActiveNoteRowId = null;
let searchTimeout;
const openSubTables = new Set();
const VISITS_LOGS_KEY = 'asgate_visits_logs_v1';

// ---------- أدوات مساعدة ----------
function getTodayDate() {
    const d = new Date();
    return d.toISOString().split('T')[0];
}

function formatMonthYear(dateString) {
    if (!dateString) return 'بدون تاريخ';
    const parts = dateString.split('-');
    if (parts.length < 2) return dateString;
    const year = parts[0];
    const monthIndex = parseInt(parts[1], 10) - 1;
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    return `${months[monthIndex]}-${year}`;
}

function getLastNoteOnlyFromJSON(jsonStr) {
    try {
        let arr = JSON.parse(jsonStr || "[]");
        if (Array.isArray(arr) && arr.length > 0) return arr[arr.length - 1].text;
    } catch(e) {}
    return "إضافة ملاحظة...";
}

// ---------- الاستماع اللحظي ----------
function listenToVisits() {
    const visitsRef = collection(db, "visits");
    onSnapshot(visitsRef, (snapshot) => {
        const tbody = document.getElementById('tableBody');
        if (!tbody) return;
        
        // حفظ التركيز قبل إعادة الرسم
        let activeId = null;
        let activeClass = null;
        let selectionStart = 0;
        if (document.activeElement && document.activeElement.tagName === 'INPUT') {
            const tr = document.activeElement.closest('tr');
            if (tr && tr.id) {
                activeId = tr.id;
                activeClass = document.activeElement.className;
                try { selectionStart = document.activeElement.selectionStart || 0; } catch(e){}
            }
        }

        tbody.innerHTML = '';
        
        if (!snapshot.empty) {
            const visits = [];
            snapshot.forEach((docSnapshot) => {
                const data = docSnapshot.data();
                data.id = docSnapshot.id;
                visits.push(data);
            });
            visits.sort((a, b) => {
                const dateA = a.visitDate || '';
                const dateB = b.visitDate || '';
                return dateB.localeCompare(dateA); 
            });

            let currentMonth = null;
            visits.forEach((data) => {
                const visitMonthStr = formatMonthYear(data.visitDate);
                if (visitMonthStr !== currentMonth) {
                    currentMonth = visitMonthStr;
                    renderMonthSeparator(currentMonth);
                }
                renderRow(data, false);
            });
        }
        updateStats();
        renderActivityLog();

        if (activeId && activeClass) {
            const activeRow = document.getElementById(activeId);
            if (activeRow) {
                // البحث بالكلاس بشكل آمن (بدون مشكلة الأقواس)
                const inputs = activeRow.querySelectorAll('input');
                for(let inp of inputs){
                    if(inp.className === activeClass){
                        inp.focus();
                        try { inp.setSelectionRange(selectionStart, selectionStart); } catch(e){}
                        break;
                    }
                }
            }
        }
    }, (error) => {
        console.error("خطأ في استقبال البيانات:", error);
        Swal.fire('خطأ', 'فشل الاتصال بـ Firestore: ' + error.message, 'error');
    });
}

function renderMonthSeparator(monthText) {
    const tbody = document.getElementById('tableBody');
    const sepRow = document.createElement('tr');
    sepRow.className = 'month-separator';
    sepRow.innerHTML = `<td colspan="14"><div style="display:inline-block;background:#3b82f6;color:#fff;padding:6px 22px;border-radius:20px;font-weight:700;font-size:13.5px;box-shadow:0 2px 4px rgba(59,130,246,0.3);"><i class="fas fa-calendar-alt" style="margin-left:6px;"></i> ${monthText}</div></td>`;
    tbody.appendChild(sepRow);
}

// ---------- بناء الصفوف ----------
function renderRow(v = {}, animate = true) {
    const tbody = document.getElementById('tableBody');
    if (!tbody) return;

    const rowId = v.id || 'visit_' + Date.now() + '_' + Math.random().toString(36).substr(2,5);
    const today = getTodayDate();
    const visitDate = v.visitDate || today;

    const mainRow = document.createElement('tr');
    mainRow.className = 'main-row';
    mainRow.id = rowId;
    if (animate) mainRow.classList.add('fade-in');

    const subRow = document.createElement('tr');
    subRow.className = 'sub-table-row';
    subRow.id = 'sub-' + rowId;

    const isSubOpen = openSubTables.has(rowId);
    subRow.style.display = isSubOpen ? 'table-row' : 'none';
    const arrowIconClass = isSubOpen ? 'fas fa-caret-down' : 'fas fa-caret-left';

    let initialWaNum = v.mob ? v.mob.replace(/[^0-9]/g, '') : '';
    if (initialWaNum.startsWith('0')) initialWaNum = '966' + initialWaNum.substring(1);
    else if (initialWaNum.length > 0 && !initialWaNum.startsWith('966')) initialWaNum = '966' + initialWaNum;
    
    const waOpacity = initialWaNum.length >= 9 ? '1' : '0.5';
    const waPointer = initialWaNum.length >= 9 ? 'auto' : 'none';
    const waHref = initialWaNum.length >= 9 ? `https://wa.me/${initialWaNum}` : '#';

    const notesJson = v.notes || "[]";
    const lastNoteText = getLastNoteOnlyFromJSON(notesJson);

    // الحالة - لون
    let statusClass = "";
    if (v.status === 'تمت الزيارة') statusClass = "status-blue";
    else if (v.status === 'لم تتم') statusClass = "status-yellow";
    else if (v.status === 'مفقودة' || v.status === 'ملغاة') statusClass = "status-red";

    mainRow.innerHTML = `
        <td class="col-select">
            <input type="checkbox" class="select-check row-select">
            <span class="toggle-arrow" onclick="toggleSubTable('${rowId}')"><i class="${arrowIconClass}"></i></span>
        </td>
        <td class="col-company"><input type="text" class="excel-input comp-input" value="${escapeHtml(v.comp || '')}" data-old="${escapeHtml(v.comp || '')}" onfocus="this.dataset.old=this.value" onblur="addToActivityLog('الشركة', this.dataset.old, this.value, this.value); saveSingleRow('${rowId}'); this.dataset.old=this.value;"></td>
        <td class="col-address"><input type="text" class="excel-input address-input" value="${escapeHtml(v.address || '')}" onblur="saveSingleRow('${rowId}')"></td>
        <td class="col-manager"><input type="text" class="excel-input manager-input" value="${escapeHtml(v.manager || '')}" onblur="saveSingleRow('${rowId}')"></td>
        <td class="col-mobile">
            <div class="phone-cell-container">
                <input type="text" class="excel-input mob-input" value="${escapeHtml(v.mob || '')}" oninput="updateWhatsAppLink(this,'${rowId}')" onblur="saveSingleRow('${rowId}')">
                <a id="wa-${rowId}" href="${waHref}" target="_blank" class="whatsapp-icon-btn" style="opacity:${waOpacity};pointer-events:${waPointer}"><i class="fab fa-whatsapp"></i></a>
            </div>
        </td>
        <td class="col-email"><input type="text" class="excel-input email-input" value="${escapeHtml(v.email || '')}" onblur="saveSingleRow('${rowId}')"></td>
        <td class="col-record"><input type="text" class="excel-input record-input" value="${escapeHtml(v.record || '')}" onblur="saveSingleRow('${rowId}')"></td>
        <td class="col-date"><input type="date" class="excel-input visit-date-val" value="${visitDate}" onblur="saveSingleRow('${rowId}'); updateStats();"></td>
        <td class="col-service"><input type="text" class="excel-input service-input" value="${escapeHtml(v.service || '')}" onblur="saveSingleRow('${rowId}')"></td>
        <td class="col-val"><input type="number" class="excel-input opp-val" value="${v.value || ''}" oninput="calculateMainVisitValue('${rowId}')" onblur="saveSingleRow('${rowId}'); updateStats();"></td>
        <td class="col-notes"><span class="notes-preview" data-full-notes='${escapeHtmlAttr(notesJson)}' onclick="openNotesModal('${rowId}')">${escapeHtml(lastNoteText)}</span></td>
        <td class="col-status"><select class="excel-input status-select ${statusClass}" onchange="handleStatusChange(this,'${rowId}'); saveSingleRow('${rowId}'); updateStats();"><option value="">-</option><option value="مجدولة" ${v.status==='مجدولة'?'selected':''}>مجدولة</option><option value="تمت الزيارة" ${v.status==='تمت الزيارة'?'selected':''}>تمت الزيارة</option><option value="لم تتم" ${v.status==='لم تتم'?'selected':''}>لم تتم</option><option value="عرض سعر" ${v.status==='عرض سعر'?'selected':''}>عرض سعر</option><option value="مفقودة" ${v.status==='مفقودة'?'selected':''}>مفقودة</option></select></td>
        <td class="col-edit"><input type="text" class="excel-input last-edit-val readonly-input" value="${escapeHtml(v.lastEdit || '')}" readonly></td>
        <td class="col-owner"><input type="text" class="excel-input owner-input" value="${escapeHtml(v.owner || '')}" onblur="saveSingleRow('${rowId}')"></td>
    `;

    // جدول المنتجات الفرعي
    let products = [];
    try { products = JSON.parse(v.products || "[]"); } catch(e){ products = []; }
    let productRowsHtml = products.map((p, idx) => `
        <tr>
            <td><input type="text" value="${escapeHtml(p.name||'')}" onblur="saveSingleRow('${rowId}')" data-field="name" data-idx="${idx}" class="prod-input"></td>
            <td><input type="number" value="${p.qty||1}" oninput="calculateMainVisitValue('${rowId}')" data-field="qty" data-idx="${idx}" class="prod-input"></td>
            <td><input type="number" value="${p.price||0}" oninput="calculateMainVisitValue('${rowId}')" data-field="price" data-idx="${idx}" class="prod-input"></td>
            <td><button class="sub-action-btn" onclick="removeProductRow('${rowId}',${idx})">×</button></td>
        </tr>
    `).join('');

    subRow.innerHTML = `<td colspan="14"><div class="sub-table-container"><table class="inner-table"><thead><tr><th>الخدمة / المنتج <button class="header-plus-btn" onclick="addProductRow('${rowId}')">+</button></th><th>الكمية</th><th>السعر</th><th>إجراء</th></tr></thead><tbody id="prod-body-${rowId}">${productRowsHtml}</tbody></table></div></td>`;

    tbody.appendChild(mainRow);
    tbody.appendChild(subRow);
    if (v.status === 'مفقودة') mainRow.classList.add('lost-row');
}

function escapeHtml(str){
    return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#039;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function escapeHtmlAttr(str){
    return String(str).replace(/'/g,'&#39;').replace(/"/g,'&quot;');
}

// ---------- دوال رئيسية كانت ناقصة ----------
function insertNewRow(){
    const id = 'visit_' + Date.now();
    const newData = { id, comp:'', visitDate: getTodayDate(), status:'مجدولة', value:'', notes:'[]', products:'[]', owner:'', lastEdit: new Date().toLocaleString('ar-SA') };
    renderRow(newData, true);
    saveSingleRow(id);
    addToActivityLog('إنشاء', '', 'زيارة جديدة', '');
}

function toggleSubTable(rowId){
    const sub = document.getElementById('sub-'+rowId);
    const arrow = document.querySelector(`#${rowId} .toggle-arrow i`);
    if(!sub) return;
    const isHidden = sub.style.display === 'none';
    sub.style.display = isHidden ? 'table-row' : 'none';
    if(isHidden) openSubTables.add(rowId); else openSubTables.delete(rowId);
    if(arrow){ arrow.className = isHidden ? 'fas fa-caret-down' : 'fas fa-caret-left'; }
}

function addProductRow(rowId){
    const tbody = document.getElementById('prod-body-'+rowId);
    if(!tbody) return;
    const idx = tbody.children.length;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><input type="text" data-field="name" data-idx="${idx}" class="prod-input" onblur="saveSingleRow('${rowId}')"></td><td><input type="number" value="1" data-field="qty" data-idx="${idx}" class="prod-input" oninput="calculateMainVisitValue('${rowId}')"></td><td><input type="number" value="0" data-field="price" data-idx="${idx}" class="prod-input" oninput="calculateMainVisitValue('${rowId}')"></td><td><button class="sub-action-btn" onclick="removeProductRow('${rowId}',${idx})">×</button></td>`;
    tbody.appendChild(tr);
    calculateMainVisitValue(rowId);
    saveSingleRow(rowId);
}

function removeProductRow(rowId, idx){
    const tbody = document.getElementById('prod-body-'+rowId);
    if(!tbody) return;
    if(tbody.children[idx]) tbody.children[idx].remove();
    calculateMainVisitValue(rowId);
    saveSingleRow(rowId);
}

function calculateMainVisitValue(rowId){
    const tbody = document.getElementById('prod-body-'+rowId);
    if(!tbody) return;
    let total = 0;
    tbody.querySelectorAll('tr').forEach(tr=>{
        const qty = parseFloat(tr.querySelector('[data-field="qty"]')?.value)||0;
        const price = parseFloat(tr.querySelector('[data-field="price"]')?.value)||0;
        total += qty*price;
    });
    const mainInput = document.querySelector(`#${rowId} .opp-val`);
    if(total>0 && mainInput) mainInput.value = total;
    updateStats();
}

async function saveSingleRow(rowId){
    const row = document.getElementById(rowId);
    if(!row) return;
    const getVal = sel => row.querySelector(sel)?.value || '';
    const notesEl = row.querySelector('.notes-preview');
    const prodBody = document.getElementById('prod-body-'+rowId);
    let products = [];
    if(prodBody){
        prodBody.querySelectorAll('tr').forEach(tr=>{
            products.push({
                name: tr.querySelector('[data-field="name"]')?.value || '',
                qty: tr.querySelector('[data-field="qty"]')?.value || '1',
                price: tr.querySelector('[data-field="price"]')?.value || '0'
            });
        });
    }
    const payload = {
        comp: getVal('.comp-input'),
        address: getVal('.address-input'),
        manager: getVal('.manager-input'),
        mob: getVal('.mob-input'),
        email: getVal('.email-input'),
        record: getVal('.record-input'),
        visitDate: getVal('.visit-date-val'),
        service: getVal('.service-input'),
        value: getVal('.opp-val'),
        status: getVal('.status-select'),
        owner: getVal('.owner-input'),
        lastEdit: new Date().toLocaleString('ar-SA'),
        notes: notesEl ? notesEl.getAttribute('data-full-notes') : '[]',
        products: JSON.stringify(products)
    };
    try{
        await setDoc(doc(db, "visits", rowId), payload, { merge:true });
    }catch(e){ console.error(e); }
}

function handleStatusChange(select, rowId){
    select.className = 'excel-input status-select';
    if(select.value==='تمت الزيارة') select.classList.add('status-blue');
    else if(select.value==='لم تتم') select.classList.add('status-yellow');
    else if(select.value==='مفقودة') select.classList.add('status-red');
    const row = document.getElementById(rowId);
    if(row){
        if(select.value==='مفقودة') row.classList.add('lost-row'); else row.classList.remove('lost-row');
    }
}

function updateWhatsAppLink(input, rowId){
    let num = input.value.replace(/[^0-9]/g,'');
    if(num.startsWith('0')) num = '966'+num.substring(1);
    else if(num.length>0 && !num.startsWith('966')) num = '966'+num;
    const a = document.getElementById('wa-'+rowId);
    if(!a) return;
    if(num.length>=9){ a.href=`https://wa.me/${num}`; a.style.opacity='1'; a.style.pointerEvents='auto'; }
    else { a.href='#'; a.style.opacity='0.5'; a.style.pointerEvents='none'; }
}

// ---------- سجل النشاط ----------
function addToActivityLog(field, oldVal, newVal, compName){
    if(!oldVal && !newVal) return;
    if(oldVal===newVal) return;
    let logs = [];
    try{ logs = JSON.parse(localStorage.getItem(VISITS_LOGS_KEY)||'[]'); }catch(e){ logs=[]; }
    logs.unshift({ field, oldVal, newVal, comp: compName||'', date: new Date().toISOString().split('T')[0], time: new Date().toLocaleTimeString('ar-SA') });
    logs = logs.slice(0,100);
    localStorage.setItem(VISITS_LOGS_KEY, JSON.stringify(logs));
    renderActivityLog();
}

function renderActivityLog(){
    const list = document.getElementById('activityList');
    if(!list) return;
    let logs = [];
    try{ logs = JSON.parse(localStorage.getItem(VISITS_LOGS_KEY)||'[]'); }catch(e){ logs=[]; }
    if(logs.length===0){ list.innerHTML='<div style="color:#94a3b8;text-align:center;padding:10px;">لا يوجد نشاط بعد</div>'; return; }
    list.innerHTML = logs.map(l=>`
        <div class="log-entry">
            <span class="log-badge-user">${escapeHtml(l.field)}</span>
            <span class="log-divider">|</span>
            <span class="log-action">${escapeHtml(l.comp||'')} ${l.oldVal?'('+escapeHtml(l.oldVal)+' → '+escapeHtml(l.newVal)+')': escapeHtml(l.newVal)}</span>
            <span class="log-timestamp">${l.date} ${l.time}</span>
        </div>
    `).join('');
}

// ---------- ملاحظات ----------
function openNotesModal(rowId){
    currentActiveNoteRowId = rowId;
    const row = document.getElementById(rowId);
    if(!row) return;
    const preview = row.querySelector('.notes-preview');
    let arr = [];
    try{ arr = JSON.parse(preview.getAttribute('data-full-notes')||'[]'); }catch(e){ arr=[]; }
    const days = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const historyLog = document.getElementById('historyLog');
    if(historyLog){
        historyLog.innerHTML = arr.map(msg=>{
            let msgDateObj = new Date(msg.date);
            let dayStr = isNaN(msgDateObj) ? '' : days[msgDateObj.getDay()] + ' ';
            let userName = msg.user && msg.user !== "المستخدم" ? msg.user : "المستخدم";
            return `<div class="log-entry" style="display:block;line-height:1.6;"><div style="margin-bottom:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><span class="log-badge-user"><i class="fas fa-user-circle"></i> ${escapeHtml(userName)}</span><span class="log-divider">|</span><span class="log-timestamp"><i class="fas fa-clock"></i> ${dayStr}${escapeHtml(msg.date)} ${escapeHtml(msg.time)}</span></div><div class="log-action" style="padding-right:5px;color:#0f172a;font-size:11px;font-weight:700;">${escapeHtml(msg.text)}</div></div>`;
        }).join('') || '<div style="color:#64748b;text-align:center;padding:20px;font-weight:700;">لا توجد ملاحظات سابقة</div>';
    }
    document.getElementById('noteModal').style.display='flex';
    document.getElementById('modalTextArea').value='';
    document.getElementById('modalTextArea').focus();
}
function closeNote(){ document.getElementById('noteModal').style.display='none'; currentActiveNoteRowId=null; }
function saveNote(){
    if(!currentActiveNoteRowId) return;
    const row = document.getElementById(currentActiveNoteRowId);
    const txt = document.getElementById('modalTextArea').value.trim();
    if(row && txt){
        const preview = row.querySelector('.notes-preview');
        let arr=[]; try{ arr=JSON.parse(preview.getAttribute('data-full-notes')||'[]'); }catch(e){}
        let username="المستخدم";
        const ownerInput=row.querySelector('.owner-input');
        if(ownerInput && ownerInput.value.trim()) username=ownerInput.value.trim();
        const today=new Date();
        const dateStr=today.toISOString().split('T')[0];
        const timeStr=today.toLocaleTimeString('ar-SA');
        arr.push({user:username,date:dateStr,time:timeStr,text:txt});
        preview.setAttribute('data-full-notes',JSON.stringify(arr));
        preview.innerText=txt;
        saveSingleRow(currentActiveNoteRowId);
        let compName=row.querySelector('.comp-input').value||'بدون اسم';
        addToActivityLog('الملاحظات','تمت إضافة ملاحظة جديدة','',compName);
    }
    closeNote();
}

// ---------- إحصائيات وفلترة ----------
function updateStats(){
    const rows=document.querySelectorAll('#tableBody .main-row');
    let totalCount=rows.length, todayCount=0, monthCount=0;
    let totalVal=0, monthVal=0;
    const todayStr=getTodayDate();
    const currentMonthStr=todayStr.substring(0,7);
    rows.forEach(row=>{
        const dateVal=row.querySelector('.visit-date-val')?.value||'';
        const val=parseFloat(row.querySelector('.opp-val')?.value)||0;
        const status=row.querySelector('.status-select')?.value||'';
        if(status==='عرض سعر'){ totalVal+=val; if(dateVal.startsWith(currentMonthStr)) monthVal+=val; }
        if(dateVal===todayStr) todayCount++;
        if(dateVal.startsWith(currentMonthStr)) monthCount++;
    });
    const setText=(id,txt)=>{ const el=document.getElementById(id); if(el) el.innerText=txt; };
    setText('stat-total',totalCount);
    setText('stat-month',monthCount);
    setText('stat-today',todayCount);
    setText('stat-value-total',totalVal.toLocaleString('en-US')+' ر.س');
    setText('stat-value-month',monthVal.toLocaleString('en-US')+' ر.س');
}
function toggleAllCheckboxes(master){ document.querySelectorAll('.row-select').forEach(cb=>cb.checked=master.checked); }
function toggleDropdown(event,btn){ event.stopPropagation(); btn.nextElementSibling.classList.toggle('show'); }
window.onclick=function(){ document.querySelectorAll('.dropdown-menu').forEach(menu=>menu.classList.remove('show')); };
async function handleBulkAction(action){
    const selectedRows=document.querySelectorAll('.row-select:checked');
    if(selectedRows.length===0) return Swal.fire('تنبيه','يرجى تحديد عنصر واحد على الأقل','warning');
    if(action==='حذف'){
        const result=await Swal.fire({title:'هل أنت متأكد؟',text:`سيتم حذف ${selectedRows.length} سجل نهائياً`,icon:'warning',showCancelButton:true,confirmButtonText:'نعم',cancelButtonText:'إلغاء'});
        if(result.isConfirmed){
            for(let cb of selectedRows){ const tr=cb.closest('tr'); if(tr&&tr.id) await deleteDoc(doc(db,"visits",tr.id)); }
            Swal.fire('تم الحذف!','تم الحذف بنجاح.','success');
        }
    }
}
function toggleLogExpansion(){ document.getElementById('activityLogSection')?.classList.toggle('expanded'); }
function debouncedFilterTable(){
    clearTimeout(searchTimeout);
    searchTimeout=setTimeout(()=>{
        const q=document.getElementById('searchInput').value.toLowerCase().trim();
        document.querySelectorAll('.main-row').forEach(row=>{
            const text=Array.from(row.cells).map(c=>c.querySelector('input, select')?.value.toLowerCase()||'').join(' ');
            const subRow=document.getElementById('sub-'+row.id);
            const match = text.includes(q) || q==='';
            row.style.display=match?'table-row':'none';
            if(subRow && !match) subRow.style.display='none';
            // إخفاء فواصل الأشهر إذا لم يكن هناك صفوف ظاهرة بعدها سيتم معالجته ببساطة
        });
    },300);
}

Object.assign(window, { 
    insertNewRow, toggleSubTable, addProductRow, removeProductRow, calculateMainVisitValue,
    openNotesModal, closeNote, saveNote, handleStatusChange, toggleAllCheckboxes, toggleDropdown,
    handleBulkAction, toggleLogExpansion, debouncedFilterTable, updateWhatsAppLink, addToActivityLog, saveSingleRow
});

document.addEventListener('DOMContentLoaded', listenToVisits);