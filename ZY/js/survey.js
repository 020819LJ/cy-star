(function () {
  'use strict';

  // ==================== Helpers ====================

  function escapeHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.appendChild(document.createTextNode(s));
    return d.innerHTML;
  }

  function escapeAttr(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function fmtDate(d) {
    var dt = new Date(d);
    return String(dt.getMonth() + 1).padStart(2, '0') + '/' + String(dt.getDate()).padStart(2, '0');
  }

  function fmtTime(d) {
    var dt = new Date(d);
    return String(dt.getHours()).padStart(2, '0') + ':' + String(dt.getMinutes()).padStart(2, '0');
  }

  function showToast(msg, type) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (type === 'warn' ? ' warn' : '');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.className = 'toast'; }, 2500);
  }

  // ==================== Comment Pool ====================

  var COMMENT_POOL = [
    '想你了', '每天都在想你呢', '你是我的全世界', '好喜欢你呀',
    '在一起的每一天都很开心', '永远喜欢你', '想牵着你的手',
    '你最珍贵', '遇到你真好', '爱你哟', '你是我的小确幸',
    '每天都想见到你', '你笑起来真好看', '想抱抱你',
    '和你在一起的时光最美好', '我的心里只有你', '你是最好的',
    '好想和你在一起', '你是我最想留住的幸运', '看见你就开心'
  ];

  var COMMENT_SEPS = ['\uff0c', '\u3002', '\uff01', '\u2026', '\uff5e'];

  function generateOppComment() {
    var count = randInt(2, 4);
    var picked = [];
    for (var i = 0; i < count; i++) {
      var idx = Math.floor(Math.random() * COMMENT_POOL.length);
      if (picked.indexOf(COMMENT_POOL[idx]) === -1) {
        picked.push(COMMENT_POOL[idx]);
      } else {
        i--;
      }
    }
    var parts = [];
    for (var j = 0; j < picked.length; j++) {
      parts.push(picked[j]);
      if (j < picked.length - 1) {
        parts.push(COMMENT_SEPS[Math.floor(Math.random() * COMMENT_SEPS.length)]);
      }
    }
    return parts.join('');
  }

  // ==================== Built-in Surveys ====================

  var BUILTIN_SURVEYS = [
    {
      id: 'builtin_tolerance',
      title: '\u5bf9\u8c61\u548c\u4ed6\u4eba\u7684\u5173\u7cfb\u4f60\u80fd\u5fcd\u5230\u51e0\u7ea7',
      builtin: true,
      questions: [
        '\u7b2c1\u7ea7\uff1a\u89c1\u9762\u6253\u62db\u547c',
        '\u7b2c2\u7ea7\uff1a\u6709\u8054\u7cfb\u65b9\u5f0f',
        '\u7b2c3\u7ea7\uff1a\u5076\u5c14\u7684\u5173\u5fc3',
        '\u7b2c4\u7ea7\uff1a\u7ecf\u5e38\u7ea6\u7740\u6253\u6e38\u620f',
        '\u7b2c5\u7ea7\uff1a\u8bb0\u5f97\u5bf9\u65b9\u751f\u65e5\uff0c\u5e76\u4e14\u4e92\u9001\u793c\u7269',
        '\u7b2c6\u7ea7\uff1a\u628ata\u6302\u5728\u5634\u8fb9\uff0c\u52a8\u4e0d\u52a8\u5c31\u63d0\u8d77',
        '\u7b2c7\u7ea7\uff1a\u5355\u72ec\u7ea6\u5403\u996d\u770b\u7535\u5f71',
        '\u7b2c8\u7ea7\uff1a\u6253\u4e2a\u7535\u8bdd\u5c31\u4f1a\u53bb\u8d74\u7ea6',
        '\u7b2c9\u7ea7\uff1a\u9891\u7e41\u804a\u5929\u53d1\u6d88\u606f',
        '\u7b2c10\u7ea7\uff1a\u559d\u9189\u4e86\u7ed9ta\u6253\u7535\u8bdd',
        '\u7b2c11\u7ea7\uff1a\u4e00\u8d77\u5408\u79df',
        '\u7b2c12\u7ea7\uff1a\u5355\u72ec\u4e00\u8d77\u65c5\u884c',
        '\u7b2c13\u7ea7\uff1a\u4e00\u8d77\u5f00\u4e00\u95f4\u623f',
        '\u7b2c14\u7ea7\uff1a\u5728\u4f60\u7684\u9762\u524d\u548cta\u6709\u76f4\u63a5\u7684\u4eb2\u5bc6\u4e3e\u52a8',
        '\u7b2c15\u7ea7\uff1a\u5b69\u5b50\u5168\u90fd\u4e0d\u662f\u4f60\u7684'
      ].map(function (t) {
        return { text: t, options: ['\u63a5\u53d7', '\u4e2d\u7acb', '\u62d2\u7edd'], needOptions: true, needComment: true };
      })
    }
  ];

  // ==================== State ====================

  var surveys = [];
  var surveyRecords = [];

  // Fill-flow state
  var surveyFill = null;
  var fillTimers = [];

  // ==================== Storage ====================

  async function saveSurveyData() {
    await localforage.setItem(getStorageKey('surveys'), surveys);
    await localforage.setItem(getStorageKey('surveyRecords'), surveyRecords);
  }

  async function loadSurveyData() {
    surveys = await localforage.getItem(getStorageKey('surveys')) || BUILTIN_SURVEYS.map(function (s) { return JSON.parse(JSON.stringify(s)); });
    surveyRecords = await localforage.getItem(getStorageKey('surveyRecords')) || [];
    // Ensure built-in surveys always exist
    for (var i = 0; i < BUILTIN_SURVEYS.length; i++) {
      var bs = BUILTIN_SURVEYS[i];
      if (!surveys.find(function (s) { return s.id === bs.id; })) {
        surveys.unshift(JSON.parse(JSON.stringify(bs)));
      }
    }
  }

  // ==================== SVG Icons ====================

  var ENVELOPE_SVG = '<svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>';

  // ==================== Envelope Card SVG ====================

  var CARD_ENVELOPE_SVG = '<svg viewBox="0 0 40 40" width="40" height="40" fill="none"><rect x="3" y="8" width="34" height="24" rx="3" stroke="currentColor" stroke-width="1.5"/><path d="M3 10l17 12 17-12" stroke="currentColor" stroke-width="1.5" fill="none"/></svg>';

  // ==================== Main Open ====================

  async function open() {
    await loadSurveyData();
    ensureModal();
    ensureFullScreen();
    renderSurveys();
    showModal(document.getElementById('surveyModal'));
  }

  function ensureModal() {
    if (document.getElementById('surveyModal')) return;
    var div = document.createElement('div');
    div.className = 'modal';
    div.id = 'surveyModal';
    div.style.display = 'none';
    div.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<span class="modal-title"><i class="fas fa-clipboard-list"></i> \u95ee\u5377</span>' +
          '<button class="modal-close" onclick="hideModal(document.getElementById(\'surveyModal\'))">&times;</button>' +
        '</div>' +
        '<div class="modal-body" style="position:relative;max-height:80vh;overflow-y:auto;">' +
          '<div class="survey-toolbar">' +
            '<button class="survey-pill-btn" onclick="SurveyApp.newSurvey()">\u65b0\u5efa\u95ee\u5377</button>' +
            '<button class="survey-pill-btn" onclick="document.getElementById(\'surveyImportInput\').click()">\u5bfc\u5165</button>' +
            '<input type="file" id="surveyImportInput" accept=".json" style="display:none" onchange="SurveyApp.handleImport(event)">' +
          '</div>' +
          '<div id="surveyDeck" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;"></div>' +
          '<div class="survey-invite-popup" id="surveyInvitePopup" style="display:none;">' +
            '<div class="sip-icon" id="sipIcon"></div>' +
            '<div class="sip-body">' +
              '<div class="sip-title" id="sipTitle"></div>' +
              '<div class="sip-sub" id="sipSub"></div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(div);
  }

  function ensureFullScreen() {
    if (document.getElementById('surveyFullScreen')) return;
    var div = document.createElement('div');
    div.className = 'survey-fullscreen';
    div.id = 'surveyFullScreen';
    div.style.display = 'none';
    div.innerHTML =
      '<div class="sf-header">' +
        '<button class="sf-back" onclick="SurveyApp.closeFull()">\u2190 \u8fd4\u56de</button>' +
        '<span class="sf-title" id="sfFullTitle"></span>' +
        '<span class="sf-progress" id="sfFullProgress"></span>' +
      '</div>' +
      '<div class="sf-body" id="sfFullBody"></div>';
    document.body.appendChild(div);
  }

  // ==================== Render Survey Cards ====================

  function renderSurveys() {
    var deck = document.getElementById('surveyDeck');
    if (!deck) return;
    if (surveys.length === 0) {
      deck.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--text-secondary);padding:40px 0;">\u6682\u65e0\u95ee\u5377\uff0c\u70b9\u51fb\u201c\u65b0\u5efa\u95ee\u5377\u201d\u521b\u5efa</div>';
      return;
    }
    var html = '';
    for (var i = 0; i < surveys.length; i++) {
      var s = surveys[i];
      var recCount = surveyRecords.filter(function (r) { return r.surveyId === s.id; }).length;
      var badge = s.builtin ? '<span style="font-size:11px;background:var(--accent-color);color:#fff;padding:1px 6px;border-radius:var(--radius-sm);margin-left:4px;">\u5185\u7f6e</span>' : '';
      html +=
        '<div class="survey-card" onclick="SurveyApp.openDetail(\'' + escapeAttr(s.id) + '\')" style="cursor:pointer;">' +
          '<div style="color:var(--text-secondary);margin-bottom:8px;">' + CARD_ENVELOPE_SVG + '</div>' +
          '<div style="font-weight:600;font-size:14px;color:var(--text-primary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.4;min-height:2.8em;">' + escapeHtml(s.title) + '</div>' +
          '<div style="margin-top:8px;font-size:12px;color:var(--text-secondary);">' + s.questions.length + '\u9898 \u00b7 ' + recCount + '\u6b21\u586b\u5199' + badge + '</div>' +
        '</div>';
    }
    deck.innerHTML = html;
  }

  // ==================== Survey Detail ====================

  function openDetail(id) {
    var s = surveys.find(function (sv) { return sv.id === id; });
    if (!s) return;
    var recs = surveyRecords.filter(function (r) { return r.surveyId === id; }).sort(function (a, b) { return b.ts - a.ts; });

    var recHtml = '';
    if (recs.length === 0) {
      recHtml = '<div style="text-align:center;color:var(--text-secondary);padding:20px 0;">\u6682\u65e0\u586b\u5199\u8bb0\u5f55</div>';
    } else {
      for (var i = 0; i < recs.length; i++) {
        var r = recs[i];
        recHtml +=
          '<div class="survey-rec-item" onclick="SurveyApp.openRecordSummary(\'' + escapeAttr(r.id) + '\')" style="cursor:pointer;padding:10px 0;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;">' +
            '<div>' +
              '<div style="font-size:13px;color:var(--text-primary);">' + escapeHtml(r.title) + '</div>' +
              '<div style="font-size:12px;color:var(--text-secondary);">' + fmtDate(r.ts) + ' ' + fmtTime(r.ts) + '</div>' +
            '</div>' +
            '<i class="fas fa-chevron-right" style="color:var(--text-secondary);font-size:12px;"></i>' +
          '</div>';
      }
    }

    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<span class="modal-title">' + escapeHtml(s.title) + '</span>' +
          '<button class="modal-close" onclick="SurveyApp._removeAndHide(this)">&times;</button>' +
        '</div>' +
        '<div class="modal-body" style="max-height:80vh;overflow-y:auto;">' +
          '<div style="margin-bottom:16px;font-size:13px;color:var(--text-secondary);">\u5171 ' + s.questions.length + ' \u9898</div>' +
          '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">' +
            '<button class="survey-pill-btn" onclick="SurveyApp.inviteSurvey(\'' + escapeAttr(s.id) + '\')">\u9080\u8bf7\u5bf9\u65b9\u586b\u5199</button>' +
            '<button class="survey-pill-btn" onclick="SurveyApp.editSurvey(\'' + escapeAttr(s.id) + '\')">\u7f16\u8f91\u95ee\u5377</button>' +
            '<button class="survey-pill-btn" onclick="SurveyApp.exportSurvey(\'' + escapeAttr(s.id) + '\')">\u5bfc\u51fa\u95ee\u5377</button>' +
            '<button class="survey-pill-btn" style="color:#e74c3c;" onclick="SurveyApp.deleteSurvey(\'' + escapeAttr(s.id) + '\')">\u5220\u9664\u95ee\u5377</button>' +
          '</div>' +
          '<div style="font-weight:600;font-size:14px;color:var(--text-primary);margin-bottom:8px;">\u586b\u5199\u8bb0\u5f55</div>' +
          recHtml +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    showModal(modal);
  }

  function _removeAndHide(btn) {
    var modal = btn.closest('.modal');
    if (modal) {
      hideModal(modal);
      setTimeout(function () { modal.remove(); }, 300);
    }
  }

  // ==================== Record Summary ====================

  function openRecordSummary(id) {
    var r = surveyRecords.find(function (rec) { return rec.id === id; });
    if (!r) return;

    var rows = '';
    for (var i = 0; i < r.answers.length; i++) {
      var a = r.answers[i];
      var commentHtml = '';
      if (a.selfComment) {
        commentHtml += '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">\u6211\uff1a' + escapeHtml(a.selfComment) + '</div>';
      }
      if (a.oppComment) {
        commentHtml += '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">\u5f7c\uff1a' + escapeHtml(a.oppComment) + '</div>';
      }
      rows +=
        '<div style="padding:10px 0;border-bottom:1px solid var(--border-color);">' +
          '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:6px;">' + escapeHtml(a.q) + '</div>' +
          '<div style="display:flex;gap:12px;font-size:13px;">' +
            '<span>\u6211\uff1a<span style="color:var(--accent-color);">' + escapeHtml(a.self || '-') + '</span></span>' +
            '<span>\u5f7c\uff1a<span style="color:var(--accent-color);">' + escapeHtml(a.opp || '-') + '</span></span>' +
          '</div>' +
          commentHtml +
        '</div>';
    }

    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'none';
    modal.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<span class="modal-title">' + escapeHtml(r.title) + '</span>' +
          '<button class="modal-close" onclick="SurveyApp._removeAndHide(this)">&times;</button>' +
        '</div>' +
        '<div class="modal-body" style="max-height:80vh;overflow-y:auto;">' +
          '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">' + fmtDate(r.ts) + ' ' + fmtTime(r.ts) + '</div>' +
          rows +
          '<div style="margin-top:16px;text-align:center;">' +
            '<button class="survey-pill-btn" style="color:#e74c3c;" onclick="SurveyApp.deleteRecord(\'' + escapeAttr(r.id) + '\')">\u5220\u9664\u6b64\u8bb0\u5f55</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    showModal(modal);
  }

  // ==================== CRUD ====================

  async function deleteRecord(id) {
    surveyRecords = surveyRecords.filter(function (r) { return r.id !== id; });
    await saveSurveyData();
    // Close the summary modal
    var modals = document.querySelectorAll('.modal');
    for (var i = modals.length - 1; i >= 0; i--) {
      if (modals[i].id !== 'surveyModal') {
        hideModal(modals[i]);
        (function (m) { setTimeout(function () { m.remove(); }, 300); })(modals[i]);
      }
    }
    renderSurveys();
    showToast('\u8bb0\u5f55\u5df2\u5220\u9664');
  }

  async function deleteSurvey(id) {
    var s = surveys.find(function (sv) { return sv.id === id; });
    if (s && s.builtin) {
      showToast('\u5185\u7f6e\u95ee\u5377\u4e0d\u53ef\u5220\u9664', 'warn');
      return;
    }
    surveys = surveys.filter(function (sv) { return sv.id !== id; });
    surveyRecords = surveyRecords.filter(function (r) { return r.surveyId !== id; });
    await saveSurveyData();
    // Close all sub-modals
    var modals = document.querySelectorAll('.modal');
    for (var i = modals.length - 1; i >= 0; i--) {
      if (modals[i].id !== 'surveyModal') {
        hideModal(modals[i]);
        (function (m) { setTimeout(function () { m.remove(); }, 300); })(modals[i]);
      }
    }
    renderSurveys();
    showToast('\u95ee\u5377\u5df2\u5220\u9664');
  }

  function exportSurvey(id) {
    var s = surveys.find(function (sv) { return sv.id === id; });
    if (!s) return;
    var json = JSON.stringify(s, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (s.title || 'survey') + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('\u5df2\u5bfc\u51fa');
  }

  function handleImport(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function (e) {
      try {
        var data = JSON.parse(e.target.result);
        if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
          showToast('\u65e0\u6548\u7684\u95ee\u5377\u6587\u4ef6\uff1a\u7f3a\u5c11\u6807\u9898', 'warn');
          return;
        }
        if (!Array.isArray(data.questions) || data.questions.length === 0) {
          showToast('\u65e0\u6548\u7684\u95ee\u5377\u6587\u4ef6\uff1a\u7f3a\u5c11\u9898\u76ee', 'warn');
          return;
        }
        for (var i = 0; i < data.questions.length; i++) {
          var q = data.questions[i];
          if (!q.text || typeof q.text !== 'string' || !q.text.trim()) {
            showToast('\u65e0\u6548\u7684\u95ee\u5377\u6587\u4ef6\uff1a\u7b2c' + (i + 1) + '\u9898\u7f3a\u5c11\u5185\u5bb9', 'warn');
            return;
          }
          if (!Array.isArray(q.options) || q.options.length < 2) {
            showToast('\u65e0\u6548\u7684\u95ee\u5377\u6587\u4ef6\uff1a\u7b2c' + (i + 1) + '\u9898\u81f3\u5c11\u9700\u89812\u4e2a\u9009\u9879', 'warn');
            return;
          }
          if (typeof q.needOptions === 'undefined') q.needOptions = true;
          if (typeof q.needComment === 'undefined') q.needComment = false;
        }
        data.id = 's' + Date.now();
        data.builtin = false;
        surveys.push(data);
        await saveSurveyData();
        renderSurveys();
        showToast('\u5bfc\u5165\u6210\u529f');
      } catch (err) {
        showToast('\u89e3\u6790 JSON \u5931\u8d25', 'warn');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  // ==================== New / Edit Survey ====================

  var editState = null; // { id, title, questions: [{ text, options, needOptions, needComment }] }

  function newSurvey() {
    editState = {
      id: null,
      title: '',
      questions: [
        { text: '', options: ['\u9009\u98791', '\u9009\u98792'], needOptions: true, needComment: false }
      ]
    };
    renderEditModal();
  }

  function editSurvey(id) {
    var s = surveys.find(function (sv) { return sv.id === id; });
    if (!s) return;
    editState = {
      id: s.id,
      title: s.title,
      questions: s.questions.map(function (q) {
        return {
          text: q.text,
          options: q.options.slice(),
          needOptions: q.needOptions !== false,
          needComment: !!q.needComment
        };
      })
    };
    renderEditModal();
  }

  function syncEditFormToState() {
    if (!editState) return;
    var titleInput = document.getElementById('surveyEditTitle');
    if (titleInput) editState.title = titleInput.value;
    for (var qi = 0; qi < editState.questions.length; qi++) {
      var qText = document.getElementById('seq_text_' + qi);
      if (qText) editState.questions[qi].text = qText.value;
      var optCheck = document.getElementById('seq_opt_' + qi);
      if (optCheck) editState.questions[qi].needOptions = optCheck.checked;
      var cmtCheck = document.getElementById('seq_cmt_' + qi);
      if (cmtCheck) editState.questions[qi].needComment = cmt.checked;
      if (editState.questions[qi].needOptions) {
        var opts = editState.questions[qi].options;
        var newOpts = [];
        for (var oi = 0; oi < opts.length; oi++) {
          var inp = document.getElementById('seo_' + qi + '_' + oi);
          if (inp) newOpts.push(inp.value);
          else newOpts.push(opts[oi]);
        }
        editState.questions[qi].options = newOpts;
      }
    }
  }

  function renderEditModal() {
    syncEditFormToState();
    // Remove existing edit modal if any
    var old = document.getElementById('surveyEditModal');
    if (old) { old.remove(); }

    var modal = document.createElement('div');
    modal.className = 'modal';
    modal.id = 'surveyEditModal';
    modal.style.display = 'none';

    var questionsHtml = '';
    for (var qi = 0; qi < editState.questions.length; qi++) {
      var q = editState.questions[qi];
      var optChecked = q.needOptions ? 'checked' : '';
      var cmtChecked = q.needComment ? 'checked' : '';

      var optionsHtml = '';
      if (q.needOptions) {
        for (var oi = 0; oi < q.options.length; oi++) {
          optionsHtml +=
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">' +
              '<input type="text" id="seo_' + qi + '_' + oi + '" value="' + escapeAttr(q.options[oi]) + '" style="flex:1;padding:6px 10px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--secondary-bg);color:var(--text-primary);font-size:13px;">' +
              '<button class="survey-pill-btn" style="padding:4px 8px;font-size:12px;color:#e74c3c;flex-shrink:0;" onclick="SurveyApp.removeEditOption(' + qi + ',' + oi + ')">\u00d7</button>' +
            '</div>';
        }
        optionsHtml +=
          '<button class="survey-pill-btn" style="font-size:12px;margin-top:4px;" onclick="SurveyApp.addEditOption(' + qi + ')">\u6dfb\u52a0\u9009\u9879</button>';
      }

      questionsHtml +=
        '<div style="border:1px solid var(--border-color);border-radius:var(--radius);padding:12px;margin-bottom:12px;">' +
          '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">' +
            '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">\u9898 ' + (qi + 1) + '</span>' +
            '<button class="survey-pill-btn" style="padding:2px 8px;font-size:12px;color:#e74c3c;" onclick="SurveyApp.removeEditQuestion(' + qi + ')">\u5220\u9664\u9898\u76ee</button>' +
          '</div>' +
          '<input type="text" id="seq_text_' + qi + '" value="' + escapeAttr(q.text) + '" placeholder="\u9898\u76ee\u5185\u5bb9" style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--secondary-bg);color:var(--text-primary);font-size:13px;box-sizing:border-box;margin-bottom:8px;">' +
          '<div style="display:flex;gap:12px;margin-bottom:8px;">' +
            '<label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--text-primary);cursor:pointer;">' +
              '<input type="checkbox" id="seq_opt_' + qi + '" ' + optChecked + ' onchange="SurveyApp.toggleQOpts(' + qi + ')">' +
              '\u9009\u9879' +
            '</label>' +
            '<label style="display:flex;align-items:center;gap:4px;font-size:13px;color:var(--text-primary);cursor:pointer;">' +
              '<input type="checkbox" id="seq_cmt_' + qi + '" ' + cmtChecked + '>' +
              '\u9644\u52a0\u8bc4\u8bba' +
            '</label>' +
          '</div>' +
          '<div id="seq_opts_container_' + qi + '">' + optionsHtml + '</div>' +
        '</div>';
    }

    modal.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<span class="modal-title">' + (editState.id ? '\u7f16\u8f91\u95ee\u5377' : '\u65b0\u5efa\u95ee\u5377') + '</span>' +
          '<button class="modal-close" onclick="SurveyApp._closeEdit()">&times;</button>' +
        '</div>' +
        '<div class="modal-body" style="max-height:80vh;overflow-y:auto;">' +
          '<input type="text" id="surveyEditTitle" value="' + escapeAttr(editState.title) + '" placeholder="\u95ee\u5377\u6807\u9898" style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--secondary-bg);color:var(--text-primary);font-size:14px;font-weight:600;box-sizing:border-box;margin-bottom:12px;">' +
          '<div id="surveyEditQuestions">' + questionsHtml + '</div>' +
          '<button class="survey-pill-btn" style="width:100%;margin-bottom:12px;" onclick="SurveyApp.addEditQuestion()">\u6dfb\u52a0\u9898\u76ee</button>' +
          '<button class="survey-pill-btn" style="width:100%;background:var(--accent-color);color:#fff;" onclick="SurveyApp.saveEditSurvey()">\u4fdd\u5b58\u95ee\u5377</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(modal);
    showModal(modal);
  }

  function toggleQOpts(qi) {
    syncEditFormToState();
    if (editState.questions[qi].needOptions && editState.questions[qi].options.length === 0) {
      editState.questions[qi].options = ['\u9009\u98791', '\u9009\u98792'];
    }
    renderEditModal();
  }

  function addEditQuestion() {
    syncEditFormToState();
    editState.questions.push({ text: '', options: ['\u9009\u98791', '\u9009\u98792'], needOptions: true, needComment: false });
    renderEditModal();
    // Scroll to bottom
    requestAnimationFrame(function () {
      var body = document.querySelector('#surveyEditModal .modal-body');
      if (body) body.scrollTop = body.scrollHeight;
    });
  }

  function removeEditQuestion(i) {
    syncEditFormToState();
    if (editState.questions.length <= 1) {
      showToast('\u81f3\u5c11\u4fdd\u7559\u4e00\u9898', 'warn');
      return;
    }
    editState.questions.splice(i, 1);
    renderEditModal();
  }

  function addEditOption(qi) {
    syncEditFormToState();
    editState.questions[qi].options.push('\u65b0\u9009\u9879');
    renderEditModal();
    // Focus the new option
    requestAnimationFrame(function () {
      var inp = document.getElementById('seo_' + qi + '_' + (editState.questions[qi].options.length - 1));
      if (inp) inp.focus();
    });
  }

  function removeEditOption(qi, oi) {
    syncEditFormToState();
    if (editState.questions[qi].options.length <= 2) {
      showToast('\u81f3\u5c11\u4fdd\u75592\u4e2a\u9009\u9879', 'warn');
      return;
    }
    editState.questions[qi].options.splice(oi, 1);
    renderEditModal();
  }

  async function saveEditSurvey() {
    syncEditFormToState();
    if (!editState.title.trim()) {
      showToast('\u8bf7\u8f93\u5165\u95ee\u5377\u6807\u9898', 'warn');
      return;
    }
    var validQuestions = [];
    for (var i = 0; i < editState.questions.length; i++) {
      var q = editState.questions[i];
      if (q.text.trim()) {
        if (q.needOptions) {
          var filtered = q.options.filter(function (o) { return o.trim(); });
          if (filtered.length < 2) {
            showToast('\u7b2c' + (i + 1) + '\u9898\u81f3\u5c11\u9700\u89812\u4e2a\u6709\u6548\u9009\u9879', 'warn');
            return;
          }
          q.options = filtered;
        }
        validQuestions.push(q);
      }
    }
    if (validQuestions.length === 0) {
      showToast('\u81f3\u5c11\u9700\u89811\u4e2a\u6709\u6548\u9898\u76ee', 'warn');
      return;
    }
    editState.questions = validQuestions;

    if (editState.id) {
      // Update existing
      var idx = surveys.findIndex(function (s) { return s.id === editState.id; });
      if (idx !== -1) {
        surveys[idx].title = editState.title;
        surveys[idx].questions = editState.questions;
      }
    } else {
      // New survey
      surveys.push({
        id: 's' + Date.now(),
        title: editState.title,
        builtin: false,
        questions: editState.questions
      });
    }
    await saveSurveyData();
    _closeEdit();
    renderSurveys();
    showToast(editState.id ? '\u95ee\u5377\u5df2\u66f4\u65b0' : '\u95ee\u5377\u5df2\u521b\u5efa');
  }

  function _closeEdit() {
    var modal = document.getElementById('surveyEditModal');
    if (modal) {
      hideModal(modal);
      setTimeout(function () { modal.remove(); }, 300);
    }
    editState = null;
  }

  // ==================== Invite Flow ====================

  function inviteSurvey(id) {
    // Close the detail modal
    var modals = document.querySelectorAll('.modal');
    for (var i = modals.length - 1; i >= 0; i--) {
      if (modals[i].id !== 'surveyModal') {
        hideModal(modals[i]);
        (function (m) { setTimeout(function () { m.remove(); }, 300); })(modals[i]);
      }
    }

    var popup = document.getElementById('surveyInvitePopup');
    var sipIcon = document.getElementById('sipIcon');
    var sipTitle = document.getElementById('sipTitle');
    var sipSub = document.getElementById('sipSub');
    if (!popup) return;

    sipIcon.innerHTML = '<i class="fas fa-paper-plane" style="font-size:28px;color:var(--accent-color);"></i>';
    sipTitle.textContent = '\u5df2\u53d1\u51fa\u9080\u8bf7 \u00b7 \u7b49\u5f85\u5bf9\u65b9\u56de\u5e94\u2026';
    sipSub.textContent = '';
    popup.style.display = 'flex';

    setTimeout(function () {
      var accepted = Math.random() < 0.5;
      if (accepted) {
        sipIcon.innerHTML = '<i class="fas fa-check-circle" style="font-size:28px;color:#27ae60;"></i>';
        sipTitle.textContent = '\u5bf9\u65b9\u63a5\u53d7\u4e86\u9080\u8bf7';
        sipSub.textContent = '\u6b63\u5728\u8fdb\u5165\u95ee\u5377\u2026';
        setTimeout(function () {
          popup.style.display = 'none';
          startSurveyFill(id);
        }, 1400);
      } else {
        sipIcon.innerHTML = '<i class="fas fa-times-circle" style="font-size:28px;color:#e74c3c;"></i>';
        sipTitle.textContent = '\u5bf9\u65b9\u62d2\u7edd\u4e86\u9080\u8bf7';
        sipSub.textContent = '';
        setTimeout(function () {
          popup.style.display = 'none';
        }, 1800);
      }
    }, 1300);
  }

  // ==================== Survey Fill (Full-Screen) ====================

  function startSurveyFill(id) {
    var s = surveys.find(function (sv) { return sv.id === id; });
    if (!s) return;
    clearFillTimers();

    surveyFill = {
      surveyId: s.id,
      survey: s,
      qIndex: 0,
      selfIdx: -1,
      oppIdx: -1,
      stage: 'pick',
      reselectMsg: '',
      curAnswer: null,
      answers: []
    };

    var fs = document.getElementById('surveyFullScreen');
    if (!fs) return;
    fs.style.display = 'block';
    document.getElementById('sfFullTitle').textContent = s.title;
    requestAnimationFrame(function () {
      fs.classList.add('sf-visible');
    });
    renderFillQuestion();
  }

  function closeFull() {
    clearFillTimers();
    surveyFill = null;
    var fs = document.getElementById('surveyFullScreen');
    if (!fs) return;
    fs.classList.remove('sf-visible');
    setTimeout(function () {
      fs.style.display = 'none';
      document.getElementById('sfFullBody').innerHTML = '';
    }, 350);
  }

  function clearFillTimers() {
    for (var i = 0; i < fillTimers.length; i++) {
      clearTimeout(fillTimers[i]);
    }
    fillTimers = [];
  }

  function renderFillQuestion() {
    if (!surveyFill) return;
    var sf = surveyFill;
    var qi = sf.qIndex;
    var q = sf.survey.questions[qi];
    var body = document.getElementById('sfFullBody');
    if (!body) return;

    // Update progress
    var prog = document.getElementById('sfFullProgress');
    if (prog) prog.textContent = (qi + 1) + ' / ' + sf.survey.questions.length;

    if (sf.stage === 'pick') {
      renderPickStage(q, body);
    } else if (sf.stage === 'reselecting') {
      renderReselectingStage(q, body);
    } else if (sf.stage === 'reselect-refused') {
      renderReselectRefusedStage(q, body);
    } else if (sf.stage === 'reselect-done') {
      renderReselectDoneStage(q, body);
    } else if (sf.stage === 'comment-wait') {
      renderCommentWaitStage(q, body);
    } else if (sf.stage === 'comment') {
      renderCommentStage(q, body);
    } else if (sf.stage === 'summary') {
      renderSummaryStage(body);
    }
  }

  function renderPickStage(q, body) {
    var sf = surveyFill;
    var optionsHtml = '';
    for (var i = 0; i < q.options.length; i++) {
      var selected = sf.selfIdx === i ? 'sf-opt-selected' : '';
      var oppMark = sf.oppIdx === i ? '<span class="sf-opp-mark">\u5f7c</span>' : '';
      optionsHtml +=
        '<div class="sf-option ' + selected + '" onclick="SurveyApp.pickOption(' + i + ')">' +
          '<span>' + escapeHtml(q.options[i]) + '</span>' +
          oppMark +
        '</div>';
    }

    var reselectHtml = (sf.selfIdx >= 0 && sf.oppIdx >= 0) ?
      '<button class="sf-reselect-btn" onclick="SurveyApp.requestReselect()">\u91cd\u9009</button>' : '';

    body.innerHTML =
      '<div class="sf-question" style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px;text-align:center;">' + escapeHtml(q.text) + '</div>' +
      '<div class="sf-options">' + optionsHtml + '</div>' +
      '<div style="margin-top:16px;text-align:center;">' + reselectHtml + '</div>';
  }

  function pickOption(idx) {
    if (!surveyFill || surveyFill.stage !== 'pick') return;
    var sf = surveyFill;
    var q = sf.survey.questions[sf.qIndex];

    sf.selfIdx = idx;
    // Generate opponent answer immediately
    sf.oppIdx = randInt(0, q.options.length - 1);

    sf.curAnswer = {
      q: q.text,
      self: q.options[sf.selfIdx],
      opp: q.options[sf.oppIdx],
      selfComment: '',
      oppComment: ''
    };

    renderFillQuestion();

    // Proceed to comment-wait or next question
    if (q.needComment) {
      var tid = setTimeout(function () {
        sf.stage = 'comment-wait';
        renderFillQuestion();
        // Generate opponent comment after 3-10s
        var commentDelay = randInt(3000, 10000);
        var ctid = setTimeout(function () {
          sf.curAnswer.oppComment = generateOppComment();
          sf.stage = 'comment';
          renderFillQuestion();
        }, commentDelay);
        fillTimers.push(ctid);
      }, 800);
      fillTimers.push(tid);
    } else {
      // No comment needed, add answer and move on
      var tid2 = setTimeout(function () {
        sf.answers.push(sf.curAnswer);
        sf.qIndex++;
        sf.selfIdx = -1;
        sf.oppIdx = -1;
        sf.curAnswer = null;
        if (sf.qIndex >= sf.survey.questions.length) {
          sf.stage = 'summary';
        } else {
          sf.stage = 'pick';
        }
        renderFillQuestion();
      }, 600);
      fillTimers.push(tid2);
    }
  }

  function requestReselect() {
    if (!surveyFill || surveyFill.stage !== 'pick') return;
    surveyFill.stage = 'reselecting';
    renderFillQuestion();

    var delay = randInt(1000, 3000);
    var tid = setTimeout(function () {
      var success = Math.random() < 0.5;
      if (success) {
        // Opponent reselects
        var q = surveyFill.survey.questions[surveyFill.qIndex];
        surveyFill.oppIdx = randInt(0, q.options.length - 1);
        surveyFill.curAnswer.opp = q.options[surveyFill.oppIdx];
        surveyFill.stage = 'reselect-done';
      } else {
        surveyFill.stage = 'reselect-refused';
      }
      renderFillQuestion();
    }, delay);
    fillTimers.push(tid);
  }

  function renderReselectingStage(q, body) {
    body.innerHTML =
      '<div class="sf-question" style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px;text-align:center;">' + escapeHtml(q.text) + '</div>' +
      '<div style="text-align:center;padding:40px 0;color:var(--text-secondary);font-size:14px;">' +
        '<i class="fas fa-spinner fa-spin" style="font-size:24px;margin-bottom:12px;display:block;"></i>' +
        '\u5bf9\u65b9\u6b63\u5728\u91cd\u65b0\u9009\u62e9\u2026' +
      '</div>';
  }

  function renderReselectRefusedStage(q, body) {
    body.innerHTML =
      '<div class="sf-question" style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px;text-align:center;">' + escapeHtml(q.text) + '</div>' +
      '<div style="text-align:center;padding:40px 0;color:var(--text-secondary);font-size:14px;">' +
        '<i class="fas fa-ban" style="font-size:24px;color:#e74c3c;margin-bottom:12px;display:block;"></i>' +
        '\u5bf9\u65b9\u62d2\u7edd\u91cd\u9009' +
      '</div>' +
      '<div style="text-align:center;margin-top:16px;">' +
        '<button class="survey-pill-btn" onclick="SurveyApp.proceedAfterReselect()">\u7ee7\u7eed</button>' +
      '</div>';
  }

  function renderReselectDoneStage(q, body) {
    var sf = surveyFill;
    var optionsHtml = '';
    for (var i = 0; i < q.options.length; i++) {
      var selfMark = sf.selfIdx === i ? '<span class="sf-self-mark">\u6211</span>' : '';
      var oppMark = sf.oppIdx === i ? '<span class="sf-opp-mark">\u5f7c</span>' : '';
      optionsHtml +=
        '<div class="sf-option' + (sf.selfIdx === i ? ' sf-opt-selected' : '') + '">' +
          '<span>' + escapeHtml(q.options[i]) + '</span>' +
          selfMark + oppMark +
        '</div>';
    }

    body.innerHTML =
      '<div class="sf-question" style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px;text-align:center;">' + escapeHtml(q.text) + '</div>' +
      '<div class="sf-options">' + optionsHtml + '</div>' +
      '<div style="text-align:center;margin-top:16px;">' +
        '<button class="survey-pill-btn" onclick="SurveyApp.proceedAfterReselect()">\u7ee7\u7eed</button>' +
      '</div>';
  }

  function proceedAfterReselect() {
    if (!surveyFill) return;
    var sf = surveyFill;
    var q = sf.survey.questions[sf.qIndex];

    sf.answers.push(sf.curAnswer);
    sf.qIndex++;
    sf.selfIdx = -1;
    sf.oppIdx = -1;
    sf.curAnswer = null;

    if (q.needComment) {
      sf.stage = 'comment-wait';
      renderFillQuestion();
      var commentDelay = randInt(3000, 10000);
      var ctid = setTimeout(function () {
        sf.curAnswer = sf.answers[sf.answers.length - 1] || {};
        sf.curAnswer.oppComment = generateOppComment();
        sf.stage = 'comment';
        renderFillQuestion();
      }, commentDelay);
      fillTimers.push(ctid);
    } else {
      if (sf.qIndex >= sf.survey.questions.length) {
        sf.stage = 'summary';
      } else {
        sf.stage = 'pick';
      }
      renderFillQuestion();
    }
  }

  function renderCommentWaitStage(q, body) {
    var sf = surveyFill;
    var optionsHtml = '';
    for (var i = 0; i < q.options.length; i++) {
      var selfMark = sf.selfIdx === i ? '<span class="sf-self-mark">\u6211</span>' : '';
      var oppMark = sf.oppIdx === i ? '<span class="sf-opp-mark">\u5f7c</span>' : '';
      optionsHtml +=
        '<div class="sf-option' + (sf.selfIdx === i ? ' sf-opt-selected' : '') + '">' +
          '<span>' + escapeHtml(q.options[i]) + '</span>' +
          selfMark + oppMark +
        '</div>';
    }

    body.innerHTML =
      '<div class="sf-question" style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px;text-align:center;">' + escapeHtml(q.text) + '</div>' +
      '<div class="sf-options">' + optionsHtml + '</div>' +
      '<div style="text-align:center;padding:24px 0;color:var(--text-secondary);font-size:14px;">' +
        '<i class="fas fa-keyboard" style="font-size:20px;margin-bottom:8px;display:block;animation:pulse 1.5s infinite;"></i>' +
        '\u5bf9\u65b9\u6b63\u5728\u8f93\u5165\u8bc4\u8bba\u2026' +
      '</div>';
  }

  function renderCommentStage(q, body) {
    var sf = surveyFill;
    var optionsHtml = '';
    for (var i = 0; i < q.options.length; i++) {
      var selfMark = sf.selfIdx === i ? '<span class="sf-self-mark">\u6211</span>' : '';
      var oppMark = sf.oppIdx === i ? '<span class="sf-opp-mark">\u5f7c</span>' : '';
      optionsHtml +=
        '<div class="sf-option' + (sf.selfIdx === i ? ' sf-opt-selected' : '') + '">' +
          '<span>' + escapeHtml(q.options[i]) + '</span>' +
          selfMark + oppMark +
        '</div>';
    }

    body.innerHTML =
      '<div class="sf-question" style="font-size:16px;font-weight:600;color:var(--text-primary);margin-bottom:16px;text-align:center;">' + escapeHtml(q.text) + '</div>' +
      '<div class="sf-options">' + optionsHtml + '</div>' +
      '<div style="margin-top:16px;">' +
        '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">\u5f7c\u7684\u8bc4\u8bba\uff1a</div>' +
        '<div style="background:var(--secondary-bg);padding:8px 12px;border-radius:var(--radius-sm);font-size:13px;color:var(--text-primary);margin-bottom:12px;">' + escapeHtml(sf.curAnswer.oppComment || '') + '</div>' +
        '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;">\u6211\u7684\u8bc4\u8bba\uff1a</div>' +
        '<textarea id="sfCommentInput" placeholder="\u5199\u70b9\u4ec0\u4e48\u2026" style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--secondary-bg);color:var(--text-primary);font-size:13px;resize:none;min-height:60px;box-sizing:border-box;font-family:var(--font-family);"></textarea>' +
        '<button class="survey-pill-btn" style="width:100%;margin-top:8px;background:var(--accent-color);color:#fff;" onclick="SurveyApp.submitComment()">\u4e0b\u4e00\u9898</button>' +
      '</div>';

    requestAnimationFrame(function () {
      var inp = document.getElementById('sfCommentInput');
      if (inp) inp.focus();
    });
  }

  function submitComment() {
    if (!surveyFill) return;
    var sf = surveyFill;
    var inp = document.getElementById('sfCommentInput');
    if (inp) sf.curAnswer.selfComment = inp.value.trim();
    sf.answers.push(sf.curAnswer);
    sf.qIndex++;
    sf.selfIdx = -1;
    sf.oppIdx = -1;
    sf.curAnswer = null;

    if (sf.qIndex >= sf.survey.questions.length) {
      sf.stage = 'summary';
    } else {
      sf.stage = 'pick';
    }
    renderFillQuestion();
  }

  function renderSummaryStage(body) {
    var sf = surveyFill;
    var rows = '';
    for (var i = 0; i < sf.answers.length; i++) {
      var a = sf.answers[i];
      var match = (a.self === a.opp);
      var commentHtml = '';
      if (a.selfComment || a.oppComment) {
        commentHtml = '<div style="margin-top:4px;font-size:12px;color:var(--text-secondary);">';
        if (a.oppComment) commentHtml += '\u5f7c\uff1a' + escapeHtml(a.oppComment) + ' ';
        if (a.selfComment) commentHtml += '\u6211\uff1a' + escapeHtml(a.selfComment);
        commentHtml += '</div>';
      }
      rows +=
        '<div style="padding:10px 0;border-bottom:1px solid var(--border-color);">' +
          '<div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">' + escapeHtml(a.q) + '</div>' +
          '<div style="display:flex;gap:12px;font-size:13px;align-items:center;">' +
            '<span>\u6211\uff1a<span style="color:var(--accent-color);">' + escapeHtml(a.self || '-') + '</span></span>' +
            '<span>\u5f7c\uff1a<span style="color:var(--accent-color);">' + escapeHtml(a.opp || '-') + '</span></span>' +
            (match ? '<span style="color:#27ae60;font-size:12px;"><i class="fas fa-check"></i> \u4e00\u81f4</span>' : '<span style="color:#e74c3c;font-size:12px;"><i class="fas fa-times"></i> \u4e0d\u4e00\u81f4</span>') +
          '</div>' +
          commentHtml +
        '</div>';
    }

    var matchCount = 0;
    for (var j = 0; j < sf.answers.length; j++) {
      if (sf.answers[j].self === sf.answers[j].opp) matchCount++;
    }
    var matchPct = Math.round((matchCount / sf.answers.length) * 100);

    body.innerHTML =
      '<div style="text-align:center;padding:24px 0 16px;">' +
        '<div style="font-size:48px;font-weight:700;color:var(--accent-color);">' + matchPct + '%</div>' +
        '<div style="font-size:14px;color:var(--text-secondary);margin-top:4px;">\u9ed8\u5951\u5ea6</div>' +
      '</div>' +
      '<div style="padding:0 4px;">' + rows + '</div>' +
      '<div style="padding:20px 0;text-align:center;">' +
        '<button class="survey-pill-btn" style="width:100%;background:var(--accent-color);color:#fff;font-size:15px;padding:10px;" onclick="SurveyApp.finishAndSave()">\u5b8c\u6210\u5e76\u4fdd\u5b58</button>' +
      '</div>';
  }

  async function finishAndSave() {
    if (!surveyFill) return;
    var sf = surveyFill;
    var record = {
      id: 'rec' + Date.now(),
      surveyId: sf.surveyId,
      title: sf.survey.title,
      ts: Date.now(),
      answers: sf.answers.map(function (a) {
        return {
          q: a.q,
          self: a.self,
          opp: a.opp,
          selfComment: a.selfComment || '',
          oppComment: a.oppComment || ''
        };
      })
    };
    surveyRecords.push(record);
    await saveSurveyData();
    closeFull();
    renderSurveys();
    showToast('\u95ee\u5377\u5df2\u4fdd\u5b58');
  }

  // ==================== Expose ====================

  window.SurveyApp = {
    open: open,
    newSurvey: newSurvey,
    handleImport: handleImport,
    openDetail: openDetail,
    openRecordSummary: openRecordSummary,
    inviteSurvey: inviteSurvey,
    editSurvey: editSurvey,
    exportSurvey: exportSurvey,
    deleteSurvey: deleteSurvey,
    deleteRecord: deleteRecord,
    toggleQOpts: toggleQOpts,
    addEditQuestion: addEditQuestion,
    removeEditQuestion: removeEditQuestion,
    addEditOption: addEditOption,
    removeEditOption: removeEditOption,
    saveEditSurvey: saveEditSurvey,
    _closeEdit: _closeEdit,
    _removeAndHide: _removeAndHide,
    closeFull: closeFull,
    pickOption: pickOption,
    requestReselect: requestReselect,
    proceedAfterReselect: proceedAfterReselect,
    submitComment: submitComment,
    finishAndSave: finishAndSave
  };

})();