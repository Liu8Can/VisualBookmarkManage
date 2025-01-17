chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.create({ url: 'manager.html' });
});

// 书签有变化的监听函数
function notifyBookmarkChange() {
  chrome.tabs.query({}, function (tabs) {
    tabs.forEach(tab => {
      if (tab.url && tab.url.endsWith('manager.html')) {
        chrome.tabs.sendMessage(tab.id, { action: 'refreshBookmarks' });
      }
    });
  });
}

// 监听书签创建事件
chrome.bookmarks.onCreated.addListener((id, bookmark) => {
  notifyBookmarkChange();
});

// 监听书签移除事件
chrome.bookmarks.onRemoved.addListener((id, removeInfo) => {
  notifyBookmarkChange();
});

// 监听书签改变事件
chrome.bookmarks.onChanged.addListener((id, changeInfo) => {
  notifyBookmarkChange();
});

// 监听书签移动事件
chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
  notifyBookmarkChange();
});

// 监听书签导入完成事件
chrome.bookmarks.onImportEnded.addListener(() => {
  notifyBookmarkChange();
});