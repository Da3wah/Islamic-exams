/* Islamic Exams — student/course management bridge
   Load after assignment-section-bridge.js in admin-v2.html only.
   Uses the page's existing Supabase client and keeps existing student/course rows intact.
*/
(function () {
  'use strict';

  function start() {
    const client = window.__islamicExamsClient || window.__questionTypesDb;
const section = document.getElementById('studentCoursesManagementRoot');
     const tableRoot = document.getElementById('studentsTable');
    if (!client || !section || !tableRoot || document.getElementById('studentCourseManagementPanel')) return;

    const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
    const statusLabel = value => ({ current: 'حالي', completed: 'مكتمل', locked: 'مقفل' })[value] || value || '—';
    let students = [];
    let courses = [];
    let activeStudentId = null;
    let loadingLinks = false;

    const panel = document.createElement('div');
    panel.id = 'studentCourseManagementPanel';
    panel.className = 'card listbox';
    panel.innerHTML = `
      <div class="pagehead"><div><h3>إدارة مساقات الطالب</h3><p class="sub">إلحاق الطالب بالمساقات، وتحديد حالة كل مساق وترتيبه، أو إيقاف الربط دون حذف سجلّه.</p></div></div>
      <p id="scmMessage" class="msg" role="status" aria-live="polite"></p>
      <div class="formgrid">
        <div class="field"><label for="scmStudentSelect">الطالب</label><select id="scmStudentSelect" required><option value="">تحميل الطلاب...</option></select></div>
        <div class="field"><label for="scmCourseSelect">إضافة مساق أو إعادة ربطه</label><select id="scmCourseSelect" required><option value="">تحميل المساقات...</option></select></div>
        <div class="field"><label for="scmStatus">حالة المساق لهذا الطالب</label><select id="scmStatus"><option value="current">حالي — متاح للطالب</option><option value="completed">مكتمل</option><option value="locked">مقفل — لا يمكن الدخول</option></select></div>
        <div class="field"><label for="scmOrder">ترتيب العرض</label><input id="scmOrder" type="number" min="0" step="1" value="0"></div>
      </div>
      <div class="actions"><button type="button" class="btn" id="scmSaveEnrollment">إضافة / تحديث ربط المساق</button><button type="button" class="btn secondary" id="scmHidePanel">إخفاء القسم</button></div>
      <hr class="divider">
      <div class="pagehead"><h3 id="scmLinkedHeading">المساقات المرتبطة بالطالب</h3><button type="button" class="btn secondary" id="scmRefreshLinks">تحديث</button></div>
      <div id="scmLinksTable" class="tablewrap"><div class="empty">اختاري طالبًا لعرض مساقاته.</div></div>`;
    section.appendChild(panel);

    function say(text, kind) {
      const node = document.getElementById('scmMessage');
      if (!node) return;
      node.textContent = text || '';
      node.className = 'msg ' + (kind || '');
    }
    window.__marsadLoadStudentCourseManagement = async function () {
      try {
        panel.classList.remove('hidden');
        await loadStudentsAndCourses();
        if (activeStudentId) {
          document.getElementById('scmStudentSelect').value =
            String(activeStudentId);
          await loadLinks(activeStudentId);
        }
      } catch (error) {
        say(
          'تعذر تحميل إدارة مساقات الطلاب: ' +
          (error.message || error),
          'error'
        );
      }
    };
    async function verifyAdmin() {
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      const session = sessionResult.data && sessionResult.data.session;
      if (!session) throw new Error('انتهت جلسة الإدارة. سجّلي الدخول مرة أخرى.');
      const profileResult = await client.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (profileResult.error) throw profileResult.error;
      if (!profileResult.data || profileResult.data.role !== 'admin') throw new Error('هذه الوظيفة متاحة لحسابات الإدارة فقط.');
    }

    async function loadStudentsAndCourses() {
      await verifyAdmin();
      const [studentResult, courseResult] = await Promise.all([
        client.from('Students').select('id,name,code').order('id', { ascending: true }),
        client.from('courses').select('id,name,active').order('id', { ascending: true })
      ]);
      if (studentResult.error) throw studentResult.error;
      if (courseResult.error) throw courseResult.error;
      students = studentResult.data || [];
      courses = courseResult.data || [];
      const studentSelect = document.getElementById('scmStudentSelect');
      const courseSelect = document.getElementById('scmCourseSelect');
      const oldStudent = studentSelect.value || (activeStudentId == null ? '' : String(activeStudentId));
      const oldCourse = courseSelect.value;
      studentSelect.innerHTML = '<option value="">اختاري الطالب</option>' + students.map(s => '<option value="' + s.id + '">' + esc(s.name) + ' — كود ' + esc(s.code || '—') + ' (#' + s.id + ')</option>').join('');
      courseSelect.innerHTML = '<option value="">اختاري المساق</option>' + courses.map(c => '<option value="' + c.id + '">' + esc(c.name) + (c.active ? '' : ' (غير نشط على مستوى المنصة)') + '</option>').join('');
      if (students.some(s => String(s.id) === oldStudent)) studentSelect.value = oldStudent;
      if (courses.some(c => String(c.id) === oldCourse)) courseSelect.value = oldCourse;
    }

    async function loadLinks(studentId) {
      if (loadingLinks) return;
      loadingLinks = true;
      const table = document.getElementById('scmLinksTable');
      table.innerHTML = '<div class="empty">جارٍ تحميل المساقات...</div>';
      try {
        await verifyAdmin();
        if (!studentId) {
          activeStudentId = null;
          table.innerHTML = '<div class="empty">اختاري طالبًا لعرض مساقاته.</div>';
          document.getElementById('scmLinkedHeading').textContent = 'المساقات المرتبطة بالطالب';
          return;
        }
        activeStudentId = Number(studentId);
        const student = students.find(s => Number(s.id) === activeStudentId);
        document.getElementById('scmLinkedHeading').textContent = 'مساقات الطالب: ' + (student ? student.name : ('#' + studentId));
        const result = await client.from('student_courses')
          .select('id,student_id,course_id,active,access_status,display_order,enrolled_at')
          .eq('student_id', activeStudentId)
          .order('display_order', { ascending: true });
        if (result.error) throw result.error;
        const links = result.data || [];
        if (!links.length) {
          table.innerHTML = '<div class="empty">هذا الطالب غير مرتبط بأي مساق بعد. اختاري مساقًا من الأعلى لإضافته.</div>';
          return;
        }
        table.innerHTML = '<table><thead><tr><th>المساق</th><th>حالة المساق</th><th>ترتيب العرض</th><th>حالة الربط</th><th>إجراء</th></tr></thead><tbody>' + links.map(link => {
          const course = courses.find(c => Number(c.id) === Number(link.course_id));
          return '<tr data-scm-link-row="' + link.id + '">' +
            '<td>' + esc(course ? course.name : ('مساق #' + link.course_id)) + '</td>' +
            '<td><select data-scm-status="' + link.id + '"><option value="current"' + (link.access_status === 'current' ? ' selected' : '') + '>حالي</option><option value="completed"' + (link.access_status === 'completed' ? ' selected' : '') + '>مكتمل</option><option value="locked"' + (link.access_status === 'locked' ? ' selected' : '') + '>مقفل</option></select></td>' +
            '<td><input data-scm-order="' + link.id + '" type="number" min="0" step="1" value="' + Number(link.display_order || 0) + '" style="width:90px"></td>' +
            '<td><select data-scm-active="' + link.id + '"><option value="true"' + (link.active ? ' selected' : '') + '>نشط</option><option value="false"' + (!link.active ? ' selected' : '') + '>متوقف</option></select></td>' +
            '<td><div class="actions"><button type="button" class="btn secondary" data-scm-save-link="' + link.id + '">حفظ</button>' + (link.active ? '<button type="button" class="btn danger" data-scm-disable-link="' + link.id + '">إيقاف الربط</button>' : '') + '</div></td>' +
            '</tr>';
        }).join('') + '</tbody></table>';
      } catch (error) {
        table.innerHTML = '<div class="empty">تعذر تحميل المساقات: ' + esc(error.message || error) + '</div>';
      } finally {
        loadingLinks = false;
      }
    }

    async function openForStudent(studentId) {
      panel.classList.remove('hidden');
      try {
        await loadStudentsAndCourses();
        document.getElementById('scmStudentSelect').value = String(studentId);
        activeStudentId = Number(studentId);
        await loadLinks(activeStudentId);
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (error) {
        say('تعذر فتح إدارة المساقات: ' + (error.message || error), 'error');
      }
    }

    function enhanceStudentTable() {
      const table = tableRoot.querySelector('table');
      if (!table) return;
      const header = table.querySelector('thead tr');
      if (header && !header.querySelector('[data-scm-header]')) {
        const th = document.createElement('th');
        th.dataset.scmHeader = 'true';
        th.textContent = 'إدارة المساقات';
        header.appendChild(th);
      }
      table.querySelectorAll('tbody tr').forEach(row => {
        if (row.querySelector('[data-scm-manage]')) return;
        const idText = row.cells[2] ? row.cells[2].textContent.trim() : '';
        if (!/^\d+$/.test(idText)) return;
        const cell = document.createElement('td');
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn secondary';
        button.dataset.scmManage = idText;
        button.textContent = 'إدارة المساقات';
        cell.appendChild(button);
        row.appendChild(cell);
      });
    }

    const observer = new MutationObserver(enhanceStudentTable);
    observer.observe(tableRoot, { childList: true, subtree: true });
    enhanceStudentTable();

    tableRoot.addEventListener('click', function (event) {
      const button = event.target.closest('button[data-scm-manage]');
      if (button) openForStudent(Number(button.dataset.scmManage));
    });

    document.getElementById('scmStudentSelect').addEventListener('change', async function () {
      activeStudentId = this.value ? Number(this.value) : null;
      await loadLinks(activeStudentId);
    });

    document.getElementById('scmSaveEnrollment').addEventListener('click', async function () {
      const button = this;
      const studentId = Number(document.getElementById('scmStudentSelect').value);
      const courseId = Number(document.getElementById('scmCourseSelect').value);
      const status = document.getElementById('scmStatus').value;
      const order = Number(document.getElementById('scmOrder').value || 0);
      if (!studentId || !courseId) { say('اختاري الطالب والمساق أولًا.', 'error'); return; }
      if (!Number.isInteger(order) || order < 0) { say('ترتيب العرض يجب أن يكون صفرًا أو عددًا صحيحًا أكبر.', 'error'); return; }
      button.disabled = true;
      say('جارٍ حفظ ربط الطالب بالمساق...');
      try {
        await verifyAdmin();
        const result = await client.from('student_courses').upsert({
          student_id: studentId,
          course_id: courseId,
          active: true,
          access_status: status,
          display_order: order
        }, { onConflict: 'student_id,course_id' });
        if (result.error) throw result.error;
        activeStudentId = studentId;
        await loadStudentsAndCourses();
        document.getElementById('scmStudentSelect').value = String(studentId);
        document.getElementById('scmCourseSelect').value = '';
        await loadLinks(studentId);
        say('تم حفظ ربط الطالب بالمساق بنجاح.', 'success');
      } catch (error) {
        say('تعذر حفظ الربط: ' + (error.message || error), 'error');
      } finally { button.disabled = false; }
    });

    document.getElementById('scmLinksTable').addEventListener('click', async function (event) {
      const save = event.target.closest('button[data-scm-save-link]');
      const disable = event.target.closest('button[data-scm-disable-link]');
      if (!save && !disable) return;
      const linkId = Number((save || disable).dataset.scmSaveLink || (save || disable).dataset.scmDisableLink);
      if (!Number.isSafeInteger(linkId) || linkId <= 0) return;
      if (disable && !window.confirm('سيتم إيقاف ربط هذا الطالب بالمساق دون حذف سجل الربط أو درجاته السابقة. هل تريدين المتابعة؟')) return;
      const button = save || disable;
      button.disabled = true;
      try {
        await verifyAdmin();
        let payload;
        if (disable) {
          payload = { active: false };
        } else {
          const statusNode = this.querySelector('[data-scm-status="' + linkId + '"]');
          const orderNode = this.querySelector('[data-scm-order="' + linkId + '"]');
          const activeNode = this.querySelector('[data-scm-active="' + linkId + '"]');
          const order = Number(orderNode ? orderNode.value : 0);
          if (!Number.isInteger(order) || order < 0) throw new Error('ترتيب العرض يجب أن يكون صفرًا أو عددًا صحيحًا أكبر.');
          payload = { access_status: statusNode.value, display_order: order, active: activeNode.value === 'true' };
        }
        const result = await client.from('student_courses').update(payload).eq('id', linkId);
        if (result.error) throw result.error;
        await loadLinks(activeStudentId);
        say(disable ? 'تم إيقاف الربط دون حذف السجل أو النتائج.' : 'تم تحديث حالة المساق وترتيبه بنجاح.', 'success');
      } catch (error) {
        say('تعذر حفظ التغيير: ' + (error.message || error), 'error');
      } finally { if (button.isConnected) button.disabled = false; }
    });

    document.getElementById('scmRefreshLinks').addEventListener('click', async function () {
      try { await loadStudentsAndCourses(); await loadLinks(activeStudentId); say('تم تحديث بيانات الربط.', 'success'); }
      catch (error) { say('تعذر التحديث: ' + (error.message || error), 'error'); }
    });
    document.getElementById('scmHidePanel').addEventListener('click', function () { panel.classList.add('hidden'); });

    // Preload option lists only when an administrator opens the students area.
    document.getElementById('nav')?.addEventListener('click', async function (event) {
      if (!event.target.closest('[data-page="students"]')) return;
      try { await loadStudentsAndCourses(); enhanceStudentTable(); }
      catch (error) { say('تعذر تحميل قوائم الطلاب والمساقات: ' + (error.message || error), 'error'); }
    });

    document.querySelector('[data-refresh="students"]')?.addEventListener('click', function () {
      window.setTimeout(enhanceStudentTable, 150);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
