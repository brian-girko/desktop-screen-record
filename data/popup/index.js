'use strict';

const notify = e => chrome.notifications.create({
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message: e.message || e
});

document.getElementById('record').addEventListener('click', () => chrome.runtime.sendMessage({
  method: 'record',
  video: document.querySelector('[name=video]:checked').id,
  audio: document.querySelector('[name=audio]:checked').id,
  play: document.getElementById('play').checked
}, () => window.close()));

chrome.storage.local.get({
  audio: 'silent',
  video: 'screen',
  play: false
}, prefs => {
  document.getElementById(prefs.video).checked = true;
  document.getElementById(prefs.audio).checked = true;
  document.getElementById('play').checked = prefs.play;
});

document.addEventListener('change', e => chrome.storage.local.set({
  [e.target.name]: e.target.type === 'radio' ? e.target.id : e.target.checked
}));

document.getElementById('draw').addEventListener('click', () => {
  chrome.runtime.sendMessage({
    method: 'draw-on-page'
  }, () => window.close());
});
