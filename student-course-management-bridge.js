/* Islamic Exams — Student Course Management
   Dedicated page: #studentCoursesManagementRoot
   Does not add course-management controls to the Students table.
   Uses the existing Supabase client and preserves existing records.
*/
(function () {
  'use strict';

  let initialized = false;
  let retryTimer = null;

  function start() {
    if (initialized) return true;

    const client =
      window.__islamicExamsClient ||
      window.__questionTypesDb;

    const section = document.getElementById(
      'studentCoursesManagementRoot'
    );

    if (!client || !section) return false;

    if (document.getElementById('studentCourseManagementPanel')) {
      initialized = true;
      return true;
    }

    initialized = true;

    let students = [];
    let courses = [];
    let activeStudentId = null;
    let loadingLinks = false;

    const esc = value =>
      String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[ch]);

    const panel = document.createElement('div');
    panel.id = 'studentCourseManagementPanel';
    panel.className = 'card listbox';

    panel.innerHTML = `
      <div class="pagehead">
        <div>
          <h3>إدارة مساقات الطلاب</h3>
          <p class="sub">
            إدارة ارتباط الطلاب بالمساقات وحالة الإتاحة وترتيب العرض.
          </p>
        </div>
      </div>

      <p id="scmMessage" class="msg"
         role="status" aria-live="polite"></p>

      <div class="formgrid">
        <div class="field">
          <label for="scmStudentSelect">الطالب</label>
          <select id="scmStudentSelect" required>
            <option value="">جارٍ تحميل الطلاب...</option>
          </select>
        </div>

        <div class="field">
          <label for="scmCourseSelect">المساق</label>
          <select id="scmCourseSelect" required>
            <option value="">جارٍ تحميل المساقات...</option>
          </select>
        </div>

        <div class="field">
          <label for="scmStatus">حالة المساق للطالب</label>
          <select id="scmStatus">
            <option value="current">حالي — متاح للطالب</option>
            <option value="completed">مكتمل</option>
            <option value="locked">مقفل — غير متاح</option>
          </select>
        </div>

        <div class="field">
          <label for="scmOrder">ترتيب العرض</label>
          <input id="scmOrder" type="number"
                 min="0" step="1" value="0">
        </div>
      </div>

      <div class="actions">
        <button type="button" class="btn"
                id="scmSaveEnrollment">
          إضافة / تحديث ربط المساق
        </button>
        <button type="button" class="btn secondary"
                id="scmRefreshLinks">
          تحديث البيانات
        </button>
      </div>

      <hr class="divider">

      <div class="pagehead">
        <h3 id="scmLinkedHeading">المساقات المرتبطة بالطالب</h3>
      </div>

      <div id="scmLinksTable" class="tablewrap">
        <div class="empty">اختاري طالبًا لعرض مساقاته.</div>
      </div>
    `;

    section.replaceChildren(panel);

    function say(message, kind) {
      const node = document.getElementById('scmMessage');
      if (!node) return;

      node.textContent = message || '';
      node.className = 'msg ' + (kind || '');
    }

    async function verifyAdmin() {
      const sessionResult = await client.auth.getSession();

      if (sessionResult.error) {
        throw sessionResult.error;
      }

      const session =
        sessionResult.data &&
        sessionResult.data.session;

      if (!session) {
        throw new Error(
          'انتهت جلسة الإدارة. سجّلي الدخول مرة أخرى.'
        );
      }

      const profileResult = await client
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle();

      if (profileResult.error) {
        throw profileResult.error;
      }

      if (
        !profileResult.data ||
        profileResult.data.role !== 'admin'
      ) {
        throw new Error(
          'هذه الوظيفة متاحة لحسابات الإدارة فقط.'
        );
      }
    }

    async function loadStudentsAndCourses() {
      await verifyAdmin();

      const [studentResult, courseResult] =
        await Promise.all([
          client
            .from('Students')
            .select('id,name,code')
            .order('id', { ascending: true }),

          client
            .from('courses')
            .select('id,name,active')
            .order('id', { ascending: true })
        ]);

      if (studentResult.error) {
        throw studentResult.error;
      }

      if (courseResult.error) {
        throw courseResult.error;
      }

      students = studentResult.data || [];
      courses = courseResult.data || [];

      const studentSelect =
        document.getElementById('scmStudentSelect');

      const courseSelect =
        document.getElementById('scmCourseSelect');

      const previousStudent =
        studentSelect.value ||
        (activeStudentId == null
          ? ''
          : String(activeStudentId));

      const previousCourse = courseSelect.value;

      studentSelect.innerHTML =
        '<option value="">اختاري الطالب</option>' +
        students.map(student =>
          '<option value="' + student.id + '">' +
          esc(student.name) +
          ' — كود ' + esc(student.code || '—') +
          '</option>'
        ).join('');

      courseSelect.innerHTML =
        '<option value="">اختاري المساق</option>' +
        courses.map(course =>
          '<option value="' + course.id + '">' +
          esc(course.name) +
          (course.active ? '' : ' (غير نشط)') +
          '</option>'
        ).join('');

      if (
        students.some(
          student => String(student.id) === previousStudent
        )
      ) {
        studentSelect.value = previousStudent;
      }

      if (
        courses.some(
          course => String(course.id) === previousCourse
        )
      ) {
        courseSelect.value = previousCourse;
      }
    }

    async function loadLinks(studentId) {
      if (loadingLinks) return;

      loadingLinks = true;

      const table =
        document.getElementById('scmLinksTable');

      table.innerHTML =
        '<div class="empty">جارٍ تحميل المساقات...</div>';

      try {
        await verifyAdmin();

        if (!studentId) {
          activeStudentId = null;

          table.innerHTML =
            '<div class="empty">اختاري طالبًا لعرض مساقاته.</div>';

          document.getElementById(
            'scmLinkedHeading'
          ).textContent = 'المساقات المرتبطة بالطالب';

          return;
        }

        activeStudentId = Number(studentId);

        const student = students.find(
          item => Number(item.id) === activeStudentId
        );

        document.getElementById(
          'scmLinkedHeading'
        ).textContent =
          'مساقات الطالب: ' +
          (student ? student.name : '#' + studentId);

        const result = await client
          .from('student_courses')
          .select(
            'id,student_id,course_id,active,access_status,display_order,enrolled_at'
          )
          .eq('student_id', activeStudentId)
          .order('display_order', { ascending: true });

        if (result.error) throw result.error;

        const links = result.data || [];

        if (!links.length) {
          table.innerHTML =
            '<div class="empty">' +
            'هذا الطالب غير مرتبط بأي مساق حاليًا.' +
            '</div>';

          return;
        }

        table.innerHTML =
          '<table>' +
          '<thead><tr>' +
          '<th>المساق</th>' +
          '<th>حالة المساق</th>' +
          '<th>ترتيب العرض</th>' +
          '<th>حالة الربط</th>' +
          '<th>إجراء</th>' +
          '</tr></thead><tbody>' +

          links.map(link => {
            const course = courses.find(
              item => Number(item.id) === Number(link.course_id)
            );

            return '<tr>' +

              '<td>' +
              esc(
                course
                  ? course.name
                  : 'مساق #' + link.course_id
              ) +
              '</td>' +

              '<td><select data-scm-status="' + link.id + '">' +
              '<option value="current"' +
              (link.access_status === 'current'
                ? ' selected' : '') +
              '>حالي</option>' +
              '<option value="completed"' +
              (link.access_status === 'completed'
                ? ' selected' : '') +
              '>مكتمل</option>' +
              '<option value="locked"' +
              (link.access_status === 'locked'
                ? ' selected' : '') +
              '>مقفل</option>' +
              '</select></td>' +

              '<td><input data-scm-order="' + link.id +
              '" type="number" min="0" step="1" ' +
              'value="' + Number(link.display_order || 0) +
              '" style="width:90px"></td>' +

              '<td><select data-scm-active="' + link.id + '">' +
              '<option value="true"' +
              (link.active ? ' selected' : '') +
              '>نشط</option>' +
              '<option value="false"' +
              (!link.active ? ' selected' : '') +
              '>متوقف</option>' +
              '</select></td>' +

              '<td><div class="actions">' +
              '<button type="button" class="btn secondary" ' +
              'data-scm-save-link="' + link.id + '">' +
              'حفظ</button>' +

              (link.active
                ? '<button type="button" class="btn danger" ' +
                  'data-scm-disable-link="' + link.id + '">' +
                  'إيقاف الربط</button>'
                : '') +

              '</div></td>' +
              '</tr>';
          }).join('') +

          '</tbody></table>';

      } catch (error) {
        table.innerHTML =
          '<div class="empty">تعذر تحميل المساقات: ' +
          esc(error.message || error) +
          '</div>';
      } finally {
        loadingLinks = false;
      }
    }

    window.__marsadLoadStudentCourseManagement =
      async function () {
        panel.classList.remove('hidden');

        try {
          await loadStudentsAndCourses();

          if (activeStudentId) {
            document.getElementById(
              'scmStudentSelect'
            ).value = String(activeStudentId);

            await loadLinks(activeStudentId);
          } else {
            await loadLinks(null);
          }
        } catch (error) {
          say(
            'تعذر تحميل إدارة مساقات الطلاب: ' +
            (error.message || error),
            'error'
          );
        }
      };

    document.getElementById(
      'scmStudentSelect'
    ).addEventListener('change', async function () {
      activeStudentId = this.value
        ? Number(this.value)
        : null;

      await loadLinks(activeStudentId);
    });

    document.getElementById(
      'scmSaveEnrollment'
    ).addEventListener('click', async function () {
      const button = this;

      const studentId = Number(
        document.getElementById('scmStudentSelect').value
      );

      const courseId = Number(
        document.getElementById('scmCourseSelect').value
      );

      const status =
        document.getElementById('scmStatus').value;

      const order = Number(
        document.getElementById('scmOrder').value || 0
      );

      if (!studentId || !courseId) {
        say('اختاري الطالب والمساق أولًا.', 'error');
        return;
      }

      if (!Number.isInteger(order) || order < 0) {
        say(
          'ترتيب العرض يجب أن يكون عددًا صحيحًا غير سالب.',
          'error'
        );
        return;
      }

      button.disabled = true;
      say('جارٍ حفظ ربط الطالب بالمساق...');

      try {
        await verifyAdmin();

        const result = await client
          .from('student_courses')
          .upsert({
            student_id: studentId,
            course_id: courseId,
            active: true,
            access_status: status,
            display_order: order
          }, {
            onConflict: 'student_id,course_id'
          });

        if (result.error) throw result.error;

        activeStudentId = studentId;

        await loadStudentsAndCourses();

        document.getElementById(
          'scmStudentSelect'
        ).value = String(studentId);

        document.getElementById(
          'scmCourseSelect'
        ).value = '';

        await loadLinks(studentId);

        say(
          'تم حفظ ربط الطالب بالمساق بنجاح.',
          'success'
        );

      } catch (error) {
        say(
          'تعذر حفظ الربط: ' + (error.message || error),
          'error'
        );
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById(
      'scmLinksTable'
    ).addEventListener('click', async function (event) {
      const save = event.target.closest(
        'button[data-scm-save-link]'
      );

      const disable = event.target.closest(
        'button[data-scm-disable-link]'
      );

      if (!save && !disable) return;

      const button = save || disable;

      const linkId = Number(
        save
          ? save.dataset.scmSaveLink
          : disable.dataset.scmDisableLink
      );

      if (!Number.isSafeInteger(linkId) || linkId <= 0) {
        return;
      }

      if (
        disable &&
        !window.confirm(
          'سيتم إيقاف ربط الطالب بالمساق دون حذف سجل الربط أو النتائج. هل تريدين المتابعة؟'
        )
      ) {
        return;
      }

      button.disabled = true;

      try {
        await verifyAdmin();

        let payload;

        if (disable) {
          payload = { active: false };
        } else {
          const statusNode = this.querySelector(
            '[data-scm-status="' + linkId + '"]'
          );

          const orderNode = this.querySelector(
            '[data-scm-order="' + linkId + '"]'
          );

          const activeNode = this.querySelector(
            '[data-scm-active="' + linkId + '"]'
          );

          const order = Number(orderNode.value);

          if (!Number.isInteger(order) || order < 0) {
            throw new Error(
              'ترتيب العرض يجب أن يكون عددًا صحيحًا غير سالب.'
            );
          }

          payload = {
            access_status: statusNode.value,
            display_order: order,
            active: activeNode.value === 'true'
          };
        }

        const result = await client
          .from('student_courses')
          .update(payload)
          .eq('id', linkId);

        if (result.error) throw result.error;

        await loadLinks(activeStudentId);

        say(
          disable
            ? 'تم إيقاف الربط دون حذف السجل أو النتائج.'
            : 'تم تحديث حالة المساق وترتيبه بنجاح.',
          'success'
        );

      } catch (error) {
        say(
          'تعذر حفظ التغيير: ' + (error.message || error),
          'error'
        );
      } finally {
        if (button.isConnected) {
          button.disabled = false;
        }
      }
    });

    document.getElementById(
      'scmRefreshLinks'
    ).addEventListener('click', async function () {
      try {
        await loadStudentsAndCourses();
        await loadLinks(activeStudentId);
        say('تم تحديث البيانات.', 'success');
      } catch (error) {
        say(
          'تعذر التحديث: ' + (error.message || error),
          'error'
        );
      }
    });

    // Load the dedicated page when opened.
    window.__marsadLoadStudentCourseManagement();
    return true;
  }

  function tryStart() {
    if (start() && retryTimer) {
      window.clearInterval(retryTimer);
      retryTimer = null;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryStart, {
      once: true
    });
  } else {
    tryStart();
  }

  // Retry briefly if the Supabase client is initialized later.
  retryTimer = window.setInterval(function () {
    tryStart();

    if (!retryTimer) return;

    if (!document.getElementById('studentCoursesManagementRoot')) {
      window.clearInterval(retryTimer);
      retryTimer = null;
      return;
    }
  }, 500);

  window.setTimeout(function () {
    if (retryTimer) {
      window.clearInterval(retryTimer);
      retryTimer = null;
    }
  }, 15000);
})();
