'use strict';

const notify = e => chrome.notifications.create({
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message: e.message || e
});

document.getElementById('record').addEventListener('click', () => chrome.runtime.sendMessage({
  method: 'record',
  quality: document.getElementById('quality').value,
  video: document.querySelector('[name=video]:checked').id,
  audio: document.querySelector('[name=audio]:checked').id,
  play: document.getElementById('play').checked
}, () => window.close()));

chrome.storage.local.get({
  audio: 'silent',
  video: 'screen',
  quality: 'default',
  play: false
}, prefs => {
  document.getElementById(prefs.video).checked = true;
  document.getElementById(prefs.audio).checked = true;
  document.getElementById('play').checked = prefs.play;
  document.getElementById('quality').value = prefs.quality;
});

document.addEventListener('change', e => {
  let value = e.target.checked;
  if (e.target.type === 'radio') {
    value = e.target.id;
  }
  else if (e.target.tagName === 'SELECT') {
    value = e.target.value;
  }
  console.log(e.target.name, value);
  chrome.storage.local.set({
    [e.target.name]: value
  });
});

document.getElementById('draw').addEventListener('click', () => {
  chrome.runtime.sendMessage({
    method: 'draw-on-page'
  }, () => window.close());
});
