/* Popup diagnostic AutoTransat QC — vanilla JS, zéro dépendance, zéro réseau.
 * Lit : manifest (version), build-info.json (moteur + date build),
 * chrome.storage.local (logs axcLogs, flag axc_debug), onglet actif (listing). */

(function () {
  'use strict';

  var LOGS_KEY = 'axcLogs';
  var DEBUG_KEY = 'axc_debug';
  var LOG_CAP = 300;

  function $(id) { return document.getElementById(id); }

  function chromeLocal() {
    try {
      return window.chrome && chrome.storage && chrome.storage.local
        ? chrome.storage.local
        : null;
    } catch (e) { return null; }
  }

  function setStatus(msg, ok) {
    var el = $('status');
    el.textContent = msg || '';
    el.style.color = ok === false ? '#f87171' : '#86efac';
  }

  function fmtTime(t) {
    try { return new Date(t).toLocaleTimeString('fr-CA', { hour12: false }); }
    catch (e) { return ''; }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function renderLogs(entries) {
    var list = $('logs');
    list.innerHTML = '';
    if (!entries.length) {
      var d = document.createElement('div');
      d.className = 'empty';
      d.textContent = 'Aucun log — ouvrez une annonce Facebook Marketplace, puis Actualiser.';
      list.appendChild(d);
      return;
    }
    entries.slice().reverse().forEach(function (e) {
      var li = document.createElement('li');
      li.className = 'lvl-' + (e.lvl || 'info');
      li.innerHTML = '<time>' + esc(fmtTime(e.t)) + '</time>' +
        '<span>[' + esc(e.lvl || 'info') + ']</span> ' + esc(e.msg || '');
      list.appendChild(li);
    });
  }

  function readLogs() {
    var area = chromeLocal();
    if (!area) return Promise.resolve([]);
    return area.get([LOGS_KEY]).then(function (res) {
      var raw = res && res[LOGS_KEY];
      if (!Array.isArray(raw)) return [];
      return raw.filter(function (e) {
        return e && typeof e.t === 'number' && typeof e.msg === 'string';
      }).slice(-LOG_CAP);
    }).catch(function () { return []; });
  }

  function refresh() {
    setStatus('');
    readLogs().then(function (entries) {
      renderLogs(entries);
      setStatus(entries.length + ' entrée(s).');
    });
  }

  function copyLogs() {
    readLogs().then(function (entries) {
      var text = entries.map(function (e) {
        return new Date(e.t).toISOString() + ' [' + e.lvl + '] ' + e.msg;
      }).join('\n') || '(aucun log)';
      function done() { setStatus('Logs copiés (' + entries.length + ').'); }
      function fallback() {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          done();
        } catch (e) { setStatus('Copie impossible.', false); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, fallback);
      } else { fallback(); }
    });
  }

  function clearLogs() {
    var area = chromeLocal();
    var done = function () { renderLogs([]); setStatus('Logs effacés.'); };
    if (!area) { done(); return; }
    area.remove([LOGS_KEY]).then(done, function () { setStatus('Effacement impossible.', false); });
  }

  function initDebugToggle() {
    var box = $('axc-debug');
    var area = chromeLocal();
    if (!area) { box.disabled = true; return; }
    area.get([DEBUG_KEY]).then(function (res) {
      var v = res && res[DEBUG_KEY];
      box.checked = v === '1' || v === true;
    }).catch(function () {});
    box.addEventListener('change', function () {
      var on = box.checked;
      area.set({ axc_debug: on ? '1' : '0' }).then(function () {
        setStatus(on ? 'Logs détaillés activés (rechargez l’onglet FB).' : 'Logs détaillés coupés.');
      }, function () { setStatus('Écriture impossible.', false); });
    });
  }

  function initVersions() {
    try {
      var m = chrome.runtime && chrome.runtime.getManifest ? chrome.runtime.getManifest() : null;
      if (m && m.version) $('axc-ver').textContent = 'v' + m.version;
    } catch (e) { $('axc-ver').textContent = '?'; }
    fetch(chrome.runtime.getURL('build-info.json')).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (info) {
      if (info.engineVersion) $('axc-engine').textContent = String(info.engineVersion).slice(0, 7);
      if (info.builtAt) {
        try { $('axc-built').textContent = 'build ' + new Date(info.builtAt).toLocaleString('fr-CA'); }
        catch (e) { $('axc-built').textContent = 'build ' + info.builtAt; }
      }
    }).catch(function () {
      $('axc-engine').textContent = '?';
      $('axc-built').textContent = 'build ?';
    });
  }

  function initListing() {
    try {
      if (!chrome.tabs || !chrome.tabs.query) return;
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        try {
          var url = tabs && tabs[0] && tabs[0].url ? tabs[0].url : '';
          var m = /\/marketplace\/item\/(\d+)/.exec(url || '');
          $('axc-listing').textContent = m ? m[1] : '(hors annonce)';
        } catch (e) { $('axc-listing').textContent = '?'; }
      });
    } catch (e) { /* tabs indisponible : on ignore */ }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initVersions();
    initDebugToggle();
    initListing();
    $('axc-refresh').addEventListener('click', refresh);
    $('axc-copy').addEventListener('click', copyLogs);
    $('axc-clear').addEventListener('click', clearLogs);
    refresh();
    var timer = setInterval(function () {
      if (document.hidden) return;
      readLogs().then(renderLogs);
    }, 1500);
    window.addEventListener('unload', function () { clearInterval(timer); });
  });
})();
