/* Islamic Exams — course result announcement bridge
 * Add after assignment-section-bridge.js in admin-v2.html only.
 * Adds safe admin-only publish controls to existing course_results table.
 */
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const tableRoot = document.getElementById('courseResultsTable');
    if (!tableRoot) return;

    const notice = document.createElement('p');
    notice.id = 'course-result-announcement-message';
    notice.className = 'msg';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    tableRoot.insertAdjacentElement('afterend', notice);

    let scheduled = false;
    let loading = false;

    function showMessage(text, kind) {
      notice.textContent = text || '';
      notice.className = 'msg ' + (kind || '');
    }

    function getClient() {
      return window.__islamicExamsClient || window.__questionTypesDb || null;
    }

    async function verifyAdmin(client) {
      const sessionResult = await client.auth.getSession();
      if (sessionResult.error) throw sessionResult.error;
      const session = sessionResult.data && sessionResult.data.session;
      if (!session) throw new Error('انتهت جلسة الإدارة؛ سجّلي الدخول مرة أخرى.');
      const roleResult = await client.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
      if (roleResult.error) throw roleResult.error;
      if (!roleResult.data || roleResult.data.role !== 'admin') throw new Error('إعلان النتائج متاح لحساب الإدارة فقط.');
    }

    async function enhanceTable() {
      if (loading) return;
      const table = tableRoot.querySelector('table');
      if (!table) return;
      const client = getClient();
      if (!client) {
        showMessage('تعذر تفعيل أزرار إعلان النتائج؛ لم يتم العثور على اتصال Supabase الحالي.', 'error');
        return;
      }
      loading = true;
      try {
        const result = await client.from('course_results')
          .select('id,student_id,course_id,weekly_exams_score,assignments_score,final_exams_score,total_score,percentage,announced_at')
          .order('id', { ascending: true });
        if (result.error) throw result.error;
        const rowsData = result.data || [];
        const bodyRows = Array.from(table.querySelectorAll('tbody tr'));
        const headerRow = table.querySelector('thead tr');
        if (!headerRow) return;

        let actionHeader = headerRow.querySelector('[data-result-announcement-header]');
        if (!actionHeader) {
          actionHeader = document.createElement('th');
          actionHeader.dataset.resultAnnouncementHeader = 'true';
          actionHeader.textContent = 'إعلان النتيجة';
          headerRow.appendChild(actionHeader);
        }

        bodyRows.forEach(function (row, index) {
          const item = rowsData[index];
          let actionCell = row.querySelector('[data-result-announcement-cell]');
          if (!actionCell) {
            actionCell = document.createElement('td');
            actionCell.dataset.resultAnnouncementCell = 'true';
            row.appendChild(actionCell);
          }
          if (!item) {
            actionCell.textContent = '—';
            return;
          }
          actionCell.dataset.resultId = String(item.id);
          actionCell.dataset.announcementState = item.announced_at ? 'announced' : 'pending';
          if (item.announced_at) {
            if (actionCell.textContent !== 'تم الإعلان') actionCell.textContent = 'تم الإعلان';
          } else {
            let button = actionCell.querySelector('button[data-announce-course-result]');
            if (!button) {
              button = document.createElement('button');
              button.type = 'button';
              button.className = 'btn secondary';
              button.dataset.announceCourseResult = String(item.id);
              button.textContent = 'إعلان النتيجة';
              actionCell.replaceChildren(button);
            } else if (button.dataset.announceCourseResult !== String(item.id)) {
              button.dataset.announceCourseResult = String(item.id);
            }
          }
        });
      } catch (error) {
        showMessage('تعذر تحميل حالة إعلان النتائج: ' + (error.message || String(error)), 'error');
      } finally {
        loading = false;
      }
    }

    function scheduleEnhance() {
      if (scheduled) return;
      scheduled = true;
      setTimeout(function () {
        scheduled = false;
        enhanceTable();
      }, 100);
    }

    tableRoot.addEventListener('click', async function (event) {
      const button = event.target.closest('button[data-announce-course-result]');
      if (!button) return;

      const client = getClient();
      const resultId = Number(button.dataset.announceCourseResult);
      if (!client || !Number.isSafeInteger(resultId) || resultId <= 0) {
        showMessage('تعذر تحديد سجل النتيجة. حدّثي البيانات ثم حاولي مرة أخرى.', 'error');
        return;
      }

      const row = button.closest('tr');
      const cells = row ? row.querySelectorAll('td') : [];
      const studentName = cells[0] ? cells[0].textContent.trim() : 'الطالب';
      const courseName = cells[1] ? cells[1].textContent.trim() : 'المساق';
      if (!window.confirm('هل تريدين إعلان نتيجة ' + studentName + ' في مساق ' + courseName + '؟ ستظهر النتيجة للطالب في بوابته.')) return;

      button.disabled = true;
      showMessage('جارٍ التحقق من النتيجة قبل إعلانها...', '');
      try {
        await verifyAdmin(client);
        const current = await client.from('course_results')
          .select('id,weekly_exams_score,assignments_score,final_exams_score,total_score,percentage,announced_at')
          .eq('id', resultId)
          .maybeSingle();
        if (current.error) throw current.error;
        if (!current.data) throw new Error('سجل النتيجة غير موجود.');
        if (current.data.announced_at) {
          showMessage('هذه النتيجة معلنة بالفعل.', '');
          await enhanceTable();
          return;
        }

        const parts = Number(current.data.weekly_exams_score || 0)
          + Number(current.data.assignments_score || 0)
          + Number(current.data.final_exams_score || 0);
        const total = Number(current.data.total_score || 0);
        if (!Number.isFinite(parts) || !Number.isFinite(total) || Math.abs(parts - total) > 0.01) {
          throw new Error('مجموع مكونات النتيجة (' + parts + ') لا يطابق المجموع الكلي (' + total + '). لم تُعلن النتيجة. حدّثي الحساب أولًا.');
        }
        if (current.data.percentage == null) {
          throw new Error('النسبة المئوية غير محسوبة؛ لم تُعلن النتيجة.');
        }

        const update = await client.from('course_results')
          .update({ announced_at: new Date().toISOString() })
          .eq('id', resultId)
          .is('announced_at', null)
          .select('id,announced_at')
          .maybeSingle();
        if (update.error) throw update.error;
        if (!update.data) throw new Error('لم يتم إعلان النتيجة؛ ربما أُعلنت بالفعل من جلسة أخرى. حدّثي الجدول.');
        showMessage('تم إعلان النتيجة بنجاح. ستظهر للطالب عند تحديث بوابته.', 'success');
        await enhanceTable();
      } catch (error) {
        showMessage('لم تُعلن النتيجة: ' + (error.message || String(error)), 'error');
      } finally {
        if (button.isConnected) button.disabled = false;
      }
    });

    new MutationObserver(scheduleEnhance).observe(tableRoot, { childList: true, subtree: true });
    scheduleEnhance();
  });
})();
