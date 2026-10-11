/* أنواع الأسئلة لموقع Islamic-exams
 * أضيفي هذا الملف بعد مكتبة Supabase مباشرة وقبل كود الصفحة الداخلي في index.html وadmin-v2.html.
 */
(function () {
  'use strict';
  if (!window.supabase || typeof window.supabase.createClient !== 'function') return;

  const originalCreateClient = window.supabase.createClient.bind(window.supabase);
  window.supabase.createClient = function (...args) {
    const client = originalCreateClient(...args);
    window.__questionTypesDb = client;
    const originalRpc = client.rpc.bind(client);

    client.rpc = function (name, params, ...rest) {
      const request = originalRpc(name, params, ...rest);
      if (name === 'get_student_exam') {
        return request.then(result => {
          if (!result.error && result.data) window.__questionTypesActiveExam = result.data;
          return result;
        });
      }
      if (name === 'submit_student_exam') {
        return request.then(result => {
          if (!result.error && result.data) window.__questionTypesLastSubmit = result.data;
          return result;
        });
      }
      return request;
    };
    return client;
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);

  function installStudentEnhancements() {
    const view = document.getElementById('view');
    if (!view) return;

    const nativeQuerySelector = view.querySelector.bind(view);
    view.querySelector = function (selector) {
      const match = typeof selector === 'string'
        ? selector.match(/^input\[name="question-(\d+)"\]:checked$/)
        : null;
      if (match) {
        const question = (window.__questionTypesActiveExam?.questions || [])
          .find(q => String(q.id) === match[1]);
        if (question?.question_type === 'multiple_select') {
          const selected = Array.from(view.querySelectorAll(
            `input[name="question-${match[1]}"]:checked`
          )).map(input => input.value);
          return selected.length ? { value: JSON.stringify(selected) } : null;
        }
      }
      return nativeQuerySelector(selector);
    };

    const enhance = () => {
      const data = window.__questionTypesActiveExam;
      if (data && data.state === 'open') {
        (data.questions || []).forEach(question => {
          const id = String(question.id);
          const input = view.querySelector(`#answer-${id}`) ||
            view.querySelector(`input[name="question-${id}"]`);
          if (!input) return;
          const section = input.closest('section');
          if (!section) return;

          if (question.question_type === 'multiple_select') {
            section.querySelectorAll(`input[name="question-${id}"]`).forEach(option => {
              option.type = 'checkbox';
            });
            if (!section.querySelector('.qt-instruction')) {
              const note = document.createElement('p');
              note.className = 'qt-instruction muted';
              note.textContent = 'اختاري كل الإجابات الصحيحة.';
              const heading = section.querySelector('h3');
              if (heading) heading.insertAdjacentElement('afterend', note);
            }
          } else if (question.question_type === 'essay' && input.tagName === 'INPUT') {
            const area = document.createElement('textarea');
            area.id = input.id;
            area.name = input.name;
            area.placeholder = 'اكتبي إجابتك هنا';
            area.rows = 5;
            area.style.width = '100%';
            area.style.maxWidth = '100%';
            area.style.boxSizing = 'border-box';
            area.style.padding = '10px';
            input.replaceWith(area);
          }
        });
      }

      const activeResult = data?.state === 'submitted' ? data?.result : null;
      const result = activeResult || window.__questionTypesLastSubmit;
      const pending = Number(result?.pending_manual_count || 0);
      const score = view.querySelector('.score');
      if (score && pending > 0) {
        score.textContent = `تم التسليم بنجاح. توجد ${pending} إجابة مقالية بانتظار التصحيح اليدوي.`;
      }
      if (score && pending === 0 && result) {
        score.textContent = `النتيجة: ${result.score ?? '—'} / ${result.total ?? '—'}`;
      }
    };

    new MutationObserver(enhance).observe(view, { childList: true, subtree: true });
    enhance();
  }

  function installAdminEditor() {
    const db = window.__questionTypesDb;
    const oldForm = document.getElementById('questionForm');
    const examPage = document.getElementById('exams');
    if (!db || !oldForm || !examPage || document.getElementById('qt-admin-editor')) return;

    const oldCard = oldForm.closest('.card');
    if (oldCard) oldCard.style.display = 'none';
    const oldExamForm = document.getElementById('examForm');
    const oldExamCard = oldExamForm?.closest('.card');
    if (oldExamCard) oldExamCard.style.display = 'none';

    const style = document.createElement('style');
    style.textContent = `
      #qt-admin-editor .qt-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:12px 0}
      #qt-admin-editor .qt-toolbar select{min-width:230px;padding:9px;border:1px solid #d7dfda;border-radius:9px}
      #qt-admin-editor .qt-new-exam-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:14px 0}
      #qt-admin-editor .qt-new-exam-grid>div{display:grid;gap:6px}
      #qt-admin-editor .qt-new-exam-grid label{font-weight:bold;font-size:13px}
      #qt-admin-editor .qt-new-exam-grid input,#qt-admin-editor .qt-new-exam-grid select{width:100%;min-width:0;padding:10px;border:1px solid #d7dfda;border-radius:9px;font:inherit;background:#fff}
      #qt-admin-editor .qt-table{min-width:1050px}
      #qt-admin-editor .qt-table textarea,#qt-admin-editor .qt-table input,#qt-admin-editor .qt-table select{width:100%;min-width:120px;box-sizing:border-box;padding:8px;border:1px solid #d7dfda;border-radius:8px;font:inherit}
      #qt-admin-editor .qt-table textarea{min-height:72px;resize:vertical}
      #qt-admin-editor .qt-table .qt-correct{min-width:170px}
      #qt-admin-editor .qt-note{font-size:13px;color:#68746f}
      #qt-admin-editor .qt-essay{border:1px solid #e1e7e3;border-radius:12px;padding:14px;margin:10px 0;background:#fff}
      #qt-admin-editor .qt-answer{white-space:pre-wrap;background:#f8faf8;border:1px solid #e1e7e3;border-radius:8px;padding:10px}
      @media(max-width:800px){#qt-admin-editor .qt-table{min-width:950px}#qt-admin-editor .qt-new-exam-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.id = 'qt-admin-editor';
    root.className = 'card';
    root.innerHTML = `
      <div class="pagehead"><div><h3>إنشاء اختبار جديد مع الأسئلة</h3>
      <p class="sub">املئي بيانات الاختبار، ثم أضيفي الأسئلة في الجدول أدناه. زر الحفظ ينشئ الاختبار ويحفظ أسئلته معًا.</p></div></div>
      <div class="qt-new-exam-grid">
        <div><label for="qt-new-title">عنوان الاختبار</label><input id="qt-new-title" maxlength="200" placeholder="مثال: اختبار الأسبوع الأول"></div>
        <div><label for="qt-new-type">نوع الاختبار</label><select id="qt-new-type"><option value="Weekly">أسبوعي</option><option value="Final">نهائي</option></select></div>
        <div><label for="qt-new-course">المساق</label><select id="qt-new-course"><option value="">اختاري المساق</option></select></div>
        <div id="qt-new-subject-field"><label for="qt-new-subject">المادة (للنهائي)</label><select id="qt-new-subject"><option value="">اختاري المادة</option></select></div>
        <div id="qt-new-week-field"><label for="qt-new-week">رقم الأسبوع</label><input id="qt-new-week" type="number" min="1" step="1" placeholder="1"></div>
        <div><label for="qt-new-open">موعد الفتح (اختياري)</label><input id="qt-new-open" type="datetime-local"></div>
        <div><label for="qt-new-close">موعد الإغلاق (اختياري)</label><input id="qt-new-close" type="datetime-local"></div>
      </div>
      <div class="qt-toolbar"><button type="button" class="btn secondary" id="qt-add-row">إضافة صف سؤال</button>
        <button type="button" class="btn" id="qt-create-exam-with-questions">إنشاء الاختبار وحفظ الأسئلة معًا</button></div>
      <hr class="divider" style="margin:22px 0">
      <div class="pagehead"><div><h3>تعديل اختبار موجود</h3>
      <p class="sub">اختاري اختبارًا لتحميل أسئلته وتعديلها، ثم احفظي التغييرات.</p></div></div>
      <div class="qt-toolbar">
        <label for="qt-exam-select">الاختبار</label><select id="qt-exam-select"><option value="">اضغطي لتحديث قائمة الاختبارات</option></select>
        <button type="button" class="btn secondary" id="qt-load-exams">تحديث الاختبارات</button>
        <button type="button" class="btn secondary" id="qt-load-questions">تحميل الأسئلة</button>
        <button type="button" class="btn" id="qt-save-questions">حفظ التعديلات</button>
      </div>
      <p id="qt-question-message" class="msg" role="status"></p>
      <p class="qt-note">الخيارات والإجابات المتعددة تُفصل بعلامة |. في السؤال المقالي اتركي خانتي الخيارات والإجابة الصحيحة فارغتين. الدرجة الافتراضية 1.</p>
      <div class="tablewrap"><table class="qt-table">
      <thead><tr><th>النوع</th><th>نص السؤال</th><th>الخيارات (بينها |)</th><th>الإجابة الصحيحة</th><th>الدرجة</th><th>إجراء</th></tr></thead>
      <tbody id="qt-question-rows"><tr><td colspan="6" class="empty">اختاري اختبارًا ثم اضغطي «تحميل الأسئلة» أو «إضافة صف».</td></tr></tbody>
      </table></div>
      <hr class="divider" style="margin:22px 0">
      <div class="pagehead"><div><h3>تصحيح الإجابات المقالية</h3><p class="sub">تظهر هنا الإجابات التي سلّمها الطلاب وتحتاج إلى تصحيح يدوي.</p></div>
      <button type="button" class="btn secondary" id="qt-refresh-essays">تحديث الإجابات المقالية</button></div>
      <p id="qt-essay-message" class="msg" role="status"></p><div id="qt-essay-list"><div class="empty">اضغطي تحديث لعرض الإجابات المقالية المعلقة.</div></div>
    `;
    oldCard?.insertAdjacentElement('beforebegin', root);

    const $ = id => document.getElementById(id);
    const examSelect = $('qt-exam-select');
    const rows = $('qt-question-rows');
    const newType = $('qt-new-type');
    const newCourse = $('qt-new-course');
    const newSubject = $('qt-new-subject');
    let newExamCoursesLoaded = false;
    const say = (id, text, kind='') => {
      const el = $(id); el.textContent = text || ''; el.className = 'msg ' + kind;
    };
    const split = value => String(value || '').split('|').map(s => s.trim()).filter(Boolean);
    const parseMultiple = value => {
      try {
        const parsed = JSON.parse(value || '[]');
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch (_) {}
      return split(value);
    };

    function addRow(question = {}) {
      const tr = document.createElement('tr');
      tr.dataset.id = question.id || '';
      let correct = question.correct_answer || '';
      const type = question.question_type || 'single_choice';
      if (type === 'multiple_select') correct = parseMultiple(correct).join(' | ');
      tr.innerHTML = `
        <td><select data-field="question_type">
          <option value="single_choice">اختيار إجابة واحدة</option>
          <option value="multiple_select">اختيار كل الإجابات الصحيحة</option>
          <option value="essay">مقالي — تصحيح يدوي</option>
        </select></td>
        <td><textarea data-field="question_text" aria-label="نص السؤال" placeholder="اكتبي نص السؤال"></textarea></td>
        <td><textarea data-field="options" aria-label="خيارات السؤال" placeholder="الخيار الأول | الخيار الثاني"></textarea></td>
        <td><textarea class="qt-correct" data-field="correct_answer" aria-label="الإجابة الصحيحة" placeholder="إجابة واحدة أو عدة إجابات مفصولة بـ |"></textarea></td>
        <td><input data-field="points" aria-label="درجة السؤال" type="number" min="1" step="1" value="1"></td>
        <td><button type="button" class="btn secondary" data-remove-row>إزالة من الجدول</button></td>`;
      tr.querySelector('[data-field="question_type"]').value = type;
      tr.querySelector('[data-field="question_text"]').value = question.question_text || '';
      const options = Array.isArray(question.options) ? question.options : [];
      tr.querySelector('[data-field="options"]').value = options.map(x => typeof x === 'object' ? (x.text ?? x.label ?? x.value ?? '') : x).join(' | ');
      tr.querySelector('[data-field="correct_answer"]').value = correct;
      tr.querySelector('[data-field="points"]').value = question.points || 1;
      tr.querySelector('[data-remove-row]').disabled = Boolean(question.id);
      tr.querySelector('[data-remove-row]').title = question.id ? 'هذا السؤال محفوظ؛ زر الإزالة متاح للصف الجديد فقط حفاظًا على السجلات' : '';
      tr.querySelector('[data-field="question_type"]').addEventListener('change', () => updateRowStyle(tr));
      rows.appendChild(tr);
      updateRowStyle(tr);
    }

    function updateRowStyle(tr) {
      const type = tr.querySelector('[data-field="question_type"]').value;
      const options = tr.querySelector('[data-field="options"]');
      const correct = tr.querySelector('[data-field="correct_answer"]');
      const isEssay = type === 'essay';
      options.disabled = isEssay;
      correct.disabled = isEssay;
      options.placeholder = isEssay ? 'غير مطلوب للسؤال المقالي' : 'الخيار الأول | الخيار الثاني';
      correct.placeholder = type === 'multiple_select' ? 'إجابة 1 | إجابة 3' : (isEssay ? 'غير مطلوب' : 'اكتبي الإجابة المطابقة لأحد الخيارات');
    }

    async function checkAdmin() {
      const { data, error } = await db.auth.getSession();
      if (error || !data?.session) throw new Error('سجّلي الدخول بحساب الإدارة أولًا.');
      const { data: profile, error: profileError } = await db.from('profiles').select('role').eq('id', data.session.user.id).maybeSingle();
      if (profileError || profile?.role !== 'admin') throw new Error('هذه الوظيفة متاحة لحساب الإدارة فقط.');
    }

    function updateNewExamFields() {
      const isFinal = newType.value === 'Final';
      $('qt-new-subject-field').style.display = isFinal ? 'grid' : 'none';
      $('qt-new-week-field').style.display = isFinal ? 'none' : 'grid';
    }

    async function loadNewExamCourses() {
      try {
        await checkAdmin();
        const { data, error } = await db.from('courses').select('id,name').order('id', {ascending:true});
        if (error) throw error;
        const old = newCourse.value;
        newCourse.innerHTML = '<option value="">اختاري المساق</option>' + (data || []).map(c =>
          `<option value="${esc(c.id)}">${esc(c.name)}</option>`
        ).join('');
        if ((data || []).some(c => String(c.id) === old)) newCourse.value = old;
        newExamCoursesLoaded = true;
        await loadNewExamSubjects();
      } catch (error) { say('qt-question-message', 'تعذر تحميل المساقات: ' + error.message, 'error'); }
    }

    async function loadNewExamSubjects() {
      try {
        newSubject.innerHTML = '<option value="">اختاري المادة</option>';
        if (!newCourse.value) return;
        const { data, error } = await db.from('course_subjects').select('id,name,course_id')
          .eq('course_id', Number(newCourse.value)).order('id', {ascending:true});
        if (error) throw error;
        newSubject.innerHTML = '<option value="">اختاري المادة</option>' + (data || []).map(subject =>
          `<option value="${esc(subject.id)}">${esc(subject.name)}</option>`
        ).join('');
      } catch (error) { say('qt-question-message', 'تعذر تحميل مواد المساق: ' + error.message, 'error'); }
    }

    async function createExamWithQuestions() {
      const button = $('qt-create-exam-with-questions');
      try {
        await checkAdmin();
        if (!newExamCoursesLoaded) await loadNewExamCourses();
        const title = $('qt-new-title').value.trim();
        const type = newType.value;
        const courseId = newCourse.value;
        if (!title) throw new Error('اكتبي عنوان الاختبار.');
        if (!courseId) throw new Error('اختاري المساق.');
        if (type === 'Final' && !newSubject.value) throw new Error('اختاري المادة للاختبار النهائي.');
        if (Array.from(rows.querySelectorAll('tr[data-id]')).some(tr => tr.dataset.id)) {
          throw new Error('جدول الأسئلة يحتوي أسئلة محفوظة لاختبار آخر. اختاري «إضافة صف سؤال» في جدول جديد قبل إنشاء اختبار جديد، أو احفظي تعديلات الاختبار الحالي أولًا.');
        }
        const questions = readRows();
        if (!questions.length) throw new Error('أضيفي سؤالًا واحدًا على الأقل.');
        const exam = {
          title,
          type,
          course_id: Number(courseId),
          course_subject_id: type === 'Final' ? Number(newSubject.value) : null,
          week_number: type === 'Weekly' && $('qt-new-week').value ? Number($('qt-new-week').value) : null,
          open_at: $('qt-new-open').value ? new Date($('qt-new-open').value).toISOString() : null,
          close_at: $('qt-new-close').value ? new Date($('qt-new-close').value).toISOString() : null
        };
        if (exam.open_at && exam.close_at && new Date(exam.close_at) <= new Date(exam.open_at)) {
          throw new Error('موعد الإغلاق يجب أن يكون بعد موعد الفتح.');
        }
        button.disabled = true;
        say('qt-question-message', 'جارٍ إنشاء الاختبار وحفظ الأسئلة في عملية واحدة…');
        const { data, error } = await db.rpc('admin_create_exam_with_questions', {
          p_exam: exam,
          p_questions: questions
        });
        if (error) throw error;
        await loadExamList();
        examSelect.value = String(data.exam_id);
        await loadQuestions();
        $('qt-new-title').value = '';
        $('qt-new-week').value = '';
        $('qt-new-open').value = '';
        $('qt-new-close').value = '';
        say('qt-question-message', `تم إنشاء الاختبار وحفظ ${data.saved} سؤالًا بنجاح.`, 'success');
      } catch (error) { say('qt-question-message', 'تعذر إنشاء الاختبار: ' + error.message, 'error'); }
      finally { button.disabled = false; }
    }

    async function loadExamList() {
      try {
        await checkAdmin();
        const { data, error } = await db.from('exams').select('id,title,type').order('id', {ascending:true});
        if (error) throw error;
        const old = examSelect.value;
        examSelect.innerHTML = '<option value="">اختاري الاختبار</option>' + (data || []).map(e =>
          `<option value="${esc(e.id)}">${esc(e.title)} (#${esc(e.id)} — ${esc(e.type || '')})</option>`
        ).join('');
        if ((data || []).some(e => String(e.id) === old)) examSelect.value = old;
        say('qt-question-message', `تم تحميل ${data?.length || 0} اختبارًا.`, 'success');
      } catch (error) { say('qt-question-message', 'تعذر تحميل الاختبارات: ' + error.message, 'error'); }
    }

    async function loadQuestions() {
      try {
        await checkAdmin();
        if (!examSelect.value) throw new Error('اختاري الاختبار أولًا.');
        const { data, error } = await db.from('questions')
          .select('id,exam_id,question_text,options,correct_answer,question_type,points')
          .eq('exam_id', Number(examSelect.value)).order('id', {ascending:true});
        if (error) throw error;
        rows.innerHTML = '';
        (data || []).forEach(addRow);
        if (!data?.length) rows.innerHTML = '<tr><td colspan="6" class="empty">لا توجد أسئلة بعد. اضغطي «إضافة صف» للبدء.</td></tr>';
        say('qt-question-message', `تم تحميل ${data?.length || 0} سؤالًا.`, 'success');
      } catch (error) { say('qt-question-message', 'تعذر تحميل الأسئلة: ' + error.message, 'error'); }
    }

    function readRows() {
      const trs = Array.from(rows.querySelectorAll('tr[data-field], tr')).filter(tr => tr.querySelector('[data-field="question_type"]'));
      return trs.map(tr => {
        const get = name => tr.querySelector(`[data-field="${name}"]`).value.trim();
        const type = get('question_type');
        const questionText = get('question_text');
        const points = Number(get('points'));
        const options = type === 'essay' ? [] : split(get('options'));
        let correct = null;
        if (type === 'single_choice') {
          const values = split(get('correct_answer'));
          if (values.length !== 1) throw new Error('في سؤال الاختيار الواحد، اكتبي إجابة صحيحة واحدة فقط.');
          if (!options.includes(values[0])) throw new Error('الإجابة الصحيحة يجب أن تطابق خيارًا مكتوبًا حرفيًا.');
          correct = values[0];
        } else if (type === 'multiple_select') {
          const values = split(get('correct_answer'));
          if (!values.length) throw new Error('حددي إجابة صحيحة واحدة على الأقل لسؤال الاختيار المتعدد.');
          if (!values.every(value => options.includes(value))) throw new Error('كل إجابة صحيحة يجب أن تطابق أحد الخيارات حرفيًا.');
          correct = JSON.stringify(values);
        }
        if (!questionText) throw new Error('يوجد صف دون نص سؤال. اكملي النص أو أزيلي الصف الجديد.');
        if (!Number.isInteger(points) || points < 1) throw new Error('درجة كل سؤال يجب أن تكون عددًا صحيحًا يبدأ من 1.');
        if (type !== 'essay' && options.length < 2) throw new Error('أسئلة الاختيار تحتاج خيارين على الأقل.');
        return {
          ...(tr.dataset.id ? { id: Number(tr.dataset.id) } : {}),
          question_text: questionText,
          question_type: type,
          options,
          correct_answer: correct,
          points
        };
      });
    }

    async function saveQuestions() {
      try {
        await checkAdmin();
        if (!examSelect.value) throw new Error('اختاري الاختبار أولًا.');
        const payload = readRows();
        if (!payload.length) throw new Error('أضيفي سؤالًا واحدًا على الأقل.');
        $('qt-save-questions').disabled = true;
        say('qt-question-message', 'جارٍ حفظ الأسئلة…');
        const { data, error } = await db.rpc('admin_save_exam_questions', {
          p_exam_id: Number(examSelect.value),
          p_questions: payload
        });
        if (error) throw error;
        say('qt-question-message', `تم حفظ ${data?.saved ?? payload.length} سؤالًا.`, 'success');
        await loadQuestions();
      } catch (error) { say('qt-question-message', 'تعذر حفظ الأسئلة: ' + error.message, 'error'); }
      finally { $('qt-save-questions').disabled = false; }
    }

    async function loadPendingEssays() {
      try {
        await checkAdmin();
        const { data, error } = await db.rpc('get_pending_essay_answers');
        if (error) throw error;
        const items = Array.isArray(data) ? data : [];
        $('qt-essay-list').innerHTML = items.length ? items.map(item => `
          <article class="qt-essay" data-answer-id="${esc(item.answer_id)}">
            <h4>${esc(item.student_name || ('طالب #' + item.student_id))} — ${esc(item.exam_title || 'اختبار')}</h4>
            <p><b>السؤال:</b> ${esc(item.question_text || '')}</p>
            <div class="qt-answer">${esc(item.answer || 'لم يكتب الطالب إجابة.')}</div>
            <div class="qt-toolbar"><label>الدرجة من ${esc(item.points)}</label>
              <input type="number" min="0" max="${esc(item.points)}" step="1" data-grade-input value="0" style="width:110px;padding:8px;border:1px solid #d7dfda;border-radius:8px">
              <button type="button" class="btn" data-grade-save>حفظ التصحيح</button></div>
          </article>
        `).join('') : '<div class="empty">لا توجد إجابات مقالية معلقة حاليًا.</div>';
        say('qt-essay-message', `عدد الإجابات المعلقة: ${items.length}`, 'success');
      } catch (error) { say('qt-essay-message', 'تعذر تحميل الإجابات: ' + error.message, 'error'); }
    }

    $('qt-load-exams').addEventListener('click', loadExamList);
    $('qt-load-questions').addEventListener('click', loadQuestions);
    $('qt-create-exam-with-questions').addEventListener('click', createExamWithQuestions);
    newType.addEventListener('change', updateNewExamFields);
    newCourse.addEventListener('change', loadNewExamSubjects);
    newCourse.addEventListener('focus', () => { if (!newExamCoursesLoaded) loadNewExamCourses(); });
    newSubject.addEventListener('focus', () => { if (newCourse.value && newSubject.options.length <= 1) loadNewExamSubjects(); });
    updateNewExamFields();
    $('qt-add-row').addEventListener('click', () => {
      const empty = rows.querySelector('.empty');
      if (empty) rows.innerHTML = '';
      addRow();
    });
    $('qt-save-questions').addEventListener('click', saveQuestions);
    $('qt-refresh-essays').addEventListener('click', loadPendingEssays);
    examSelect.addEventListener('change', () => { rows.innerHTML = '<tr><td colspan="6" class="empty">اضغطي «تحميل الأسئلة» لعرض أسئلة هذا الاختبار.</td></tr>'; });
    rows.addEventListener('click', event => {
      const button = event.target.closest('[data-remove-row]');
      if (button && !button.disabled) button.closest('tr').remove();
    });
    $('qt-essay-list').addEventListener('click', async event => {
      const button = event.target.closest('[data-grade-save]');
      if (!button) return;
      const article = button.closest('[data-answer-id]');
      const scoreInput = article.querySelector('[data-grade-input]');
      const points = Number(scoreInput.value);
      try {
        await checkAdmin();
        if (!Number.isInteger(points) || points < 0 || points > Number(scoreInput.max)) {
          throw new Error(`أدخلي درجة من 0 إلى ${scoreInput.max}.`);
        }
        button.disabled = true;
        const { error } = await db.rpc('grade_student_essay', {
          p_student_answer_id: Number(article.dataset.answerId),
          p_awarded_points: points
        });
        if (error) throw error;
        say('qt-essay-message', 'تم حفظ التصحيح وتحديث نتيجة الامتحان.', 'success');
        await loadPendingEssays();
      } catch (error) {
        button.disabled = false;
        say('qt-essay-message', 'تعذر حفظ التصحيح: ' + error.message, 'error');
      }
    });

    // لا ننفذ أي عملية في قاعدة البيانات تلقائيًا عند فتح الصفحة.
    examSelect.addEventListener('focus', () => {
      if (examSelect.options.length <= 1) loadExamList();
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (document.getElementById('view')) installStudentEnhancements();
    if (document.getElementById('questionForm')) installAdminEditor();
  });
})();
