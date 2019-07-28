'use strict';

document.getElementById('record').addEventListener('click', () => chrome.runtime.sendMessage({
  method: 'record',
  video: document.querySelector('[name=video]:checked').id,
  audio: document.querySelector('[name=audio]:checked').id
}, () => window.close()));

chrome.storage.local.get({
  audio: 'silent',
  video: 'screen'
}, prefs => {
  document.getElementById(prefs.video).checked = true;
  document.getElementById(prefs.audio).checked = true;
});

document.addEventListener('change', e => chrome.storage.local.set({
  [e.target.name]: e.target.id
}));
