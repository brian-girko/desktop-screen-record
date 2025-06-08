/* global notify, EBML */
let tracks = [];

// https://github.com/node-ebml/node-ebml/issues/119
EBML.tools.makeMetadataSeekable = new Proxy(EBML.tools.makeMetadataSeekable, {
  apply(target, self, args) {
    args[0] = args[0].filter(o => o.type !== 'unknown');
    return Reflect.apply(target, self, args);
  }
});

const button = {
  stop() {
    tracks.forEach(track => track.stop());
    clearTimeout(button.id);
    document.body.dataset.mode = 'ready';
    document.title = 'Screen Recorder';
    chrome.runtime.sendMessage({
      method: 'normal'
    });
    setTimeout(() => chrome.action.setIcon({
      path: {
        '16': '/data/icons/16.png',
        '32': '/data/icons/32.png',
        '48': '/data/icons/48.png'
      }
    }), 600);
  },
  pause() {
    document.title = 'Recording is paused!';
    document.body.dataset.mode = 'paused';
    clearTimeout(button.id);
    chrome.runtime.sendMessage({
      method: 'normal'
    });
    setTimeout(() => chrome.action.setIcon({
      path: {
        '16': '/data/icons/16.png',
        '32': '/data/icons/32.png',
        '48': '/data/icons/48.png'
      }
    }), 600);
  },
  recording() {
    button.alter(0);
    document.title = 'Recording...';
    document.body.dataset.mode = 'recording';
    if (document.getElementById('minimize').checked) {
      chrome.runtime.sendMessage({
        method: 'minimize'
      });
    }
  },
  alter(index) {
    const mode = index % 2 ? 'active/' : '';
    chrome.action.setIcon({
      path: {
        '16': '/data/icons/' + mode + '16.png',
        '32': '/data/icons/' + mode + '32.png',
        '48': '/data/icons/' + mode + '48.png'
      }
    }, () => {
      clearTimeout(button.id);
      button.id = setTimeout(button.alter, 500, index + 1);
    });
  }
};

self.record = async request => {
  // file
  const handle = await window.showSaveFilePicker({
    types: [{
      description: 'WebM Video',
      accept: {
        'video/webm': ['.webm']
      }
    }]
  });

  if (request.audio === 'mic' || request.audio === 'mixed') {
    const state = (await navigator.permissions.query({name: 'microphone'})).state;

    if (state !== 'granted') {
      await navigator.mediaDevices.getUserMedia({
        audio: true
      }).catch(() => {
        alert(`Recording is aborted due to lack of microphone access.
Either use different audio source or allow the microphone access`);
        chrome.tabs.create({
          url: 'chrome://settings/content/siteDetails?site=' + encodeURIComponent(location.href)
        });

        throw Error('no microphone access');
      });
    }
  }

  const type = [request.video];
  if (request.audio === 'system' || request.audio === 'mixed') {
    type.push('audio');
  }

  const streamId = await new Promise(resolve => chrome.desktopCapture.chooseDesktopMedia(type, resolve));
  if (!streamId) {
    throw Error('recording aborted');
  }

  tracks = [];
  const constraints = {
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: streamId
      }
    }
  };
  if (request.audio === 'system' || request.audio === 'mixed') {
    constraints.audio = {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: streamId
      }
    };
  }
  if (request.quality === 'high') {
    constraints.video.mandatory.maxWidth = screen.width * 2;
    constraints.video.mandatory.maxHeight = screen.height * 2;
  }
  else if (request.quality === 'medium') {
    constraints.video.mandatory.maxWidth = screen.width * 0.5;
    constraints.video.mandatory.maxHeight = screen.height * 0.5;
  }
  else if (request.quality === 'low') {
    constraints.video.mandatory.maxWidth = screen.width * 0.25;
    constraints.video.mandatory.maxHeight = screen.height * 0.25;
  }

  let stream = await navigator.mediaDevices.getUserMedia(constraints);
  if (request.audio === 'mic' || request.audio === 'mixed') {
    const audio = await navigator.mediaDevices.getUserMedia({
      audio: true
    });
    if (stream.getAudioTracks().length === 0) {
      for (const track of audio.getAudioTracks()) {
        stream.addTrack(track);
      }
    }
    else {
      try {
        const context = new AudioContext();
        const destination = context.createMediaStreamDestination();
        context.createMediaStreamSource(audio).connect(destination);
        context.createMediaStreamSource(stream).connect(destination);
        const ns = new MediaStream();
        stream.getVideoTracks().forEach(track => ns.addTrack(track));
        destination.stream.getAudioTracks().forEach(track => ns.addTrack(track));
        tracks.push(...stream.getTracks());
        stream = ns;
      }
      catch (e) {
        console.warn(e);
        notify(e);
      }
    }
  }
  tracks.push(...stream.getTracks());

  const writable = await handle.createWritable();

  const write = async () => {
    if (write.busy) {
      // console.log('skipped');
      return;
    }
    write.busy = true;
    let chunk;
    while (chunk = meta.chunks.shift()) {
      await writable.write(new Uint8Array(chunk));
    }
    write.busy = false;
    if (meta.recording === false) {
      // Update header to have the correct duration
      if (request.seekable) {
        try {
          const header = EBML.tools.makeMetadataSeekable(reader.metadatas, duration(), reader.cues);
          await writable.write({
            type: 'write',
            data: new Uint8Array(header),
            position: 0
          });
        }
        catch (e) {
          console.error(e);
        }
      }
      await writable.close();
      button.stop();
    }
  };
  write.busy = request.seekable ? true : false;

  // meta
  const meta = {
    recording: true, // if false, closes writeable stream
    stats: [],
    chunks: []
  };

  const duration = () => {
    return meta.stats.reduce((p, {start, end}) => {
      return p + (end || Date.now()) - start;
    }, 0);
  };
  const ms2st = d => {
    d = d / 1000;
    const h = Math.floor(d / 3600);
    const m = Math.floor(d % 3600 / 60);
    const s = Math.floor(d % 3600 % 60);

    return (h + '').padStart(2, '0') + ':' + (m + '').padStart(2, '0') + ':' + (s + '').padStart(2, '0');
  };

  const mediaRecorder = new MediaRecorder(stream, {
    mime: 'video/webm'
  });

  // detect metadata
  const reader = new EBML.Reader();
  const decoder = new EBML.Decoder();

  // prepares meta data; can be called once
  const prepare = async () => {
    if (prepare.busy) {
      return;
    }
    prepare.busy = true;

    // writing dummy meta
    if (request.seekable) {
      try {
        const header = EBML.tools.makeMetadataSeekable(reader.metadatas, reader.duration, reader.cues);
        const ab = await (new Blob(meta.chunks)).arrayBuffer();

        meta.chunks.length = 0;

        console.log(ab, reader);

        // prepending data without the original header
        meta.chunks.unshift(ab.slice(reader.metadataSize));
        // prepending the dummy meta
        meta.chunks.unshift(header);
      }
      catch (e) {
        console.error(e);
      }
    }

    write.busy = false;
  };

  // recorder
  mediaRecorder.ondataavailable = async e => {
    const ab = await e.data.arrayBuffer();
    meta.chunks.push(ab);

    if (request.seekable) {
      // meta is ready; lets start to write to disk
      if (reader.cues.length) {
        prepare();
      }
      else {
        decoder.decode(ab).forEach(element => reader.read(element));
      }
    }

    write();

    document.title = 'Recording for ' + ms2st(duration());
  };

  mediaRecorder.onstop = mediaRecorder.onerror = () => {
    meta.stats[meta.stats.length - 1].end = Date.now();
    meta.recording = false;
  };
  stream.oninactive = stream.onremovetrack = stream.onended = button.stop;
  for (const track of tracks) {
    track.onended = button.stop;
  }

  meta.stats.push({
    start: Date.now()
  });
  mediaRecorder.start(1000);
  button.recording();

  document.getElementById('pause').onclick = () => {
    const stat = meta.stats[meta.stats.length - 1];
    stat.end = Date.now();
    mediaRecorder.pause();
    button.pause();
  };
  document.getElementById('resume').onclick = () => {
    meta.stats.push({
      start: Date.now()
    });
    mediaRecorder.resume();
    button.recording();
  };
  document.getElementById('stop').onclick = () => {
    button.stop();
  };
};
