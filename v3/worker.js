const notify = e => chrome.notifications.create({
  type: 'basic',
  iconUrl: '/data/icons/48.png',
  title: chrome.runtime.getManifest().name,
  message: e.message || e
}, id => {
  setTimeout(chrome.notifications.clear, 3000, id);
});

chrome.action.onClicked.addListener(tab => {
  chrome.runtime.sendMessage({
    method: 'recording-state'
  }, async r => {
    if (r === true) {
      chrome.runtime.sendMessage({
        method: 'stop-recording'
      });
    }
    else if (r === undefined) {
      chrome.runtime.lastError;
      const win = await chrome.windows.getCurrent();

      chrome.storage.local.get({
        width: 800,
        height: 650,
        left: win.left + Math.round((win.width - 800) / 2),
        top: win.top + Math.round((win.height - 650) / 2)
      }, prefs => {
        chrome.windows.create({
          url: 'data/popup/index.html?tabId=' + tab.id + '&windowId=' + tab.windowId,
          width: prefs.width,
          height: prefs.height,
          left: prefs.left,
          top: prefs.top,
          type: 'popup'
        });
      });
    }
  });
});

chrome.runtime.onMessage.addListener((request, sender, response) => {
  if (request.method === 'minimize') {
    chrome.windows.update(sender.tab.windowId, {
      state: 'minimized'
    });
  }
  else if (request.method === 'normal') {
    chrome.windows.update(sender.tab.windowId, {
      state: 'normal'
    });
  }
  else if (request.method === 'capture-tab') {
    chrome.tabs.captureVisibleTab({
      format: 'png',
      quality: 1
    }, href => response(href));
    return true;
  }
});

// context menu
{
  const startup = () => {
    chrome.contextMenus.create({
      title: 'Draw on This Page',
      id: 'draw-on-page',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      title: 'Draw on New Page',
      id: 'draw-on-new',
      contexts: ['action']
    });
  };
  chrome.runtime.onStartup.addListener(startup);
  chrome.runtime.onInstalled.addListener(startup);
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'draw-on-page') {
    chrome.permissions.request({
      permissions: ['activeTab', 'scripting']
    }, granted => {
      if (granted) {
        chrome.scripting.executeScript({
          target: {
            tabId: tab.id
          },
          files: ['data/inject.js']
        }).catch(notify);
      }
    });
  }
  else if (info.menuItemId === 'draw-on-new') {
    chrome.tabs.create({
      url: '/data/window/index.html?print-background-color=transparent&runtime-resize=true&runtime-remote-download=true&runtime-report-close=true'
    });
  }
});

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
