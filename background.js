'use strict';

const notify = e => chrome.notifications.create({
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message: e.message || e
});

let tracks;

const button = {
  click() {
    tracks.forEach(track => track.stop());
    chrome.browserAction.setPopup({
      popup: 'data/popup/index.html'
    });
    window.setTimeout(() => chrome.browserAction.setIcon({
      path: {
        '16': 'data/icons/16.png',
        '19': 'data/icons/19.png',
        '32': 'data/icons/32.png',
        '38': 'data/icons/38.png',
        '48': 'data/icons/48.png'
      }
    }), 600);
  },
  recording() {
    chrome.browserAction.setPopup({popup: ''});
    button.alter(0);
  },
  alter(index) {
    const mode = index % 2 ? 'active/' : '';
    chrome.browserAction.setIcon({
      path: {
        '16': 'data/icons/' + mode + '16.png',
        '19': 'data/icons/' + mode + '19.png',
        '32': 'data/icons/' + mode + '32.png',
        '38': 'data/icons/' + mode + '38.png',
        '48': 'data/icons/' + mode + '48.png'
      }
    }, () => {
      clearTimeout(button.id);
      button.id = setTimeout(button.alter, 500, index + 1);
    });
  }
};
chrome.browserAction.onClicked.addListener(button.click);

const onMessage = (request, sender, response) => {
  if (request.method === 'record') {
    (async () => {
      try {
        if (request.audio === 'mic') {
          const state = (await navigator.permissions.query({name: 'microphone'})).state;
          if (state !== 'granted') {
            return chrome.windows.create({
              url: chrome.extension.getURL('data/permission/index.html?' + `video=${request.video}&audio=${request.audio}`),
              width: 400,
              height: 400,
              left: screen.availLeft + Math.round((screen.availWidth - 400) / 2),
              top: screen.availTop + Math.round((screen.availHeight - 400) / 2),
              type: 'popup'
            });
          }
        }

        const type = [request.video];
        if (request.audio === 'system') {
          type.push('audio');
        }

        chrome.desktopCapture.chooseDesktopMedia(type, async streamId => {
          try {
            const constraints = {
              video: {
                mandatory: {
                  chromeMediaSource: 'desktop',
                  chromeMediaSourceId: streamId
                }
              }
            };
            if (request.audio === 'system') {
              constraints.audio = {
                mandatory: {
                  chromeMediaSource: 'system',
                  chromeMediaSourceId: streamId
                }
              };
            }
            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            if (request.audio === 'mic') {
              const audio = await navigator.mediaDevices.getUserMedia({
                audio: true
              });
              for (const track of audio.getAudioTracks()) {
                stream.addTrack(track);
              }
            }
            tracks = stream.getTracks();

            if (request.play && type.includes('tab') && type.includes('audio')) {
              try {
                const context = new AudioContext();
                const source = context.createMediaStreamSource(stream);
                source.connect(context.destination);
              }
              catch (e) {}
            }

            const file = new File();
            await file.open();
            const mediaRecorder = new MediaRecorder(stream, {
              mime: 'video/webm'
            });

            const capture = () => {
              if (mediaRecorder.state === 'recording') {
                mediaRecorder.requestData();
                capture.id = setTimeout(capture, 10000);
              }
            };
            capture.offset = 0;
            capture.progress = 0;

            mediaRecorder.addEventListener('error', e => notify(e.message));
            mediaRecorder.addEventListener('dataavailable', e => {
              const download = () => {
                if (capture.progress === 0 && mediaRecorder.state === 'inactive') {
                  clearTimeout(button.id);

                  file.download('capture.webm', 'video/webm').then(() => file.remove()).catch(e => {
                    console.warn(e);
                    notify('An error occurred during saving: ' + e.message);
                  });
                }
              };
              if (e.data.size) {
                capture.progress += 1;
                e.data.arrayBuffer().then(ab => {
                  file.chunks({
                    offset: capture.offset,
                    buffer: new Uint8Array(ab)
                  }).then(() => {
                    capture.progress -= 1;
                    download();
                  });
                });
                capture.offset += 1;
              }
              else {
                download();
              }
            });
            stream.oninactive = stream.onremovetrack = stream.onended = button.click;
            for (const track of tracks) {
              track.onended = button.click;
            }
            mediaRecorder.start();
            button.recording();
            capture();
          }
          catch (e) {
            notify(e.message || 'Capturing Failed with an unknown error');
          }
        });
      }
      catch (e) {
        notify(e.message || 'Capturing Failed with an unknown error');
      }

    })();
  }
  else if (request.method === 'notify') {
    notify(request.message);
  }
  else if (request.method === 'draw-on-page') {
    chrome.permissions.request({
      permissions: ['activeTab']
    }, granted => {
      if (granted) {
        chrome.tabs.executeScript({
          file: 'data/inject.js',
          runAt: 'document_start'
        }, () => {
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            notify(lastError);
          }
        });
      }
    });
  }
  else if (request.method === 'download') {
    chrome.tabs.captureVisibleTab({
      format: 'png',
      quality: 1
    }, href => {
      const a = document.createElement('a');
      a.href = href;
      a.download = sender.tab.title + '.png';
      a.click();
      response();
    });
    return true;
  }
};
chrome.runtime.onMessage.addListener(onMessage);

// save files from indexdb and remove the
{
  const restore = async () => {
    const os = 'databases' in indexedDB ? await indexedDB.databases() : Object.keys(localStorage)
      .filter(name => name.startsWith('file:'))
      .map(name => ({
        name: name.replace('file:', '')
      }));
    for (const o of os) {
      const file = new File(o.name);
      await file.open();
      try {
        await file.download('capture.webm', 'video/webm');
      }
      catch (e) {
        console.warn(e);
      }
      file.remove();
    }
  };

  chrome.runtime.onStartup.addListener(restore);
  chrome.runtime.onInstalled.addListener(restore);
}

// context menu
{
  const startup = () => {
    chrome.contextMenus.create({
      title: 'Draw on This Page',
      id: 'draw-on-page',
      contexts: ['browser_action']
    });
  };
  chrome.runtime.onStartup.addListener(startup);
  chrome.runtime.onInstalled.addListener(startup);
}
chrome.contextMenus.onClicked.addListener(() => onMessage({
  method: 'draw-on-page'
}));

/* FAQs & Feedback */
{
  const {management, runtime: {onInstalled, setUninstallURL, getManifest}, storage, tabs} = chrome;
  if (navigator.webdriver !== true) {
    const page = getManifest().homepage_url;
    const {name, version} = getManifest();
    onInstalled.addListener(({reason, previousVersion}) => {
      management.getSelf(({installType}) => installType === 'normal' && storage.local.get({
        'faqs': true,
        'last-update': 0
      }, prefs => {
        if (reason === 'install' || (prefs.faqs && reason === 'update')) {
          const doUpdate = (Date.now() - prefs['last-update']) / 1000 / 60 / 60 / 24 > 45;
          if (doUpdate && previousVersion !== version) {
            tabs.query({active: true, currentWindow: true}, tbs => tabs.create({
              url: page + '?version=' + version + (previousVersion ? '&p=' + previousVersion : '') + '&type=' + reason,
              active: reason === 'install',
              ...(tbs && tbs.length && {index: tbs[0].index + 1})
            }));
            storage.local.set({'last-update': Date.now()});
          }
        }
      }));
    });
    setUninstallURL(page + '?rd=feedback&name=' + encodeURIComponent(name) + '&version=' + version);
  }
}
