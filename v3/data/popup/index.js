'use strict';

const args = new URLSearchParams(location.search);

const notify = e => chrome.notifications.create({
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message: e.message || e
});

document.getElementById('record').addEventListener('click', () => self.record({
  quality: document.getElementById('quality').value,
  video: document.querySelector('[name=video]:checked').id,
  audio: document.querySelector('[name=audio]:checked').id,
  play: document.getElementById('play').checked,
  // seekable: document.getElementById('seekable').checked
  seekable: false
}).catch(e => {
  console.warn(e);
  alert(e.message || e);
}));

chrome.storage.local.get({
  audio: 'silent',
  video: 'screen',
  quality: 'default',
  play: false,
  seekable: false
}, prefs => {
  document.getElementById(prefs.video).checked = true;
  document.getElementById(prefs.audio).checked = true;
  document.getElementById('play').checked = prefs.play;
  document.getElementById('seekable').checked = prefs.seekable;
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
  chrome.storage.local.set({
    [e.target.name]: value
  });
});

document.getElementById('draw').addEventListener('click', () => chrome.permissions.request({
  permissions: ['activeTab', 'scripting']
}, async granted => {
  if (granted) {
    try {
      const tabId = Number(args.get('tabId'));
      const windowId = Number(args.get('windowId'));

      await chrome.tabs.update(tabId, {
        highlighted: true
      });
      await chrome.windows.update(windowId, {
        focused: true
      });

      await chrome.scripting.executeScript({
        target: {
          tabId
        },
        files: ['data/inject.js']
      });
      window.close();
    }
    catch (e) {
      notify(e.message + '\n\nTry to open the editor with right-click on the action button');
    }
  }
}));

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'recording-state') {
    response(document.body.dataset.mode === 'recording');
    // bring to front
    if (document.body.dataset.mode === 'ready') {
      chrome.runtime.sendMessage({
        method: 'normal'
      });
    }
  }
  else if (request.method === 'stop-recording') {
    if (document.body.dataset.mode === 'recording' || document.body.dataset.mode === 'paused') {
      document.getElementById('stop').click();
    }
  }
});

chrome.commands.onCommand.addListener(name => {
  if (name === 'resume-recording' && document.body.dataset.mode === 'paused') {
    document.getElementById('resume').click();
  }
  if (name === 'pause-recording' && document.body.dataset.mode === 'recording') {
    document.getElementById('pause').click();
  }
  if (name === 'stop-recording' && (
    document.body.dataset.mode === 'recording' ||
    document.body.dataset.mode === 'paused'
  )) {
    document.getElementById('stop').click();
  }
});
