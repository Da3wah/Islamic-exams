/* Islamic Exams — assignment section bridge
   Add this script after question-types-bridge.js in admin-v2.html and index.html.
   It reuses the Supabase client created by the existing page script. */
(function () {
  'use strict';

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    console.error('Assignment bridge: Supabase JS is not loaded.');
    return;
  }

  if (!window.__islamicExamsCreateClientHooked) {
    const originalCreateClient = window.supabase.createClient.bind(window.supabase);
    window.supabase.createClient = function () {
      const client = originalCreateClient.apply(null, arguments);
      window.__islamicExamsClient = client;
      return client;
    };
    window.__islamicExamsCreateClientHooked = true;
  }

  document.addEventListener('DOMContentLoaded', function () {
    const client = window.__islamicExamsClient;
    if (!client) {
      console.error('Assignment bridge: existing Supabase client was not captured.');
      return;
    }
    if (document.getElementById('assignmentForm') && document.getElementById('assignments')) {
      bootAdminAssignments(client);
    }
    if (document.getElementById('login-form') && document.getElementById('app-section')) {
      bootStudentAssignments(client);
    }
  });

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  function localDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ar-EG');
  }

  function toLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  function showMessage(node, text, kind) {
    if (!node) return;
    node.textContent = text || '';
    node.className = 'msg ' + (kind || '');
  }

  async function verifyAdmin(client) {
    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    const session = result.data && result.data.session;
    if (!session) throw new Error('سجّلي الدخول إلى حساب الإدارة أولًا.');
    const roleResult = await client.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
    if (roleResult.error) throw roleResult.error;
    if (!roleResult.data || roleResult.data.role !== 'admin') throw new Error('هذه الوظيفة متاحة للإدارة فقط.');
  }

  function bootAdminAssignments(client) {
    const section = document.getElementById('assignments');
    const legacyForm = document.getElementById('assignmentForm');
    const legacyFormCard = legacyForm && legacyForm.closest('.card');
    const legacyList = section.querySelector('.listbox');
    if (legacyFormCard) legacyFormCard.classList.add('hidden');
    if (legacyList) legacyList.classList.add('hidden');

    const root = document.createElement('div');
    root.id = 'assignmentBridgeAdmin';
    root.innerHTML = `
      <div class="card">
        <div class="pagehead"><h3 id="abFormHeading">إنشاء تكليف جديد</h3><span class="tag">سؤال مكتوب + درجة تلقائية</span></div>
        <form id="abAssignmentForm">
          <div class="formgrid">
            <div class="field"><label for="abTitle">عنوان التكليف *</label><input id="abTitle" maxlength="200" required></div>
            <div class="field"><label for="abCourse">المساق *</label><select id="abCourse" required><option value="">جارٍ تحميل المساقات...</option></select></div>
            <div class="field"><label for="abSubject">المادة *</label><select id="abSubject" required><option value="">اختاري المساق أولًا</option></select></div>
            <div class="field full"><label for="abQuestion">سؤال التكليف *</label><textarea id="abQuestion" rows="5" maxlength="20000" required placeholder="اكتبي السؤال أو المطلوب من الطالب بالتفصيل"></textarea></div>
            <div class="field"><label for="abMaxGrade">الدرجة الكلية *</label><input id="abMaxGrade" type="number" min="1" step="1" value="5" required></div>
            <div class="field"><label for="abOpen">موعد الفتح (اختياري)</label><input id="abOpen" type="datetime-local"></div>
            <div class="field"><label for="abClose">موعد الإغلاق (اختياري)</label><input id="abClose" type="datetime-local"></div>
            <div class="field full"><label for="abDescription">تعليمات إضافية (اختياري)</label><textarea id="abDescription" rows="3" placeholder="إرشادات إضافية للطالب"></textarea></div>
          </div>
          <div class="actions"><button class="btn" id="abSave">إنشاء التكليف</button><button class="btn secondary hidden" type="button" id="abCancel">إلغاء التعديل</button></div>
          <p class="msg" id="abFormMessage" role="status" aria-live="polite"></p>
        </form>
      </div>
      <div class="card listbox">
        <div class="pagehead"><h3>التكليفات الحالية</h3><button type="button" class="btn secondary" id="abRefresh">تحديث</button></div>
        <div class="tablewrap" id="abAssignmentsTable"><div class="empty">جارٍ تحميل التكليفات...</div></div>
      </div>
      <div class="card listbox hidden" id="abTrackingPanel">
        <div class="pagehead"><h3 id="abTrackingTitle">متابعة التسليمات</h3><button type="button" class="btn secondary" id="abCloseTracking">إغلاق</button></div>
        <p class="msg" id="abTrackingMessage"></p>
        <div class="tablewrap" id="abTrackingTable"></div>
      </div>`;
    const pageHead = section.querySelector('.pagehead');
    if (pageHead) pageHead.insertAdjacentElement('afterend', root);
    else section.appendChild(root);

    const $ = function (id) { return document.getElementById(id); };
    let courses = [];
    let subjects = [];
    let assignments = [];
    let editingId = null;

    function fillSelect(node, items, placeholder, labelFn) {
      const previous = node.value;
      node.innerHTML = '<option value="">' + escapeHtml(placeholder) + '</option>' + items.map(function (item) {
        return '<option value="' + escapeHtml(item.id) + '">' + escapeHtml(labelFn(item)) + '</option>';
      }).join('');
      if (items.some(function (item) { return String(item.id) === previous; })) node.value = previous;
    }

    function resetForm() {
      $('abAssignmentForm').reset();
      editingId = null;
      $('abMaxGrade').value = '5';
      $('abFormHeading').textContent = 'إنشاء تكليف جديد';
      $('abSave').textContent = 'إنشاء التكليف';
      $('abCancel').classList.add('hidden');
      showMessage($('abFormMessage'), '', '');
    }

    async function loadChoices() {
      const courseResult = await client.from('courses').select('id,name,active').order('id');
      if (courseResult.error) throw courseResult.error;
      const subjectResult = await client.from('course_subjects').select('id,course_id,name,active').order('id');
      if (subjectResult.error) throw subjectResult.error;
      courses = (courseResult.data || []).filter(function (x) { return x.active !== false; });
      subjects = (subjectResult.data || []).filter(function (x) { return x.active !== false; });
      fillSelect($('abCourse'), courses, 'اختاري المساق', function (x) { return x.name; });
      fillSubjects();
    }

    function fillSubjects() {
      const courseId = $('abCourse').value;
      const eligible = subjects.filter(function (x) { return String(x.course_id) === String(courseId); });
      fillSelect($('abSubject'), eligible, courseId ? 'اختاري المادة' : 'اختاري المساق أولًا', function (x) { return x.name; });
    }

    async function loadAssignments() {
      const result = await client.from('assignments').select('id,title,question_text,max_grade,description,open_at,close_at,course_id,course_subject_id').order('id');
      if (result.error) throw result.error;
      assignments = result.data || [];
      const courseNames = Object.fromEntries(courses.map(function (x) { return [x.id, x.name]; }));
      const subjectNames = Object.fromEntries(subjects.map(function (x) { return [x.id, x.name]; }));
      if (!assignments.length) {
        $('abAssignmentsTable').innerHTML = '<div class="empty">لم تتم إضافة تكليفات بعد.</div>';
        return;
      }
      $('abAssignmentsTable').innerHTML = '<table><thead><tr><th>التكليف والسؤال</th><th>المساق</th><th>المادة</th><th>الدرجة</th><th>المواعيد</th><th>إجراء</th></tr></thead><tbody>' + assignments.map(function (x) {
        return '<tr><td><strong>' + escapeHtml(x.title) + '</strong><div style="white-space:pre-wrap">' + escapeHtml(x.question_text || 'لم يُكتب سؤال التكليف بعد') + '</div>' + (x.description ? '<small>تعليمات: ' + escapeHtml(x.description) + '</small>' : '') + '</td><td>' + escapeHtml(courseNames[x.course_id] || '—') + '</td><td>' + escapeHtml(subjectNames[x.course_subject_id] || '—') + '</td><td>' + escapeHtml(x.max_grade == null ? 5 : x.max_grade) + '</td><td>' + escapeHtml(localDate(x.open_at)) + '<br>' + escapeHtml(localDate(x.close_at)) + '</td><td><div class="actions"><button type="button" class="btn secondary" data-ab-edit="' + x.id + '">تعديل</button><button type="button" class="btn secondary" data-ab-track="' + x.id + '">متابعة التسليمات</button></div></td></tr>';
      }).join('') + '</tbody></table>';
    }

    async function refreshAll() {
      try {
        await verifyAdmin(client);
        await loadChoices();
        await loadAssignments();
      } catch (error) {
        $('abAssignmentsTable').innerHTML = '<div class="empty">تعذر تحميل التكليفات: ' + escapeHtml(error.message || error) + '</div>';
      }
    }

    async function trackAssignment(id) {
      try {
        await verifyAdmin(client);
        const assignment = assignments.find(function (x) { return Number(x.id) === Number(id); });
        if (!assignment) throw new Error('حدّثي التكليفات أولًا.');
        $('abTrackingPanel').classList.remove('hidden');
        $('abTrackingTitle').textContent = 'متابعة التسليمات: ' + assignment.title;
        showMessage($('abTrackingMessage'), 'جارٍ تحميل قائمة الطلاب...', '');
        const result = await client.rpc('get_assignment_tracking', { p_assignment_id: Number(id) });
        if (result.error) throw result.error;
        const students = Array.isArray(result.data && result.data.students) ? result.data.students : [];
        if (!students.length) {
          $('abTrackingTable').innerHTML = '<div class="empty">لا يوجد طلاب نشطون في هذا المساق الحالي.</div>';
        } else {
          $('abTrackingTable').innerHTML = '<table><thead><tr><th>الطالب</th><th>الكود</th><th>حالة التسليم</th><th>تاريخ التسليم</th><th>الدرجة</th><th>الإجراء</th></tr></thead><tbody>' + students.map(function (x) {
            const status = x.submitted ? 'تم التسليم' : (x.reopen_pending ? 'أُعيد فتحه ولم يسلّم بعد' : 'لم يسلّم');
            const grade = x.submitted ? escapeHtml(x.grade == null ? assignment.max_grade : x.grade) + ' / ' + escapeHtml(assignment.max_grade) : '—';
            const action = x.submitted ? '—' : (x.reopen_pending ? '<span class="tag">تم فتحه</span>' : '<button type="button" class="btn secondary" data-ab-reopen="' + id + '" data-ab-student="' + x.student_id + '">إعادة فتح للطالب</button>');
            return '<tr><td>' + escapeHtml(x.name || ('طالب #' + x.student_id)) + '</td><td>' + escapeHtml(x.code || '—') + '</td><td>' + status + '</td><td>' + escapeHtml(localDate(x.submitted_at)) + '</td><td>' + grade + '</td><td>' + action + '</td></tr>';
          }).join('') + '</tbody></table>';
        }
        showMessage($('abTrackingMessage'), 'عدد الطلاب: ' + students.length + '. التسليم يمنح الدرجة الكاملة تلقائيًا.', 'success');
      } catch (error) {
        showMessage($('abTrackingMessage'), 'تعذرت متابعة التسليمات: ' + (error.message || error), 'error');
      }
    }

    $('abCourse').addEventListener('change', fillSubjects);
    $('abRefresh').addEventListener('click', refreshAll);
    $('abCloseTracking').addEventListener('click', function () { $('abTrackingPanel').classList.add('hidden'); });
    $('abCancel').addEventListener('click', resetForm);
    $('abAssignmentsTable').addEventListener('click', async function (event) {
      const edit = event.target.closest('[data-ab-edit]');
      const track = event.target.closest('[data-ab-track]');
      if (edit) {
        const item = assignments.find(function (x) { return Number(x.id) === Number(edit.dataset.abEdit); });
        if (!item) return;
        editingId = Number(item.id);
        $('abTitle').value = item.title || '';
        $('abCourse').value = String(item.course_id || '');
        fillSubjects();
        $('abSubject').value = String(item.course_subject_id || '');
        $('abQuestion').value = item.question_text || '';
        $('abMaxGrade').value = String(item.max_grade == null ? 5 : item.max_grade);
        $('abDescription').value = item.description || '';
        $('abOpen').value = toLocalInput(item.open_at);
        $('abClose').value = toLocalInput(item.close_at);
        $('abFormHeading').textContent = 'تعديل التكليف';
        $('abSave').textContent = 'حفظ التعديلات';
        $('abCancel').classList.remove('hidden');
        $('abAssignmentForm').scrollIntoView({behavior:'smooth',block:'start'});
      } else if (track) {
        await trackAssignment(Number(track.dataset.abTrack));
      }
    });
    $('abTrackingTable').addEventListener('click', async function (event) {
      const button = event.target.closest('[data-ab-reopen]');
      if (!button) return;
      button.disabled = true;
      try {
        await verifyAdmin(client);
        const result = await client.rpc('admin_reopen_assignment_for_student', {
          p_assignment_id: Number(button.dataset.abReopen),
          p_student_id: Number(button.dataset.abStudent)
        });
        if (result.error) throw result.error;
        await trackAssignment(Number(button.dataset.abReopen));
      } catch (error) {
        showMessage($('abTrackingMessage'), 'تعذرت إعادة الفتح: ' + (error.message || error), 'error');
      } finally { button.disabled = false; }
    });

    $('abAssignmentForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      const button = $('abSave');
      button.disabled = true;
      try {
        await verifyAdmin(client);
        const title = $('abTitle').value.trim();
        const question = $('abQuestion').value.trim();
        const maxGrade = Number($('abMaxGrade').value);
        const courseId = Number($('abCourse').value);
        const subjectId = Number($('abSubject').value);
        if (!title) throw new Error('اكتبي عنوان التكليف.');
        if (!question) throw new Error('اكتبي سؤال التكليف نفسه.');
        if (!Number.isInteger(maxGrade) || maxGrade < 1) throw new Error('الدرجة الكلية يجب أن تكون عددًا صحيحًا لا يقل عن 1.');
        if (!subjects.some(function (x) { return Number(x.id) === subjectId && Number(x.course_id) === courseId; })) throw new Error('اختاري مادة تابعة للمساق المحدد.');
        const payload = {
          title: title, question_text: question, max_grade: maxGrade,
          description: $('abDescription').value.trim() || null,
          course_id: courseId, course_subject_id: subjectId,
          open_at: $('abOpen').value ? new Date($('abOpen').value).toISOString() : null,
          close_at: $('abClose').value ? new Date($('abClose').value).toISOString() : null
        };
        if (payload.open_at && payload.close_at && new Date(payload.close_at) <= new Date(payload.open_at)) throw new Error('موعد الإغلاق يجب أن يأتي بعد موعد الفتح.');
        if (editingId) {
          const old = assignments.find(function (x) { return Number(x.id) === editingId; });
          if (old && Number(old.max_grade || 5) !== maxGrade) {
            const countResult = await client.from('assignment_submissions').select('id', {count:'exact',head:true}).eq('assignment_id', editingId).not('submitted_at','is',null);
            if (countResult.error) throw countResult.error;
            if (countResult.count > 0 && !window.confirm('يوجد طلاب سلّموا بالفعل. تغيير الدرجة الكلية سيغيّر الدرجة المستحقة لهم أيضًا. هل تريدين المتابعة؟')) throw new Error('أُلغي تغيير الدرجة.');
          }
          const updateResult = await client.from('assignments').update(payload).eq('id', editingId);
          if (updateResult.error) throw updateResult.error;
          const gradeResult = await client.from('assignment_submissions').update({grade:maxGrade}).eq('assignment_id',editingId).not('submitted_at','is',null);
          if (gradeResult.error) throw gradeResult.error;
          showMessage($('abFormMessage'), 'تم حفظ التعديلات. درجات التسليمات تساوي الدرجة الكلية الجديدة.', 'success');
        } else {
          const insertResult = await client.from('assignments').insert(payload);
          if (insertResult.error) throw insertResult.error;
          showMessage($('abFormMessage'), 'تم إنشاء التكليف وحفظ السؤال والدرجة.', 'success');
        }
        resetForm();
        await loadAssignments();
        $('abTrackingPanel').classList.add('hidden');
      } catch (error) {
        showMessage($('abFormMessage'), 'تعذر حفظ التكليف: ' + (error.message || error), 'error');
      } finally { button.disabled = false; }
    });

    client.auth.onAuthStateChange(function (event, session) {
      if (session) setTimeout(refreshAll, 100);
    });
    refreshAll();
  }

  function bootStudentAssignments(client) {
    const originalOpenSubject = window.portalOpenSubject;
    if (typeof originalOpenSubject === 'function' && !window.__assignmentSubjectWrapped) {
      window.portalOpenSubject = function (courseId, subjectId) {
        const value = originalOpenSubject(courseId, subjectId);
        refreshSubjectAssignmentCards(client, Number(courseId), Number(subjectId));
        return value;
      };
      window.__assignmentSubjectWrapped = true;
    }

    window.portalOpenAssignment = async function (courseId, subjectId, assignmentId) {
      const view = document.getElementById('view');
      if (!view) return;
      view.innerHTML = '<section><p>جارٍ تحميل سؤال التكليف وحالة التسليم...</p></section>';
      const detailResult = await client.rpc('get_student_assignment_details', {p_assignment_id:Number(assignmentId)});
      if (detailResult.error) {
        view.innerHTML = '<section><p class="error">' + escapeHtml(detailResult.error.message || detailResult.error) + '</p><button type="button" onclick="portalOpenSubject(' + Number(courseId) + ',' + Number(subjectId) + ')">رجوع للمادة</button></section>';
        return;
      }
      renderStudentAssignment(client, view, detailResult.data || {}, Number(courseId), Number(subjectId), Number(assignmentId));
    };
  }

  async function refreshSubjectAssignmentCards(client, courseId, subjectId) {
    const {data, error} = await client.rpc('get_student_dashboard');
    if (error || !data) return;
    const course = (data.courses || []).find(function (x) { return Number(x.id) === courseId; });
    const subject = course && (course.subjects || []).find(function (x) { return Number(x.id) === subjectId; });
    if (!subject) return;
    const view = document.getElementById('view');
    if (!view) return;
    const cards = view.querySelectorAll('.item-list .item-card');
    (subject.assignments || []).forEach(function (assignment, index) {
      const card = cards[index];
      if (!card) return;
      const status = Array.from(card.querySelectorAll('p')).find(function (p) { return p.textContent.startsWith('الحالة:'); });
      const submitted = Boolean(assignment.submission && assignment.submission.submitted_at);
      if (status) status.textContent = 'الحالة: ' + (submitted ? 'تم التسليم — الإجابة مغلقة' : 'لم يتم التسليم');
      const button = card.querySelector('button[onclick*="portalOpenAssignment("]');
      if (button) button.textContent = submitted ? 'عرض التسليم' : 'فتح التكليف';
      if (submitted && assignment.submission.grade != null) {
        let grade = Array.from(card.querySelectorAll('p')).find(function (p) { return p.textContent.startsWith('الدرجة'); });
        if (!grade) { grade = document.createElement('p'); card.insertBefore(grade, button || null); }
        grade.textContent = 'الدرجة المستحقة: ' + assignment.submission.grade;
      }
    });
  }

  function renderStudentAssignment(client, view, details, courseId, subjectId, assignmentId) {
    const submission = details.submission || null;
    const submitted = Boolean(submission && submission.submitted_at);
    const question = String(details.question_text || '').trim();
    const maxGrade = Number(details.max_grade == null ? 5 : details.max_grade);
    const now = Date.now();
    const notOpened = Boolean(details.open_at && now < new Date(details.open_at).getTime());
    const beforeClose = !details.close_at || now < new Date(details.close_at).getTime();
    const reopened = Boolean(details.reopen_allowed);
    const canSubmit = !submitted && Boolean(question) && !notOpened && (beforeClose || reopened);
    let html = '<div class="row"><button type="button" onclick="portalOpenSubject(' + courseId + ',' + subjectId + ')">رجوع للمادة</button><h2>' + escapeHtml(details.title || 'التكليف') + '</h2></div>';
    if (question) html += '<section class="item-card"><h3>سؤال التكليف</h3><p style="white-space:pre-wrap">' + escapeHtml(question) + '</p></section>';
    if (details.description) html += '<section class="item-card"><h3>تعليمات إضافية</h3><p style="white-space:pre-wrap">' + escapeHtml(details.description) + '</p></section>';
    html += '<p><strong>الدرجة الكلية:</strong> ' + escapeHtml(maxGrade) + '</p>';
    if (details.open_at) html += '<p>موعد الفتح: ' + escapeHtml(localDate(details.open_at)) + '</p>';
    if (details.close_at) html += '<p>موعد الإغلاق: ' + escapeHtml(localDate(details.close_at)) + '</p>';
    if (submitted) {
      html += '<section class="item-card"><h3>تم تسليم التكليف</h3><p>تاريخ التسليم: ' + escapeHtml(localDate(submission.submitted_at)) + '</p><p><strong>الدرجة المستحقة:</strong> ' + escapeHtml(submission.grade == null ? maxGrade : submission.grade) + ' / ' + escapeHtml(maxGrade) + '</p><h4>إجابتك المرسلة (للقراءة فقط)</h4><div style="white-space:pre-wrap;overflow-wrap:anywhere">' + escapeHtml(submission.submission_text || '') + '</div><p>تم تثبيت إجابتك بعد التسليم ولا يمكن تعديلها.</p></section>';
    } else if (canSubmit) {
      html += '<form id="assignmentBridgeStudentForm" class="item-card"><label for="assignment-bridge-answer">اكتبي إجابتك هنا</label><textarea id="assignment-bridge-answer" rows="8" maxlength="20000" required></textarea><button id="assignment-bridge-submit" type="submit">تسليم التكليف نهائيًا</button></form><p>بمجرد التسليم ستحصلين على الدرجة الكاملة (' + escapeHtml(maxGrade) + ') ولن تتمكني من تعديل الإجابة.</p><p id="assignment-bridge-message" role="status" aria-live="polite"></p>';
    } else {
      let text = 'التكليف غير متاح للتسليم الآن.';
      if (!question) text = 'لم تضف الإدارة سؤال هذا التكليف بعد.';
      else if (notOpened) text = 'لم يفتح التكليف بعد.';
      else if (!beforeClose && !reopened) text = 'انتهى موعد التسليم. يمكنك التواصل مع الإدارة لإعادة فتح التكليف إذا لم تسلّميه.';
      else if (reopened) text = 'أعادت الإدارة فتح التكليف لك. أعيدي فتح الصفحة وحاولي مرة أخرى.';
      html += '<section class="item-card"><strong>التكليف غير متاح للتسليم الآن</strong><p>' + escapeHtml(text) + '</p></section>';
    }
    view.innerHTML = html;
    const form = document.getElementById('assignmentBridgeStudentForm');
    if (!form) return;
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const button = document.getElementById('assignment-bridge-submit');
      const answer = document.getElementById('assignment-bridge-answer').value;
      if (!answer.trim()) { showMessage(document.getElementById('assignment-bridge-message'), 'اكتبي إجابتك قبل التسليم.', 'error'); return; }
      button.disabled = true;
      showMessage(document.getElementById('assignment-bridge-message'), 'جارٍ تسليم الإجابة نهائيًا...', '');
      const result = await client.rpc('submit_student_assignment', {p_assignment_id:assignmentId,p_submission_text:answer});
      if (result.error) {
        showMessage(document.getElementById('assignment-bridge-message'), result.error.message || String(result.error), 'error');
        button.disabled = false;
        return;
      }
      const detailResult = await client.rpc('get_student_assignment_details', {p_assignment_id:assignmentId});
      if (detailResult.error) { showMessage(document.getElementById('assignment-bridge-message'), 'تم التسليم، لكن تعذر تحديث العرض. أعيدي فتح التكليف للتأكد من ظهور التسليم.', 'error'); return; }
      renderStudentAssignment(client, view, detailResult.data || {}, courseId, subjectId, assignmentId);
      showMessage(document.getElementById('app-message'), 'تم التسليم بنجاح وحُفظت الدرجة الكاملة.', 'success');
      await refreshSubjectAssignmentCards(client, courseId, subjectId);
    });
  }
})();
