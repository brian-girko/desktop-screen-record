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
    chrome.browserAction.setIcon({
      path: {
        '16': 'data/icons/16.png',
        '19': 'data/icons/19.png',
        '32': 'data/icons/32.png',
        '38': 'data/icons/38.png',
        '48': 'data/icons/48.png'
      }
    });
  },
  recording() {
    chrome.browserAction.setPopup({popup: ''});
    button.alter(0);
  },
  alter(index) {
    const mode = index % 2 ? 'active/' : '';
    chrome.browserAction.setIcon({
      path: {
        '16': 'data/icons/' + (mode) + '16.png',
        '19': 'data/icons/' + (mode) + '19.png',
        '32': 'data/icons/' + (mode) + '32.png',
        '38': 'data/icons/' + (mode) + '38.png',
        '48': 'data/icons/' + (mode) + '48.png'
      }
    }, () => {
      window.clearTimeout(button.id);
      button.id = window.setTimeout(button.alter, 500, index + 1);
    });
  }
};
chrome.browserAction.onClicked.addListener(button.click);

chrome.runtime.onMessage.addListener(async request => {
  if (request.method === 'record') {
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

        const mediaRecorder = new MediaRecorder(stream, {
          mime: 'video/webm'
        });
        mediaRecorder.addEventListener('dataavailable', e => {
          const url = URL.createObjectURL(e.data);
          chrome.downloads.download({
            filename: 'capture.webm',
            url
          }, () => URL.revokeObjectURL(url));
          window.clearTimeout(button.id);
        });
        stream.oninactive = stream.onremovetrack = stream.onended = () => {
          mediaRecorder.stop();
        };
        mediaRecorder.start();
        button.recording();
      });
    }
    catch (e) {
      notify(e.message || 'Capturing Failed with an unknown error');
    }
  }
  else if (request.method === 'notify') {
    notify(request.message);
  }
});
